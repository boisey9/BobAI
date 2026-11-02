// Mutations are confined to a freshly owned local fixture, never a hosted target.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile, writeFile, mkdir, readdir, lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { realpathSync as filesystemRealpath } from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { socket, enabled, bin, env, execute, syntheticConnection as rawSyntheticConnection } from "../scripts/lib/workflow-synthetic-postgres.ts";
import { backupSchemaDigest, inspectBackupCoverage, readBackupCatalog } from "../scripts/lib/backup-coverage.mjs";
import { runBackupCoveragePreflight } from "../scripts/lib/backup-preflight.mjs";
import { runBackupJob } from "../scripts/lib/backup-job.mjs";
import { captureInventory, createEncryptedBundle, quoteIdentifier, sha256, validateManifest } from "../scripts/lib/backup.mjs";
import { assertEmptyRestoreDestination, assertRestoreVersion, verifyRestoredBackup } from "../scripts/lib/backup-restore-verification.mjs";
import { prepareBackupRecoveryHandoff, retainBackupRecoveryHandoff } from "../scripts/lib/backup-recovery-handoff.mjs";
import { runBackupDownloadOperator } from "../scripts/lib/backup-download-operator.mjs";
import { createBackupDownloadStorage } from "../scripts/lib/backup-storage.mjs";
import { runRestoreDatabase } from "../scripts/lib/backup-restore-operation.mjs";
import { seedOAuthRecoveryFixture, assertOAuthRecoveryRevoked } from "../scripts/lib/oauth-recovery-fixture.mjs";
import assert from "node:assert/strict";

const root = process.env.BOB_BACKUP_COVERAGE_TEST_ROOT;
const available = enabled && !!root && /^\/tmp\/bob-backup-coverage-run-[a-zA-Z0-9_-]+$/.test(root);
const full = "bob_backup_synthetic_full", restricted = "bob_backup_synthetic_public";
const ledgerRole = "bob_backup_synthetic_nobypass";
const projectId = "11111111-1111-4111-8111-111111111111";
let major;
// The pinned psql transport reads every JSON-array output line, but only wraps
// SELECT statements automatically. Preserve actual DECLARE/FETCH cursor behavior
// while encoding each fetched row for that existing parser. This test-only
// adaptation changes neither the production helper nor its transaction guard.
function syntheticConnection(user, database) {
  const client = rawSyntheticConnection(user, database);
  return { ...client, query: (sql, parameters) => {
    const declaration = sql.match(/^(DECLARE "bob_integrity_[a-f0-9]+" NO SCROLL CURSOR WITHOUT HOLD FOR )([\s\S]+)$/);
    const rendered = declaration
      ? `${declaration[1]}SELECT jsonb_build_array(integrity_row)::text FROM (${declaration[2]}) integrity_row`
      : sql;
    const returned = /^(INSERT|UPDATE)/.test(rendered) && /RETURNING id::text AS id$/.test(rendered)
      ? `WITH changed AS (${rendered}) SELECT COALESCE(jsonb_agg(changed),'[]'::jsonb)::text FROM changed` : rendered;
    const bound = parameters?.map(value => {
      if (!Array.isArray(value)) return value;
      if (!value.every(item => typeof item === "string" && /^[a-z_]+$/.test(item))) throw new Error("synthetic_schema_names_required");
      return `{${value.join(",")}}`; // Only the operation's fixed schema-name array.
    });
    return client.query(returned, bound);
  } };
}
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

