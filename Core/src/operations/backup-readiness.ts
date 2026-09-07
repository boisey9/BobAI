import { neon } from "@neondatabase/serverless";
import type { Check } from "./readiness.js";

type BackupRun = {
  status: string;
  started_at: string;
  verified_at: string | null;
  retention_checked_at: string | null;
  failure_code: string | null;
};

export function describeBackupReadiness(runs: BackupRun[], now = Date.now()): Check {
  const checkedAt = new Date(now).toISOString();
  const verified = runs.find(run => run.verified_at);
  if (!verified?.verified_at) return { status: "unavailable", checkedAt, detail: "No verified encrypted backup is recorded." };
  const snapshotAt = Date.parse(verified.started_at);
  const detail = `Last verified backup snapshot: ${verified.started_at}.`;
  if (!Number.isFinite(snapshotAt) || snapshotAt > now || now - snapshotAt > 24 * 60 * 60 * 1000)
    return { status: "stale", checkedAt, detail };
  const latest = runs[0];
  if (latest?.failure_code || latest?.status === "failed")
    return { status: "unavailable", checkedAt, detail: `${detail} The latest job or retention cleanup failed.` };
  if (latest?.status === "running" && now - Date.parse(latest.started_at) > 15 * 60 * 1000)
    return { status: "unavailable", checkedAt, detail: `${detail} A backup job has not finished within its deadline.` };
  if (!verified.retention_checked_at)
    return { status: "unavailable", checkedAt, detail: `${detail} Thirty-day retention has not been verified.` };
  return { status: "available", checkedAt, detail };
}

export async function backupReadiness(databaseURL: string, ownerId: string): Promise<Check> {
  try {
    const sql = neon(databaseURL, { fetchOptions: { signal: AbortSignal.timeout(5_000) } });
    // Keep the latest attempt and latest success even after many failed retries.
    const rows = await sql`SELECT status, started_at, verified_at, retention_checked_at, failure_code
      FROM public.bob_backup_runs WHERE id IN (
        (SELECT id FROM public.bob_backup_runs WHERE owner_id=${ownerId} ORDER BY started_at DESC LIMIT 1),
        (SELECT id FROM public.bob_backup_runs WHERE owner_id=${ownerId} AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1)
      ) ORDER BY started_at DESC`;
    return describeBackupReadiness(rows as BackupRun[]);
  } catch {
    return { status: "unavailable", checkedAt: new Date().toISOString(), detail: "Backup verification records could not be read." };
  }
}
