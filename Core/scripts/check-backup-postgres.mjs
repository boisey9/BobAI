// Repeatable destructive drill, confined to two empty databases created by this
// process on the explicitly selected isolated recovery branch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { createEncryptedBundle, postgresEnvironment, quoteIdentifier } from "./lib/backup.mjs";
import { NeonSharedContextStore } from "../src/context/neon-store.ts";
import { SharedContextService } from "../src/context/service.ts";
import { createCredentialRateLimiter } from "../src/security/rate-limit.ts";
import { provisionBackupRole } from "./lib/backup-role.mjs";

process.umask(0o077);
assert.equal(process.env.BOB_TEST_BRANCH_ID, "br-solitary-wind-ay86swt0", "Select the isolated recovery branch.");
const adminURL = (await readFile(process.env.BOB_TEST_ADMIN_URL_FILE, "utf8")).trim();
postgresEnvironment(adminURL);
const identity = process.env.BOB_TEST_RECOVERY_IDENTITY_FILE;
const recipient = (await readFile(process.env.BOB_TEST_RECIPIENT_FILE, "utf8")).trim();
const directory = await mkdtemp(join(tmpdir(), "bob-backup-drill-"));
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const databases = [`bob_backup_source_${suffix}`, `bob_backup_restore_${suffix}`];
const admin = new Pool({ connectionString: adminURL, max: 1 });
const created = [];
const pools = [];
const roles = [];
const started = Date.now();
try {
  for (const name of databases) {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0`);
    created.push(name);
  }
  const urls = databases.map(name => { const url = new URL(adminURL); url.pathname = `/${name}`; return url.toString(); });
  const [source, destination] = urls.map(connectionString => {
    const pool = new Pool({ connectionString, max: 2 }); pools.push(pool); return pool;
  });
  for (const file of (await readdir(new URL("../migrations/", import.meta.url))).filter(name => name.endsWith(".sql")).sort())
    await source.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  const rateConfig = { rateLimitsEnabled: true, databaseURL: urls[0], ownerId: "drill",
    coreRequestsPerMinute: 4, aiRequestsPerMinute: 2 };
  const limiters = [createCredentialRateLimiter(rateConfig), createCredentialRateLimiter(rateConfig)];
  const seconds = Number((await source.query("SELECT extract(second FROM now()) AS seconds")).rows[0].seconds);
  if (seconds > 50) await new Promise(resolve => setTimeout(resolve, (61-seconds)*1000));
  const limits = await Promise.all(Array.from({length: 12}, (_, i) => limiters[i%2]("a".repeat(64), "core")));
  assert.equal(limits.filter(result => result.allowed).length, 4, "Concurrent instances share one atomic bucket");
  assert.equal((await limiters[0]("a".repeat(64), "ai")).allowed, true, "AI and Core buckets are separate");
  assert.equal((await limiters[1]("b".repeat(64), "core")).allowed, true, "Other credentials retain their capacity");
  await source.query("UPDATE bob_credential_rate_limits SET window_start=now()-interval '1 minute'");
  assert.equal((await limiters[0]("a".repeat(64), "core")).allowed, true, "Next minute restores capacity");
  const backupRole = `bob_backup_${suffix}`;
  const backupPassword = randomBytes(36).toString("base64url");
  const roleClient = await source.connect();
  try {
    await roleClient.query("BEGIN");
    await provisionBackupRole(roleClient, backupRole, backupPassword);
    await roleClient.query("COMMIT"); roles.push(backupRole);
  } catch (error) { await roleClient.query("ROLLBACK"); throw error; }
  finally { roleClient.release(); }
  const backupURL = new URL(urls[0]); backupURL.username = backupRole; backupURL.password = backupPassword;
  const backupPool = new Pool({ connectionString: backupURL.toString(), max: 1 }); pools.push(backupPool);
  await assert.rejects(backupPool.query("UPDATE bob_tasks SET title='forbidden'"), error => error.code === "42501");
  await backupPool.query("INSERT INTO bob_backup_runs(id,owner_id,instance_key,status) VALUES($1,'drill','drill','running')", [randomUUID()]);
  const owner = "backup-drill";
  const project = randomUUID();
  await source.query("INSERT INTO bob_projects(id,owner_id,project_key,name,metadata) VALUES($1,$2,'drill','Restore drill',$3)",
    [project, owner, JSON.stringify({ auth: { interfaceCredentials: [{ id: "copied-grant" }], readCredentialHashes: ["copied-hash"] } })]);
  await source.query(`INSERT INTO bob_auth_user(id,name,email,"emailVerified") VALUES('drill-owner','Drill','restore@bob.example',true)`);
  await source.query(`INSERT INTO bob_auth_session(id,"expiresAt",token,"updatedAt","userId")
    VALUES('drill-session',now()+interval '1 day',$1,now(),'drill-owner')`, [randomUUID()]);
  await source.query(`INSERT INTO bob_auth_verification(id,identifier,value,"expiresAt")
    VALUES('drill-verification','drill',$1,now()+interval '1 hour')`, [randomUUID()]);
  const service = new SharedContextService(new NeonSharedContextStore(urls[0]), owner);
  const input = { projectKey: "drill", operationId: "backup-drill-task-0001", title: "Survive recovery",
    actor: { interfaceId: "backup-drill", surface: "codex" } };
  const original = await service.createSyncedTask(input);
  const client = await backupPool.connect();
  let bundle;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // Commit a real application write after snapshot export. Neither the counts
    // nor pg_dump may include that later row.
    const snapshotClient = { query: async (...args) => {
      const result = await client.query(...args);
      if (String(args[0]).includes("pg_export_snapshot"))
        await source.query("INSERT INTO bob_events(id,owner_id,project_id,event_type,summary) VALUES($1,$2,$3,'drill.concurrent','After snapshot')", [randomUUID(), owner, project]);
      return result;
    } };
    bundle = await createEncryptedBundle({ client: snapshotClient, connectionString: backupURL.toString(), directory, recipient,
      id: randomUUID(), instance: "drill", startedAt: new Date().toISOString(),
      pgDump: process.env.BOB_PG_DUMP_BIN, age: process.env.BOB_AGE_BIN });
    await client.query("COMMIT");
  } finally { client.release(); }
  assert.equal((await source.query("SELECT count(*)::int n FROM bob_events WHERE event_type='drill.concurrent'")).rows[0].n, 1);
  assert.deepEqual((await readdir(directory)).sort(), ["backup.dump.age", "backup.manifest.age", "receipt.json"], "No plaintext export on backup runner");
  const destinationFile = join(directory, "destination-url");
  await writeFile(destinationFile, urls[1], { mode: 0o600 });
  const args = [fileURLToPath(new URL("./restore-database.mjs", import.meta.url)), "--archive", bundle.archive,
    "--manifest", bundle.manifestFile, "--receipt", join(directory, "receipt.json"), "--identity", identity,
    "--destination-url-file", destinationFile, "--confirm-empty-destination"];
  const restore = () => spawnSync(process.execPath, args, { encoding: "utf8", timeout: 300_000 });
  // Corruption must fail before any destination tables appear.
  const ciphertext = await readFile(bundle.archive);
  await writeFile(bundle.archive, Buffer.concat([ciphertext, Buffer.from("corrupt")]));
  assert.notEqual(restore().status, 0);
  assert.equal((await destination.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
  await writeFile(bundle.archive, ciphertext);
  const restored = restore();
  assert.equal(restored.status, 0, "Restore CLI must validate the snapshot and revoke copied sessions");
  const evidence = JSON.parse(restored.stdout.trim());
  assert.equal(evidence.event, "restore.verified");
  assert.equal((await destination.query("SELECT count(*)::int n FROM bob_events WHERE event_type='drill.concurrent'")).rows[0].n, 0);
  for (const table of ["bob_auth_session", "bob_auth_verification"])
    assert.equal((await destination.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
  const metadata = (await destination.query("SELECT metadata FROM bob_projects WHERE id=$1", [project])).rows[0].metadata;
  assert.equal(metadata.auth.interfaceCredentials, undefined);
  assert.equal(metadata.auth.readCredentialHashes, undefined);
  const recovered = new SharedContextService(new NeonSharedContextStore(urls[1]), owner);
  const replay = await recovered.createSyncedTask(input);
  assert.equal(replay.task.id, original.task.id);
  assert.equal(replay.idempotent, true);
  await recovered.updateSyncedTask({ ...input, operationId: "backup-drill-complete-0001",
    taskId: original.task.id, expectedVersion: original.task.version, status: "done" });
  const completed = (await destination.query("SELECT version,status FROM bob_tasks WHERE id=$1", [original.task.id])).rows[0];
  assert.equal(completed.status, "done");
  assert.equal(completed.version, 2);
  assert.notEqual(restore().status, 0, "Nonempty destination must be refused without mutation");
  assert.deepEqual((await destination.query("SELECT version,status FROM bob_tasks WHERE id=$1", [original.task.id])).rows[0], completed);
  console.log(JSON.stringify({ event: "backup.drill.passed", encryptedArchiveBytes: bundle.receipt.bytes,
    tablesVerified: evidence.tablesVerified, restoredInSeconds: evidence.seconds,
    totalSeconds: Math.round((Date.now()-started)/1000), concurrentSnapshot: true,
    corruptionRejected: true, nonemptyDestinationPreserved: true, copiedSessionsRevoked: true,
    restoredTaskReplayAndUpdate: true, concurrentCredentialLimits: true, restrictedBackupRole: true }));
} finally {
  await Promise.all(pools.map(pool => pool.end()));
  // Drop only names created by this invocation, never its source connection DB.
  for (const name of created) await admin.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`);
  for (const role of roles) await admin.query(`DROP ROLE ${quoteIdentifier(role)}`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
