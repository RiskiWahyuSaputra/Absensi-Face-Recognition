import crypto from "crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";

function getKeyBuffer(hexKey = env.faceEncryptionKey): Buffer {
  const buf = Buffer.from(hexKey, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "FACE_ENCRYPTION_KEY harus berupa 64 karakter hex (32 byte) untuk AES-256-GCM"
    );
  }
  return buf;
}

/**
 * Enkripsi vektor wajah 128-dimensi dengan AES-256-GCM sebelum disimpan ke PostgreSQL.
 * Kunci disimpan di luar database (environment variable / secret manager) sesuai UU PDP.
 */
export function encryptFaceVector(
  vector: number[],
  hexKey = env.faceEncryptionKey
): string {
  const key = getKeyBuffer(hexKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(vector), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptFaceVector(
  payload: string,
  hexKey = env.faceEncryptionKey
): number[] {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Format vektor wajah terenkripsi tidak valid");
  }
  const [ivHex, authTagHex, dataHex] = parts;
  const key = getKeyBuffer(hexKey);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  const parsed = JSON.parse(decrypted.toString("utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("Hasil dekripsi vektor wajah bukan array");
  }
  return parsed.map(Number);
}

export function sha256Hex(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateKioskToken(): string {
  return `kiosk_${crypto.randomBytes(24).toString("hex")}`;
}
