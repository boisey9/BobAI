import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, open, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { readBackupDownloadInput } from "./backup-download-input.mjs";
import { validateBackupRecovery, validateBackupRecoveryProducer } from "./backup-recovery-handoff.mjs";
import { RestoreOperationError, runRestoreCommand } from "./backup-restore-operation.mjs";
import { backupProcessEnvironment, isOutsideDirectory, MAX_ARCHIVE_BYTES, sha256 } from "./backup.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const preparedStates = new WeakMap();
const HANDOFF_BYTES = 4096, CIPHERTEXT_BYTES = 16384;
const AGE_HEADER = Buffer.from("age-encryption.org/v1\n");
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const identity = info => ({ dev: info.dev, ino: info.ino });
const fail = (code, state) => { throw Object.assign(new BackupCoverageError(`custody_${code}`), state ? { state } : {}); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
const active = signal => {
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail("invalid_input");
  if (signal?.aborted) fail("interrupted");
};
const privateDirectory = info => info.isDirectory() && !info.isSymbolicLink() &&
  info.uid === process.getuid() && (info.mode & 0o7777) === 0o700;
const privateFile = (info, expected) => info.isFile() && info.uid === process.getuid() && info.nlink === 1 &&
  (info.mode & 0o7777) === 0o600 && (!expected || same(info, expected));
const sanitize = error => {
  if (error instanceof BackupCoverageError && /^custody_[a-z_]+$/.test(error.code)) throw error;
  fail("operation_failed");
};

async function directoryIdentity(path, expected, empty = false) {
  if (typeof path !== "string" || !isAbsolute(path) || !isOutsideDirectory(repository, path) ||
      await realpath(path) !== path) fail("directory_unsafe");
  const info = await lstat(path);
  if (!privateDirectory(info) || expected && !same(info, expected)) fail("directory_changed");
  if (empty && (await readdir(path)).length) fail("directory_not_empty");
  return identity(info);
}

// Preparation is read-only and precedes capture. These are controlled same-UID
// filesystem checks, not atomic protection against a hostile local process.
// An issued preparation permits one attempt only: age ciphertext is randomized,
// so a repeat must never masquerade as an identical retry after lost output.
export async function prepareBackupCustody({ enabled = false, directory, recoveryDirectory, temporaryRoot,
  producer, recipient, instance, signal } = {}) {
  if (enabled !== true) fail("disabled");
  try {
    active(signal);
    if (process.platform === "win32" || typeof process.getuid !== "function" ||
        typeof recipient !== "string" || !/^age1[a-z0-9]{20,100}$/.test(recipient) ||
        typeof instance !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(instance)) fail("invalid_input");
    const checkedProducer = validateBackupRecoveryProducer(producer);
    const paths = [directory, recoveryDirectory, temporaryRoot];
    for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
      if (typeof paths[i] !== "string" || typeof paths[j] !== "string" ||
          !isOutsideDirectory(paths[i], paths[j]) || !isOutsideDirectory(paths[j], paths[i])) fail("directory_unsafe");
    }
    const identities = [];
    for (const path of paths) { active(signal); identities.push(await directoryIdentity(path, undefined, true)); }
    active(signal);
    const prepared = Object.freeze({});
    preparedStates.set(prepared, { directory, recoveryDirectory, temporaryRoot, identities,
      producer: checkedProducer, recipient, instance, attempted: false });
    return prepared;
  } catch (error) { sanitize(error); }
}

export function validateBackupCustodyResult(result) {
  if (!exact(result, ["event", "id", "bytes", "retentionChecked", "expiredObjectsRemoved", "handoff"]) ||
      result.event !== "backup.verified" || typeof result.id !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(result.id) ||
      !Number.isSafeInteger(result.bytes) || result.bytes < 1 || result.bytes > MAX_ARCHIVE_BYTES ||
      result.retentionChecked !== false || result.expiredObjectsRemoved !== 0 ||
      !exact(result.handoff, ["version", "sha256", "bytes"]) || result.handoff.version !== 1 ||
      typeof result.handoff.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(result.handoff.sha256) ||
      !Number.isSafeInteger(result.handoff.bytes) || result.handoff.bytes < 1 || result.handoff.bytes > HANDOFF_BYTES)
    fail("result_invalid");
}

async function verifyDirectories(config, ciphertextEmpty) {
  for (const [index, path] of [config.directory, config.recoveryDirectory, config.temporaryRoot].entries())
    await directoryIdentity(path, config.identities[index], index === 0 && ciphertextEmpty);
}

async function createPrivateFile(path, bytes, owned) {
  let file;
  try {
    file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const info = await file.stat(); owned.set(path, identity(info));
    if (!privateFile(info) || info.size !== 0) fail("file_unsafe");
    await file.writeFile(bytes); await file.sync();
    if (!privateFile(await file.stat(), info)) fail("file_unsafe");
  } finally { await file?.close(); }
}

// Cleanup touches only identities this operation created or admitted in its own
// staging directory. Unknown/replaced files remain for owner reconciliation.
async function removePlaintextStage(stage, stageIdentity, owned) {
  await directoryIdentity(stage, stageIdentity);
  let failed = false;
  for (const [path, expected] of owned) {
    try {
      const info = await lstat(path);
      if (!privateFile(info, expected)) { failed = true; continue; }
      await unlink(path);
    } catch { failed = true; }
  }
  try { await directoryIdentity(stage, stageIdentity); await rmdir(stage); } catch { failed = true; }
  if (failed) fail("cleanup_failed", { cleanupUncertain: true, plaintextRetained: true });
}

