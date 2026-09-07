import { describe, expect, it } from "vitest";
import { expiredBackupKeys, isOutsideDirectory, objectKeys, postgresEnvironment, validateManifest } from "../scripts/lib/backup.mjs";
import { assertRecoveryDrillTarget } from "../scripts/lib/recovery-drill-target.mjs";

describe("backup boundaries", () => {
  it("binds the drill's branch guard to the actual endpoint and rejects connection overrides", () => {
    const branch = "br-solitary-wind-ay86swt0";
    const url = "postgresql://owner:synthetic@ep-steep-poetry-ayo4lqz2.c-5.us-east-2.aws.neon.tech/drill?sslmode=require";
    expect(() => assertRecoveryDrillTarget(branch, url)).not.toThrow();
    expect(() => assertRecoveryDrillTarget(branch, url.replace("ep-steep-poetry-ayo4lqz2", "ep-other"))).toThrow("allowlisted");
    expect(() => assertRecoveryDrillTarget("br-rapid-hall-aykwycjn", url)).toThrow("allowlisted");
    expect(() => assertRecoveryDrillTarget(branch, `${url}&host=production.example`)).toThrow("allowlisted");
  });
  it("requires recovery secrets outside the repository, including dot-prefixed children", () => {
    expect(isOutsideDirectory("/work/bob", "/work/bob/..private/key")).toBe(false);
    expect(isOutsideDirectory("/work/bob", "/work/bob")).toBe(false);
    expect(isOutsideDirectory("/work/bob", "/work/bob/key")).toBe(false);
    expect(isOutsideDirectory("/work/bob", "/work/recovery/key")).toBe(true);
  });
  it("retains thirty full days and never deletes another instance, unknown keys or the current backup", () => {
    const now = Date.parse("2026-10-07T10:00:00Z");
    const old = new Date("2026-09-01T10:00:00Z");
    const current = "personal/2026-10-07/current-backup.dump.age";
    expect(expiredBackupKeys([
      { Key: "personal/2026-09-01/expired-backup.dump.age", LastModified: old },
      { Key: "company/2026-09-01/expired-backup.dump.age", LastModified: old },
      { Key: "personal/private-key", LastModified: old },
      { Key: "personal/2026-09-01/unknown-time.dump.age" },
      { Key: current, LastModified: old },
      { Key: "personal/2026-09-07/boundary-backup.dump.age", LastModified: new Date(now - 30 * 86400000) },
    ], "personal", now, [current])).toEqual(["personal/2026-09-01/expired-backup.dump.age"]);
  });
  it("rejects pooled connections and keeps passwords out of command arguments", () => {
    expect(() => postgresEnvironment("not-a-url-with-a-secret")).toThrow("valid direct PostgreSQL");
    expect(() => postgresEnvironment("postgresql://owner:secret@ep-one-pooler.example/db")).toThrow("direct");
    const env = postgresEnvironment("postgresql://owner:p%40ss@ep-one.example/db");
    expect(env.PGPASSWORD).toBe("p@ss");
    expect(env.PGDATABASE).toBe("db");
    expect(env.PGSSLMODE).toBe("verify-full");
    expect(() => objectKeys("../company", "backup-id", new Date().toISOString())).toThrow();
  });
  it("rejects swapping an encrypted archive with a different backup's manifest", () => {
    const manifest = { format: "bob-disaster-backup", version: 1, id: "first", instance: "personal", archiveSha256: "first-hash", tables: [] };
    expect(() => validateManifest(manifest, { id: "second", instance: "personal", archiveSha256: "first-hash" }, "first-hash")).toThrow();
    expect(() => validateManifest(manifest, { ...manifest }, "changed-archive")).toThrow();
  });
  it("accepts a versioned bound manifest and rejects malformed inventories", () => {
    const manifest = { format: "bob-disaster-backup", version: 1, id: "test-backup-01", instance: "personal",
      startedAt: "2026-09-07T07:17:00Z", recipientFingerprint: "b".repeat(64), archiveSha256: "a".repeat(64),
      tables: [{ schema: "public", name: "bob_tasks", rows: "12" }] };
    const receipt = { ...manifest, keys: objectKeys(manifest.instance, manifest.id, manifest.startedAt), bytes: 42 };
    expect(() => validateManifest(manifest, receipt, manifest.archiveSha256)).not.toThrow();
    expect(() => validateManifest(manifest, { ...receipt, keys: {} }, manifest.archiveSha256)).toThrow();
    expect(() => validateManifest({ ...manifest, tables: [{ schema: "public", name: "bob_tasks", rows: 12 }] }, manifest, manifest.archiveSha256)).toThrow();
  });
});
