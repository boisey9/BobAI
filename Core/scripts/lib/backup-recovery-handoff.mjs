import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { validateBackupDownloadExpected } from "./backup-download.mjs";
import { isOutsideDirectory, sha256 } from "./backup.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const issued = new WeakMap();
const maximumBytes = 4096;
const fail = code => { throw new BackupCoverageError(`recovery_${code}`); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const identity = info => Object.freeze({ dev: info.dev, ino: info.ino });
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
const active = signal => { if (signal?.aborted) fail("interrupted"); };
const io = async (signal, action) => { active(signal); const value = await action(); active(signal); return value; };
const safeCodes = new Set(["recovery_disabled", "recovery_invalid_input", "recovery_producer_invalid",
  "recovery_directory_required", "recovery_directory_changed", "recovery_conflict", "recovery_file_unsafe",
  "recovery_io_failed", "recovery_interrupted"]);
const sanitize = error => {
  if (error instanceof BackupCoverageError && safeCodes.has(error.code)) throw new BackupCoverageError(error.code);
  fail("io_failed");
};

// These are nonsecret assertions supplied by the caller, not authentication of
// GitHub or a registry. Only an independently approved custody path can establish
// their authority. Reconstruct fields explicitly for stable serialized bytes.
export function validateBackupRecovery(input) {
  try {
    if (!exact(input, ["version", "expected"]) || input.version !== 1 ||
        !exact(input.expected, ["id", "instance", "startedAt", "recipientFingerprint", "receiptSha256", "receiptBytes", "manifestBytes"]))
      fail("invalid_input");
    const expected = validateBackupDownloadExpected(input.expected);
    return { version: 1, expected: { id: expected.id, instance: expected.instance, startedAt: expected.startedAt,
      recipientFingerprint: expected.recipientFingerprint, receiptSha256: expected.receiptSha256,
      receiptBytes: expected.receiptBytes, manifestBytes: expected.manifestBytes } };
  } catch { fail("invalid_input"); }
}

export function validateBackupRecoveryProducer(input) {
  try {
    if (!exact(input, ["repository", "sourceCommit", "workflow", "runId", "runAttempt", "image"]) ||
        input.repository !== "boisey9/BobAI" || typeof input.sourceCommit !== "string" ||
        !/^[a-f0-9]{40}$/.test(input.sourceCommit) || /^0+$/.test(input.sourceCommit) ||
        input.workflow !== "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main" ||
        ![input.runId, input.runAttempt].every(value => typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value)) ||
        typeof input.image !== "string" || !/^ghcr\.io\/boisey9\/bob-backup-runner@sha256:[a-f0-9]{64}$/.test(input.image) ||
        input.image.endsWith("0".repeat(64))) fail("producer_invalid");
    return { repository: input.repository, sourceCommit: input.sourceCommit, workflow: input.workflow,
      runId: input.runId, runAttempt: input.runAttempt, image: input.image };
  } catch { fail("producer_invalid"); }
}

function privateDirectory(info) {
  return info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o7777) === 0o700;
}

async function inspectDirectory(directory, expectedIdentity, signal) {
  if (typeof directory !== "string" || !isAbsolute(directory) || !isOutsideDirectory(repository, directory))
    fail("directory_required");
  const info = await io(signal, () => lstat(directory));
  if (!privateDirectory(info) || await io(signal, () => realpath(directory)) !== directory) fail("directory_required");
  if (expectedIdentity && !same(info, expectedIdentity)) fail("directory_changed");
  return info;
}

async function inspectTemporaryRoot(temporaryRoot, expectedIdentity, signal) {
  if (typeof temporaryRoot !== "string" || !isAbsolute(temporaryRoot)) fail("directory_required");
  const info = await io(signal, () => lstat(temporaryRoot));
  if (!info.isDirectory() || info.isSymbolicLink() || await io(signal, () => realpath(temporaryRoot)) !== temporaryRoot)
    fail("directory_required");
  if (expectedIdentity && !same(info, expectedIdentity)) fail("directory_changed");
  return info;
}

// Preparation writes nothing. The retained directory must be outside both the
// repository and the temporary tree that the exporter/adapter can remove.
export async function prepareBackupRecoveryHandoff({ enabled = false, directory, producer, temporaryRoot } = {}) {
  try {
    if (enabled !== true) fail("disabled");
    if (process.platform === "win32" || typeof process.getuid !== "function") fail("invalid_input");
    const provenance = validateBackupRecoveryProducer(producer);
    const info = await inspectDirectory(directory);
    const temporary = await inspectTemporaryRoot(temporaryRoot);
    if (!isOutsideDirectory(temporaryRoot, directory) || !isOutsideDirectory(directory, temporaryRoot)) fail("directory_required");
    const prepared = Object.freeze({ version: 1, directory, temporaryRoot,
      producer: Object.freeze(provenance), identity: identity(info) });
    issued.set(prepared, { ...prepared, temporaryIdentity: identity(temporary) });
    return prepared;
  } catch (error) {
    if (error instanceof BackupCoverageError && safeCodes.has(error.code)) sanitize(error);
    fail("directory_required");
  }
}

