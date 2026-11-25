import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import authRoutes from "./routes/auth";
import employeeRoutes from "./routes/employees";
import faceRegistrationRoutes from "./routes/faceRegistration";
import kioskRoutes from "./routes/kiosk";
import attendanceRoutes from "./routes/attendance";
import correctionRoutes from "./routes/corrections";
import shiftRoutes from "./routes/shifts";
import reportRoutes from "./routes/reports";
import adminRoutes from "./routes/admin";

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(","),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "15mb" }));

  // Global rate limiter
  app.use(
    "/api/",
    rateLimit({
      windowMs: 60 * 1000,
      max: env.rateLimitPerMinute * 3,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/employees", employeeRoutes);
  app.use("/api/face-registration", faceRegistrationRoutes);
  app.use("/api/kiosk", kioskRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/corrections", correctionRoutes);
  app.use("/api/shifts", shiftRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/admin", adminRoutes);

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[ERROR]", err);
    res.status(500).json({
      error:
        env.nodeEnv === "production"
          ? "Terjadi kesalahan internal server"
          : err.message,
    });
  });

  return app;
}
