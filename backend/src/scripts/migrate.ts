import fs from "fs";
import path from "path";
import { pool } from "../config/db";
import { runBootstrapSeed } from "../services/bootstrapSeed";

async function migrate() {
  const sqlPath = path.resolve(__dirname, "../../../database/init.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("[MIGRATE] Menjalankan skema database ke PostgreSQL / Supabase...");
  await pool.query(sql);
  console.log("[MIGRATE] Skema tabel & ekstensi pgvector berhasil diterapkan.");
  await runBootstrapSeed();
  await pool.end();
  console.log("[MIGRATE] Selesai.");
}

migrate().catch((err) => {
  console.error("[MIGRATE] Gagal:", err);
  process.exit(1);
});
