import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { isAbsolute, join, relative, sep } from "node:path";

export const RETENTION_DAYS = 30;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

export function isOutsideDirectory(directory, file) {
  const path = relative(directory, file);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

export function postgresEnvironment(connectionString) {
  let url;
  try { url = new URL(connectionString); }
  catch { throw new Error("A valid direct PostgreSQL connection is required."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || !url.username || !url.password ||
      url.hostname.includes("-pooler.")) {
    throw new Error("A direct PostgreSQL connection is required.");
  }
  // Avoid putting the credential in argv or interpreting it as a literal dbname.
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "15", PGSSLMODE: "verify-full", PGSSLROOTCERT: "system" };
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
    WHERE c.relkind='r' AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY n.nspname,c.relname`);
  const result = [];
  for (const table of tables.rows) {
    const count = await client.query(`SELECT count(*)::text AS count FROM ONLY ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`);
    result.push({ ...table, rows: count.rows[0].count });
  }
  return result;
}

// The caller holds a REPEATABLE READ transaction until this completes. Counts
// and pg_dump share one exported snapshot, even while the application writes.
export async function createEncryptedBundle({ client, connectionString, directory, recipient, id,
  instance, startedAt, pgDump = "pg_dump", age = "age" }) {
  if (!/^age1[a-z0-9]+$/.test(recipient)) throw new Error("An age public recipient is required.");
  const keys = objectKeys(instance, id, startedAt);
  const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot, current_setting('server_version') AS version")).rows[0];
  const tables = await captureInventory(client);
  const archive = join(directory, "backup.dump.age");
  const manifestFile = join(directory, "backup.manifest.age");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  const dump = spawn(pgDump, ["--format=custom", "--no-owner", "--no-acl",
    "--lock-wait-timeout=10s", `--snapshot=${snapshot.snapshot}`],
    { env: postgresEnvironment(connectionString), stdio: ["ignore", "pipe", "pipe"], signal: controller.signal });
  const encrypt = spawn(age, ["--encrypt", "--recipient", recipient, "--output", archive],
    { stdio: ["pipe", "ignore", "pipe"], signal: controller.signal });
  try {
    await Promise.all([exit(dump, "PostgreSQL export"), exit(encrypt, "Archive encryption"), pipeline(dump.stdout, encrypt.stdin)]);
  } catch {
    controller.abort();
    throw new Error("Encrypted database export failed; no backup was published.");
  } finally { clearTimeout(timeout); }
  const archiveStat = await stat(archive);
  if (archiveStat.size > MAX_ARCHIVE_BYTES) throw new Error("Backup exceeds the configured 100 MiB bound.");
  const archiveHash = sha256(await readFile(archive));
  const manifest = { format: "bob-disaster-backup", version: 1, id, instance, startedAt,
    postgresVersion: snapshot.version, archiveSha256: archiveHash,
    recipientFingerprint: sha256(recipient), tables };
  const encryptManifest = spawn(age, ["--encrypt", "--recipient", recipient, "--output", manifestFile],
    { stdio: ["pipe", "ignore", "pipe"], signal: AbortSignal.timeout(30_000) });
  const manifestDone = exit(encryptManifest, "Manifest encryption");
  await Promise.all([manifestDone, pipeline(Readable.from([JSON.stringify(manifest)]), encryptManifest.stdin)]);
  const receipt = { version: 1, id, instance, startedAt, keys, archiveSha256: archiveHash,
    manifestSha256: sha256(await readFile(manifestFile)), bytes: archiveStat.size,
    recipientFingerprint: sha256(recipient) };
  await writeFile(join(directory, "receipt.json"), JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
  return { archive, manifestFile, receipt };
}

export function validateManifest(manifest, receipt, actualArchiveHash) {
  if (manifest.format !== "bob-disaster-backup" || manifest.version !== 1 ||
      receipt.version !== 1 || !/^[a-zA-Z0-9-]{8,100}$/.test(manifest.id) ||
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
}
