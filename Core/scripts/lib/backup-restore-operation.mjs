import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isIP } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backupProcessEnvironment, isOutsideDirectory, postgresEnvironment, sha256,
  validateBackupReceipt, validateManifest, MAX_ARCHIVE_BYTES, MAX_MANIFEST_BYTES } from "./backup.mjs";
import { assertEmptyRestoreDestination, assertRestoreVersion, verifyRestoredBackup } from "./backup-restore-verification.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const unsupportedAuthoritySchemas = ["bob_workflow", "bob_owner_delegation", "bob_private_checks"];
export class RestoreOperationError extends Error {
  constructor(code, state = {}) { super(code); this.name = "RestoreOperationError"; this.code = code; this.state = state; }
}
const fail = code => { throw new RestoreOperationError(code); };
const checkSignal = signal => {
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail("restore_input_invalid");
  if (signal?.aborted) fail("restore_interrupted");
};
const interruptedExit = signal => ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal?.reason] ?? 1);

// One normalized connection selects both the Neon client and libpq. Arbitrary
// URL options (notably host/dbname/user overrides) are never forwarded to one
// transport while silently ignored by the other. Host identity still requires
// an operator-reviewed destination; matching database/roles is not that proof.
export function normalizeRestoreDestination(raw) {
  try {
    if (typeof raw !== "string" || /[\x00-\x20\x7f]/.test(raw)) fail("restore_input_invalid");
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.password || url.hash)
      fail("restore_input_invalid");
    // Non-special PostgreSQL URLs preserve encoded hosts and case. Accept only
    // canonical IPv4 or ASCII DNS labels and normalize once for both clients.
    // IPv6, percent escapes, numeric shorthand and trailing-dot aliases need a
    // separately reviewed connection profile instead of implicit decoding.
    const hostname = url.hostname.toLowerCase();
    const labels = hostname.split("."), label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    const numericAlias = labels.every(part => /^(?:\d+|0x[0-9a-f]+)$/.test(part));
    const dns = hostname.length <= 253 && labels.every(part => label.test(part)) &&
      !/^\d+$/.test(labels.at(-1)) && !numericAlias;
    if (!(isIP(hostname) === 4 || dns) || hostname.includes("-pooler.")) fail("restore_input_invalid");
    url.hostname = hostname;
    const database = decodeURIComponent(url.pathname.slice(1)), user = decodeURIComponent(url.username);
    // Keep libpq's dbname argument a literal name: '=' or a URI-like value
    // would otherwise be interpreted as connection options. This operating
    // profile deliberately accepts only unambiguous ASCII database/role names.
    const identifier = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
    if (!identifier.test(database) || !identifier.test(user)) fail("restore_input_invalid");
    url.username = user; url.pathname = `/${database}`;
    const seen = new Set();
    for (const [key, value] of url.searchParams) {
      if (seen.has(key) || !(key === "sslmode" && ["require", "verify-full"].includes(value) ||
          key === "channel_binding" && ["prefer", "require"].includes(value))) fail("restore_input_invalid");
      seen.add(key);
    }
    url.searchParams.set("sslmode", "verify-full");
    const connectionString = url.toString(), env = postgresEnvironment(connectionString);
    if (url.searchParams.has("channel_binding")) env.PGCHANNELBINDING = url.searchParams.get("channel_binding");
    return { connectionString, database, user, env };
  } catch { fail("restore_input_invalid"); }
}

