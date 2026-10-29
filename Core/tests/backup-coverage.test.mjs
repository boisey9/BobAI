import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupSchemaDigest, inspectBackupCoverage, readBackupCatalog, validateBackupCoverage } from "../scripts/lib/backup-coverage.mjs";
import { runBackupCoveragePreflight, validateBackupPreflightPlan, validateBackupPreflightTarget } from "../scripts/lib/backup-preflight.mjs";

const column = (patch = {}) => ({ position: 1, name: "id", type: "integer", notNull: true, default: "", identity: "", generated: "", ...patch });
const relation = (patch = {}) => ({ schema: "public", name: "bob_tasks", kind: "r", schemaUsage: true,
  schemaCreate: false, select: true, anySelect: true, insert: false, update: false, otherWrite: false, rls: false,
  forceRls: false, owns: false, rowSecurityActive: false, partition: false, columns: [column()], definition: "", ...patch });
const catalog = (relations = [relation()], role = {}) => ({ relations, role: {
  superuser: false, bypassRls: false, createRole: false, createDb: false, replication: false,
  ownsDatabase: false, databaseCreate: false, hasMembership: false, readOnly: true,
  largeObjectsPresent: false, isolation: "repeatable read", ...role } });
const plan = (input = catalog()) => ({ version: 1, enabled: true, environment: "testing",
  target: { host: "backup-test.invalid", port: 5432, database: "postgres", role: "bob_backup_fixture", postgresMajor: 18 },
  project: { key: "bobai", id: "11111111-1111-4111-8111-111111111111", ownerId: "fixture-owner", repository: "boisey9/BobAI" },
  expectedSchemaDigest: backupSchemaDigest(input) });
const target = "postgresql://bob_backup_fixture:synthetic-password@backup-test.invalid/postgres?sslmode=require";
function fakeClient(input = catalog(), bound = plan(input)) {
  return { query: vi.fn(async (sql) => {
    if (sql.includes("FROM pg_roles")) return { rows: [input.role] };
    if (sql.includes("FROM pg_class")) return { rows: input.relations };
    if (sql.includes("server_version_num")) return { rows: [{ database: bound.target.database, role: bound.target.role, major: bound.target.postgresMajor }] };
    if (sql.includes("FROM public.bob_projects")) return { rows: [{ id: bound.project.id, owner_id: bound.project.ownerId, repository: bound.project.repository }] };
    return { rows: [] };
  }) };
}