function safeFile(info, expectedIdentity, bytes) {
  if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1 || (info.mode & 0o7777) !== 0o600)
    fail("file_unsafe");
  if (expectedIdentity && !same(info, expectedIdentity)) fail("conflict");
  if (info.size !== bytes) fail("conflict");
}

async function readExactRecord(path, bytes, expectedIdentity, signal, sync = false) {
  let file;
  try {
    active(signal);
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    active(signal);
    const before = await io(signal, () => file.stat());
    safeFile(before, expectedIdentity, bytes.length);
    const buffer = Buffer.alloc(bytes.length + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = await io(signal, () => file.read(buffer, size, buffer.length - size, size));
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
    }
    if (size !== bytes.length || !buffer.subarray(0, size).equals(bytes)) fail("conflict");
    safeFile(await io(signal, () => file.stat()), before, bytes.length);
    const current = await io(signal, () => lstat(path));
    safeFile(current, before, bytes.length);
    if (sync) await io(signal, () => file.sync());
    return identity(before);
  } catch (error) {
    if (["ELOOP", "ENXIO", "EISDIR"].includes(error?.code)) fail("file_unsafe");
    throw error;
  } finally { if (file) await file.close(); }
}

// A successful result confirms a synced local file and exact readback only. It
// does not claim off-device durability or authenticated producer provenance.
// Pathname checks assume an exclusively controlled same-UID directory, not an
// atomic defense against a hostile local process. Never delete or overwrite a
// partial/conflicting file: its exact UUID identifies reconciliation evidence.
export async function retainBackupRecoveryHandoff({ prepared, recovery, signal } = {}) {
  let directoryHandle, file;
  try {
    if (!issued.has(prepared) || (signal !== undefined && !(signal instanceof AbortSignal))) fail("invalid_input");
    active(signal);
    const config = issued.get(prepared), checked = validateBackupRecovery(recovery);
    const record = { version: 1, recovery: checked, producer: config.producer };
    const bytes = Buffer.from(JSON.stringify(record) + "\n");
    if (bytes.length > maximumBytes) fail("invalid_input");
    await inspectDirectory(config.directory, config.identity, signal);
    await inspectTemporaryRoot(config.temporaryRoot, config.temporaryIdentity, signal);
    directoryHandle = await open(config.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    active(signal);
    const directoryInfo = await io(signal, () => directoryHandle.stat());
    if (!privateDirectory(directoryInfo) || !same(directoryInfo, config.identity)) fail("directory_changed");
    const path = join(config.directory, `${checked.expected.id}.recovery.json`);
    let created = false, fileIdentity;
    try {
      active(signal);
      file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
    } catch (error) { if (error.code !== "EEXIST") throw error; }
    active(signal);
    if (created) {
      const before = await io(signal, () => file.stat());
      safeFile(before, undefined, 0); fileIdentity = identity(before);
      await io(signal, () => file.writeFile(bytes));
      safeFile(await io(signal, () => file.stat()), fileIdentity, bytes.length);
      await io(signal, () => file.sync());
      await file.close(); file = undefined;
      active(signal);
    } else {
      fileIdentity = await readExactRecord(path, bytes, undefined, signal, true);
    }
    await inspectDirectory(config.directory, config.identity, signal);
    await io(signal, () => directoryHandle.sync());
    await readExactRecord(path, bytes, fileIdentity, signal);
    await inspectDirectory(config.directory, config.identity, signal);
    const finalDirectory = await io(signal, () => directoryHandle.stat());
    if (!privateDirectory(finalDirectory) || !same(finalDirectory, config.identity)) fail("directory_changed");
    await directoryHandle.close(); directoryHandle = undefined;
    active(signal);
    return { version: 1, sha256: sha256(bytes), bytes: bytes.length };
  } catch (error) { sanitize(error); }
  finally {
    // Uncertain writes deliberately remain for identical retry/readback or
    // owner reconciliation. Closing descriptors is the only automatic cleanup.
    let failed = false;
    for (const handle of [file, directoryHandle]) {
      try { if (handle) await handle.close(); } catch { failed = true; }
    }
    if (failed) fail("io_failed");
  }
}