// Private inputs are owner controlled and canonical. The owned temporary copies
// bind decryption to the exact ciphertext already hashed. This is not a defense
// against a hostile process with the same OS identity and directory access.
async function boundedFile(path, maximum, secret = false, read = true) {
  let handle;
  try {
    if (typeof path !== "string" || !isAbsolute(path) || await realpath(path) !== path) fail("restore_input_unsafe");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
        secret && (!isOutsideDirectory(repository, path) || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600))
      fail("restore_input_unsafe");
    if (info.size < 1 || info.size > maximum) fail("restore_artifact_invalid");
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino || opened.size !== info.size)
      fail("restore_input_unsafe");
    if (!read) return;
    const buffer = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat(), current = await lstat(path);
    if (offset !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs ||
        current.dev !== info.dev || current.ino !== info.ino || current.size !== info.size || await realpath(path) !== path)
      fail("restore_input_unsafe");
    return buffer.subarray(0, offset);
  } catch (error) {
    if (error instanceof RestoreOperationError) throw error;
    fail("restore_input_unsafe");
  } finally { await handle?.close(); }
}

// Restore-only supervision waits for close and the owned process group to be
// absent before plaintext can be deleted. No child output reaches diagnostics.
// Unknown liveness (EPERM) is retried boundedly; only ESRCH proves absence.
export async function runRestoreCommand(command, args, env, _label, timeout = 300_000, signal) {
  checkSignal(signal);
  if (process.platform === "win32" || typeof command !== "string" || !command || !Array.isArray(args) ||
      !env || !Number.isInteger(timeout) || timeout < 1 || timeout > 300_000) fail("restore_command_failed");
  let child, timer, abort, closed = false, errored = false, timedOut = false, forcedShutdown = false, exitCode;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const exists = () => {
    if (!Number.isSafeInteger(child?.pid)) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if (error.code === "ESRCH") return false; if (error.code === "EPERM") return true; throw error; }
  };
  const send = signal => {
    if (!Number.isSafeInteger(child?.pid)) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const waitGone = async duration => {
    const deadline = Date.now() + duration;
    do { if (closed && !exists()) return true; await pause(10); } while (Date.now() < deadline);
    return closed && !exists();
  };
  try {
    let done;
    const finished = new Promise(resolve => { done = resolve; });
    abort = () => done();
    signal?.addEventListener("abort", abort, { once: true });
    checkSignal(signal);
    try {
      child = spawn(command, args, { env: { ...env }, detached: true, stdio: ["ignore", "ignore", "pipe"] });
    } catch { fail("restore_command_failed"); }
    child.once("error", () => { errored = true; done(); });
    child.once("exit", code => { exitCode = code; done(); });
    child.once("close", code => { exitCode = code; closed = true; done(); });
    child.stderr?.on("error", () => {}); child.stderr?.resume();
    timer = setTimeout(() => { timedOut = true; done(); }, timeout);
    await finished;
    try {
      if (!await waitGone(100)) {
        forcedShutdown = true;
        send("SIGTERM");
        if (!await waitGone(1000)) { send("SIGKILL"); if (!await waitGone(1000)) throw Error(); }
      }
    } catch { throw new RestoreOperationError("restore_command_shutdown_unconfirmed", { commandUnsettled: true, cleanupUncertain: true }); }
    checkSignal(signal);
    if (errored || timedOut || forcedShutdown || exitCode !== 0) fail("restore_command_failed");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); child?.stderr?.destroy(); }
}

async function openNeonDestination(connectionString) {
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000, query_timeout: 15_000 });
  pool.on("error", () => {});
  let client;
  try { client = await pool.connect(); }
  catch {
    let cleanupUncertain = false;
    try { await pool.end(); } catch { cleanupUncertain = true; }
    throw new RestoreOperationError("restore_destination_failed", { cleanupUncertain });
  }
  return { client, close: async () => {
    let failed = false;
    try { client.release(true); } catch { failed = true; }
    try { await pool.end(); } catch { failed = true; }
    if (failed) fail("restore_cleanup_failed");
  } };
}

