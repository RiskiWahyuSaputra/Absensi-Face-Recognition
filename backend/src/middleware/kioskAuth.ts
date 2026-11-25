import { NextFunction, Request, Response } from "express";
import { query } from "../config/db";
import { sha256Hex } from "../utils/crypto";

// In-memory sliding window rate limiter per kiosk device
const kioskHits = new Map<string, number[]>();

export async function requireKioskAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token =
    (req.headers["x-kiosk-token"] as string | undefined) ||
    (req.query.kioskToken as string | undefined);

  if (!token) {
    res.status(401).json({ error: "Token perangkat kiosk diperlukan" });
    return;
  }

  try {
    const tokenHash = sha256Hex(token.trim());
    const result = await query<{
      id: string;
      device_code: string;
      name: string;
      location: string;
      is_active: boolean;
      rate_limit_per_min: number;
    }>(
      `SELECT id, device_code, name, location, is_active, rate_limit_per_min
       FROM kiosks
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Token kiosk tidak dikenali" });
      return;
    }

    const kiosk = result.rows[0];
    if (!kiosk.is_active) {
      res.status(403).json({
        error: "Perangkat kiosk telah dinonaktifkan/dicabut oleh Admin IT",
      });
      return;
    }

    // Per-kiosk rate limit check (PRD: batasi jumlah request per menit)
    const now = Date.now();
    const windowStart = now - 60_000;
    const recent = (kioskHits.get(kiosk.id) || []).filter(
      (ts) => ts > windowStart
    );
    if (recent.length >= kiosk.rate_limit_per_min) {
      res.status(429).json({
        error: "Batas permintaan per menit kiosk terlampaui. Coba sesaat lagi.",
      });
      return;
    }
    recent.push(now);
    kioskHits.set(kiosk.id, recent);

    // Update last_seen_at secara asinkron
    query("UPDATE kiosks SET last_seen_at = NOW() WHERE id = $1", [
      kiosk.id,
    ]).catch(() => {});

    req.kiosk = {
      id: kiosk.id,
      deviceCode: kiosk.device_code,
      name: kiosk.name,
      location: kiosk.location,
      rateLimitPerMin: kiosk.rate_limit_per_min,
    };
    next();
  } catch (err) {
    next(err);
  }
}
