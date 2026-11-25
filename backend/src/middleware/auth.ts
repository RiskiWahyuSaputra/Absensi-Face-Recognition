import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type UserRole = "employee" | "supervisor" | "hr_admin" | "it_admin";

export interface AuthUser {
  id: string;
  nik: string;
  fullName: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      kiosk?: {
        id: string;
        deviceCode: string;
        name: string;
        location: string;
        rateLimitPerMin: number;
      };
    }
  }
}

export function signUserToken(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Autentikasi diperlukan" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Token sesi tidak valid atau kedaluwarsa" });
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Autentikasi diperlukan" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: "Anda tidak memiliki izin untuk mengakses fitur ini",
      });
      return;
    }
    next();
  };
}
