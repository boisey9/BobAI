import { describe, expect, it } from "vitest";
import { describeBackupReadiness } from "../src/operations/backup-readiness.js";

const now = Date.parse("2026-09-07T12:00:00Z");
const verified = { status: "verified", started_at: "2026-09-07T07:17:00Z",
  verified_at: "2026-09-07T07:18:00Z", retention_checked_at: "2026-09-07T07:19:00Z", failure_code: null };

describe("encrypted backup readiness", () => {
  it("distinguishes no backup, healthy backup, and an archive older than the recovery target", () => {
    expect(describeBackupReadiness([], now).status).toBe("unavailable");
    expect(describeBackupReadiness([verified], now).status).toBe("available");
    expect(describeBackupReadiness([verified], now + 86400000).status).toBe("stale");
    expect(describeBackupReadiness([{ ...verified, started_at: "2026-09-05T07:17:00Z" }], now).status).toBe("stale");
  });
  it("does not let an older successful backup hide failed or stuck jobs", () => {
    const latest = { status: "failed", started_at: "2026-09-07T11:00:00Z", verified_at: null,
      retention_checked_at: null, failure_code: "backup_job_failed" };
    expect(describeBackupReadiness([latest, verified], now).status).toBe("unavailable");
    expect(describeBackupReadiness([{ ...latest, status: "running", failure_code: null }, verified], now).status).toBe("unavailable");
    expect(describeBackupReadiness([{ ...verified, retention_checked_at: null }], now).status).toBe("unavailable");
  });
});
