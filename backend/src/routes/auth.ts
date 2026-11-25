import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../config/db";
import { requireAuth, signUserToken, UserRole } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email dan password wajib diisi dengan benar" });
      return;
    }

    const { email, password } = parsed.data;
    const result = await query<{
      id: string;
      nik: string;
      full_name: string;
      email: string;
      password_hash: string;
      role: UserRole;
      department: string;
      position: string;
      is_active: boolean;
    }>(
      `SELECT id, nik, full_name, email, password_hash, role, department, position, is_active
       FROM employees
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Email atau password salah" });
      return;
    }

    const user = result.rows[0];
    if (!user.is_active) {
      res.status(403).json({ error: "Akun karyawan sudah dinonaktifkan" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Email atau password salah" });
      return;
    }

    const token = signUserToken({
      id: user.id,
      nik: user.nik,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        nik: user.nik,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        department: user.department,
        position: user.position,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.id, e.nik, e.full_name, e.email, e.role, e.department, e.position,
              e.biometric_consent_status, e.biometric_consented_at,
              s.name AS shift_name, s.start_time, s.end_time,
              (SELECT COUNT(*) FROM face_embeddings fe WHERE fe.employee_id = e.id)::int AS face_vector_count
       FROM employees e
       LEFT JOIN shifts s ON s.id = e.shift_id
       WHERE e.id = $1`,
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Pengguna tidak ditemukan" });
      return;
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
