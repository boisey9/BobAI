// Mutations are confined to a freshly owned local fixture, never a hosted target.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { realpathSync as filesystemRealpath } from "node:fs";
import { randomUUID } from "node:crypto";
import { socket, enabled, bin, env, execute, syntheticConnection } from "../scripts/lib/workflow-synthetic-postgres.ts";
import { backupSchemaDigest, inspectBackupCoverage, readBackupCatalog } from "../scripts/lib/backup-coverage.mjs";
import { runBackupCoveragePreflight } from "../scripts/lib/backup-preflight.mjs";
import { runBackupJob } from "../scripts/lib/backup-job.mjs";
import { captureInventory, createEncryptedBundle, quoteIdentifier, sha256, validateManifest } from "../scripts/lib/backup.mjs";

const root = process.env.BOB_BACKUP_COVERAGE_TEST_ROOT;
const available = enabled && !!root && /^\/tmp\/bob-backup-coverage-run-[a-zA-Z0-9_-]+$/.test(root);
const full = "bob_backup_synthetic_full", restricted = "bob_backup_synthetic_public";
const ledgerRole = "bob_backup_synthetic_nobypass";
const projectId = "11111111-1111-4111-8111-111111111111";
let major;
async function query(sql, parameters = [], user = "bob_workflow_test_admin", database = "postgres") {
  const client = syntheticConnection(user, database);
  try { return await client.query(sql, parameters); } finally { client.close(); }
}
async function snapshot(user, run) {
  const client = syntheticConnection(user);
  try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public"); return await run(client);
  } finally { await client.query("ROLLBACK"); client.close(); }
}
async function makePlan(user = full) {
  const digest = await snapshot(full, async client => backupSchemaDigest(await readBackupCatalog(client)));
  return { version: 1, enabled: true, environment: "testing",
    target: { host: "synthetic.invalid", port: 5432, database: "postgres", role: user, postgresMajor: major },
    project: { key: "bobai", id: projectId, ownerId: "fixture-owner", repository: "boisey9/BobAI" },
    expectedSchemaDigest: digest };
}
async function preflight(plan) {
  const client = syntheticConnection(plan.target.role);
  try { return await runBackupCoveragePreflight(client, plan); } finally { client.close(); }
}
async function fingerprints(client) {
  const tables = await captureInventory(client), results = [];
  for (const table of tables) {
    const digest = (await client.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest
      FROM ONLY ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} t`)).rows[0].digest;
    results.push({ ...table, digest });
  }
  return results;
}

describe.skipIf(!available)("owned local PostgreSQL backup coverage", () => {
  beforeAll(async () => {
    const marker = JSON.parse(await readFile(join(root, "SYNTHETIC-ONLY.json"), "utf8"));
    expect(marker).toMatchObject({ kind: "owned-backup-coverage-fixture", socket, bin: bin.slice(0, -1) });
    const actual = (await query("SELECT current_setting('data_directory') AS data,current_setting('listen_addresses') AS listening,(current_setting('server_version_num')::int/10000)::int AS major")).rows[0];
    if (marker.executor === "docker") expect(actual.data).toBe(marker.data);
    else expect(filesystemRealpath(actual.data)).toBe(filesystemRealpath(marker.data));
    expect(actual.listening).toBe(""); major = actual.major; expect([17, 18]).toContain(major);
    await query(`CREATE ROLE ${full} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE ${restricted} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE ${ledgerRole} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
  });
  beforeEach(async () => {
    // These names and the cluster were verified above; all values are synthetic.
    await query("DROP DATABASE IF EXISTS workflow_backup_restore_synthetic WITH (FORCE)");
    const statements = [`DROP SCHEMA IF EXISTS backup_private CASCADE; DROP SCHEMA IF EXISTS pgx CASCADE; DROP SCHEMA public CASCADE;
      CREATE SCHEMA public; REVOKE ALL ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO ${full},${restricted},${ledgerRole};
      CREATE TABLE public.bob_projects(id uuid PRIMARY KEY,project_key text,owner_id text,repository text);
      INSERT INTO public.bob_projects VALUES('${projectId}','bobai','fixture-owner','boisey9/BobAI');
      CREATE TABLE public.bob_tasks(id integer PRIMARY KEY,value text); INSERT INTO public.bob_tasks VALUES(1,'before');
      CREATE TABLE public.bob_backup_runs(id uuid PRIMARY KEY,owner_id text NOT NULL,instance_key text NOT NULL,
        status text NOT NULL CHECK(status IN ('running','verified','failed')),started_at timestamptz,
        verified_at timestamptz,failed_at timestamptz,retention_checked_at timestamptz,archive_key text,
        manifest_key text,receipt_key text,ciphertext_sha256 text,size_bytes bigint,failure_code text)`];
    for (let i = 0; i < 7; i++) statements.push(`CREATE TABLE public.fixture_business_${i}(id integer,value text); INSERT INTO public.fixture_business_${i} VALUES(${i},'synthetic business')`);
    for (let i = 0; i < 14; i++) statements.push(`CREATE TABLE public.fixture_auth_${i}(id integer,value text); INSERT INTO public.fixture_auth_${i} VALUES(${i},'synthetic auth')`);
    statements.push(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${full},${restricted};
      GRANT INSERT,UPDATE ON public.bob_backup_runs TO ${full},${restricted};
      GRANT SELECT,INSERT,UPDATE ON public.bob_backup_runs TO ${ledgerRole}`);
    for (let i = 0; i < 14; i++) statements.push(`REVOKE SELECT ON public.fixture_auth_${i} FROM ${restricted}`);
    await query(statements.join(";\n"));
  });
  it("finds all fourteen denied tables instead of accepting the visible ten", async () => {
    await snapshot(restricted, async client => {
      const catalog = await readBackupCatalog(client);
      expect(catalog.relations).toHaveLength(24);
      expect(catalog.relations.filter(t => !t.select)).toHaveLength(14);
      await expect(inspectBackupCoverage(client)).rejects.toThrow("read_privilege_required");
    });
    await expect(preflight(await makePlan(restricted))).rejects.toThrow("read_privilege_required");
  });
  it("accepts the bound restricted full reader without modifying rows, ACLs or the ledger", async () => {
    const before = await snapshot(full, fingerprints), plan = await makePlan();
    const aclBefore = (await query("SELECT relname,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY relname")).rows;
    expect(await preflight(plan)).toMatchObject({ tableCount: 24, completeVisibility: true, backupVerified: false });
    expect(await snapshot(full, fingerprints)).toEqual(before);
    expect((await query("SELECT relname,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY relname")).rows).toEqual(aclBefore);
    await expect(query("UPDATE public.bob_tasks SET value='forbidden'", [], full)).rejects.toThrow(/permission denied/);
  });
  it("rejects new columns and newly granted tables against the reviewed digest", async () => {
    const plan = await makePlan();
    await query("ALTER TABLE public.bob_tasks ADD COLUMN new_sensitive_content text");
    await expect(preflight(plan)).rejects.toThrow("schema_changed");
    await query("ALTER TABLE public.bob_tasks DROP COLUMN new_sensitive_content");
    await query(`CREATE TABLE public.new_auth(id int); GRANT SELECT ON public.new_auth TO ${full}`);
    await expect(preflight(plan)).rejects.toThrow("schema_changed");
  });
  it("finds unreadable schemas and rejects silent row filtering", async () => {
    await query(`CREATE SCHEMA backup_private; CREATE TABLE backup_private.hidden(id int); GRANT SELECT ON backup_private.hidden TO ${full}`);
    await expect(preflight(await makePlan())).rejects.toThrow("read_privilege_required");
    await query(`GRANT USAGE ON SCHEMA backup_private TO ${full}; ALTER TABLE public.bob_tasks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY hidden_rows ON public.bob_tasks USING (false)`);
    expect((await query("SELECT count(*)::int AS n FROM public.bob_tasks", [], full)).rows[0].n).toBe(0);
    await expect(preflight(await makePlan())).rejects.toThrow("rls_review_required");
  });
  it("rejects column writes, schema creation and inherited authority", async () => {
    const plan = await makePlan();
    await query(`GRANT UPDATE(value) ON public.bob_tasks TO ${full}`);
    await expect(preflight(plan)).rejects.toThrow("excess_privilege");
    await query(`REVOKE UPDATE(value) ON public.bob_tasks FROM ${full}; GRANT CREATE ON SCHEMA public TO ${full}`);
    await expect(preflight(plan)).rejects.toThrow("excess_privilege");
    await query(`REVOKE CREATE ON SCHEMA public FROM ${full}; GRANT ${restricted} TO ${full}`);
    try { await expect(preflight(plan)).rejects.toThrow("restricted_role_required"); }
    finally { await query(`REVOKE ${restricted} FROM ${full}`); }
  });
  it("requires sequence read access and refuses nextval authority", async () => {
    await query("CREATE SEQUENCE public.fixture_sequence");
    const plan = await makePlan();
    await expect(preflight(plan)).rejects.toThrow("read_privilege_required");
    await query(`GRANT SELECT ON SEQUENCE public.fixture_sequence TO ${full}`);
    expect((await preflight(plan)).relationCount).toBe(25);
    await query(`GRANT USAGE ON SEQUENCE public.fixture_sequence TO ${full}`);
    await expect(preflight(plan)).rejects.toThrow("excess_privilege");
  });
  it("rejects partition, materialized-view and large-object storage", async () => {
    await query(`CREATE TABLE public.partitioned(id int) PARTITION BY RANGE(id); GRANT SELECT ON public.partitioned TO ${full}`);
    await expect(preflight(await makePlan())).rejects.toThrow("relation_kind_unsupported");
    await query(`DROP TABLE public.partitioned; CREATE MATERIALIZED VIEW public.materialized AS SELECT 1 AS id; GRANT SELECT ON public.materialized TO ${full}`);
    await expect(preflight(await makePlan())).rejects.toThrow("relation_kind_unsupported");
    await query("DROP MATERIALIZED VIEW public.materialized");
    const oid = (await query("SELECT lo_create(0) AS oid")).rows[0].oid;
    try { await expect(preflight(await makePlan())).rejects.toThrow("large_objects_unsupported"); }
    finally { await query("SELECT lo_unlink($1::oid)", [oid]); }
  });
  it("pins view definitions and fails wrong project identity", async () => {
    await query(`CREATE VIEW public.fixture_view AS SELECT id FROM public.bob_tasks; GRANT SELECT ON public.fixture_view TO ${full}`);
    const plan = await makePlan();
    expect((await preflight(plan)).tableCount).toBe(24);
    await query("CREATE OR REPLACE VIEW public.fixture_view AS SELECT id FROM public.bob_tasks WHERE id>1");
    await expect(preflight(plan)).rejects.toThrow("schema_changed");
    plan.project.id = "22222222-2222-4222-8222-222222222222";
    await expect(preflight(plan)).rejects.toThrow("source_mismatch");
  });
  it("rolls back successful and rejected checks on a reusable dedicated connection", async () => {
    const plan = await makePlan(), client = syntheticConnection(full);
    try {
      await runBackupCoveragePreflight(client, plan);
      expect((await client.query("SELECT current_setting('transaction_read_only') AS mode")).rows[0].mode).toBe("off");
      await expect(runBackupCoveragePreflight(client, { ...plan, expectedSchemaDigest: "0".repeat(64) })).rejects.toThrow("schema_changed");
      expect((await client.query("SELECT current_setting('transaction_read_only') AS mode")).rows[0].mode).toBe("off");
    } finally { client.close(); }
  });
  it("reuses complete snapshot encryption and restores all twenty-four tables into an empty fixture", async () => {
    const directory = join(root, "archive-fixture"), identity = join(directory, "synthetic.age");
    await mkdir(directory, { mode: 0o700 });
    await execute("/usr/local/bin/age-keygen", ["-o", identity], { env, timeout: 10000 });
    const recipient = (await execute("/usr/local/bin/age-keygen", ["-y", identity], { env })).stdout.trim();
    // Test-only transport adapter binds pg_dump to the owned socket and fixed role.
    // It discards the helper's environment; production TLS/target guards stay intact.
    const wrapper = join(directory, "pg-dump-fixture");
    await writeFile(wrapper, `#!${process.execPath}\nconst {execFileSync}=require('node:child_process');\nprocess.stdout.write(execFileSync(${JSON.stringify(bin + "pg_dump")},${JSON.stringify(["-h", socket, "-U", full, "-d", "postgres"])}.concat(process.argv.slice(2)),{env:${JSON.stringify({ ...env, PGOPTIONS: "-c default_transaction_read_only=on" })},maxBuffer:20000000}));\n`, { mode: 0o700 });
    let before, bundle;
    await snapshot(full, async client => {
      expect((await inspectBackupCoverage(client)).tableCount).toBe(24);
      before = await fingerprints(client);
      await query("UPDATE public.bob_tasks SET value='after snapshot'");
      bundle = await createEncryptedBundle({ client, connectionString: "postgresql://fixture:synthetic@synthetic.invalid/postgres",
        directory, recipient, id: "synthetic-coverage-20261028", instance: "synthetic-coverage",
        startedAt: new Date().toISOString(), pgDump: wrapper, age: "/usr/local/bin/age" });
    });
    const manifest = JSON.parse((await execute("/usr/local/bin/age", ["-d", "-i", identity, bundle.manifestFile], { env })).stdout);
    validateManifest(manifest, bundle.receipt, sha256(await readFile(bundle.archive)));
    expect(manifest.tables).toHaveLength(24);
    const plain = join(directory, "restore.dump");
    await execute("/usr/local/bin/age", ["-d", "-i", identity, "-o", plain, bundle.archive], { env });
    await query("CREATE DATABASE workflow_backup_restore_synthetic");
    const destination = syntheticConnection("bob_workflow_test_admin", "workflow_backup_restore_synthetic");
    try {
      expect(await captureInventory(destination)).toEqual([]);
      await execute(bin + "pg_restore", ["-h", socket, "-U", "bob_workflow_test_admin", "-d", "workflow_backup_restore_synthetic",
        "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", plain], { env, timeout: 20000 });
      expect(await fingerprints(destination)).toEqual(before);
      expect((await destination.query("SELECT value FROM public.bob_tasks")).rows[0].value).toBe("before");
    } finally { destination.close(); }
  }, 30000);

  async function integratedInput() {
    await query(`REVOKE INSERT,UPDATE ON public.bob_backup_runs FROM ${full}`);
    const capture = await makePlan(), records = [], objects = new Map();
    const bind = name => async () => {
      records.push("open:" + name);
      const client = syntheticConnection(name);
      return { query: (sql, params) => {
        records.push(name + ":" + sql.split(/\s/)[0]);
        // psql transports JSON rows; the actual production INSERT/UPDATE still
        // executes unchanged as the CTE and returns its bound receipt.
        const rendered = /^(INSERT|UPDATE)/.test(sql) && /RETURNING id::text AS id$/.test(sql) ?
          `WITH changed AS (${sql}) SELECT COALESCE(jsonb_agg(changed),'[]'::jsonb)::text FROM changed` : sql;
        return client.query(rendered, params);
      }, close: async () => {
        records.push("close:" + name);
        if (client.child.exitCode !== null) return;
        const done = new Promise((yes, no) => {
          const timer = setTimeout(() => { client.child.kill("SIGKILL"); no(new Error("fixture_close_timeout")); }, 3000);
          client.child.once("close", () => { clearTimeout(timer); yes(); });
        });
        client.close(); await done;
      } };
    };
    return { records, objects, input: { plan: { version: 1, enabled: true, capture, ledgerRole,
      instance: "synthetic-capture", recipient: "age1" + "a".repeat(58), retentionEnabled: false,
      storage: { bucket: "synthetic-backups", endpoint: "https://storage.invalid/", region: "us-east-2" } },
      captureURL: `postgresql://${full}:synthetic@synthetic.invalid/postgres?sslmode=verify-full`,
      ledgerURL: `postgresql://${ledgerRole}:synthetic@synthetic.invalid/postgres?sslmode=verify-full`,
      id: randomUUID(), startedAt: new Date().toISOString(), openCapture: bind(full), openLedger: bind(ledgerRole),
      storage: { put: async (key, bytes) => { records.push("put"); objects.set(key, Buffer.from(bytes)); },
        get: async key => objects.get(key), list: async () => { throw new Error("retention_must_stay_off"); },
        remove: async () => { throw new Error("retention_must_stay_off"); } } } };
  }

  it.each(["missing-read", "schema-change", "capture-write", "rls", "wrong-project"])("integrated %s denial produces no ledger, upload or retention effects", async failure => {
    const f = await integratedInput();
    if (failure === "missing-read") await query(`REVOKE SELECT ON public.fixture_auth_0 FROM ${full}`);
    if (failure === "schema-change") await query("ALTER TABLE public.bob_tasks ADD COLUMN changed text");
    if (failure === "capture-write") await query(`GRANT INSERT ON public.bob_backup_runs TO ${full}`);
    if (failure === "rls") await query("ALTER TABLE public.bob_tasks ENABLE ROW LEVEL SECURITY");
    if (failure === "wrong-project") f.input.plan.capture.project.id = "22222222-2222-4222-8222-222222222222";
    f.input.exportBundle = async () => { throw new Error("export_must_not_run"); };
    await expect(runBackupJob(f.input)).rejects.toThrow("backup_coverage_");
    expect(f.records).not.toContain("open:" + ledgerRole); expect(f.records).not.toContain("put");
    expect((await query("SELECT count(*)::int AS n FROM public.bob_backup_runs")).rows[0].n).toBe(0);
  });

  it("enforces real capture/ledger role separation and rejects post-preflight export failure", async () => {
    const f = await integratedInput();
    await expect(query("SELECT * FROM public.fixture_auth_0", [], ledgerRole)).rejects.toThrow(/permission denied/);
    await expect(query("UPDATE public.bob_tasks SET value='forbidden'", [], ledgerRole)).rejects.toThrow(/permission denied/);
    await expect(query("INSERT INTO public.bob_backup_runs(id) VALUES('33333333-3333-4333-8333-333333333333')", [], full)).rejects.toThrow(/permission denied/);
    f.input.exportBundle = async ({ client }) => { await client.query("SELECT pg_export_snapshot()"); throw new Error("synthetic_dump_failure"); };
    await expect(runBackupJob(f.input)).rejects.toThrow("capture_failed");
    expect(f.records).not.toContain("open:" + ledgerRole); expect(f.objects.size).toBe(0);
  });

  it("captures pgx and concurrent snapshot state, blocks DDL, then writes only through the ledger role", async () => {
    await query(`CREATE SCHEMA pgx; CREATE TABLE pgx.fixture_edge(id int,value text); INSERT INTO pgx.fixture_edge VALUES(1,'covered');
      GRANT USAGE ON SCHEMA pgx TO ${full}; GRANT SELECT ON pgx.fixture_edge TO ${full}`);
    const f = await integratedInput(), directory = join(root, "integration-fixtures"), identity = join(directory, "synthetic.age");
    await mkdir(directory, { mode: 0o700 });
    await execute("/usr/local/bin/age-keygen", ["-o", identity], { env, timeout: 10000 });
    f.input.plan.recipient = (await execute("/usr/local/bin/age-keygen", ["-y", identity], { env })).stdout.trim();
    const wrapper = join(directory, "pg-dump-fixture");
    await writeFile(wrapper, `#!${process.execPath}\nconst {execFileSync}=require('node:child_process');\nprocess.stdout.write(execFileSync(${JSON.stringify(bin + "pg_dump")},${JSON.stringify(["-h", socket, "-U", full, "-d", "postgres"])}.concat(process.argv.slice(2)),{env:${JSON.stringify({ ...env, PGOPTIONS: "-c default_transaction_read_only=on" })},maxBuffer:20000000}));\n`, { mode: 0o700 });
    f.input.directory = directory; f.input.pgDump = wrapper; f.input.age = "/usr/local/bin/age";
    let before, bundle;
    f.input.exportBundle = async input => {
      before = await fingerprints(input.client);
      await expect(query("SET lock_timeout='100ms'; ALTER TABLE public.bob_tasks ADD COLUMN blocked text")).rejects.toThrow(/lock timeout/);
      await query("UPDATE public.bob_tasks SET value='after snapshot'");
      await query(`CREATE TABLE public.created_after_snapshot(id int); GRANT SELECT ON public.created_after_snapshot TO ${full}`);
      bundle = await createEncryptedBundle(input); return bundle;
    };
    expect(await runBackupJob(f.input)).toMatchObject({ event: "backup.verified", retentionChecked: false });
    expect(f.records.indexOf("close:" + full)).toBeLessThan(f.records.indexOf("open:" + ledgerRole));
    expect(f.objects.size).toBe(3);
    expect((await query("SELECT status FROM public.bob_backup_runs", [], ledgerRole)).rows).toEqual([{ status: "verified" }]);
    const manifest = JSON.parse((await execute("/usr/local/bin/age", ["-d", "-i", identity, bundle.manifestFile], { env })).stdout);
    validateManifest(manifest, bundle.receipt, sha256(await readFile(bundle.archive)));
    expect(manifest.coverage).toMatchObject({ projectId, schemaDigest: f.input.plan.capture.expectedSchemaDigest, tableCount: 25 });
    expect(manifest.tables.some(t => t.schema === "pgx")).toBe(true);
    expect(manifest.tables.some(t => t.name === "created_after_snapshot")).toBe(false);
    const plain = join(directory, "restore.dump");
    await execute("/usr/local/bin/age", ["-d", "-i", identity, "-o", plain, bundle.archive], { env });
    await query("CREATE DATABASE workflow_backup_restore_synthetic");
    const destination = syntheticConnection("bob_workflow_test_admin", "workflow_backup_restore_synthetic");
    try {
      expect(await captureInventory(destination)).toEqual([]);
      await execute(bin + "pg_restore", ["-h", socket, "-U", "bob_workflow_test_admin", "-d", "workflow_backup_restore_synthetic",
        "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", plain], { env, timeout: 20000 });
      expect(await fingerprints(destination)).toEqual(before);
    } finally { destination.close(); }
    // The coherent snapshot excludes later objects; the next run must review them.
    await expect(preflight(f.input.plan.capture)).rejects.toThrow("schema_changed");
  }, 30000);
});
