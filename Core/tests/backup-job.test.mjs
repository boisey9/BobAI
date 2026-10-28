import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupSchemaDigest, validateBackupLedgerCoverage } from "../scripts/lib/backup-coverage.mjs";
import { readBoundedBackupObject, runBackupJob, validateBackupJobPlan, validateBackupJobTargets } from "../scripts/lib/backup-job.mjs";
import { createEncryptedBundle, objectKeys, postgresEnvironment, backupProcessEnvironment, sha256 } from "../scripts/lib/backup.mjs";

const id = "33333333-3333-4333-8333-333333333333", projectId = "11111111-1111-4111-8111-111111111111";
const startedAt = "2026-10-28T19:00:00.000Z", capRole = "bob_backup_capture", ledRole = "bob_backup_ledger";
const url = role => `postgresql://${role}:synthetic-password@fixture.invalid/postgres?sslmode=verify-full`;
const role = { superuser: false, bypassRls: false, createRole: false, createDb: false, replication: false,
  ownsDatabase: false, databaseCreate: false, hasMembership: false, readOnly: true, isolation: "repeatable read", largeObjectsPresent: false };
const table = (name, patch = {}) => ({ schema: "public", name, kind: "r", schemaUsage: true, schemaCreate: false,
  select: true, anySelect: true, insert: false, update: false, otherWrite: false, rls: false, forceRls: false, owns: false,
  rowSecurityActive: false, partition: false, columns: [{ position: 1, name: "id", type: "uuid", notNull: true,
    default: "", identity: "", generated: "" }], definition: "", ...patch });
const catalog = { role, relations: [table("bob_backup_runs"), table("bob_projects"), table("bob_tasks")] };
const plan = () => ({ version: 1, enabled: true, capture: { version: 1, enabled: true, environment: "testing",
  target: { host: "fixture.invalid", port: 5432, database: "postgres", role: capRole, postgresMajor: 18 },
  project: { key: "bobai", id: projectId, ownerId: "fixture-owner", repository: "boisey9/BobAI" },
  expectedSchemaDigest: backupSchemaDigest(catalog) }, ledgerRole: ledRole, instance: "fixture",
  recipient: "age1" + "a".repeat(58), storage: { endpoint: "https://storage.invalid/", bucket: "fixture-backups", region: "us-east-2" }, retentionEnabled: false });
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });
async function fixture() {
  const directory = await mkdtemp("/private/tmp/bob-job-unit-"); roots.push(directory);
  const events = [], bytes = new Map(), captureCatalog = structuredClone(catalog);
  const ledgerCatalog = { role: { ...role }, relations: catalog.relations.map(t => table(t.name,
    t.name === "bob_backup_runs" ? { insert: true, update: true } : { select: false, anySelect: false })) };
  let ledgerStatus, inCapture = false;
  const capture = { query: vi.fn(async sql => {
    events.push("capture:" + sql.split(/\s/)[0]);
    if (sql.startsWith("BEGIN")) inCapture = true;
    if (sql === "ROLLBACK") inCapture = false;
    if (sql.includes("server_version_num")) return { rows: [{ database: "postgres", role: capRole, major: 18 }] };
    if (sql.includes("FROM public.bob_projects")) return { rows: [{ id: projectId, owner_id: "fixture-owner", repository: "boisey9/BobAI" }] };
    if (sql.includes("FROM pg_roles")) return { rows: [captureCatalog.role] };
    if (sql.includes("FROM pg_class")) return { rows: captureCatalog.relations };
    return { rows: [] };
  }), close: vi.fn(async () => { expect(inCapture).toBe(false); events.push("capture:close"); }) };
  const ledger = { query: vi.fn(async sql => {
    events.push("ledger:" + sql.split(/\s/)[0]);
    if (sql.includes("server_version_num")) return { rows: [{ database: "postgres", role: ledRole, major: 18 }] };
    if (sql.includes("FROM pg_roles")) return { rows: [ledgerCatalog.role] };
    if (sql.includes("FROM pg_class")) return { rows: ledgerCatalog.relations };
    if (sql.startsWith("INSERT")) ledgerStatus = "running";
    if (sql.includes("SET status='verified'")) ledgerStatus = "verified";
    if (sql.includes("failure_code='backup_job_failed'") && ledgerStatus !== "verified") ledgerStatus = "failed";
    return { rows: sql.includes("RETURNING") ? [{ id }] : [] };
  }), close: vi.fn(async () => { events.push("ledger:close"); }) };
  const storage = { put: vi.fn(async (key, data) => { events.push("storage:put"); bytes.set(key, Buffer.from(data)); }),
    get: vi.fn(async key => { events.push("storage:get"); return bytes.get(key); }),
    list: vi.fn(async () => ({ Contents: [] })), remove: vi.fn(async () => ({})) };
  const exportBundle = vi.fn(async input => {
    expect(inCapture).toBe(true); expect(input.client).toBe(capture); expect(input.connectionString).toBe(url(capRole));
    expect(input.expectedTables).toHaveLength(3); expect(input.coverage.projectId).toBe(projectId);
    events.push("export");
    const archive = join(directory, "archive"), manifestFile = join(directory, "manifest");
    await writeFile(archive, "synthetic-ciphertext"); await writeFile(manifestFile, "synthetic-manifest");
    return { archive, manifestFile, receipt: { version: 1, id, instance: "fixture", startedAt,
      keys: objectKeys("fixture", id, startedAt), bytes: 20, archiveSha256: sha256(Buffer.from("synthetic-ciphertext")),
      manifestSha256: sha256(Buffer.from("synthetic-manifest")) } };
  });
  const input = { plan: plan(), captureURL: url(capRole), ledgerURL: url(ledRole), directory, id, startedAt,
    openCapture: vi.fn(async () => capture), openLedger: vi.fn(async () => { events.push("ledger:open"); return ledger; }), storage, exportBundle };
  return { input, capture, ledger, captureCatalog, ledgerCatalog, events, bytes, status: () => ledgerStatus };
}

