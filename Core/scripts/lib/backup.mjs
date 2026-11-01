import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { isAbsolute, join, relative, sep } from "node:path";
import { captureBackupIntegrity, validateBackupIntegrity, INTEGRITY_ALGORITHM } from "./backup-integrity.mjs";

export const RETENTION_DAYS = 30;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 21 * 1024 * 1024;
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
export const sortBackupTables = tables => [...tables].sort((a, b) =>
  a.schema < b.schema ? -1 : a.schema > b.schema ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function isOutsideDirectory(directory, file) {
  const path = relative(directory, file);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

// Child processes need the selected database credential, never storage, provider
// or ledger secrets inherited from the parent runner.
export function backupProcessEnvironment() {
  return Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "WINDIR"]
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
}

export function postgresEnvironment(connectionString, { readOnly = false } = {}) {
  let url;
  try { url = new URL(connectionString); }
  catch { throw new Error("A valid direct PostgreSQL connection is required."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || !url.username || !url.password ||
      url.hostname.includes("-pooler.")) {
    throw new Error("A direct PostgreSQL connection is required.");
  }
  // Avoid putting the credential in argv or interpreting it as a literal dbname.
  return { ...backupProcessEnvironment(), PGHOST: url.hostname, PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "15", PGSSLMODE: "verify-full", PGSSLROOTCERT: "system",
    ...(readOnly ? { PGOPTIONS: "-c default_transaction_read_only=on" } : {}) };
}

export function objectKeys(instance, id, startedAt) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(instance) ||
      !/^[a-zA-Z0-9-]{8,100}$/.test(id) || !Number.isFinite(Date.parse(startedAt))) {
    throw new Error("Invalid backup identity.");
  }
  const prefix = `${instance}/${new Date(startedAt).toISOString().slice(0, 10)}/${id}`;
  return { archive: `${prefix}.dump.age`, manifest: `${prefix}.manifest.age`, receipt: `${prefix}.receipt.json` };
}

export function expiredBackupKeys(objects, instance, now, protectedKeys = []) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(instance) || !Number.isFinite(now))
    throw new Error("Invalid retention boundary.");
  const pattern = new RegExp(`^${instance}/\\d{4}-\\d{2}-\\d{2}/[a-zA-Z0-9-]{8,100}\\.(?:dump\\.age|manifest\\.age|receipt\\.json)$`);
  const protectedSet = new Set(protectedKeys);
  const cutoff = now - RETENTION_DAYS * 86_400_000;
  return objects.filter(({ Key, LastModified }) => pattern.test(Key ?? "") &&
    !protectedSet.has(Key) && Number.isFinite(new Date(LastModified).getTime()) &&
    new Date(LastModified).getTime() < cutoff).map(({ Key }) => Key);
}

