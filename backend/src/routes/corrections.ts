import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { requireAuth, requireRoles } from "../middleware/auth";

const router = Router();

const createCorrectionSchema = z.object({
  employeeId: z.string().uuid().optional(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attendanceType: z.enum(["check_in", "check_out"]),
  requestedTime: z.string().datetime(),
  reason: z.string().min(5, "Alasan koreksi minimal 5 karakter").max(500),
});

/**
 * Daftar koreksi absensi (F-08: karyawan lihat miliknya; atasan lihat timnya; HR/IT lihat semua).
 * Audit: siapa, kapan, alasan, status persetujuan selalu tercatat.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const params: unknown[] = [];
    let whereSql = "";

    if (req.user!.role === "employee") {
      params.push(req.user!.id);
      whereSql = "WHERE ac.employee_id = $1";
    } else if (req.user!.role === "supervisor") {
      params.push(req.user!.id);
      whereSql = "WHERE (e.supervisor_id = $1 OR ac.employee_id = $1)";
    }

    const result = await query(
      `SELECT ac.id, ac.employee_id, e.nik, e.full_name, e.department,
              ac.attendance_date, ac.attendance_type, ac.requested_time,
              ac.reason, ac.status, ac.review_note, ac.reviewed_at, ac.created_at,
              req_u.full_name AS requested_by_name,
              rev_u.full_name AS reviewed_by_name
       FROM attendance_corrections ac
       JOIN employees e ON e.id = ac.employee_id
       LEFT JOIN employees req_u ON req_u.id = ac.requested_by
       LEFT JOIN employees rev_u ON rev_u.id = ac.reviewed_by
       ${whereSql}
       ORDER BY ac.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({ corrections: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * Ajukan koreksi absensi (oleh Karyawan untuk diri sendiri, atau oleh HR untuk karyawan).
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || "Data koreksi tidak valid",
      });
      return;
    }

    const targetEmployeeId =
      (req.user!.role === "hr_admin" || req.user!.role === "it_admin") &&
      parsed.data.employeeId
        ? parsed.data.employeeId
        : req.user!.id;

    const result = await query(
      `INSERT INTO attendance_corrections
         (employee_id, attendance_date, attendance_type, requested_time, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        targetEmployeeId,
        parsed.data.attendanceDate,
        parsed.data.attendanceType,
        parsed.data.requestedTime,
        parsed.data.reason,
        req.user!.id,
      ]
    );

    res.status(201).json({ correction: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().max(500).optional(),
});

/**
 * Persetujuan koreksi absen oleh Atasan atau Admin HR.
 * Bila disetujui, otomatis membuat/memperbarui log absensi dengan metode manual_correction.
 */
router.post(
  "/:id/review",
  requireAuth,
  requireRoles("supervisor", "hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Keputusan persetujuan tidak valid" });
        return;
      }

      const corrRes = await query<{
        id: string;
        employee_id: string;
        attendance_date: string;
        attendance_type: "check_in" | "check_out";
        requested_time: Date;
        status: string;
        supervisor_id: string | null;
      }>(
        `SELECT ac.*, e.supervisor_id
         FROM attendance_corrections ac
         JOIN employees e ON e.id = ac.employee_id
         WHERE ac.id = $1`,
        [req.params.id]
      );

      if (corrRes.rows.length === 0) {
        res.status(404).json({ error: "Pengajuan koreksi tidak ditemukan" });
        return;
      }

      const corr = corrRes.rows[0];
      if (corr.status !== "pending") {
        res.status(400).json({ error: "Pengajuan koreksi sudah diproses sebelumnya" });
        return;
      }

      if (
        req.user!.role === "supervisor" &&
        corr.supervisor_id !== req.user!.id
      ) {
        res.status(403).json({
          error: "Atasan hanya dapat menyetujui koreksi milik timnya sendiri",
        });
        return;
      }

      let createdLogId: string | null = null;
      if (parsed.data.decision === "approved") {
        const logRes = await query<{ id: string }>(
          `INSERT INTO attendance_logs
             (employee_id, attendance_date, attendance_type, status, method, recorded_at, needs_hr_review, hr_reviewed_by, hr_reviewed_at, hr_review_note)
           VALUES ($1, $2, $3, 'on_time', 'manual_correction', $4, FALSE, $5, NOW(), $6)
           RETURNING id`,
          [
            corr.employee_id,
            corr.attendance_date,
            corr.attendance_type,
            corr.requested_time,
            req.user!.id,
            parsed.data.reviewNote || "Disetujui melalui koreksi absen",
          ]
        );
        createdLogId = logRes.rows[0].id;
      }

      const updated = await query(
        `UPDATE attendance_corrections
         SET status = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             review_note = $3,
             attendance_log_id = COALESCE($4, attendance_log_id),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          parsed.data.decision,
          req.user!.id,
          parsed.data.reviewNote || null,
          createdLogId,
          corr.id,
        ]
      );

      res.json({ correction: updated.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
