import { neon } from "@neondatabase/serverless";
import type { BobCoreConfig } from "../config.js";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };
export type CredentialRateLimiter = (credentialHash: string, operation: "core" | "ai") => Promise<RateLimitResult>;

export function createCredentialRateLimiter(config: BobCoreConfig): CredentialRateLimiter | undefined {
  if (!config.rateLimitsEnabled) return undefined;
  if (!config.databaseURL) throw new Error("Credential rate limiting requires PostgreSQL.");
  const sql = neon(config.databaseURL);
  return async (credentialHash, operation) => {
    const limit = operation === "ai" ? config.aiRequestsPerMinute : config.coreRequestsPerMinute;
    // PostgreSQL serializes this upsert, including across different instances.
    // Its clock sets the bucket, never a caller-supplied date or header.
    const rows = await sql.query(`INSERT INTO public.bob_credential_rate_limits
      (owner_id,credential_hash,operation_class,window_start,request_count)
      VALUES($1,$2,$3,date_trunc('minute',now()),1)
      ON CONFLICT(owner_id,credential_hash,operation_class) DO UPDATE SET
        request_count=CASE WHEN bob_credential_rate_limits.window_start=EXCLUDED.window_start
          THEN LEAST(bob_credential_rate_limits.request_count+1,$4+1) ELSE 1 END,
        window_start=EXCLUDED.window_start
      RETURNING request_count<=$4 AS allowed,
        GREATEST(1,ceil(extract(epoch FROM window_start+interval '1 minute'-clock_timestamp())))::int AS retry_seconds`,
    [config.ownerId, credentialHash, operation, limit], { fetchOptions: { signal: AbortSignal.timeout(5_000) } });
    const row = rows[0];
    if (!row || typeof row.allowed !== "boolean" || !Number.isInteger(row.retry_seconds))
      throw new Error("Request capacity returned an invalid result.");
    return { allowed: row.allowed, retryAfterSeconds: Math.max(1, Math.min(60, row.retry_seconds as number)) };
  };
}
