import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSystemSettingNumber, query } from "../config/db";
import { env } from "../config/env";
import { requireKioskAuth } from "../middleware/kioskAuth";
import { analyzeFace } from "../services/faceServiceClient";
import { evaluateAttendanceEvent, ShiftRule } from "../services/attendanceEngine";
import { decryptFaceVector, encryptFaceVector } from "../utils/crypto";
import { findBestMatch, StoredEmbeddingCandidate } from "../utils/similarity";
import { saveProofPhoto } from "../utils/storage";

const router = Router();

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getEmployeeWithShift(employeeId: string) {
  const res = await query<{
    id: string;
    nik: string;
    full_name: string;
    department: string;
    shift_start: string | null;
    shift_end: string | null;
    late_tolerance_minutes: number | null;
    early_leave_tolerance_minutes: number | null;
  }>(
    `SELECT e.id, e.nik, e.full_name, e.department,
            s.start_time AS shift_start, s.end_time AS shift_end,
            s.late_tolerance_minutes, s.early_leave_tolerance_minutes
     FROM employees e
     LEFT JOIN shifts s ON s.id = e.shift_id
     WHERE e.id = $1 AND e.is_active = TRUE`,
    [employeeId]
  );
  return res.rows[0] || null;
}

async function recordAttendanceForEmployee(params: {
  employeeId: string;
  kioskId: string;
  method: "face" | "pin_fallback";
  matchScore: number | null;
  livenessScore: number | null;
  proofPhotoBase64: string;
  needsHrReview: boolean;
  isOfflineSynced?: boolean;
  clientRecordedAt?: Date | null;
}) {
  const now = params.clientRecordedAt || new Date();
  const attendanceDate = formatDateLocal(now);

  const employee = await getEmployeeWithShift(params.employeeId);
  if (!employee) {
    return { ok: false as const, statusCode: 404, error: "Karyawan tidak aktif" };
  }

  const todayLogsRes = await query<{
    attendance_type: "check_in" | "check_out";
    recorded_at: Date;
  }>(
    `SELECT attendance_type, recorded_at
     FROM attendance_logs
     WHERE employee_id = $1 AND attendance_date = $2
     ORDER BY recorded_at ASC`,
    [employee.id, attendanceDate]
  );

  const duplicateWindowMinutes = await getSystemSettingNumber(
    "duplicate_window_minutes",
    env.duplicateWindowMinutes
  );
  const checkoutMinHours = await getSystemSettingNumber(
    "checkout_min_hours",
    env.checkoutMinHours
  );

  const shift: ShiftRule | null =
    employee.shift_start && employee.shift_end
      ? {
          startTime: employee.shift_start,
          endTime: employee.shift_end,
          lateToleranceMinutes: employee.late_tolerance_minutes ?? 15,
          earlyLeaveToleranceMinutes: employee.early_leave_tolerance_minutes ?? 0,
        }
      : null;

  const decision = evaluateAttendanceEvent({
    now,
    todayLogs: todayLogsRes.rows.map((r) => ({
      attendanceType: r.attendance_type,
      recordedAt: new Date(r.recorded_at),
    })),
    shift,
    duplicateWindowMinutes,
    checkoutMinHours,
  });

  if (decision.action !== "record") {
    return {
      ok: true as const,
      ignored: true,
      message: decision.message,
      employee: {
        id: employee.id,
        nik: employee.nik,
        fullName: employee.full_name,
        department: employee.department,
      },
    };
  }

  // F-05: Simpan waktu server, ID kiosk, skor kecocokan, dan foto bukti
  const proofPhotoPath = saveProofPhoto(params.proofPhotoBase64, attendanceDate);

  const insertRes = await query<{ id: string; recorded_at: Date }>(
    `INSERT INTO attendance_logs
       (employee_id, kiosk_id, attendance_date, attendance_type, status, method,
        match_score, liveness_score, proof_photo_path, needs_hr_review,
        is_offline_synced, client_recorded_at, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
     RETURNING id, recorded_at`,
    [
      employee.id,
      params.kioskId,
      attendanceDate,
      decision.attendanceType,
      decision.status,
      params.method,
      params.matchScore,
      params.livenessScore,
      proofPhotoPath,
      params.needsHrReview,
      Boolean(params.isOfflineSynced),
      params.clientRecordedAt || null,
    ]
  );

  return {
    ok: true as const,
    ignored: false,
    attendanceId: insertRes.rows[0].id,
    recordedAt: insertRes.rows[0].recorded_at,
    attendanceType: decision.attendanceType,
    status: decision.status,
    statusLabel: decision.label,
    method: params.method,
    needsHrReview: params.needsHrReview,
    matchScore: params.matchScore,
    livenessScore: params.livenessScore,
    employee: {
      id: employee.id,
      nik: employee.nik,
      fullName: employee.full_name,
      department: employee.department,
    },
  };
}

