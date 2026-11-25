import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { requireAuth, requireRoles } from "../middleware/auth";
import { logBiometricAccess } from "../middleware/audit";
import { cleanupExpiredProofPhotos } from "../services/cleanupService";
import { checkFaceServiceHealth } from "../services/faceServiceClient";
import { generateKioskToken, sha256Hex } from "../utils/crypto";

const router = Router();

/**
 * Admin IT: Kelola perangkat kiosk (daftar, buat token baru, cabut token bila tablet hilang).
 */
router.get(
  "/kiosks",
  requireAuth,
  requireRoles("it_admin", "hr_admin"),
  async (_req, res, next) => {
    try {
      const result = await query(
        `SELECT id, device_code, name, location, is_active, rate_limit_per_min,
                last_seen_at, revoked_at, created_at
         FROM kiosks
         ORDER BY created_at DESC`
      );
      res.json({ kiosks: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

const createKioskSchema = z.object({
  deviceCode: z.string().min(2).max(50),
  name: z.string().min(2).max(120),
  location: z.string().min(2).max(150),
  rateLimitPerMin: z.number().int().min(10).max(300).default(60),
});

router.post(
  "/kiosks",
  requireAuth,
  requireRoles("it_admin"),
  async (req, res, next) => {
    try {
      const parsed = createKioskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Data perangkat kiosk tidak valid" });
        return;
      }
      const rawToken = generateKioskToken();
      const tokenHash = sha256Hex(rawToken);
      const d = parsed.data;

      const result = await query(
        `INSERT INTO kiosks (device_code, name, location, token_hash, rate_limit_per_min, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, device_code, name, location, is_active, rate_limit_per_min, created_at`,
        [d.deviceCode, d.name, d.location, tokenHash, d.rateLimitPerMin, req.user!.id]
      );

      res.status(201).json({
        kiosk: result.rows[0],
        // Token plaintext hanya ditampilkan sekali saat pembuatan!
        kioskToken: rawToken,
        warning: "Simpan token ini di tablet kiosk. Token tidak akan ditampilkan lagi.",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/kiosks/:id/revoke",
  requireAuth,
  requireRoles("it_admin"),
  async (req, res, next) => {
    try {
      const result = await query(
        `UPDATE kiosks
         SET is_active = FALSE, revoked_at = NOW()
         WHERE id = $1
         RETURNING id, device_code, name, is_active, revoked_at`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Kiosk tidak ditemukan" });
        return;
      }
      res.json({ kiosk: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Pengaturan ambang kecocokan & aturan sistem.
 */
router.get(
  "/settings",
  requireAuth,
  requireRoles("it_admin", "hr_admin"),
  async (_req, res, next) => {
    try {
      const result = await query("SELECT * FROM system_settings ORDER BY key ASC");
      let faceServiceHealth: Record<string, unknown> = { status: "unreachable" };
      try {
        faceServiceHealth = await checkFaceServiceHealth();
      } catch {
        // ignore
      }
      res.json({ settings: result.rows, faceServiceHealth });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  "/settings/:key",
  requireAuth,
  requireRoles("it_admin"),
  async (req, res, next) => {
    try {
      const value = String(req.body?.value ?? "").trim();
      if (!value) {
        res.status(400).json({ error: "Nilai pengaturan wajib diisi" });
        return;
      }
      const result = await query(
        `UPDATE system_settings
         SET value = $1, updated_by = $2, updated_at = NOW()
         WHERE key = $3
         RETURNING *`,
        [value, req.user!.id, req.params.key]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Kunci pengaturan tidak ditemukan" });
        return;
      }

      await logBiometricAccess({
        req,
        action: "UPDATE_SYSTEM_SETTING",
        details: { key: req.params.key, value },
      });

      res.json({ setting: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Log akses data biometrik (UU PDP: hanya Admin HR & Admin IT).
 */
router.get(
  "/biometric-audit-logs",
  requireAuth,
  requireRoles("it_admin", "hr_admin"),
  async (_req, res, next) => {
    try {
      const result = await query(
        `SELECT l.id, l.action, l.actor_role, l.ip_address, l.details, l.created_at,
                actor.full_name AS actor_name,
                target.full_name AS target_employee_name,
                target.nik AS target_employee_nik
         FROM biometric_access_logs l
         LEFT JOIN employees actor ON actor.id = l.actor_id
         LEFT JOIN employees target ON target.id = l.target_employee_id
         ORDER BY l.created_at DESC
         LIMIT 200`
      );
      res.json({ logs: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Trigger manual pembersihan foto bukti absen > 90 hari (UU PDP).
 */
router.post(
  "/cleanup-proof-photos",
  requireAuth,
  requireRoles("it_admin"),
  async (_req, res, next) => {
    try {
      const summary = await cleanupExpiredProofPhotos();
      res.json({ message: "Pembersihan foto bukti selesai", ...summary });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
