import { createApp } from "./app";
import { env } from "./config/env";
import { runBootstrapSeed } from "./services/bootstrapSeed";
import { cleanupExpiredProofPhotos } from "./services/cleanupService";
import { ensureStorageDir } from "./utils/storage";

async function start() {
  ensureStorageDir();

  try {
    await runBootstrapSeed();
  } catch (err) {
    console.error("[BOOTSTRAP] Gagal menjalankan seed awal:", err);
  }

  // Jadwal pembersihan otomatis foto bukti absen > 90 hari setiap 6 jam (UU PDP No. 27/2022)
  setInterval(() => {
    cleanupExpiredProofPhotos()
      .then((r) => {
        if (r.deletedCount > 0) {
          console.log(
            `[UU PDP CLEANUP] ${r.deletedCount} foto bukti > ${r.retentionDays} hari dihapus.`
          );
        }
      })
      .catch((err) => console.error("[UU PDP CLEANUP] Error:", err));
  }, 6 * 60 * 60 * 1000);

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[BACKEND] Server berjalan di port ${env.port} (${env.nodeEnv})`);
  });
}

start();