describe("complete backup visibility and schema review", () => {
  it("accepts an ordinary fully readable snapshot without mutating its catalog", () => {
    const input = catalog([relation({ name: "z" }), relation({ name: "a" })]), before = structuredClone(input);
    const evidence = validateBackupCoverage(input);
    expect(evidence).toMatchObject({ tableCount: 2, relationCount: 2, completeVisibility: true });
    expect(backupSchemaDigest(catalog([...input.relations].reverse()))).toBe(evidence.schemaDigest);
    expect(input).toEqual(before);
  });
  it.each([{ relations: [] }, { relations: [relation({ kind: "v" })] }])("does not certify an empty table dataset", ({ relations }) => {
    expect(() => validateBackupCoverage(catalog(relations))).toThrow("empty_catalog");
  });
  it.each(["schemaUsage", "select"])("rejects an unreadable relation through %s", permission => {
    expect(() => validateBackupCoverage(catalog([relation(), relation({ schema: "private_auth", name: "tokens", [permission]: false })]))).toThrow("read_privilege_required");
  });
  it("detects fourteen hidden auth tables without excluding them from inventory", () => {
    const input = catalog([relation(), ...Array.from({ length: 14 }, (_, i) => relation({ name: `bob_auth_${i}`, select: false }))]);
    expect(() => validateBackupCoverage(input)).toThrow("read_privilege_required");
    expect(input.relations).toHaveLength(15);
  });
  it.each(["superuser", "bypassRls", "createRole", "createDb", "replication", "ownsDatabase", "databaseCreate", "hasMembership"])("refuses elevated role flag %s", key => {
    expect(() => validateBackupCoverage(catalog(undefined, { [key]: true }))).toThrow("restricted_role_required");
  });
  it.each(["rls", "forceRls", "rowSecurityActive"])("does not turn %s into permission to bypass row policies", key => {
    expect(() => validateBackupCoverage(catalog([relation({ [key]: true })]))).toThrow("rls_review_required");
  });
  it.each(["schemaCreate", "owns", "insert", "update", "otherWrite"])("rejects excess relation privilege %s", key => {
    expect(() => validateBackupCoverage(catalog([relation({ [key]: true })]))).toThrow("excess_privilege");
  });
  it("allows only the existing operational ledger insert/update exception", () => {
    expect(validateBackupCoverage(catalog([relation({ name: "bob_backup_runs", insert: true, update: true })])).completeVisibility).toBe(true);
    expect(() => validateBackupCoverage(catalog([relation({ name: "bob_backup_runs", otherWrite: true })]))).toThrow("excess_privilege");
    expect(() => validateBackupCoverage(catalog([relation({ schema: "other", name: "bob_backup_runs", insert: true })]))).toThrow("excess_privilege");
  });
  it.each(["p", "m", "f"])("refuses unsupported relation kind %s", kind => {
    expect(() => validateBackupCoverage(catalog([relation({ kind })]))).toThrow("relation_kind_unsupported");
  });
  it("rejects partition leaves and large objects", () => {
    expect(() => validateBackupCoverage(catalog([relation({ partition: true })]))).toThrow("relation_kind_unsupported");
    expect(() => validateBackupCoverage(catalog(undefined, { largeObjectsPresent: true }))).toThrow("large_objects_unsupported");
  });
  it.each([{ readOnly: false }, { isolation: "read committed" }])("requires a coherent read-only snapshot %j", role => {
    expect(() => validateBackupCoverage(catalog(undefined, role))).toThrow("snapshot_required");
  });
  it("pins added/removed relations, columns and types, independently of read grants", () => {
    const input = catalog(), expectedSchemaDigest = backupSchemaDigest(input);
    for (const changed of [catalog([relation(), relation({ name: "new_auth" })]),
      catalog([relation({ name: "renamed" })]), catalog([relation({ columns: [column({ type: "text" })] })]),
      catalog([relation({ columns: [column(), column({ position: 2, name: "secret" })] })])])
      expect(() => validateBackupCoverage(changed, { expectedSchemaDigest })).toThrow("schema_changed");
    expect(backupSchemaDigest(catalog([relation({ select: false })]))).toBe(expectedSchemaDigest);
  });
  it("refuses malformed, duplicate and unbounded catalogs", () => {
    for (const input of [null, {}, catalog([relation(), relation()]), catalog([relation({ name: "x".repeat(64) })]),
      catalog([relation({ columns: [column(), column()] })]), catalog([relation({ select: "true" })]),
      catalog(Array.from({ length: 10001 }, (_, i) => relation({ name: `table_${i}` })))])
      expect(() => validateBackupCoverage(input)).toThrow("invalid_catalog");
  });
  it("sanitizes catalog failures without retry or raw driver details", async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error("postgres://secret@private-host/private-query")) };
    const error = await readBackupCatalog(client).catch(e => e);
    expect(error.message).toBe("backup_coverage_catalog_unavailable");
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(error)).not.toContain("secret");
    expect(client.query).toHaveBeenCalledOnce();
  });
  it("reads the catalog instead of permission-filtered information_schema views", async () => {
    const client = fakeClient();
    expect((await inspectBackupCoverage(client)).completeVisibility).toBe(true);
    for (const [sql] of client.query.mock.calls) expect(sql.trim()).toMatch(/^SELECT /);
    expect(client.query.mock.calls[1][0]).toContain("FROM pg_class");
    expect(client.query.mock.calls[1][0]).toContain("has_any_column_privilege");
  });
});