/**
 * Info perangkat kiosk yang sedang terhubung (untuk verifikasi token di tablet kiosk).
 */
router.get("/info", requireKioskAuth, async (req, res, next) => {
  try {
    const maxFail = await getSystemSettingNumber("max_face_fail_before_pin", 3);
    res.json({
      kiosk: req.kiosk,
      maxFaceFailBeforePin: maxFail,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

const faceAttendanceSchema = z.object({
  imageBase64: z.string().min(50),
  secondaryImageBase64: z.string().min(50).optional(),
  clientRecordedAt: z.string().datetime().optional(),
  isOfflineSynced: z.boolean().optional(),
});

/**
 * Endpoint utama absensi wajah di Kiosk (F-01 s/d F-06):
 * 1. Deteksi wajah & cek liveness di Python face-service
 * 2. Dekripsi vektor AES-256 karyawan aktif & cari skor cosine similarity tertinggi
 * 3. Skor < ambang -> tolak & minta coba lagi (F-06)
 * 4. Tentukan masuk/pulang (>=4 jam) & abaikan duplikat (<5 menit)
 * 5. Simpan log + foto bukti
 */
router.post("/attendance/face", requireKioskAuth, async (req, res, next) => {
  try {
    const parsed = faceAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Gambar kamera tidak valid" });
      return;
    }

    const matchThreshold = await getSystemSettingNumber(
      "match_threshold",
      env.defaultMatchThreshold
    );
    const livenessThreshold = await getSystemSettingNumber(
      "liveness_threshold",
      env.defaultLivenessThreshold
    );

    const analysis = await analyzeFace({
      imageBase64: parsed.data.imageBase64,
      secondaryImageBase64: parsed.data.secondaryImageBase64,
      livenessThreshold,
    });

    if (!analysis.face_detected || !analysis.embedding) {
      res.status(422).json({
        code: "NO_FACE",
        error: "Wajah tidak terdeteksi. Posisikan wajah di tengah layar.",
      });
      return;
    }

    // F-02: Anti-spoofing (tolak foto, layar HP, video)
    if (!analysis.liveness.is_live) {
      res.status(403).json({
        code: "LIVENESS_FAILED",
        error:
          analysis.liveness.reason ||
          "Absen ditolak: foto atau layar HP terdeteksi.",
        livenessScore: analysis.liveness.score,
      });
      return;
    }

    // Ambil semua vektor terenkripsi milik karyawan aktif & dekripsi di memori
    const rows = await query<{
      employee_id: string;
      embedding_encrypted: string;
    }>(
      `SELECT fe.employee_id, fe.embedding_encrypted
       FROM face_embeddings fe
       JOIN employees e ON e.id = fe.employee_id
       WHERE e.is_active = TRUE AND e.biometric_consent_status = 'consented'`
    );

    const candidates: StoredEmbeddingCandidate[] = rows.rows.map((r) => ({
      employeeId: r.employee_id,
      embedding: decryptFaceVector(r.embedding_encrypted),
    }));

    const best = findBestMatch(analysis.embedding, candidates);

    // F-06: Kecocokan di bawah ambang -> tidak tercatat, minta coba lagi
    if (!best || best.score < matchThreshold) {
      res.status(404).json({
        code: "FACE_NOT_MATCHED",
        error: "Wajah tidak dikenali. Mohon coba lagi atau gunakan PIN setelah 3 kali gagal.",
        matchScore: best?.score ?? 0,
        threshold: matchThreshold,
      });
      return;
    }

    const recorded = await recordAttendanceForEmployee({
      employeeId: best.employeeId,
      kioskId: req.kiosk!.id,
      method: "face",
      matchScore: best.score,
      livenessScore: analysis.liveness.score,
      proofPhotoBase64: parsed.data.imageBase64,
      needsHrReview: false,
      isOfflineSynced: parsed.data.isOfflineSynced,
      clientRecordedAt: parsed.data.clientRecordedAt
        ? new Date(parsed.data.clientRecordedAt)
        : null,
    });

    if (!recorded.ok) {
      res.status(recorded.statusCode).json({ error: recorded.error });
      return;
    }

    // Mitigasi risiko PRD halaman 9: perbarui/tambah vektor adaptif bila skor sangat tinggi (>= 0.80)
    if (!recorded.ignored && best.score >= 0.8) {
      const adaptiveCount = await query<{ count: string }>(
        "SELECT COUNT(*) FROM face_embeddings WHERE employee_id = $1 AND is_adaptive = TRUE",
        [best.employeeId]
      );
      if (Number(adaptiveCount.rows[0]?.count || 0) < 2) {
        const encryptedAdaptive = encryptFaceVector(analysis.embedding);
        await query(
          `INSERT INTO face_embeddings (employee_id, pose_label, embedding_encrypted, quality_score, is_adaptive)
           VALUES ($1, 'adaptive_high_score', $2, $3, TRUE)`,
          [best.employeeId, encryptedAdaptive, best.score]
        ).catch(() => {});
      }
    }

    res.json(recorded);
  } catch (err) {
    next(err);
  }
});

const pinAttendanceSchema = z.object({
  nik: z.string().min(2),
  pin: z.string().min(4),
  imageBase64: z.string().min(50),
  clientRecordedAt: z.string().datetime().optional(),
  isOfflineSynced: z.boolean().optional(),
});

/**
 * Fallback PIN + Foto (setelah 3x gagal wajah atau karyawan menolak biometrik UU PDP).
 * Ditandai needs_hr_review = true agar HR meninjau fotonya.
 */
router.post("/attendance/pin", requireKioskAuth, async (req, res, next) => {
  try {
    const parsed = pinAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "NIK, PIN, dan foto bukti wajib diisi" });
      return;
    }

    const empRes = await query<{
      id: string;
      pin_hash: string | null;
      is_active: boolean;
    }>(
      `SELECT id, pin_hash, is_active
       FROM employees
       WHERE LOWER(nik) = LOWER($1)`,
      [parsed.data.nik.trim()]
    );

    if (empRes.rows.length === 0 || !empRes.rows[0].is_active) {
      res.status(401).json({ error: "NIK tidak ditemukan atau tidak aktif" });
      return;
    }

    const emp = empRes.rows[0];
    if (!emp.pin_hash) {
      res.status(400).json({ error: "PIN belum diatur untuk karyawan ini" });
      return;
    }

    const pinValid = await bcrypt.compare(parsed.data.pin, emp.pin_hash);
    if (!pinValid) {
      res.status(401).json({ error: "PIN salah" });
      return;
    }

    const recorded = await recordAttendanceForEmployee({
      employeeId: emp.id,
      kioskId: req.kiosk!.id,
      method: "pin_fallback",
      matchScore: null,
      livenessScore: null,
      proofPhotoBase64: parsed.data.imageBase64,
      needsHrReview: true,
      isOfflineSynced: parsed.data.isOfflineSynced,
      clientRecordedAt: parsed.data.clientRecordedAt
        ? new Date(parsed.data.clientRecordedAt)
        : null,
    });

    if (!recorded.ok) {
      res.status(recorded.statusCode).json({ error: recorded.error });
      return;
    }

    res.json(recorded);
  } catch (err) {
    next(err);
  }
});

export default router;
