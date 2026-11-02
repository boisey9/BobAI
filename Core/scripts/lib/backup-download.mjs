import { constants } from "node:fs";
import { lstat, open, readdir, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { isOutsideDirectory, MAX_ARCHIVE_BYTES, MAX_MANIFEST_BYTES, objectKeys,
  sha256, validateBackupReceipt } from "./backup.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAX_RECEIPT_BYTES = 64 * 1024;
const fail = code => { throw new BackupCoverageError(code); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const boundedSize = (value, maximum) => Number.isInteger(value) && value > 0 && value <= maximum;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const safeCodes = new Set(["download_disabled", "download_invalid_input", "download_destination_required",
  "download_destination_not_empty", "download_receipt_mismatch", "download_artifact_mismatch",
  "download_transport_failed", "download_file_failed", "download_cleanup_failed", "download_interrupted", "download_finalize_failed"]);
const active = signal => { if (signal?.aborted) fail("download_interrupted"); };

export function validateBackupDownloadExpected(expected) {
  if (!exact(expected, ["id", "instance", "startedAt", "recipientFingerprint", "receiptSha256", "receiptBytes", "manifestBytes"]) ||
      typeof expected.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(expected.id) ||
      typeof expected.instance !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(expected.instance) ||
      typeof expected.startedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expected.startedAt) ||
      !Number.isFinite(Date.parse(expected.startedAt)) || new Date(expected.startedAt).toISOString() !== expected.startedAt ||
      !digest(expected.recipientFingerprint) || !digest(expected.receiptSha256) ||
      !boundedSize(expected.receiptBytes, MAX_RECEIPT_BYTES) || !boundedSize(expected.manifestBytes, MAX_MANIFEST_BYTES))
    fail("download_invalid_input");
  return { ...expected };
}

async function inspectDirectory(directory, identity, owned = []) {
  if (typeof directory !== "string" || !isAbsolute(directory) || !isOutsideDirectory(repository, directory) ||
      await realpath(directory) !== directory) fail("download_destination_required");
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() ||
      (info.mode & 0o777) !== 0o700 || (identity && !sameFile(info, identity))) fail("download_destination_required");
  const allowed = new Set(owned.map(file => file.name));
  if ((await readdir(directory)).some(name => !allowed.has(name))) fail("download_destination_not_empty");
  return info;
}

async function fetchObject(storage, key, bytes, expectedHash, signal) {
  let body;
  active(signal);
  try { body = await storage.get(key, bytes); }
  catch { active(signal); fail("download_transport_failed"); }
  active(signal);
  // The injected get interface is responsible for bounded streaming before it
  // returns (the existing S3 adapter already does this). Do not coerce strings,
  // streams or arbitrary objects into buffers, or print transport exceptions.
  if (!(body instanceof Uint8Array) || body.byteLength !== bytes || sha256(body) !== expectedHash)
    fail("download_artifact_mismatch");
  return body;
}