export async function encryptBackupCustody({ prepared, result, signal } = {}, {
  runCommand = runRestoreCommand, cleanup = removePlaintextStage,
} = {}) {
  let config, stage, stageIdentity, commandUnsettled = false, failure, descriptor;
  const ownedStage = new Map(), ownedFinal = new Map();
  try {
    active(signal);
    config = preparedStates.get(prepared);
    if (!config || config.attempted) fail("preparation_required");
    config.attempted = true;
    validateBackupCustodyResult(result);
    await verifyDirectories(config, true); active(signal);
    // The UUID is validated before it selects a single private input. No scan,
    // glob, newest-file heuristic, or fetched receipt supplies trust anchors.
    const bytes = await readBackupDownloadInput(join(config.recoveryDirectory, `${result.id}.recovery.json`), HANDOFF_BYTES, signal);
    if (bytes.length !== result.handoff.bytes || sha256(bytes) !== result.handoff.sha256) fail("handoff_mismatch");
    let record, recovery, producer;
    try {
      record = JSON.parse(bytes.toString("utf8"));
      if (!exact(record, ["version", "recovery", "producer"]) || record.version !== 1) fail("handoff_mismatch");
      recovery = validateBackupRecovery(record.recovery); producer = validateBackupRecoveryProducer(record.producer);
    } catch { fail("handoff_mismatch"); }
    if (recovery.expected.id !== result.id || recovery.expected.instance !== config.instance ||
        recovery.expected.recipientFingerprint !== sha256(config.recipient) ||
        JSON.stringify(producer) !== JSON.stringify(config.producer) ||
        !bytes.equals(Buffer.from(JSON.stringify({ version: 1, recovery, producer }) + "\n"))) fail("handoff_mismatch");
    await verifyDirectories(config, true); active(signal);
    stage = await mkdtemp(join(config.temporaryRoot, "bob-backup-custody-"));
    await chmod(stage, 0o700); stageIdentity = await directoryIdentity(stage);
    const plaintext = join(stage, "recovery.json"), encrypted = join(stage, "recovery.json.age");
    await createPrivateFile(plaintext, bytes, ownedStage); active(signal);
    try {
      await runCommand("/usr/local/bin/age", ["--encrypt", "--recipient", config.recipient,
        "--output", encrypted, plaintext], backupProcessEnvironment(), "Custody encryption", 60_000, signal);
    } catch (error) {
      // Only this supervisor's settled failures establish that cleanup is safe.
      if (!(error instanceof RestoreOperationError) || error.state?.commandUnsettled) {
        commandUnsettled = true;
        fail("command_shutdown_unconfirmed", { cleanupUncertain: true, plaintextRetained: true });
      }
      if (error.code === "restore_interrupted") fail("interrupted");
      fail("encryption_failed");
    }
    // The tool owns creation inside our private stage. Admit only its regular,
    // single-link output before changing its mode or reading any bytes.
    let output;
    try {
      output = await open(encrypted, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = await output.stat();
      if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1)
        fail("ciphertext_invalid");
      ownedStage.set(encrypted, identity(info)); await output.chmod(0o600);
      if (!privateFile(await output.stat(), info)) fail("file_unsafe");
      if (info.size < 1 || info.size > CIPHERTEXT_BYTES) fail("ciphertext_invalid");
    } finally { await output?.close(); }
    active(signal);
    const ciphertext = await readBackupDownloadInput(encrypted, CIPHERTEXT_BYTES, signal);
    // Sanity-check the pinned tool's unarmored format before publishing. This
    // does not establish recipient-key custody or independently test decryption.
    if (!ciphertext.subarray(0, AGE_HEADER.length).equals(AGE_HEADER)) fail("ciphertext_invalid");
    await verifyDirectories(config, true); active(signal);
    const path = join(config.directory, "recovery.json.age");
    await createPrivateFile(path, ciphertext, ownedFinal); active(signal);
    const readback = await readBackupDownloadInput(path, CIPHERTEXT_BYTES, signal);
    if (!readback.equals(ciphertext) || !privateFile(await lstat(path), ownedFinal.get(path))) fail("ciphertext_mismatch");
    let directoryHandle;
    try {
      directoryHandle = await open(config.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      const info = await directoryHandle.stat();
      if (!privateDirectory(info) || !same(info, config.identities[0])) fail("directory_changed");
      await directoryHandle.sync();
    } finally { await directoryHandle?.close(); }
    await verifyDirectories(config, false); active(signal);
    descriptor = { name: `bob-recovery-handoff-r${producer.runId}-a${producer.runAttempt}`,
      path, sha256: sha256(ciphertext), bytes: ciphertext.length };
  } catch (error) { failure = error; }
  finally {
    if (stage && stageIdentity && !commandUnsettled) {
      try { await cleanup(stage, stageIdentity, ownedStage); }
      catch { failure = new BackupCoverageError("custody_cleanup_failed");
        failure.state = { cleanupUncertain: true, plaintextRetained: true }; }
    }
  }
  if (failure) sanitize(failure);
  try {
    active(signal);
    // Cleanup is awaited before success. Recheck after that asynchronous work
    // so a lost/replaced final file cannot acquire a successful descriptor.
    await verifyDirectories(config, false);
    const finalBytes = await readBackupDownloadInput(descriptor.path, CIPHERTEXT_BYTES, signal);
    if (finalBytes.length !== descriptor.bytes || sha256(finalBytes) !== descriptor.sha256 ||
        !privateFile(await lstat(descriptor.path), ownedFinal.get(descriptor.path))) fail("ciphertext_mismatch");
    active(signal);
    return descriptor;
  } catch (error) { sanitize(error); }
}
