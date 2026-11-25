import { Router } from "express";
import { z } from "zod";
import { getSystemSettingNumber, query } from "../config/db";
import { env } from "../config/env";
import { requireAuth, requireRoles } from "../middleware/auth";
import { logBiometricAccess } from "../middleware/audit";
import { analyzeFace, checkFaceQuality } from "../services/faceServiceClient";
import { decryptFaceVector, encryptFaceVector } from "../utils/crypto";
import { cosineSimilarity } from "../utils/similarity";

const router = Router();

/**
 * Cek kualitas 1 foto registrasi secara real-time (1 wajah, cukup terang, tidak buram).
 * Foto tidak pernah disimpan.
 */
router.post(
  "/quality-check",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const imageBase64 = req.body?.imageBase64;
      if (typeof imageBase64 !== "string" || imageBase64.length < 50) {
        res.status(400).json({ error: "Foto base64 wajib dikirim" });
        return;
      }
      const quality = await checkFaceQuality(imageBase64);
      res.json({ quality });
    } catch (err) {
      next(err);
    }
  }
);

const enrollSchema = z.object({
  photos: z
    .array(
      z.object({
        poseLabel: z.string().min(1).max(50),
        imageBase64: z.string().min(50),
      })
    )
    .min(3, "Minimal 3 foto registrasi wajah diperlukan")
    .max(5, "Maksimal 5 foto registrasi wajah"),
});

/**
 * Registrasi 3-5 foto wajah oleh HR:
 * 1. Pastikan karyawan sudah menyetujui formulir biometrik (UU PDP).
 * 2. Cek kualitas tiap foto & ekstrak vektor 128-dimensi via face-service.
 * 3. Enkripsi vektor dengan AES-256-GCM dan simpan di DB.
 * 4. Foto registrasi dibuang (TIDAK disimpan).
 */
router.post(
  "/:employeeId/enroll",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const employeeId = String(req.params.employeeId);
      const parsed = enrollSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || "Data registrasi tidak valid",
        });
        return;
      }

      const empRes = await query<{
        id: string;
        full_name: string;
        is_active: boolean;
        biometric_consent_status: string;
      }>(
        "SELECT id, full_name, is_active, biometric_consent_status FROM employees WHERE id = $1",
        [employeeId]
      );

      if (empRes.rows.length === 0 || !empRes.rows[0].is_active) {
        res.status(404).json({ error: "Karyawan aktif tidak ditemukan" });
        return;
      }

      if (empRes.rows[0].biometric_consent_status !== "consented") {
        res.status(400).json({
          error:
            "Karyawan wajib menandatangani persetujuan data biometrik terlebih dahulu (UU PDP No. 27/2022).",
        });
        return;
      }

      const extracted: Array<{
        poseLabel: string;
        embedding: number[];
        qualityScore: number;
      }> = [];

      for (const item of parsed.data.photos) {
        const analysis = await analyzeFace({ imageBase64: item.imageBase64 });
        if (!analysis.face_detected || !analysis.embedding) {
          res.status(400).json({
            error: `Foto pose "${item.poseLabel}" gagal: wajah tidak terdeteksi.`,
          });
          return;
        }
        if (analysis.quality && !analysis.quality.passed) {
          res.status(400).json({
            error: `Foto pose "${item.poseLabel}" tidak memenuhi kualitas: ${analysis.quality.reasons.join(" ")}`,
          });
          return;
        }
        extracted.push({
          poseLabel: item.poseLabel,
          embedding: analysis.embedding,
          qualityScore: analysis.quality?.quality_score ?? 1.0,
        });
      }

      // Ganti vektor lama dengan registrasi baru
      await query("DELETE FROM face_embeddings WHERE employee_id = $1", [
        employeeId,
      ]);

      for (const vec of extracted) {
        const encrypted = encryptFaceVector(vec.embedding);
        await query(
          `INSERT INTO face_embeddings (employee_id, pose_label, embedding_encrypted, quality_score, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            employeeId,
            vec.poseLabel,
            encrypted,
            vec.qualityScore,
            req.user!.id,
          ]
        );
      }

      await logBiometricAccess({
        req,
        action: "ENROLL_FACE_VECTORS",
        targetEmployeeId: employeeId,
        details: {
          vectorCount: extracted.length,
          poses: extracted.map((e) => e.poseLabel),
        },
      });

      res.status(201).json({
        message: `${extracted.length} vektor wajah berhasil dienkripsi (AES-256) dan disimpan. Foto registrasi tidak disimpan.`,
        vectorCount: extracted.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Langkah 6 Registrasi PRD: Karyawan mencoba verifikasi sekali untuk memastikan wajahnya dikenali.
 */
router.post(
  "/:employeeId/verify-test",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const employeeId = req.params.employeeId;
      const imageBase64 = req.body?.imageBase64;
      if (typeof imageBase64 !== "string" || imageBase64.length < 50) {
        res.status(400).json({ error: "Foto uji verifikasi wajib dikirim" });
        return;
      }

      const threshold = await getSystemSettingNumber(
        "match_threshold",
        env.defaultMatchThreshold
      );
      const analysis = await analyzeFace({ imageBase64 });
      if (!analysis.face_detected || !analysis.embedding) {
        res.json({ matched: false, score: 0, threshold, reason: "Wajah tidak terdeteksi" });
        return;
      }

      const stored = await query<{ embedding_encrypted: string }>(
        "SELECT embedding_encrypted FROM face_embeddings WHERE employee_id = $1",
        [employeeId]
      );
      if (stored.rows.length === 0) {
        res.status(400).json({ error: "Karyawan belum memiliki vektor wajah terdaftar" });
        return;
      }

      let bestScore = -1;
      for (const row of stored.rows) {
        const vec = decryptFaceVector(row.embedding_encrypted);
        const score = cosineSimilarity(analysis.embedding, vec);
        if (score > bestScore) bestScore = score;
      }

      const matched = bestScore >= threshold;
      res.json({
        matched,
        score: Number(bestScore.toFixed(4)),
        threshold,
        liveness: analysis.liveness,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
