import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { captureInventory, isOutsideDirectory, postgresEnvironment, runCommand, sha256, validateManifest } from "./lib/backup.mjs";

process.umask(0o077);
const { values } = parseArgs({ options: {
  archive: { type: "string" }, manifest: { type: "string" }, receipt: { type: "string" },
  identity: { type: "string" }, "destination-url-file": { type: "string" },
  "confirm-empty-destination": { type: "boolean" },
} });
for (const name of ["archive", "manifest", "receipt", "identity", "destination-url-file"])
  if (!values[name] || !isAbsolute(values[name])) throw new Error(`Supply an absolute --${name} path.`);
if (!values["confirm-empty-destination"]) throw new Error("Explicitly select an empty restore destination.");
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
for (const file of [values.identity, values["destination-url-file"]]) {
  const path = await realpath(file);
  if (!isOutsideDirectory(repo, path) || ((await stat(path)).mode & 0o077))
    throw new Error("Recovery secrets must be private files outside the repository.");
}
const destination = (await readFile(values["destination-url-file"], "utf8")).trim();
const env = postgresEnvironment(destination);
const receipt = JSON.parse(await readFile(values.receipt, "utf8"));
assert.equal(sha256(await readFile(values.archive)), receipt.archiveSha256, "Archive ciphertext mismatch");
assert.equal(sha256(await readFile(values.manifest)), receipt.manifestSha256, "Manifest ciphertext mismatch");
const directory = await mkdtemp(join(tmpdir(), "bob-restore-"));
const pool = new Pool({ connectionString: destination, max: 1, connectionTimeoutMillis: 15_000 });
const started = Date.now();
try {
  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT count(*)::int AS count FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')`);
    assert.equal(existing.rows[0].count, 0, "Restore destination must be empty; nothing will be dropped");
    const age = process.env.BOB_AGE_BIN || "age";
    const archive = join(directory, "restore.dump");
    const manifestFile = join(directory, "manifest.json");
    for (const [input, output] of [[values.archive, archive], [values.manifest, manifestFile]])
      await runCommand(age, ["--decrypt", "--identity", values.identity, "--output", output, input], process.env, "Backup decryption");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    validateManifest(manifest, receipt, sha256(await readFile(values.archive)));
    await runCommand(process.env.BOB_PG_RESTORE_BIN || "pg_restore", ["--no-owner", "--no-acl", "--exit-on-error",
      "--single-transaction", `--dbname=${env.PGDATABASE}`, archive], env, "Database restoration");
    const actual = await captureInventory(client);
    assert.deepEqual(actual, manifest.tables, "Restored table counts must match the exported snapshot");
    const invalid = await client.query("SELECT count(*)::int AS count FROM pg_constraint WHERE contype='f' AND NOT convalidated");
    assert.equal(invalid.rows[0].count, 0, "Restored foreign keys must validate");
    const ledger = await client.query("SELECT to_regclass('public.bob_backup_runs') IS NOT NULL AS exists");
    if (ledger.rows[0].exists) {
      // The archive contains its own pre-upload 'running' row. An authenticated,
      // count-checked restore proves this artifact is recoverable, so it must
      // not become a permanently stuck job. Destination retention still needs
      // a fresh backup run; never infer it from this restore.
      await client.query(`UPDATE public.bob_backup_runs SET status='verified',verified_at=now(),
        retention_checked_at=NULL,failed_at=NULL,failure_code=NULL,
        archive_key=$2,manifest_key=$3,receipt_key=$4,ciphertext_sha256=$5,size_bytes=$6
        WHERE id::text=$1 AND status='running'`, [manifest.id, receipt.keys.archive, receipt.keys.manifest,
        receipt.keys.receipt, receipt.archiveSha256, receipt.bytes]);
    }
    // The source credentials are copied data, not authority to connect to a
    // recovery instance. Provision replacement grants before exposing Core.
    const projects = await client.query("SELECT to_regclass('public.bob_projects') IS NOT NULL AS exists");
    if (projects.rows[0].exists) await client.query("UPDATE bob_projects SET metadata=metadata #- '{auth,interfaceCredentials}' #- '{auth,readCredentialHashes}'");
    for (const table of ["bob_auth_session", "bob_auth_verification"]) {
      const exists = await client.query("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${table}`]);
      if (exists.rows[0].exists) await client.query(`DELETE FROM public.${table}`);
    }
    console.log(JSON.stringify({ event: "restore.verified", backupId: manifest.id, snapshotAt: manifest.startedAt,
      tablesVerified: actual.length, seconds: Math.round((Date.now() - started) / 1000),
      copiedInterfaceCredentialsRevoked: true, runtimeAcceptanceRequired: true }));
  } finally { client.release(); }
} catch (error) {
  console.error(JSON.stringify({ event: "restore.failed", code: "restore_validation_failed", error: error.name }));
  process.exitCode = 1;
} finally { await pool.end(); await rm(directory, { recursive: true, force: true }); }