// Docker exec transport startup is materially slower than native Unix sockets.
// These fixture budgets do not alter capture statement/export/shutdown limits.
describe.skipIf(!available)("owned local PostgreSQL backup coverage", { timeout: 30_000 }, () => {
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
    // Reuse existing tables so the complete-coverage table count stays fixed.
    // More than one fetch batch of identical rich rows exercises multiplicity,
    // canonical type output and the cursor transport; a separate table is empty.
    await query(`CREATE DOMAIN public.fixture_positive AS integer NOT NULL
        CONSTRAINT fixture_positive_check CHECK (VALUE > 0);
      ALTER TABLE public.fixture_business_0
        ADD COLUMN occurred_at timestamptz NOT NULL DEFAULT '2026-10-31 13:40:28.057-04',
        ADD COLUMN payload jsonb DEFAULT '{"z":null,"a":[1,{"nested":true}]}',
        ADD COLUMN measurement double precision DEFAULT 1.2345678901234567e100,
        ADD COLUMN special double precision DEFAULT 'NaN',
        ADD COLUMN duration interval DEFAULT '1 year 2 mons 3 days 04:05:06.789',
        ADD COLUMN binary_value bytea DEFAULT decode('00ff1020','hex'),
        ADD COLUMN positive public.fixture_positive DEFAULT 1;
      INSERT INTO public.fixture_business_0 SELECT original.* FROM public.fixture_business_0 original
        CROSS JOIN generate_series(1,1000);
      DELETE FROM public.fixture_business_1`);
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
    expect(manifest.version).toBe(2); expect(bundle.receipt.version).toBe(2);
    expect(manifest.tables).toHaveLength(24);
    expect(manifest.integrity.tables.find(t => t.name === "fixture_business_0").rows).toBe("1001");
    expect(manifest.integrity.tables.find(t => t.name === "fixture_business_1").rows).toBe("0");
    expect(manifest.integrity.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetKind: "domain", targetSchema: "public", targetName: "fixture_positive",
        name: "fixture_positive_check", type: "c", validated: true, enforced: true }),
    ]));
    if (major === 18) expect(manifest.integrity.constraints.some(c => c.type === "n")).toBe(true);
    const plain = join(directory, "restore.dump");
    await execute("/usr/local/bin/age", ["-d", "-i", identity, "-o", plain, bundle.archive], { env });
    await query("CREATE DATABASE workflow_backup_restore_synthetic");
    const destination = syntheticConnection("bob_workflow_test_admin", "workflow_backup_restore_synthetic");
    try {
      expect(await captureInventory(destination)).toEqual([]);
      await expect(assertEmptyRestoreDestination(destination)).resolves.toBeUndefined();
      await expect(assertRestoreVersion(destination, manifest)).resolves.toBeUndefined();
      await expect(assertRestoreVersion(destination, { ...manifest, postgresVersion: major === 17 ? "18.6" : "17.11" }))
        .rejects.toThrow("same supported PostgreSQL major");
      await execute(bin + "pg_restore", ["-h", socket, "-U", "bob_workflow_test_admin", "-d", "workflow_backup_restore_synthetic",
        "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", plain], { env, timeout: 20000 });
      expect(await fingerprints(destination)).toEqual(before);
      expect((await destination.query("SELECT value FROM public.bob_tasks")).rows[0].value).toBe("before");
      await destination.query("SET TimeZone='Pacific/Honolulu'; SET DateStyle='SQL, DMY'; SET extra_float_digits=0");
      const verified = await verifyRestoredBackup(destination, manifest);
      expect(verified).toEqual({ tablesVerified: 24, integrityLevel: "full-content-and-constraints",
        constraintsVerified: manifest.integrity.constraints.length });
      await expect(assertEmptyRestoreDestination(destination)).rejects.toThrow("must be empty");

      // Change exactly one duplicate without changing any table count.
      await destination.query(`UPDATE public.fixture_business_0 SET value='changed same-count row'
        WHERE ctid=(SELECT ctid FROM public.fixture_business_0 LIMIT 1)`);
      expect(await captureInventory(destination)).toEqual(manifest.tables);
      await expect(verifyRestoredBackup(destination, manifest)).rejects.toThrow("integrity_mismatch");
      await destination.query("UPDATE public.fixture_business_0 SET value='synthetic business' WHERE value='changed same-count row'");
      await expect(verifyRestoredBackup(destination, manifest)).resolves.toEqual(verified);

      // A semantically compatible replacement still changes the backed-up
      // definition. Restoring it proves catalog OIDs are not part of identity.
      await destination.query(`ALTER DOMAIN public.fixture_positive DROP CONSTRAINT fixture_positive_check;
        ALTER DOMAIN public.fixture_positive ADD CONSTRAINT fixture_positive_check CHECK (VALUE >= 1)`);
      await expect(verifyRestoredBackup(destination, manifest)).rejects.toThrow("integrity_mismatch");
      await destination.query(`ALTER DOMAIN public.fixture_positive DROP CONSTRAINT fixture_positive_check;
        ALTER DOMAIN public.fixture_positive ADD CONSTRAINT fixture_positive_check CHECK (VALUE > 0)`);
      await expect(verifyRestoredBackup(destination, manifest)).resolves.toEqual(verified);

      // PG17 does not represent NOT NULL in pg_constraint. Domain and column
      // enforcement must still be verified when every stored value/count agrees.
      await destination.query("ALTER DOMAIN public.fixture_positive DROP NOT NULL");
      expect(await captureInventory(destination)).toEqual(manifest.tables);
      await expect(verifyRestoredBackup(destination, manifest)).rejects.toThrow("integrity_mismatch");
      await destination.query("ALTER DOMAIN public.fixture_positive SET NOT NULL");
      await expect(verifyRestoredBackup(destination, manifest)).resolves.toEqual(verified);
      await destination.query("ALTER TABLE public.fixture_business_0 ALTER COLUMN occurred_at DROP NOT NULL");
      expect(await captureInventory(destination)).toEqual(manifest.tables);
      await expect(verifyRestoredBackup(destination, manifest)).rejects.toThrow("integrity_mismatch");
      await destination.query("ALTER TABLE public.fixture_business_0 ALTER COLUMN occurred_at SET NOT NULL");
      await expect(verifyRestoredBackup(destination, manifest)).resolves.toEqual(verified);
    } finally { destination.close(); }
  }, 60000);

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

  it("captures a held snapshot, retains its handoff, downloads through the Get-only operator and restores downloaded copies", async () => {
    await query(`CREATE SCHEMA pgx; CREATE TABLE pgx.fixture_edge(id int,value text); INSERT INTO pgx.fixture_edge VALUES(1,'covered');
      GRANT USAGE ON SCHEMA pgx TO ${full}; GRANT SELECT ON pgx.fixture_edge TO ${full}`);
    // Representative public auth tables use the column types and dependency
    // relationships consumed by the real operation. No migration is executed.
    await query(`ALTER TABLE public.bob_projects ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
      UPDATE public.bob_projects SET metadata='{"auth":{"interfaceCredentials":[{"id":"synthetic-copied-grant"}],"readCredentialHashes":["synthetic-copied-hash"],"retainedSetting":true},"businessSetting":"preserved"}';
      CREATE TABLE public.bob_auth_user(id text PRIMARY KEY,email text NOT NULL);
      CREATE TABLE public.bob_auth_account(id text PRIMARY KEY,"userId" text REFERENCES public.bob_auth_user(id),password text);
      CREATE TABLE public.bob_auth_passkey(id text PRIMARY KEY,"userId" text REFERENCES public.bob_auth_user(id),"publicKey" text);
      CREATE TABLE public.bob_auth_session(id text PRIMARY KEY,"userId" text REFERENCES public.bob_auth_user(id),token text,"expiresAt" timestamptz);
      CREATE TABLE public.bob_auth_verification(id text PRIMARY KEY,value text);
      CREATE TABLE public.bob_auth_oauth_client(id text PRIMARY KEY,"clientId" text UNIQUE NOT NULL,"clientSecret" text,"redirectUris" jsonb NOT NULL,"userId" text REFERENCES public.bob_auth_user(id),disabled boolean);
      CREATE TABLE public.bob_auth_oauth_resource(id text PRIMARY KEY,identifier text UNIQUE NOT NULL,name text NOT NULL,disabled boolean);
      CREATE TABLE public.bob_oauth_project_grants(id uuid PRIMARY KEY,owner_id text,user_id text REFERENCES public.bob_auth_user(id),client_id text REFERENCES public.bob_auth_oauth_client("clientId"),project_id uuid REFERENCES public.bob_projects(id),surface text,scopes text[],operation_id uuid,request_fingerprint text,revoked_at timestamptz);
      CREATE TABLE public.bob_auth_oauth_refresh_token(id text PRIMARY KEY,token text UNIQUE,"clientId" text REFERENCES public.bob_auth_oauth_client("clientId") ON DELETE CASCADE,"userId" text REFERENCES public.bob_auth_user(id),"referenceId" text,"expiresAt" timestamptz,"createdAt" timestamptz,scopes jsonb);
      CREATE TABLE public.bob_auth_oauth_access_token(id text PRIMARY KEY,token text UNIQUE,"clientId" text REFERENCES public.bob_auth_oauth_client("clientId") ON DELETE CASCADE,"userId" text REFERENCES public.bob_auth_user(id),"referenceId" text,"refreshId" text REFERENCES public.bob_auth_oauth_refresh_token(id) ON DELETE CASCADE,"expiresAt" timestamptz,"createdAt" timestamptz,scopes jsonb);
      CREATE TABLE public.bob_auth_oauth_consent(id text PRIMARY KEY,"clientId" text REFERENCES public.bob_auth_oauth_client("clientId") ON DELETE CASCADE,"userId" text REFERENCES public.bob_auth_user(id),"referenceId" text,"createdAt" timestamptz,"updatedAt" timestamptz,scopes jsonb);
      INSERT INTO public.bob_auth_user VALUES('drill-owner','restore@bob.example');
      INSERT INTO public.bob_auth_account VALUES('synthetic-account','drill-owner','synthetic-unusable-owner-hash');
      INSERT INTO public.bob_auth_passkey VALUES('synthetic-passkey','drill-owner','synthetic-owner-public-key');
      INSERT INTO public.bob_auth_session VALUES('synthetic-session','drill-owner','synthetic-session-token',now()+interval '1 day');
      INSERT INTO public.bob_auth_verification VALUES('synthetic-verification','synthetic-challenge');
      INSERT INTO public.bob_auth_oauth_resource VALUES('synthetic-resource','https://synthetic.invalid/mcp','synthetic resource',NULL);
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${full}`);
    const seededOAuth = await seedOAuthRecoveryFixture({ query: (sql, parameters) => {
      // The psql bridge binds text expressions rather than unknown wire values.
      // Supply the UUID casts inferred by the real driver's parameter protocol.
      const typed = sql.includes("INSERT INTO bob_oauth_project_grants")
        ? sql.replace(/\$(1|4|5)(?!\d)/g, "$&::uuid") : sql;
      return query(typed, parameters);
    } }, "fixture-owner", projectId);
    const f = await integratedInput(), directory = join(root, "integration-fixtures"), identity = join(directory, "synthetic.age");
    // Older captures could contain their own running ledger row. Seed that
    // compatibility case; the fixture removes it outside the held snapshot
    // after export, allowing the current job's normal post-capture registration.
    await query("INSERT INTO public.bob_backup_runs(id,owner_id,instance_key,status,started_at) VALUES($1::uuid,'fixture-owner','synthetic-capture','running',$2::timestamptz)", [f.input.id, f.input.startedAt]);
    await mkdir(directory, { mode: 0o700 });
    // Every artifact belongs to the runner's existing cleanup root. The actual
    // capture directory and retained handoff are separate sibling trees.
    const captureDirectory = join(directory, "capture"), retentionDirectory = join(directory, "retained-handoff"),
      operatorDirectory = join(directory, "operator-inputs");
    for (const child of [captureDirectory, retentionDirectory, operatorDirectory]) await mkdir(child, { mode: 0o700 });
    await execute("/usr/local/bin/age-keygen", ["-o", identity], { env, timeout: 10000 });
    f.input.plan.recipient = (await execute("/usr/local/bin/age-keygen", ["-y", identity], { env })).stdout.trim();
    const wrapper = join(directory, "pg-dump-fixture");
    await writeFile(wrapper, `#!${process.execPath}\nconst {execFileSync}=require('node:child_process');\nprocess.stdout.write(execFileSync(${JSON.stringify(bin + "pg_dump")},${JSON.stringify(["-h", socket, "-U", full, "-d", "postgres"])}.concat(process.argv.slice(2)),{env:${JSON.stringify({ ...env, PGOPTIONS: "-c default_transaction_read_only=on" })},maxBuffer:20000000}));\n`, { mode: 0o700 });
    f.input.directory = captureDirectory; f.input.pgDump = wrapper; f.input.age = "/usr/local/bin/age";
    let before, bundle;
    f.input.exportBundle = async input => {
      before = await fingerprints(input.client);
      await expect(query("SET lock_timeout='100ms'; ALTER TABLE public.bob_tasks ADD COLUMN blocked text")).rejects.toThrow(/lock timeout/);
      await query("UPDATE public.bob_tasks SET value='after snapshot'");
      await query(`CREATE TABLE public.created_after_snapshot(id int); GRANT SELECT ON public.created_after_snapshot TO ${full}`);
      bundle = await createEncryptedBundle(input);
      await query("DELETE FROM public.bob_backup_runs WHERE id=$1::uuid", [f.input.id]);
      return bundle;
    };
    const captured = await runBackupJob(f.input);
    expect(captured).toMatchObject({ event: "backup.verified", retentionChecked: false });
    expect(f.records.indexOf("close:" + full)).toBeLessThan(f.records.indexOf("open:" + ledgerRole));
    expect(f.objects.size).toBe(3);
    expect((await query("SELECT status FROM public.bob_backup_runs", [], ledgerRole)).rows).toEqual([{ status: "verified" }]);
    // These are deliberately synthetic provenance/custody assertions, not an
    // actual published source/image, authenticated GitHub run or external account.
    const producer = { repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
      workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main", runId: "123", runAttempt: "1",
      image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) };
    const prepared = await prepareBackupRecoveryHandoff({ enabled: true, directory: filesystemRealpath(retentionDirectory),
      temporaryRoot: filesystemRealpath(captureDirectory), producer });
    const retained = await retainBackupRecoveryHandoff({ prepared, recovery: captured.recovery });
    const handoffFile = join(filesystemRealpath(retentionDirectory), `${captured.id}.recovery.json`);
    const retainedBytes = await readFile(handoffFile), retainedIdentity = await lstat(handoffFile);
    expect(retained).toEqual({ version: 1, sha256: sha256(retainedBytes), bytes: retainedBytes.length });
    expect(retainedIdentity.mode & 0o777).toBe(0o600);
    const handoff = JSON.parse(retainedBytes.toString("utf8"));
    expect(handoff).toEqual({ version: 1, recovery: captured.recovery, producer });
    // An identical lost-acknowledgement retry reads back without replacing the
    // record; no second capture/upload or reconstructed receipt is used.
    expect(await retainBackupRecoveryHandoff({ prepared, recovery: captured.recovery })).toEqual(retained);
    const retriedIdentity = await lstat(handoffFile);
    expect({ ino: retriedIdentity.ino, mtimeMs: retriedIdentity.mtimeMs })
      .toEqual({ ino: retainedIdentity.ino, mtimeMs: retainedIdentity.mtimeMs });
    const expected = handoff.recovery.expected;
    expect(expected).toMatchObject({ id: captured.id, instance: f.input.plan.instance,
      startedAt: f.input.startedAt, recipientFingerprint: sha256(f.input.plan.recipient) });
    expect(expected.receiptSha256).toBe(sha256(Buffer.from(JSON.stringify(bundle.receipt))));

    // The transport owns copies of the three real encrypted objects produced by
    // the job. Trust anchors come only from its retained handoff, never this Map.
    // All original bundle files are deleted before any download operator runs.
    for (const file of [bundle.archive, bundle.manifestFile, join(captureDirectory, "receipt.json")]) {
      await rm(file); await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    }
    const credentialsFile = join(filesystemRealpath(operatorDirectory), "synthetic-credentials.json");
    await writeFile(credentialsFile, JSON.stringify({ accessKeyId: "synthetic-read-only-access",
      secretAccessKey: "synthetic-read-only-secret" }), { mode: 0o600 });
    expect((await lstat(credentialsFile)).mode & 0o777).toBe(0o600);
    const makeOperator = async mode => {
      const downloadDirectory = join(directory, `${mode}-download-fixture`);
      await mkdir(downloadDirectory, { mode: 0o700 });
      const plan = { version: 1, enabled: true, storage: f.input.plan.storage,
        handoff: { sha256: retained.sha256, bytes: retained.bytes, id: expected.id, instance: expected.instance, producer },
        review: { reviewedAt: expected.startedAt, storageAccountId: "synthetic-in-memory-account",
          custodyReference: "synthetic-local-fixture-only" }, destination: { directory: filesystemRealpath(downloadDirectory) } };
      const planFile = join(filesystemRealpath(operatorDirectory), `${mode}-plan.json`);
      await writeFile(planFile, JSON.stringify(plan), { mode: 0o600 });
      expect((await lstat(planFile)).mode & 0o777).toBe(0o600);
      expect((await lstat(downloadDirectory)).mode & 0o777).toBe(0o700);
      const requested = [], bodies = [], controller = new AbortController();
      let opened = 0, closed = 0;
      const createStorage = options => {
        opened++;
        expect(options.expected).toEqual(expected);
        const transport = createBackupDownloadStorage({ ...options, requestHandler: {
          handle: async request => {
            expect(request.method).toBe("GET"); expect(request.protocol).toBe("https:");
            expect(request.hostname).toBe("storage.invalid");
            const prefix = `/${plan.storage.bucket}/`;
            expect(request.path.startsWith(prefix)).toBe(true);
            const key = request.path.slice(prefix.length);
            expect(Object.values(bundle.receipt.keys)).toContain(key);
            const bytes = Buffer.from(f.objects.get(key));
            requested.push(key);
            if (mode === "corrupt" && key === bundle.receipt.keys.archive) bytes[0] ^= 1;
            const body = Readable.from([bytes]); bodies.push(body);
            if (mode === "cancelled" && key === bundle.receipt.keys.archive) controller.abort("SIGTERM");
            // The real SDK serializer/signature/deserializer and bounded body
            // reader execute; this handler opens no socket or service client.
            return { response: { statusCode: 200, headers: { "content-length": String(bytes.length) }, body } };
          }, destroy() {},
        } });
        expect(Object.keys(transport).sort()).toEqual(["destroy", "get"]);
        return { get: transport.get, destroy: () => { closed++; transport.destroy(); } };
      };
      return { downloadDirectory, requested, bodies, counts: () => ({ opened, closed }),
        input: { mode: "--download", planFile, handoffFile, credentialsFile, signal: controller.signal, createStorage } };
    };
    const corrupt = await makeOperator("corrupt");
    expect(await runBackupDownloadOperator(corrupt.input)).toEqual({ exitCode: 1,
      result: { event: "backup.failed", id: expected.id, code: "download_artifact_mismatch" } });
    expect(await readdir(corrupt.downloadDirectory)).toEqual([]);
    expect(corrupt.counts()).toEqual({ opened: 1, closed: 1 }); expect(corrupt.bodies.every(body => body.destroyed)).toBe(true);

    const cancelled = await makeOperator("cancelled");
    expect(await runBackupDownloadOperator(cancelled.input)).toEqual({ exitCode: 143,
      result: { event: "backup.failed", id: expected.id, code: "operator_interrupted" } });
    expect(await readdir(cancelled.downloadDirectory)).toEqual([]);
    expect(cancelled.counts()).toEqual({ opened: 1, closed: 1 }); expect(cancelled.bodies.every(body => body.destroyed)).toBe(true);

    const valid = await makeOperator("verified");
    const { credentialsFile: _unused, ...checkInput } = valid.input;
    expect(await runBackupDownloadOperator({ ...checkInput, mode: "--check" })).toEqual({ exitCode: 0,
      result: { event: "backup.download_checked", id: expected.id, handoffSha256: retained.sha256, networkAccessed: false } });
    expect(valid.counts()).toEqual({ opened: 0, closed: 0 }); expect(valid.requested).toEqual([]);
    expect(await runBackupDownloadOperator(valid.input)).toEqual({ exitCode: 0,
      result: { event: "backup.download_verified", id: expected.id, bytes: bundle.receipt.bytes,
        handoffSha256: retained.sha256, receiptSha256: expected.receiptSha256 } });
    expect(valid.requested).toEqual([bundle.receipt.keys.receipt, bundle.receipt.keys.archive, bundle.receipt.keys.manifest]);
    expect(valid.counts()).toEqual({ opened: 1, closed: 1 }); expect(valid.bodies.every(body => body.destroyed)).toBe(true);
    // Reinvocation refuses the completed destination before credentials/client
    // effects, preserving all downloaded files instead of overwriting a result.
    expect((await runBackupDownloadOperator(valid.input)).result)
      .toEqual({ event: "backup.failed", code: "operator_destination_not_empty" });
    expect(valid.counts()).toEqual({ opened: 1, closed: 1 }); expect(valid.requested).toHaveLength(3);
    const downloaded = { archive: join(valid.downloadDirectory, "archive.dump.age"),
      manifestFile: join(valid.downloadDirectory, "manifest.age"), receiptFile: join(valid.downloadDirectory, "receipt.json") };
    downloaded.receipt = JSON.parse(await readFile(downloaded.receiptFile, "utf8"));
    expect(downloaded.receipt).toEqual(bundle.receipt);
    expect(sha256(await readFile(downloaded.receiptFile))).toBe(expected.receiptSha256);
    const manifest = JSON.parse((await execute("/usr/local/bin/age", ["-d", "-i", identity, downloaded.manifestFile], { env })).stdout);
    validateManifest(manifest, downloaded.receipt, sha256(await readFile(downloaded.archive)));
    expect(manifest.coverage).toMatchObject({ projectId, schemaDigest: f.input.plan.capture.expectedSchemaDigest, tableCount: 36 });
    expect(manifest.tables.some(t => t.schema === "pgx")).toBe(true);
    expect(manifest.tables.some(t => t.name === "created_after_snapshot")).toBe(false);
    const restoreDatabase = "workflow_backup_restore_synthetic", admin = "bob_workflow_test_admin";
    const readRestored = (sql, parameters = []) => query(sql, parameters, admin, restoreDatabase);
    const resetDestination = async () => {
      // The fixed database name belongs only to this freshly owned fixture.
      await query(`DROP DATABASE IF EXISTS ${restoreDatabase} WITH (FORCE)`);
      await query(`CREATE DATABASE ${restoreDatabase}`);
    };
    await resetDestination();
    const destinationURLFile = join(directory, "synthetic-restore-url");
    await writeFile(destinationURLFile, `postgresql://${admin}:synthetic@synthetic.invalid/${restoreDatabase}?sslmode=verify-full`, { mode: 0o600 });
    const options = { archive: filesystemRealpath(downloaded.archive), manifest: filesystemRealpath(downloaded.manifestFile),
      receipt: filesystemRealpath(downloaded.receiptFile), identity: filesystemRealpath(identity),
      destinationURLFile: filesystemRealpath(destinationURLFile), confirmEmptyDestination: true,
      age: "/usr/local/bin/age", pgRestore: bin + "pg_restore" };
    const previousTemp = process.env.TMPDIR;
    process.env.TMPDIR = directory; // Existing temp-path setting, not a transport selector.
    let restoreCalls = 0, opened = 0, closed = 0;
    const operate = async (mode = "success", selectedOptions = options) => runRestoreDatabase(selectedOptions, {
      openDestination: async selected => {
        const target = new URL(selected);
        expect(target.hostname).toBe("synthetic.invalid"); expect(target.pathname).toBe(`/${restoreDatabase}`);
        opened++;
        const connection = syntheticConnection(admin, restoreDatabase);
        return { client: { query: async (sql, parameters) => {
          if (mode === "quarantine-failure" && /^UPDATE public\.bob_auth_oauth_resource\b/.test(sql))
            throw new Error("synthetic_mid_quarantine_failure");
          const result = await connection.query(sql, parameters);
          if (mode === "commit-ack-lost" && sql === "COMMIT") throw new Error("synthetic_commit_ack_lost");
          return result;
        } }, close: async () => {
          const done = new Promise((resolve, reject) => {
            const timer = setTimeout(() => { connection.child.kill("SIGKILL"); reject(new Error("fixture_restore_close_timeout")); }, 3000);
            connection.child.once("close", () => { clearTimeout(timer); closed++; resolve(); });
          });
          connection.close(); await done;
        } };
      },
      runCommand: async (command, args, suppliedEnv) => {
        if (command === options.age) {
          await execute(command, args, { env, timeout: 10000 }); return;
        }
        expect(command).toBe(options.pgRestore); expect(suppliedEnv.PGHOST).toBe("synthetic.invalid");
        expect(suppliedEnv.PGDATABASE).toBe(restoreDatabase); expect(suppliedEnv.PGUSER).toBe(admin);
        expect(args).toContain("--single-transaction"); expect(args).toContain("--exit-on-error");
        restoreCalls++;
        // Only the programmatic test adapter selects the owned Unix socket.
        // The shipped CLI has no option/environment adapter-selection hook.
        const actualArgs = args.filter(arg => !arg.startsWith("--dbname="));
        actualArgs[actualArgs.length - 1] = actualArgs.at(-1).replace(/^\/private\/tmp\//, "/tmp/");
        await execute(command, ["-h", socket, "-U", admin, "-d", restoreDatabase, ...actualArgs], { env, timeout: 20000 });
        if (mode === "verification-failure") await readRestored("UPDATE public.bob_tasks SET value='synthetic-restored-drift'");
      },
    });
    const restoredFingerprints = async () => {
      const c = syntheticConnection(admin, restoreDatabase);
      try { return await fingerprints(c); } finally { c.close(); }
    };
    const assertQuarantined = async () => {
      await assertOAuthRecoveryRevoked(assert, { query: (sql, parameters) => readRestored(
        sql.includes("FROM bob_oauth_project_grants WHERE id=$1") ? sql.replace("id=$1", "id=$1::uuid") : sql, parameters) }, seededOAuth.grant);
      for (const table of ["bob_auth_session", "bob_auth_verification"])
        expect((await readRestored(`SELECT count(*)::int AS count FROM public.${table}`)).rows).toEqual([{ count: 0 }]);
      expect((await readRestored("SELECT disabled FROM public.bob_auth_oauth_client")).rows).toEqual([{ disabled: true }]);
      expect((await readRestored("SELECT disabled FROM public.bob_auth_oauth_resource")).rows).toEqual([{ disabled: true }]);
      expect((await readRestored("SELECT metadata FROM public.bob_projects")).rows[0].metadata)
        .toEqual({ auth: { retainedSetting: true }, businessSetting: "preserved" });
      const ledger = (await readRestored("SELECT status,retention_checked_at,archive_key,manifest_key,receipt_key,ciphertext_sha256,size_bytes::text AS size_bytes FROM public.bob_backup_runs WHERE id=$1::uuid", [captured.id])).rows[0];
      expect(ledger).toEqual({ status: "verified", retention_checked_at: null, archive_key: downloaded.receipt.keys.archive,
        manifest_key: downloaded.receipt.keys.manifest, receipt_key: downloaded.receipt.keys.receipt,
        ciphertext_sha256: downloaded.receipt.archiveSha256, size_bytes: String(downloaded.receipt.bytes) });
      const mutated = new Set(["bob_projects", "bob_backup_runs", "bob_oauth_project_grants", "bob_auth_oauth_client",
        "bob_auth_oauth_resource", "bob_auth_oauth_access_token", "bob_auth_oauth_refresh_token", "bob_auth_oauth_consent",
        "bob_auth_session", "bob_auth_verification"]);
      // Owner account/passkey rows and all business data remain unchanged.
      expect((await restoredFingerprints()).filter(t => !mutated.has(t.name))).toEqual(before.filter(t => !mutated.has(t.name)));
    };
    try {
      await readRestored("CREATE SCHEMA pgx; CREATE TABLE pgx.nonempty_sentinel(id integer); INSERT INTO pgx.nonempty_sentinel VALUES(1)");
      expect((await operate()).exitCode).not.toBe(0); expect(restoreCalls).toBe(0);
      expect((await readRestored("SELECT id FROM pgx.nonempty_sentinel")).rows).toEqual([{ id: 1 }]);
      await readRestored("DROP SCHEMA pgx CASCADE");

      const badIntegrity = await operate("verification-failure");
      expect(badIntegrity.exitCode).not.toBe(0);
      expect(badIntegrity.result).toMatchObject({ event: "restore.failed", destinationMayContainRestoredData: true });
      expect((await readRestored("SELECT disabled FROM public.bob_auth_oauth_resource")).rows).toEqual([{ disabled: null }]);
      expect((await readRestored("SELECT status FROM public.bob_backup_runs")).rows).toEqual([{ status: "running" }]);
      await resetDestination();

      const failed = await operate("quarantine-failure");
      expect(failed.exitCode).not.toBe(0);
      expect(failed.result).toMatchObject({ event: "restore.failed", destinationMayContainRestoredData: true });
      expect(await restoredFingerprints()).toEqual(before); // Every mutation and ledger normalization rolled back.
      const callsBeforeRetry = restoreCalls;
      expect((await operate()).exitCode).not.toBe(0); expect(restoreCalls).toBe(callsBeforeRetry);
      expect(await restoredFingerprints()).toEqual(before);
      await resetDestination();

      const uncertain = await operate("commit-ack-lost");
      expect(uncertain.exitCode).not.toBe(0);
      expect(uncertain.result).toMatchObject({ event: "restore.failed", commitUncertain: true, destinationMayContainRestoredData: true });
      await assertQuarantined(); // Readback proves this injected lost acknowledgement committed, but operation did not claim it.
      await resetDestination();

      const restored = await operate();
      expect(restored.exitCode).toBe(0);
      expect(restored.result).toMatchObject({ event: "restore.verified", backupId: captured.id, tablesVerified: 36,
        integrityLevel: "full-content-and-constraints", constraintsVerified: manifest.integrity.constraints.length,
        copiedInterfaceCredentialsRevoked: true, runtimeAcceptanceRequired: true });
      expect(opened).toBe(closed); await assertQuarantined();
      const beforeRetry = await restoredFingerprints();
      expect((await operate()).exitCode).not.toBe(0); expect(await restoredFingerprints()).toEqual(beforeRetry);
      expect(restoreCalls).toBe(4); expect(opened).toBe(closed);

      // Current exports register the run only after capture. Qualify that normal
      // absence branch with a second genuine encrypted capture, rather than
      // modifying the restored data after its integrity check or copying SQL.
      const normal = await integratedInput(), normalDirectory = join(directory, "normal-capture");
      await mkdir(normalDirectory, { mode: 0o700 });
      Object.assign(normal.input, { directory: normalDirectory, pgDump: wrapper, age: "/usr/local/bin/age" });
      normal.input.plan.recipient = f.input.plan.recipient;
      const normalCaptured = await runBackupJob(normal.input);
      await resetDestination();
      const normalRestored = await operate("success", { ...options,
        archive: filesystemRealpath(join(normalDirectory, "backup.dump.age")),
        manifest: filesystemRealpath(join(normalDirectory, "backup.manifest.age")),
        receipt: filesystemRealpath(join(normalDirectory, "receipt.json")) });
      expect(normalRestored.exitCode).toBe(0);
      expect(normalRestored.result).toMatchObject({ event: "restore.verified", backupId: normalCaptured.id,
        tablesVerified: 37, copiedInterfaceCredentialsRevoked: true });
      expect((await readRestored("SELECT id::text AS id,status FROM public.bob_backup_runs ORDER BY id")).rows)
        .toEqual([{ id: captured.id, status: "verified" }]); // No fabricated current-run row; prior history survives.
      expect((await readRestored("SELECT disabled FROM public.bob_auth_oauth_resource")).rows).toEqual([{ disabled: true }]);
      expect((await readRestored("SELECT revoked_at IS NOT NULL AS revoked FROM public.bob_oauth_project_grants")).rows)
        .toEqual([{ revoked: true }]);
      expect(restoreCalls).toBe(5); expect(opened).toBe(closed);
      expect((await readdir(directory)).filter(name => name.startsWith("bob-restore-"))).toEqual([]);
    } finally {
      if (previousTemp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTemp;
    }
    // The coherent snapshot excludes later objects; the next run must review them.
    await expect(preflight(f.input.plan.capture)).rejects.toThrow("schema_changed");
  }, 120000);
});
