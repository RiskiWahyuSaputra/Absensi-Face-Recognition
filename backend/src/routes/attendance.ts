import { Router } from "express";
import fs from "fs";
import { query } from "../config/db";
import { requireAuth, requireRoles } from "../middleware/auth";
import { getProofPhotoFullPath } from "../utils/storage";

const router = Router();

/**
 * Dashboard HR / Atasan: ringkasan kehadiran hari ini (hadir, terlambat, belum hadir, review PIN).
 */
router.get("/today-summary", requireAuth, async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const params: unknown[] = [today];
    let scopeFilter = "WHERE e.is_active = TRUE";

    if (req.user!.role === "supervisor") {
      params.push(req.user!.id);
      scopeFilter += ` AND (e.supervisor_id = $2 OR e.id = $2)`;
    } else if (req.user!.role === "employee") {
      params.push(req.user!.id);
      scopeFilter += ` AND e.id = $2`;
    }

    const rows = await query<{
      employee_id: string;
      nik: string;
      full_name: string;
      department: string;
      shift_name: string | null;
      check_in_at: Date | null;
      check_in_status: string | null;
      check_in_method: string | null;
      check_out_at: Date | null;
      check_out_status: string | null;
      needs_hr_review: boolean;
    }>(
      `SELECT e.id AS employee_id, e.nik, e.full_name, e.department, s.name AS shift_name,
              MIN(CASE WHEN al.attendance_type = 'check_in' THEN al.recorded_at END) AS check_in_at,
              MAX(CASE WHEN al.attendance_type = 'check_in' THEN al.status END) AS check_in_status,
              MAX(CASE WHEN al.attendance_type = 'check_in' THEN al.method END) AS check_in_method,
              MAX(CASE WHEN al.attendance_type = 'check_out' THEN al.recorded_at END) AS check_out_at,
              MAX(CASE WHEN al.attendance_type = 'check_out' THEN al.status END) AS check_out_status,
              COALESCE(BOOL_OR(al.needs_hr_review AND al.hr_reviewed_at IS NULL), FALSE) AS needs_hr_review
       FROM employees e
       LEFT JOIN shifts s ON s.id = e.shift_id
       LEFT JOIN attendance_logs al ON al.employee_id = e.id AND al.attendance_date = $1
       ${scopeFilter}
       GROUP BY e.id, s.name
       ORDER BY e.full_name ASC`,
      params
    );

    const list = rows.rows;
    const totalEmployees = list.length;
    const presentCount = list.filter((r) => r.check_in_at !== null).length;
    const lateCount = list.filter((r) => r.check_in_status === "late").length;
    const notPresentCount = totalEmployees - presentCount;
    const pendingReviewCount = list.filter((r) => r.needs_hr_review).length;

    res.json({
      date: today,
      stats: {
        totalEmployees,
        presentCount,
        lateCount,
        notPresentCount,
        pendingReviewCount,
      },
      employees: list,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Riwayat log absensi (F-08: karyawan hanya lihat miliknya; atasan lihat timnya; HR/IT lihat semua).
 */
router.get("/logs", requireAuth, async (req, res, next) => {
  try {
    const startDate =
      (req.query.startDate as string) ||
      new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const endDate =
      (req.query.endDate as string) || new Date().toISOString().slice(0, 10);
    const onlyPendingReview = req.query.onlyPendingReview === "true";

    const params: unknown[] = [startDate, endDate];
    const where: string[] = [
      "al.attendance_date >= $1",
      "al.attendance_date <= $2",
    ];

    if (req.user!.role === "employee") {
      params.push(req.user!.id);
      where.push(`al.employee_id = $${params.length}`);
    } else if (req.user!.role === "supervisor") {
      params.push(req.user!.id);
      where.push(
        `(e.supervisor_id = $${params.length} OR al.employee_id = $${params.length})`
      );
    }

    if (onlyPendingReview) {
      where.push("al.needs_hr_review = TRUE AND al.hr_reviewed_at IS NULL");
    }

    const result = await query(
      `SELECT al.id, al.employee_id, e.nik, e.full_name, e.department,
              al.attendance_date, al.attendance_type, al.status, al.method,
              al.match_score, al.liveness_score, al.proof_photo_path,
              al.needs_hr_review, al.hr_reviewed_at, al.hr_review_note,
              al.is_offline_synced, al.recorded_at,
              k.name AS kiosk_name, k.device_code
       FROM attendance_logs al
       JOIN employees e ON e.id = al.employee_id
       LEFT JOIN kiosks k ON k.id = al.kiosk_id
       WHERE ${where.join(" AND ")}
       ORDER BY al.recorded_at DESC
       LIMIT 300`,
      params
    );

    res.json({ logs: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * HR meninjau absen fallback PIN + foto bukti.
 */
router.post(
  "/logs/:id/review",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const note = typeof req.body?.note === "string" ? req.body.note : "Terverifikasi oleh HR";
      const result = await query(
        `UPDATE attendance_logs
         SET needs_hr_review = FALSE, hr_reviewed_by = $1, hr_reviewed_at = NOW(), hr_review_note = $2
         WHERE id = $3
         RETURNING id, needs_hr_review, hr_reviewed_at, hr_review_note`,
        [req.user!.id, note, req.params.id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Log absensi tidak ditemukan" });
        return;
      }
      res.json({ log: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mengambil foto bukti absensi (hanya pemilik, atasannya, HR, atau IT).
 */
router.get("/logs/:id/proof-photo", requireAuth, async (req, res, next) => {
  try {
    const result = await query<{
      employee_id: string;
      supervisor_id: string | null;
      proof_photo_path: string | null;
    }>(
      `SELECT al.employee_id, e.supervisor_id, al.proof_photo_path
       FROM attendance_logs al
       JOIN employees e ON e.id = al.employee_id
       WHERE al.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Log tidak ditemukan" });
      return;
    }

    const row = result.rows[0];
    const isAllowed =
      req.user!.role === "hr_admin" ||
      req.user!.role === "it_admin" ||
      row.employee_id === req.user!.id ||
      (req.user!.role === "supervisor" && row.supervisor_id === req.user!.id);

    if (!isAllowed) {
      res.status(403).json({ error: "Akses foto bukti ditolak" });
      return;
    }

    if (!row.proof_photo_path) {
      res.status(404).json({ error: "Foto bukti sudah dihapus otomatis (> 90 hari) atau tidak tersedia" });
      return;
    }

    const fullPath = getProofPhotoFullPath(row.proof_photo_path);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: "Berkas foto tidak ditemukan" });
      return;
    }

    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});

export default router;
