import fs from "fs";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env";

export function ensureStorageDir(): void {
  fs.mkdirSync(env.storageDir, { recursive: true });
}

/**
 * Menyimpan foto bukti absensi ke disk VPS (dihapus otomatis setelah 90 hari sesuai UU PDP).
 * Foto registrasi TIDAK pernah menggunakan fungsi ini.
 */
export function saveProofPhoto(base64Image: string, attendanceDate: string): string {
  ensureStorageDir();
  const cleanBase64 = base64Image.includes(",")
    ? base64Image.split(",")[1]
    : base64Image;
  const buffer = Buffer.from(cleanBase64, "base64");
  const dateFolder = path.join(env.storageDir, attendanceDate);
  fs.mkdirSync(dateFolder, { recursive: true });
  const filename = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}.jpg`;
  const relativePath = path.join(attendanceDate, filename);
  const fullPath = path.join(env.storageDir, relativePath);
  fs.writeFileSync(fullPath, buffer);
  return relativePath;
}

export function getProofPhotoFullPath(relativePath: string): string {
  const resolvedBase = path.resolve(env.storageDir);
  const resolvedTarget = path.resolve(env.storageDir, relativePath);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw new Error("Path traversal tidak diizinkan");
  }
  return resolvedTarget;
}

export function deleteProofPhotoFile(relativePath: string): boolean {
  try {
    const fullPath = getProofPhotoFullPath(relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