describe("default-off, source-bound read-only preflight", () => {
  it.each([undefined, {}, { enabled: false }, { version: 1, enabled: false }])("is disabled without explicit configuration %j", async input => {
    const client = { query: vi.fn() };
    await expect(runBackupCoveragePreflight(client, input)).rejects.toThrow("disabled");
    expect(client.query).not.toHaveBeenCalled();
  });
  it("rejects malformed plans and production PostgreSQL 17", () => {
    for (const input of [{ ...plan(), enabled: "true" }, { ...plan(), extra: true },
      { ...plan(), expectedSchemaDigest: "" }, { ...plan(), project: { ...plan().project, key: "rfq" } },
      { ...plan(), environment: "production", target: { ...plan().target, postgresMajor: 17 } }])
      expect(() => validateBackupPreflightPlan(input)).toThrow("invalid_plan");
  });
  it("accepts only the exact direct target and explicit TLS policy", () => {
    expect(validateBackupPreflightTarget(target, plan())).toBe(target);
    for (const bad of [target.replace("fixture:", "owner:"), target.replace("backup-test.invalid", "other.invalid"),
      target.replace("/postgres?", "/other?"), target.replace("sslmode=require", "sslmode=disable"),
      target+"&host=other.invalid", target+"&options=-c%20row_security%3Doff", target+"&sslmode=require", target+"#fragment",
      target.replace("@backup-test.invalid", "@backup-test.invalid:5433")])
      expect(() => validateBackupPreflightTarget(bad, plan())).toThrow("target_mismatch");
  });
  it("checks identity and digest in one snapshot, then rolls back without exporting", async () => {
    const client = fakeClient(), result = await runBackupCoveragePreflight(client, plan());
    expect(result).toMatchObject({ event: "backup.coverage.checked", completeVisibility: true, backupVerified: false });
    expect(client.query.mock.calls[0][0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    for (const [sql] of client.query.mock.calls) expect(sql).toMatch(/^(?:BEGIN|SET LOCAL|SELECT|ROLLBACK)/);
  });
  it.each(["database", "role", "major", "project"])("rejects source identity mismatch %s before catalog acceptance", async field => {
    const wrong = plan();
    if (field === "project") wrong.project.id = "22222222-2222-4222-8222-222222222222";
    else if (field === "major") wrong.target.postgresMajor = 17;
    else wrong.target[field] = "different";
    const client = fakeClient(catalog(), wrong);
    await expect(runBackupCoveragePreflight(client, plan())).rejects.toThrow("source_mismatch");
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
  });
  it("refuses schema changes and does not swallow a rollback failure", async () => {
    const client = fakeClient(catalog([relation({ name: "changed" })]));
    await expect(runBackupCoveragePreflight(client, plan())).rejects.toThrow("schema_changed");
    const broken = fakeClient(), query = broken.query;
    broken.query = vi.fn((sql, params) => sql === "ROLLBACK" ? Promise.reject(new Error("private failure")) : query(sql, params));
    await expect(runBackupCoveragePreflight(broken, plan())).rejects.toThrow("rollback_unconfirmed");
  });
});

describe("operator CLI refuses before secret or network access", () => {
  const cli = fileURLToPath(new URL("../scripts/check-backup-coverage.mjs", import.meta.url));
  function invoke(args) {
    try { return { status: 0, stdout: execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10000,
      env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"] }), stderr: "" }; }
    catch (e) { return { status: e.status, stdout: e.stdout.toString(), stderr: e.stderr.toString() }; }
  }
  it("does nothing without an explicitly enabled plan", () => {
    const result = invoke(["--database-url-file=/not-read"]);
    expect(result.status).toBe(1);expect(JSON.parse(result.stderr).code).toBe("disabled");expect(result.stdout).toBe("");
  });
  it("keeps disabled plans inert and rejects public/symlinked/oversized private inputs", () => {
    const root = mkdtempSync(join(tmpdir(), "bob-coverage-cli-")), path = join(root, "plan.json"), credential = join(root, "url");
    try {
      writeFileSync(path, JSON.stringify({ version: 1, enabled: false }), { mode: 0o600 });
      expect(JSON.parse(invoke(["--plan-file="+path,"--database-url-file=/not-read"]).stderr).code).toBe("disabled");
      writeFileSync(path, JSON.stringify(plan()));chmodSync(path, 0o644);
      expect(JSON.parse(invoke(["--plan-file="+path]).stderr).code).toBe("private_input_required");
      chmodSync(path, 0o600);writeFileSync(credential, target.replace("backup-test.invalid", "wrong.invalid"), { mode: 0o600 });
      const badTarget=invoke(["--plan-file="+path,"--database-url-file="+credential]);
      expect(JSON.parse(badTarget.stderr).code).toBe("target_mismatch");expect(badTarget.stderr).not.toContain("synthetic-password");
      symlinkSync(credential, join(root,"link"));
      expect(JSON.parse(invoke(["--plan-file="+path,"--database-url-file="+join(root,"link")]).stderr).code).toBe("private_input_required");
      writeFileSync(path,"x".repeat(16385));
      expect(JSON.parse(invoke(["--plan-file="+path]).stderr).code).toBe("private_input_required");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
