import { Request } from "express";
import { query } from "../config/db";

/**
 * Mencatat setiap akses atau perubahan data biometrik (UU PDP No. 27/2022).
 */
export async function logBiometricAccess(params: {
  req: Request;
  action: string;
  targetEmployeeId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const actorId = params.req.user?.id || null;
  const actorRole = params.req.user?.role || (params.req.kiosk ? "kiosk" : "system");
  const ip =
    (params.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    params.req.socket.remoteAddress ||
    "unknown";

  await query(
    `INSERT INTO biometric_access_logs (actor_id, actor_role, action, target_employee_id, ip_address, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actorId,
      actorRole,
      params.action,
      params.targetEmployeeId || null,
      ip,
      JSON.stringify(params.details || {}),
    ]
  );
}