async function assertIdentity(client, destination, expectedMajor) {
  const result = await client.query(`SELECT current_database() AS database_name,
    current_user AS current_role, session_user AS session_role,
    (current_setting('server_version_num')::int/10000)::int AS major`);
  const row = result.rows?.[0];
  if (result.rows?.length !== 1 || row.database_name !== destination.database ||
      row.current_role !== destination.user || row.session_role !== destination.user) fail("restore_destination_mismatch");
  if (![17, 18].includes(row.major) || expectedMajor !== undefined && row.major !== expectedMajor) fail("restore_version_mismatch");
}
async function assertAuthorityProfile(client, manifest) {
  const schemaDenied = schema => unsupportedAuthoritySchemas.includes(schema);
  if (manifest && (manifest.tables.some(table => schemaDenied(table.schema)) ||
      manifest.integrity?.constraints.some(c => schemaDenied(c.schema) || schemaDenied(c.targetSchema) ||
        c.parent && (schemaDenied(c.parent.schema) || schemaDenied(c.parent.targetSchema))) ||
      manifest.integrity?.notNull.some(n => schemaDenied(n.schema)))) fail("restore_authority_profile_unsupported");
  const result = await client.query(`SELECT nspname AS schema FROM pg_catalog.pg_namespace
    WHERE nspname=ANY($1::text[]) ORDER BY nspname`, [unsupportedAuthoritySchemas]);
  if (!Array.isArray(result.rows) || result.rows.length) fail("restore_authority_profile_unsupported");
}
async function assertEmpty(client) {
  try { await assertEmptyRestoreDestination(client); } catch { fail("restore_destination_not_empty"); }
}

