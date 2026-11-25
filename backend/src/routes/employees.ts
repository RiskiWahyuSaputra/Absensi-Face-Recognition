import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../config/db";
import { requireAuth, requireRoles } from "../middleware/auth";
import { logBiometricAccess } from "../middleware/audit";

const router = Router();

const createEmployeeSchema = z.object({
  nik: z.string().min(2).max(50),
  fullName: z.string().min(2).max(150),
  email: z.string().email(),
  password: z.string().min(6).default("Karyawan123!"),
  role: z.enum(["employee", "supervisor", "hr_admin", "it_admin"]).default("employee"),
  department: z.string().default("Umum"),
  position: z.string().default("Staf"),
  shiftId: z.string().uuid().nullable().optional(),
  supervisorId: z.string().uuid().nullable().optional(),
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 digit angka").default("123456"),
});

router.get(
  "/",
  requireAuth,
  requireRoles("hr_admin", "it_admin", "supervisor"),
  async (req, res, next) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const params: unknown[] = [];
      const where: string[] = [];

      if (!includeInactive) {
        where.push("e.is_active = TRUE");
      }
      if (req.user!.role === "supervisor") {
        params.push(req.user!.id);
        where.push(`(e.supervisor_id = $${params.length} OR e.id = $${params.length})`);
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      const result = await query(
        `SELECT e.id, e.nik, e.full_name, e.email, e.role, e.department, e.position,
                e.shift_id, s.name AS shift_name, e.supervisor_id,
                sup.full_name AS supervisor_name,
                e.biometric_consent_status, e.biometric_consented_at,
                e.is_active, e.deactivated_at, e.created_at,
                (SELECT COUNT(*) FROM face_embeddings fe WHERE fe.employee_id = e.id)::int AS face_vector_count
         FROM employees e
         LEFT JOIN shifts s ON s.id = e.shift_id
         LEFT JOIN employees sup ON sup.id = e.supervisor_id
         ${whereSql}
         ORDER BY e.created_at DESC`,
        params
      );
      res.json({ employees: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const parsed = createEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "Data tidak valid" });
        return;
      }

      const d = parsed.data;
      const passwordHash = await bcrypt.hash(d.password, 10);
      const pinHash = await bcrypt.hash(d.pin, 10);

      const result = await query(
        `INSERT INTO employees (nik, full_name, email, password_hash, role, department, position, shift_id, supervisor_id, pin_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, nik, full_name, email, role, department, position, shift_id, supervisor_id, biometric_consent_status, is_active`,
        [
          d.nik,
          d.fullName,
          d.email,
          passwordHash,
          d.role,
          d.department,
          d.position,
          d.shiftId || null,
          d.supervisorId || null,
          pinHash,
        ]
      );

      res.status(201).json({ employee: result.rows[0] });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "NIK atau email sudah terdaftar" });
        return;
      }
      next(err);
    }
  }
);

const consentSchema = z.object({
  status: z.enum(["consented", "declined_pin_only"]),
  note: z.string().max(500).optional(),
});

/**
 * UU PDP No. 27/2022: Formulir persetujuan data biometrik sebelum registrasi wajah,
 * atau pilih alternatif PIN bagi karyawan yang menolak.
 */
router.post(
  "/:id/biometric-consent",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const parsed = consentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Status persetujuan tidak valid" });
        return;
      }

      const { status, note } = parsed.data;
      const employeeId = String(req.params.id);

      // Jika menolak biometrik, pastikan vektor wajah yang mungkin ada ikut dihapus
      if (status === "declined_pin_only") {
        await query("DELETE FROM face_embeddings WHERE employee_id = $1", [
          employeeId,
        ]);
      }

      const result = await query(
        `UPDATE employees
         SET biometric_consent_status = $1,
             biometric_consented_at = NOW(),
             biometric_consent_note = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, nik, full_name, biometric_consent_status, biometric_consented_at`,
        [status, note || null, employeeId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Karyawan tidak ditemukan" });
        return;
      }

      await logBiometricAccess({
        req,
        action: "RECORD_BIOMETRIC_CONSENT",
        targetEmployeeId: employeeId,
        details: { status, note: note || null },
      });

      res.json({ employee: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * F-07 & UU PDP: HR menonaktifkan karyawan dan seluruh data vektor wajahnya ikut dihapus permanen.
 */
router.post(
  "/:id/deactivate",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const employeeId = String(req.params.id);
      const deletedVecs = await query(
        "DELETE FROM face_embeddings WHERE employee_id = $1 RETURNING id",
        [employeeId]
      );
      const result = await query(
        `UPDATE employees
         SET is_active = FALSE, deactivated_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING id, nik, full_name, is_active, deactivated_at`,
        [employeeId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Karyawan tidak ditemukan" });
        return;
      }

      await logBiometricAccess({
        req,
        action: "DEACTIVATE_EMPLOYEE_AND_PURGE_BIOMETRIC",
        targetEmployeeId: employeeId,
        details: { deletedFaceVectors: deletedVecs.rowCount || 0 },
      });

      res.json({
        message: "Karyawan dinonaktifkan dan seluruh data wajah telah dihapus (UU PDP).",
        employee: result.rows[0],
        deletedFaceVectors: deletedVecs.rowCount || 0,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