describe("snapshot-bound capture and separate ledger", () => {
  it.each([2, 3, 4])("bounds downloaded object content to exactly %i bytes", async expected => {
    const body = { async *[Symbol.asyncIterator]() { yield Buffer.from("a"); yield Buffer.from("bc"); }, destroy: vi.fn() };
    if (expected === 3) expect((await readBoundedBackupObject(body, expected)).toString()).toBe("abc");
    else await expect(readBoundedBackupObject(body, expected)).rejects.toThrow("storage_readback_failed");
    expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("completes capture before ledger writes and verifies all three uploaded objects", async () => {
    const f = await fixture(), result = await runBackupJob(f.input);
    expect(result).toMatchObject({ event: "backup.verified", id, retentionChecked: false });
    expect(f.events.indexOf("export")).toBeLessThan(f.events.indexOf("capture:close"));
    expect(f.events.indexOf("capture:close")).toBeLessThan(f.events.indexOf("ledger:open"));
    expect(f.events.indexOf("ledger:INSERT")).toBeLessThan(f.events.indexOf("storage:put"));
    expect(f.input.storage.put).toHaveBeenCalledTimes(3); expect(f.input.storage.get).toHaveBeenCalledTimes(3);
    expect(f.input.storage.list).not.toHaveBeenCalled(); expect(f.input.storage.remove).not.toHaveBeenCalled();
    expect(f.status()).toBe("verified"); expect(f.ledger.close).toHaveBeenCalledOnce();
    for (const [sql] of f.capture.query.mock.calls) expect(sql).toMatch(/^(BEGIN|SET LOCAL|SELECT|LOCK TABLE|ROLLBACK)/);
  });
  it.each(["missing-read", "schema", "capture-write", "role", "rls", "export", "rollback", "close"])("refuses %s without opening the ledger or touching storage", async failure => {
    const f = await fixture();
    if (failure === "missing-read") f.captureCatalog.relations[2].select = false;
    if (failure === "schema") f.input.plan.capture.expectedSchemaDigest = "0".repeat(64);
    if (failure === "capture-write") f.captureCatalog.relations[0].insert = true;
    if (failure === "role") f.captureCatalog.role.bypassRls = true;
    if (failure === "rls") f.captureCatalog.relations[2].rls = true;
    if (failure === "export") f.input.exportBundle.mockRejectedValue(new Error("private export details"));
    if (failure === "rollback") { const original = f.capture.query; f.capture.query = vi.fn((sql, p) => sql === "ROLLBACK" ? Promise.reject(new Error("private")) : original(sql, p)); f.capture.close.mockResolvedValue(); }
    if (failure === "close") f.capture.close.mockRejectedValue(new Error("private"));
    await expect(runBackupJob(f.input)).rejects.toThrow("backup_coverage_");
    expect(f.input.openLedger).not.toHaveBeenCalled();
    for (const method of Object.values(f.input.storage)) expect(method).not.toHaveBeenCalled();
  });
  it.each(["extra-read", "column-read", "extra-write", "owner", "missing-insert"])("rejects ledger capability mismatch %s before any writes or uploads", async failure => {
    const f = await fixture();
    if (failure === "extra-read") f.ledgerCatalog.relations[1].select = true;
    if (failure === "column-read") f.ledgerCatalog.relations[1].anySelect = true;
    if (failure === "extra-write") f.ledgerCatalog.relations[1].update = true;
    if (failure === "owner") f.ledgerCatalog.role.ownsDatabase = true;
    if (failure === "missing-insert") f.ledgerCatalog.relations[0].insert = false;
    await expect(runBackupJob(f.input)).rejects.toThrow("backup_coverage_");
    expect(f.ledger.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
    expect(f.input.storage.put).not.toHaveBeenCalled(); expect(f.ledger.close).toHaveBeenCalledOnce();
  });
  it("refuses matching principals or a second database target before connecting", async () => {
    const f = await fixture();
    expect(() => validateBackupJobPlan({ ...f.input.plan, ledgerRole: capRole })).toThrow("separate_credentials");
    for (const wrong of [url(capRole), url(ledRole).replace("fixture.invalid", "other.invalid"), url(ledRole) + "&options=x"])
      expect(() => validateBackupJobTargets(f.input.plan, url(capRole), wrong)).toThrow("target_mismatch");
    await expect(runBackupJob({ ...f.input, plan: { enabled: false } })).rejects.toThrow("disabled");
    expect(f.input.openCapture).not.toHaveBeenCalled();
  });
  it("refuses malformed opt-in plans without relying on URL type coercion", () => {
    for (const changed of [{ ...plan(), version: 2 }, { ...plan(), retentionEnabled: "true" },
      { ...plan(), storage: { ...plan().storage, endpoint: ["https://storage.invalid/"] } },
      { ...plan(), storage: { ...plan().storage, endpoint: "http://storage.invalid/" } }])
      expect(() => validateBackupJobPlan(changed)).toThrow("invalid_job_plan");
  });
  it.each([1, 2, 3])("rejects corrupt readback of object %i without retention or false verification", async object => {
    const f = await fixture(), get = f.input.storage.get; let n = 0;
    f.input.storage.get = vi.fn(key => ++n === object ? Buffer.from("corrupt") : get(key));
    await expect(runBackupJob(f.input)).rejects.toThrow("storage_readback_failed");
    expect(f.status()).toBe("failed"); expect(f.input.storage.list).not.toHaveBeenCalled();
  });
  it("does not upload after an unconfirmed registration commit", async () => {
    const f = await fixture(), query = f.ledger.query;
    f.ledger.query = vi.fn((sql, params) => sql === "COMMIT" ? Promise.reject(new Error("connection lost")) : query(sql, params));
    await expect(runBackupJob(f.input)).rejects.toThrow("job_failed");
    expect(f.input.storage.put).not.toHaveBeenCalled();
    expect(f.ledger.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"))).toHaveLength(1);
  });
  it("limits explicitly enabled retention and preserves verified state when housekeeping fails", async () => {
    const f = await fixture(); f.input.plan.retentionEnabled = true;
    const old = new Date(Date.now() - 40 * 86400000), expired = "fixture/2026-01-01/old-backup.dump.age";
    f.input.storage.list.mockResolvedValue({ Contents: [{ Key: expired, LastModified: old },
      { Key: "other/2026-01-01/old-backup.dump.age", LastModified: old }, { Key: "fixture/private-key", LastModified: old }] });
    f.input.storage.remove.mockResolvedValue({ Errors: [{}] });
    await expect(runBackupJob(f.input)).rejects.toThrow("retention_failed");
    expect(f.input.storage.remove).toHaveBeenCalledWith([expired]); expect(f.status()).toBe("verified");
  });
  it("rejects repeated pagination tokens instead of looping", async () => {
    const f = await fixture(); f.input.plan.retentionEnabled = true;
    f.input.storage.list.mockResolvedValue({ IsTruncated: true, NextContinuationToken: "repeated", Contents: [] });
    await expect(runBackupJob(f.input)).rejects.toThrow("retention_inventory_incomplete");
    expect(f.input.storage.list).toHaveBeenCalledTimes(2); expect(f.input.storage.remove).not.toHaveBeenCalled();
  });
  it("bounds unique empty pagination pages before any deletion", async () => {
    const f = await fixture(); f.input.plan.retentionEnabled = true; let page = 0;
    f.input.storage.list.mockImplementation(async () => ({ IsTruncated: true, NextContinuationToken: String(++page), Contents: [] }));
    await expect(runBackupJob(f.input)).rejects.toThrow("retention_bound_exceeded");
    expect(f.input.storage.list).toHaveBeenCalledTimes(100); expect(f.input.storage.remove).not.toHaveBeenCalled();
    expect(f.status()).toBe("verified");
  });
  it("denies a missing ledger or a ledger with filtered rows", () => {
    expect(() => validateBackupLedgerCoverage(catalog)).toThrow("ledger_privilege_mismatch");
    const input = { role, relations: [table("bob_backup_runs", { insert: true, update: true, rls: true })] };
    expect(() => validateBackupLedgerCoverage(input)).toThrow("ledger_privilege_mismatch");
  });
  it("refuses count-inventory mismatch before starting encryption or a dump process", async () => {
    const f = await fixture(), client = { query: vi.fn(async sql => sql.includes("pg_export_snapshot") ?
      { rows: [{ snapshot: "fixture", version: "18" }] } : { rows: [] }) };
    await expect(createEncryptedBundle({ client, connectionString: "not-used", directory: f.input.directory,
      recipient: plan().recipient, id, instance: "fixture", startedAt, expectedTables: [{ schema: "pgx", name: "missing" }],
      pgDump: "/not-executed", age: "/not-executed" })).rejects.toThrow("inventory does not match");
  });
  it("does not pass ledger, storage, provider or PG override secrets to capture subprocesses", () => {
    for (const [key, value] of Object.entries({ AWS_SECRET_ACCESS_KEY: "synthetic-storage", BOB_BACKUP_LEDGER_DATABASE_URL: "synthetic-ledger",
      OPENAI_API_KEY: "synthetic-provider", PGOPTIONS: "-c role=owner", PGSERVICE: "other", NODE_OPTIONS: "--unhandled-rejections=warn" })) vi.stubEnv(key, value);
    const env = postgresEnvironment(url(capRole), { readOnly: true });
    expect(env.PGUSER).toBe(capRole); expect(env.PGOPTIONS).toBe("-c default_transaction_read_only=on");
    for (const key of ["AWS_SECRET_ACCESS_KEY", "BOB_BACKUP_LEDGER_DATABASE_URL", "OPENAI_API_KEY", "PGSERVICE", "NODE_OPTIONS"])
      expect(env).not.toHaveProperty(key);
    expect(backupProcessEnvironment()).not.toHaveProperty("PGPASSWORD");
  });
  it("keeps the CLI disabled even with the complete legacy job environment", async () => {
    const cli = fileURLToPath(new URL("../scripts/backup-database.mjs", import.meta.url));
    const run = args => { try { execFileSync(process.execPath, [cli, ...args], { timeout: 10000,
      env: { PATH: "/usr/bin:/bin", BOB_BACKUP_DATABASE_URL: "legacy-secret", AWS_SECRET_ACCESS_KEY: "storage-secret",
        BOB_BACKUP_SCHEDULE_ENABLED: "true" }, stdio: ["ignore", "pipe", "pipe"] }); throw new Error("unexpected success"); }
      catch (e) { expect(e.status).toBe(1); expect(e.stdout.toString()).toBe(""); return JSON.parse(e.stderr.toString()); } };
    expect(run([])).toEqual({ event: "backup.failed", code: "disabled" });
    const f = await fixture(), disabled = join(f.input.directory, "disabled.json");
    await writeFile(disabled, JSON.stringify({ version: 1, enabled: false }), { mode: 0o600 });
    expect(run(["--plan-file=" + disabled, "--capture-url-file=/not-read", "--ledger-url-file=/not-read"]).code).toBe("disabled");
  });
});