async function quarantineCopiedAccess(client, manifest, receipt, signal) {
  let begun = false, committing = false;
  const hasTable = async table => {
    const result = await client.query("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${table}`]);
    if (result.rows?.length !== 1 || typeof result.rows[0].exists !== "boolean") fail("restore_quarantine_readback_failed");
    return result.rows[0].exists;
  };
  const noRemaining = async (sql, params = []) => {
    const result = await client.query(sql, params);
    if (result.rows?.length !== 1 || result.rows[0].remaining !== 0) fail("restore_quarantine_readback_failed");
  };
  try {
    await client.query("BEGIN READ WRITE"); begun = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    await client.query("SET LOCAL search_path = pg_catalog, public");
    // RLS must error instead of silently hiding copied authority from revocation.
    await client.query("SET LOCAL row_security = off");
    await assertAuthorityProfile(client);
    if (await hasTable("bob_backup_runs")) {
      const parameters = [manifest.id, receipt.keys.archive, receipt.keys.manifest,
        receipt.keys.receipt, receipt.archiveSha256, receipt.bytes];
      const updated = await client.query(`UPDATE public.bob_backup_runs SET status='verified',verified_at=now(),
        retention_checked_at=NULL,failed_at=NULL,failure_code=NULL,
        archive_key=$2,manifest_key=$3,receipt_key=$4,ciphertext_sha256=$5,size_bytes=$6
        WHERE id::text=$1 AND status='running' RETURNING id::text AS id`, parameters);
      if (!Array.isArray(updated.rows) || updated.rows.length > 1 ||
          updated.rows.some(row => row.id !== manifest.id)) fail("restore_quarantine_readback_failed");
      // A post-capture registration is legitimately absent from the snapshot.
      // A present current-run row must bind all anchors, and a row just updated
      // must still exist. Never fabricate it or rewrite unrelated run history.
      await noRemaining(`SELECT CASE WHEN count(*) > 1 OR ($8::boolean AND count(*) <> 1) OR
        count(*) FILTER (WHERE instance_key IS DISTINCT FROM $7 OR status IS DISTINCT FROM 'verified' OR verified_at IS NULL OR
        retention_checked_at IS NOT NULL OR failed_at IS NOT NULL OR failure_code IS NOT NULL OR
        archive_key IS DISTINCT FROM $2 OR manifest_key IS DISTINCT FROM $3 OR receipt_key IS DISTINCT FROM $4 OR
        ciphertext_sha256 IS DISTINCT FROM $5 OR size_bytes IS DISTINCT FROM $6) > 0 THEN 1 ELSE 0 END::int AS remaining
        FROM public.bob_backup_runs WHERE id::text=$1`, [...parameters, receipt.instance, updated.rows.length === 1]);
    }
    if (await hasTable("bob_projects")) {
      await client.query("UPDATE public.bob_projects SET metadata=metadata #- '{auth,interfaceCredentials}' #- '{auth,readCredentialHashes}'");
      await noRemaining(`SELECT count(*)::int AS remaining FROM public.bob_projects
        WHERE metadata #> '{auth,interfaceCredentials}' IS NOT NULL OR metadata #> '{auth,readCredentialHashes}' IS NOT NULL`);
    }
    if (await hasTable("bob_oauth_project_grants")) {
      await client.query("UPDATE public.bob_oauth_project_grants SET revoked_at=COALESCE(revoked_at,now())");
      await noRemaining("SELECT count(*)::int AS remaining FROM public.bob_oauth_project_grants WHERE revoked_at IS NULL");
    }
    for (const table of ["bob_auth_oauth_client", "bob_auth_oauth_resource"]) {
      if (!await hasTable(table)) continue;
      await client.query(`UPDATE public.${table} SET disabled=true`);
      await noRemaining(`SELECT count(*)::int AS remaining FROM public.${table} WHERE disabled IS DISTINCT FROM true`);
    }
    for (const table of ["bob_auth_oauth_access_token", "bob_auth_oauth_refresh_token", "bob_auth_oauth_consent", "bob_auth_session", "bob_auth_verification"]) {
      if (!await hasTable(table)) continue;
      await client.query(`DELETE FROM public.${table}`);
      await noRemaining(`SELECT count(*)::int AS remaining FROM public.${table}`);
    }
    // Owner identity/account/passkey records deliberately survive. This is a
    // recovery quarantine, not runtime or replacement-credential acceptance.
    checkSignal(signal);
    committing = true;
    await client.query("COMMIT"); begun = false;
    // An interruption racing the acknowledgement requires operator readback.
    checkSignal(signal);
  } catch (error) {
    let rollbackFailed = false;
    if (begun) try { await client.query("ROLLBACK"); } catch { rollbackFailed = true; }
    // COMMIT can apply and lose its acknowledgement. A successful subsequent
    // ROLLBACK cannot prove it did not; never retry automatically.
    if (committing) throw new RestoreOperationError("restore_commit_unconfirmed", { commitUncertain: true, cleanupUncertain: rollbackFailed });
    if (rollbackFailed) throw new RestoreOperationError("restore_rollback_unconfirmed", { cleanupUncertain: true });
    if (error instanceof RestoreOperationError) throw error;
    fail("restore_quarantine_failed");
  }
}

// Dependency seams are programmatic only. The CLI always uses the same Neon
// transport and local tools; no environment/argument selects a test adapter.
export async function runRestoreDatabase(options, {
  openDestination = openNeonDestination, runCommand = runRestoreCommand,
  verify = verifyRestoredBackup, remove = rm,
} = {}) {
  const started = Date.now();
  let phase = "input", directory, connection, receipt, manifest, verification, failure;
  let destinationMayContainRestoredData = false, commitUncertain = false, cleanupUncertain = false;
  let commandUnsettled = false, temporaryRemoved = false;
  try {
    if (!options || options.confirmEmptyDestination !== true ||
        options.allowLegacyCountsOnly !== undefined && typeof options.allowLegacyCountsOnly !== "boolean") fail("restore_input_invalid");
    checkSignal(options.signal);
    for (const name of ["archive", "manifest", "receipt", "identity", "destinationURLFile"])
      if (typeof options[name] !== "string" || !isAbsolute(options[name])) fail("restore_input_invalid");
    const age = options.age ?? "age", pgRestore = options.pgRestore ?? "pg_restore";
    if ([age, pgRestore].some(value => typeof value !== "string" || !value || /[\x00-\x1f\x7f]/.test(value))) fail("restore_input_invalid");
    await boundedFile(options.identity, 64 * 1024, true, false);
    const destination = normalizeRestoreDestination((await boundedFile(options.destinationURLFile, 8192, true)).toString("utf8").trim());
    try {
      receipt = JSON.parse((await boundedFile(options.receipt, 64 * 1024)).toString("utf8"));
      validateBackupReceipt(receipt);
    } catch { receipt = undefined; fail("restore_artifact_invalid"); }
    const archiveBytes = await boundedFile(options.archive, MAX_ARCHIVE_BYTES);
    const manifestBytes = await boundedFile(options.manifest, MAX_MANIFEST_BYTES);
    if (archiveBytes.length !== receipt.bytes || sha256(archiveBytes) !== receipt.archiveSha256 ||
        sha256(manifestBytes) !== receipt.manifestSha256) fail("restore_artifact_invalid");
    directory = await mkdtemp(join(tmpdir(), "bob-restore-")); await chmod(directory, 0o700);
    const archiveCipher = join(directory, "archive.dump.age"), manifestCipher = join(directory, "manifest.age");
    await writeFile(archiveCipher, archiveBytes, { flag: "wx", mode: 0o600 });
    await writeFile(manifestCipher, manifestBytes, { flag: "wx", mode: 0o600 });
    phase = "destination";
    checkSignal(options.signal);
    connection = await openDestination(destination.connectionString);
    if (!connection?.client?.query || typeof connection.close !== "function") fail("restore_destination_failed");
    // Checks precede every query. A running query finishes within the configured
    // database timeout before cleanup; rollback remains possible after abort.
    const client = { query: (sql, params) => {
      if (sql !== "ROLLBACK") checkSignal(options.signal);
      return connection.client.query(sql, params);
    } };
    await assertIdentity(client, destination); await assertAuthorityProfile(client); await assertEmpty(client);
    phase = "decrypt";
    const archive = join(directory, "restore.dump"), manifestFile = join(directory, "manifest.json");
    try {
      for (const [input, output] of [[archiveCipher, archive], [manifestCipher, manifestFile]])
        { checkSignal(options.signal);
          await runCommand(age, ["--decrypt", "--identity", options.identity, "--output", output, input], backupProcessEnvironment(), "Backup decryption", 300_000, options.signal); }
    } catch (error) {
      if (error instanceof RestoreOperationError && (error.state.commandUnsettled || error.code === "restore_interrupted")) throw error;
      fail("restore_decryption_failed");
    }
    try {
      const info = await lstat(manifestFile);
      if (!info.isFile() || info.size < 1 || info.size > 20 * 1024 * 1024) fail("restore_manifest_invalid");
      manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      validateManifest(manifest, receipt, receipt.archiveSha256, { allowLegacy: options.allowLegacyCountsOnly === true });
    } catch { fail("restore_manifest_invalid"); }
    await assertAuthorityProfile(client, manifest);
    try { await assertRestoreVersion(client, manifest); } catch { fail("restore_version_mismatch"); }
    phase = "restore";
    const expectedMajor = Number(manifest.postgresVersion.split(".")[0]);
    await assertIdentity(client, destination, expectedMajor); await assertEmpty(client);
    destinationMayContainRestoredData = true;
    try {
      await runCommand(pgRestore, ["--no-owner", "--no-acl", "--exit-on-error", "--single-transaction",
        `--dbname=${destination.env.PGDATABASE}`, archive], destination.env, "Database restoration", 300_000, options.signal);
    } catch (error) {
      if (error instanceof RestoreOperationError) throw error;
      fail("restore_command_failed");
    }
    phase = "verify";
    checkSignal(options.signal);
    try { verification = await verify(client, manifest); } catch (error) {
      if (error instanceof RestoreOperationError && error.code === "restore_interrupted") throw error;
      fail("restore_integrity_failed");
    }
    phase = "quarantine";
    await assertIdentity(client, destination, expectedMajor);
    await quarantineCopiedAccess(client, manifest, receipt, options.signal);
  } catch (error) {
    if (error instanceof RestoreOperationError) {
      failure = { code: error.code, phase };
      commitUncertain = error.state.commitUncertain === true;
      cleanupUncertain = error.state.cleanupUncertain === true;
      commandUnsettled = error.state.commandUnsettled === true;
    } else failure = { code: phase === "input" ? "restore_input_invalid" : phase === "destination" ? "restore_destination_failed" : "restore_operation_failed", phase };
  } finally {
    const cleanup = [];
    if (connection) cleanup.push(Promise.resolve().then(() => connection.close()));
    if (directory && !commandUnsettled) cleanup.push(Promise.resolve().then(async () => {
      await remove(directory, { recursive: true, force: true }); temporaryRemoved = true;
    }));
    if ((await Promise.allSettled(cleanup)).some(result => result.status === "rejected")) {
      cleanupUncertain = true;
      failure ??= { code: "restore_cleanup_failed", phase: "cleanup" };
    }
  }
  if (!failure && options?.signal?.aborted) failure = { code: "restore_interrupted", phase: "cleanup" };
  if (failure) return { exitCode: failure.code === "restore_interrupted" ? interruptedExit(options?.signal) : 1,
    result: { event: "restore.failed", ...(receipt ? { backupId: receipt.id } : {}),
    ...failure, destinationMayContainRestoredData, commitUncertain, cleanupUncertain,
    ...(directory && !temporaryRemoved ? { recoveryDirectory: directory, plaintextRetained: true } : {}) } };
  return { exitCode: 0, result: { event: "restore.verified", backupId: manifest.id, snapshotAt: manifest.startedAt,
    ...verification, seconds: Math.round((Date.now() - started) / 1000),
    copiedInterfaceCredentialsRevoked: true, runtimeAcceptanceRequired: true } };
}

// A lost output acknowledgement never retries restoration. Cancellation must
// also release a blocked terminal write after database and file cleanup.
export async function writeRestoreOutcome({ result, exitCode, signal,
  write = (stream, record) => new Promise((resolve, reject) => process[stream].write(
    JSON.stringify(record) + "\n", error => error ? reject(error) : resolve())) }) {
  const diagnostic = code => ({ event: "restore.failed", ...(result.backupId ? { backupId: result.backupId } : {}),
    code, phase: "complete", destinationMayContainRestoredData: true, commitUncertain: false, cleanupUncertain: false });
  const acknowledge = async (stream, record) => {
    const delivery = Promise.resolve().then(() => write(stream, record));
    if (!signal) return delivery;
    let abort;
    const interrupted = new Promise((_, reject) => {
      abort = () => reject(new RestoreOperationError("restore_interrupted"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    try { return await Promise.race([delivery, interrupted]); }
    finally { signal.removeEventListener("abort", abort); }
  };
  if (exitCode === 0 && signal?.aborted) { result = diagnostic("restore_interrupted"); exitCode = interruptedExit(signal); }
  try { await acknowledge(exitCode === 0 ? "stdout" : "stderr", result); }
  catch {
    if (exitCode === 0) try {
      await acknowledge("stderr", diagnostic(signal?.aborted ? "restore_interrupted" : "restore_output_failed"));
    } catch { /* The nonzero process exit remains the only acknowledgement. */ }
    return exitCode || (signal?.aborted ? interruptedExit(signal) : 1);
  }
  if (exitCode === 0 && signal?.aborted) {
    try { await acknowledge("stderr", diagnostic("restore_interrupted")); } catch { /* Never wait indefinitely after cancellation. */ }
    return interruptedExit(signal);
  }
  return exitCode;
}