function exit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error(`${label} could not start.`)));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${label} failed.`)));
    // Do not put pg_dump diagnostics containing data or credentials into CI logs.
    child.stderr?.resume();
  });
}

export async function runCommand(command, args, env, label, timeout = 300_000) {
  const child = spawn(command, args, { env, stdio: ["ignore", "ignore", "pipe"],
    signal: AbortSignal.timeout(timeout) });
  await exit(child, label);
}

export async function captureInventory(client) {
  const tables = await client.query(`SELECT n.nspname AS schema, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    ORDER BY n.nspname,c.relname`);
  const result = [];
  for (const table of tables.rows) {
    const count = await client.query(`SELECT count(*)::text AS count FROM ONLY ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`);
    result.push({ schema: table.schema, name: table.name, rows: count.rows[0].count });
  }
  return sortBackupTables(result);
}

// The caller holds a REPEATABLE READ transaction until this completes. Counts
// and pg_dump share one exported snapshot, even while the application writes.
export async function createEncryptedBundle({ client, connectionString, directory, recipient, id,
  instance, startedAt, pgDump = "pg_dump", age = "age", expectedTables, coverage }) {
  if (!/^age1[a-z0-9]+$/.test(recipient)) throw new Error("An age public recipient is required.");
  const keys = objectKeys(instance, id, startedAt);
  const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot, current_setting('server_version') AS version")).rows[0];
  const tables = await captureInventory(client);
  if (expectedTables !== undefined && JSON.stringify(tables.map(({ schema, name }) => ({ schema, name }))) !== JSON.stringify(sortBackupTables(expectedTables)))
    throw new Error("Backup inventory does not match the reviewed coverage.");
  if (typeof snapshot.snapshot !== "string" || !/^[a-fA-F0-9-]{1,128}$/.test(snapshot.snapshot) ||
      !/^(17|18)(?:\.|$)/.test(snapshot.version)) throw new Error("Unsupported backup snapshot.");
  // This uses the very same held transaction whose snapshot pg_dump imports.
  // Content hashes and constraint definitions never enter the public receipt.
  const integrity = await captureBackupIntegrity(client, tables);
  validateBackupIntegrity(integrity, tables);
  const archive = join(directory, "backup.dump.age");
  const manifestFile = join(directory, "backup.manifest.age");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  const dump = spawn(pgDump, ["--format=custom", "--no-owner", "--no-acl",
    "--lock-wait-timeout=10s", `--snapshot=${snapshot.snapshot}`],
    { env: postgresEnvironment(connectionString, { readOnly: true }), stdio: ["ignore", "pipe", "pipe"], signal: controller.signal });
  const encrypt = spawn(age, ["--encrypt", "--recipient", recipient, "--output", archive],
    { env: backupProcessEnvironment(), stdio: ["pipe", "ignore", "pipe"], signal: controller.signal });
  try {
    await Promise.all([exit(dump, "PostgreSQL export"), exit(encrypt, "Archive encryption"), pipeline(dump.stdout, encrypt.stdin)]);
  } catch {
    controller.abort();
    throw new Error("Encrypted database export failed; no backup was published.");
  } finally { clearTimeout(timeout); }
  const archiveStat = await stat(archive);
  if (archiveStat.size > MAX_ARCHIVE_BYTES) throw new Error("Backup exceeds the configured 100 MiB bound.");
  const archiveHash = sha256(await readFile(archive));
  const manifest = { format: "bob-disaster-backup", version: 2, id, instance, startedAt,
    postgresVersion: snapshot.version, archiveSha256: archiveHash,
    recipientFingerprint: sha256(recipient), tables, snapshot: snapshot.snapshot, integrity,
    ...(coverage ? { coverage } : {}) };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  if (manifestBytes.length > 20 * 1024 * 1024) throw new Error("Backup manifest exceeds its size bound.");
  const encryptManifest = spawn(age, ["--encrypt", "--recipient", recipient, "--output", manifestFile],
    { env: backupProcessEnvironment(), stdio: ["pipe", "ignore", "pipe"], signal: AbortSignal.timeout(30_000) });
  const manifestDone = exit(encryptManifest, "Manifest encryption");
  await Promise.all([manifestDone, pipeline(Readable.from([manifestBytes]), encryptManifest.stdin)]);
  if ((await stat(manifestFile)).size > MAX_MANIFEST_BYTES) throw new Error("Encrypted manifest exceeds its size bound.");
  const receipt = { version: 2, id, instance, startedAt, keys, archiveSha256: archiveHash,
    manifestSha256: sha256(await readFile(manifestFile)), bytes: archiveStat.size,
    recipientFingerprint: sha256(recipient), integrity: { version: 1, algorithm: INTEGRITY_ALGORITHM } };
  validateBackupReceipt(receipt, { requireIntegrity: true });
  await writeFile(join(directory, "receipt.json"), JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
  return { archive, manifestFile, receipt };
}

export function validateBackupReceipt(receipt, { requireIntegrity = false } = {}) {
  if (!receipt || ![1, 2].includes(receipt.version) || (requireIntegrity && receipt.version !== 2) ||
      typeof receipt.id !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(receipt.id) ||
      typeof receipt.instance !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(receipt.instance) ||
      typeof receipt.startedAt !== "string" || !Number.isFinite(Date.parse(receipt.startedAt)) ||
      ![receipt.archiveSha256, receipt.manifestSha256, receipt.recipientFingerprint]
        .every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) ||
      !Number.isInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > MAX_ARCHIVE_BYTES)
    throw new Error("Backup receipt metadata is invalid.");
  const keys = objectKeys(receipt.instance, receipt.id, receipt.startedAt);
  if (!receipt.keys || Object.keys(receipt.keys).length !== 3 || Object.keys(keys).some(k => keys[k] !== receipt.keys[k]))
    throw new Error("Backup receipt keys are invalid.");
  if (receipt.version === 2 && (!receipt.integrity || Object.keys(receipt.integrity).length !== 2 ||
      receipt.integrity.version !== 1 || receipt.integrity.algorithm !== INTEGRITY_ALGORITHM))
    throw new Error("Backup integrity descriptor is invalid.");
  if (receipt.version === 2 && (Object.keys(receipt).length !== 10 ||
      !["version", "id", "instance", "startedAt", "keys", "archiveSha256", "manifestSha256", "bytes", "recipientFingerprint", "integrity"]
        .every(k => Object.hasOwn(receipt, k)))) throw new Error("Backup receipt fields are invalid.");
  if (receipt.version === 1 && receipt.integrity !== undefined)
    throw new Error("Legacy backup cannot claim full integrity verification.");
}

export function validateManifest(manifest, receipt, actualArchiveHash, { allowLegacy = false } = {}) {
  if (!manifest || !receipt || ![1, 2].includes(manifest.version) ||
      manifest.version !== receipt.version || (manifest.version === 1 && !allowLegacy))
    throw new Error("Backup version requires explicit legacy acceptance or is unsupported.");
  validateBackupReceipt(receipt);
  if (manifest.format !== "bob-disaster-backup" || !/^[a-zA-Z0-9-]{8,100}$/.test(manifest.id) ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(manifest.instance) ||
      !Number.isFinite(Date.parse(manifest.startedAt)) ||
      !/^[a-f0-9]{64}$/.test(manifest.recipientFingerprint) ||
      !/^[a-f0-9]{64}$/.test(manifest.archiveSha256) ||
      manifest.id !== receipt.id || manifest.instance !== receipt.instance ||
      manifest.startedAt !== receipt.startedAt || manifest.recipientFingerprint !== receipt.recipientFingerprint ||
      manifest.archiveSha256 !== receipt.archiveSha256 || actualArchiveHash !== manifest.archiveSha256 ||
      !Array.isArray(manifest.tables) || !manifest.tables.every(t =>
        typeof t.schema === "string" && typeof t.name === "string" &&
        typeof t.rows === "string" && /^\d+$/.test(t.rows)))
    throw new Error("Backup manifest or archive does not match.");
  const keys = objectKeys(manifest.instance, manifest.id, manifest.startedAt);
  if (!receipt.keys || Object.keys(keys).some(key => keys[key] !== receipt.keys[key]) ||
      !Number.isInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > MAX_ARCHIVE_BYTES)
    throw new Error("Backup receipt metadata does not match the encrypted manifest.");
  if (manifest.version === 2) {
    if (typeof manifest.snapshot !== "string" || !/^[a-fA-F0-9-]{1,128}$/.test(manifest.snapshot) ||
        typeof manifest.postgresVersion !== "string" || !/^(17|18)(?:\.|$)/.test(manifest.postgresVersion))
      throw new Error("Backup snapshot metadata is invalid.");
    validateBackupIntegrity(manifest.integrity, manifest.tables);
  } else if (manifest.integrity !== undefined) {
    throw new Error("Legacy backup cannot claim full integrity verification.");
  }
}
