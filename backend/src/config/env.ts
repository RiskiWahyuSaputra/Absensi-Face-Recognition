import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres",
  databaseSsl:
    process.env.DATABASE_SSL === "true" ||
    (process.env.DATABASE_URL || "").includes("supabase"),
  faceEncryptionKey:
    process.env.FACE_ENCRYPTION_KEY ||
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  jwtSecret: process.env.JWT_SECRET || "dev_jwt_secret_change_in_production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  faceServiceUrl: process.env.FACE_SERVICE_URL || "http://localhost:8000",
  faceServiceApiKey:
    process.env.FACE_SERVICE_API_KEY || "internal_face_service_shared_secret",
  defaultMatchThreshold: Number(process.env.DEFAULT_MATCH_THRESHOLD || 0.45),
  defaultLivenessThreshold: Number(process.env.DEFAULT_LIVENESS_THRESHOLD || 0.5),
  duplicateWindowMinutes: Number(process.env.DUPLICATE_WINDOW_MINUTES || 5),
  checkoutMinHours: Number(process.env.CHECKOUT_MIN_HOURS || 4),
  proofPhotoRetentionDays: Number(process.env.PROOF_PHOTO_RETENTION_DAYS || 90),
  storageDir: process.env.STORAGE_DIR || "./storage/proofs",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 60),
};