async function writeOwnedFile(directory, identity, owned, name, bytes, expectedHash) {
  await inspectDirectory(directory, identity, owned);
  let file;
  try { file = await open(join(directory, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch { fail("download_file_failed"); }
  // Track the open-created inode before any write. A partial write/close failure
  // therefore cannot leave an untracked secret-bearing output file behind.
  const record = { name, path: join(directory, name), bytes: bytes.byteLength, hash: expectedHash };
  owned.push(record);
  try {
    record.identity = await file.stat();
    if (!record.identity.isFile() || record.identity.nlink !== 1 || record.identity.uid !== process.getuid() ||
        (record.identity.mode & 0o777) !== 0o600) fail("download_file_failed");
    await file.writeFile(bytes);
  } finally { await file.close(); }
}

async function verifyOwnedFile(record) {
  let file;
  try {
    // A replaced FIFO must not block open before its inode/type can be checked.
    file = await open(record.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!record.identity || !sameFile(info, record.identity) || !info.isFile() || info.nlink !== 1 ||
        info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600 || info.size !== record.bytes ||
        sha256(await file.readFile()) !== record.hash) fail("download_artifact_mismatch");
  } finally { await file?.close(); }
}

async function cleanupOwnedFiles(directory, identity, owned) {
  if (owned.length === 0) return;
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || !sameFile(info, identity) || await realpath(directory) !== directory)
    fail("download_cleanup_failed");
  let failed = false;
  for (const record of owned) {
    try {
      const current = await lstat(record.path);
      if (!record.identity || !sameFile(current, record.identity) || !current.isFile() || current.isSymbolicLink()) {
        failed = true; continue;
      }
      await unlink(record.path);
    } catch (error) { if (error.code !== "ENOENT") failed = true; }
  }
  if (failed) fail("download_cleanup_failed");
}

// Read-only artifact transport; importing this module creates no client or work.
// The caller supplies a separately trusted exact receipt hash/size and identity
// anchors. The unsigned receipt cannot establish its own producer provenance.
// manifestBytes must also come from trusted capture/custody evidence: receipt v2
// does not record it, while storage.get(key, exactBytes) requires an exact bound.
// The caller owns the private, initially empty destination and successful files;
// failure removes only files whose exclusive creation this invocation recorded.
// This assumes a trusted same-UID process boundary on an isolated runner: Node's
// pathname checks/unlink are not atomic against hostile same-UID substitutions.
// No private recovery identity, plaintext, ledger, listing or deletion authority
// is accepted. Storage deletion is never called; local cleanup is not erasure.
export async function downloadBackupBundle({ enabled = false, storage, expected: input, directory,
  directoryIdentity, signal, finalize = async () => {} } = {}) {
  const owned = [];
  let identity;
  try {
    if (enabled !== true) fail("download_disabled");
    if (!process.getuid || process.platform === "win32" || typeof storage?.get !== "function" ||
        typeof finalize !== "function" || (signal !== undefined && !(signal instanceof AbortSignal)) ||
        (directoryIdentity !== undefined && (!exact(directoryIdentity, ["dev", "ino"]) ||
          !Number.isSafeInteger(directoryIdentity.dev) || !Number.isSafeInteger(directoryIdentity.ino)))) fail("download_invalid_input");
    active(signal);
    const expected = validateBackupDownloadExpected(input);
    try { identity = await inspectDirectory(directory, directoryIdentity); }
    catch (error) {
      if (error instanceof BackupCoverageError) throw error;
      fail("download_destination_required");
    }
    active(signal);
    const keys = objectKeys(expected.instance, expected.id, expected.startedAt);
    const receiptBytes = await fetchObject(storage, keys.receipt, expected.receiptBytes, expected.receiptSha256, signal);
    let receipt;
    try {
      receipt = JSON.parse(Buffer.from(receiptBytes).toString("utf8"));
      validateBackupReceipt(receipt, { requireIntegrity: true });
      if (["id", "instance", "startedAt", "recipientFingerprint"].some(key => receipt[key] !== expected[key]) ||
          Object.keys(keys).some(key => receipt.keys[key] !== keys[key])) fail("download_receipt_mismatch");
    } catch { fail("download_receipt_mismatch"); }
    await writeOwnedFile(directory, identity, owned, "receipt.json", receiptBytes, expected.receiptSha256);
    active(signal);
    if (!boundedSize(receipt.bytes, MAX_ARCHIVE_BYTES)) fail("download_receipt_mismatch");
    const archive = await fetchObject(storage, keys.archive, receipt.bytes, receipt.archiveSha256, signal);
    await writeOwnedFile(directory, identity, owned, "archive.dump.age", archive, receipt.archiveSha256);
    active(signal);
    const manifest = await fetchObject(storage, keys.manifest, expected.manifestBytes, receipt.manifestSha256, signal);
    await writeOwnedFile(directory, identity, owned, "manifest.age", manifest, receipt.manifestSha256);
    active(signal);
    // Keep transport shutdown inside the owned-file cleanup boundary. A late
    // cancellation or shutdown failure must not produce a successful download.
    try { await finalize(); } catch { fail("download_finalize_failed"); }
    active(signal);
    await inspectDirectory(directory, identity, owned);
    for (const record of owned) { active(signal); await verifyOwnedFile(record); }
    active(signal);
    return { receipt, archive: join(directory, "archive.dump.age"), manifestFile: join(directory, "manifest.age"),
      receiptFile: join(directory, "receipt.json") };
  } catch (error) {
    try { if (identity) await cleanupOwnedFiles(directory, identity, owned); }
    catch { fail("download_cleanup_failed"); }
    if (error instanceof BackupCoverageError && safeCodes.has(error.code)) throw error;
    fail("download_file_failed");
  }
}
