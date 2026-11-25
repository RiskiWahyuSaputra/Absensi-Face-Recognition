import { Pool, QueryResult, QueryResultRow } from "pg";
import { env } from "./env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function getSystemSettingNumber(
  key: string,
  fallback: number
): Promise<number> {
  const res = await query<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = $1",
    [key]
  );
  if (res.rows.length === 0) return fallback;
  const parsed = Number(res.rows[0].value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
