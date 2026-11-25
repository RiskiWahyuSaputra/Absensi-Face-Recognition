import { getSystemSettingNumber, query } from "../config/db";
import { env } from "../config/env";
import { deleteProofPhotoFile } from "../utils/storage";

/**
 * UU PDP No. 27/2022: Foto bukti absen dihapus otomatis setelah 90 hari.
 */
export async function cleanupExpiredProofPhotos(): Promise<{
  retentionDays: number;
  deletedCount: number;
}> {
  const retentionDays = await getSystemSettingNumber(
    "proof_photo_retention_days",
    env.proofPhotoRetentionDays
  );

  const expired = await query<{ id: string; proof_photo_path: string }>(
    `SELECT id, proof_photo_path
     FROM attendance_logs
     WHERE proof_photo_path IS NOT NULL
       AND proof_photo_deleted_at IS NULL
       AND recorded_at < NOW() - ($1 || ' days')::interval`,
    [retentionDays]
  );

  let deletedCount = 0;
  for (const row of expired.rows) {
    deleteProofPhotoFile(row.proof_photo_path);
    await query(
      `UPDATE attendance_logs
       SET proof_photo_path = NULL, proof_photo_deleted_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    deletedCount++;
  }

  return { retentionDays, deletedCount };
}
