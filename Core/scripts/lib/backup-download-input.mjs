import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { validateBackupStorageTarget } from "./backup-job.mjs";
import { validateBackupRecovery, validateBackupRecoveryProducer } from "./backup-recovery-handoff.mjs";
import { isOutsideDirectory, sha256 } from "./backup.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PLAN_BYTES = 16384, HANDOFF_BYTES = 4096, CREDENTIAL_BYTES = 20480;
const fail = code => { throw new BackupCoverageError(`operator_${code}`); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const identityOf = info => ({ dev: info.dev, ino: info.ino });
const utc = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const reference = value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const safeCodes = new Set(["operator_disabled", "operator_invalid_input", "operator_invalid_plan", "operator_input_unsafe",
  "operator_input_changed", "operator_input_too_large", "operator_input_failed", "operator_interrupted",
  "operator_handoff_mismatch", "operator_credentials_invalid", "operator_destination_required",
  "operator_destination_changed", "operator_destination_not_empty"]);
const sanitize = error => {
  if (error instanceof BackupCoverageError && safeCodes.has(error.code)) throw new BackupCoverageError(error.code);
  fail("input_failed");
};
const active = signal => {
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail("invalid_input");
  if (signal?.aborted) fail("interrupted");
};
const io = async (signal, action) => {
  active(signal);
  try { const value = await action(); active(signal); return value; }
  catch (error) { active(signal); throw error; }
};
const supported = () => { if (process.platform === "win32" || typeof process.getuid !== "function") fail("invalid_input"); };

// Review metadata and producer provenance are caller-supplied assertions. This
// contract does not authenticate an account, reviewer, GitHub run, or registry.
export function validateBackupDownloadPlan(input) {
  try {
    const enabled = input && Object.getOwnPropertyDescriptor(input, "enabled");
    if (!enabled || !Object.hasOwn(enabled, "value") || enabled.value !== true) fail("disabled");
    if (!exact(input, ["version", "enabled", "storage", "handoff", "review", "destination"]) || input.version !== 1 ||
        !exact(input.storage, ["endpoint", "bucket", "region"]) ||
        !exact(input.handoff, ["sha256", "bytes", "id", "instance", "producer"]) ||
        typeof input.handoff.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.handoff.sha256) || /^0+$/.test(input.handoff.sha256) ||
        !Number.isInteger(input.handoff.bytes) || input.handoff.bytes < 1 || input.handoff.bytes > HANDOFF_BYTES ||
        typeof input.handoff.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.handoff.id) ||
        typeof input.handoff.instance !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(input.handoff.instance) ||
        !exact(input.review, ["reviewedAt", "storageAccountId", "custodyReference"]) || !utc(input.review.reviewedAt) ||
        !reference(input.review.storageAccountId) || !reference(input.review.custodyReference) ||
        !exact(input.destination, ["directory"]) || typeof input.destination.directory !== "string" ||
        !isAbsolute(input.destination.directory) || input.destination.directory.includes("\0")) fail("invalid_plan");
    const storage = validateBackupStorageTarget(input.storage), producer = validateBackupRecoveryProducer(input.handoff.producer);
    return { version: 1, enabled: true, storage,
      handoff: { sha256: input.handoff.sha256, bytes: input.handoff.bytes, id: input.handoff.id,
        instance: input.handoff.instance, producer },
      review: { reviewedAt: input.review.reviewedAt, storageAccountId: input.review.storageAccountId,
        custodyReference: input.review.custodyReference }, destination: { directory: input.destination.directory } };
  } catch (error) {
    if (error instanceof BackupCoverageError && error.code === "operator_disabled") throw error;
    fail("invalid_plan");
  }
}

function privateFile(info, maximum, previous) {
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || info.nlink !== 1 ||
      (info.mode & 0o7777) !== 0o600) fail("input_unsafe");
  if (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > maximum) fail("input_too_large");
  if (previous && (!same(info, previous) || info.size !== previous.size || info.mtimeMs !== previous.mtimeMs ||
      info.ctimeMs !== previous.ctimeMs)) fail("input_changed");
}

async function boundedRead(file, maximum, signal) {
  const buffer = Buffer.alloc(maximum + 1);
  let size = 0;
  while (size < buffer.length) {
    const result = await io(signal, () => file.read(buffer, size, buffer.length - size, size));
    if (result.bytesRead === 0) break;
    size += result.bytesRead;
  }
  if (size > maximum) fail("input_too_large");
  return buffer.subarray(0, size);
}

// Bounded reads preserve every byte, including the final newline. Recheck the
// open inode, pathname, metadata, and bytes. These checks assume a controlled
// same-UID filesystem; they are not an atomic hostile-local-process boundary.
export async function readBackupDownloadInput(path, maximum, signal) {
  let file;
  try {
    active(signal); supported();
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > CREDENTIAL_BYTES || typeof path !== "string" ||
        !isAbsolute(path) || !isOutsideDirectory(repository, path)) fail("invalid_input");
    const before = await io(signal, () => lstat(path));
    privateFile(before, maximum);
    if (await io(signal, () => realpath(path)) !== path) fail("input_unsafe");
    active(signal);
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    active(signal);
    privateFile(await io(signal, () => file.stat()), maximum, before);
    const bytes = await boundedRead(file, maximum, signal);
    if (bytes.length !== before.size) fail("input_changed");
    privateFile(await io(signal, () => file.stat()), maximum, before);
    const reread = await boundedRead(file, maximum, signal);
    if (reread.length !== bytes.length || sha256(reread) !== sha256(bytes)) fail("input_changed");
    privateFile(await io(signal, () => file.stat()), maximum, before);
    privateFile(await io(signal, () => lstat(path)), maximum, before);
    if (await io(signal, () => realpath(path)) !== path) fail("input_changed");
    await file.close(); file = undefined; active(signal);
    return bytes;
  } catch (error) {
    active(signal);
    if (["ELOOP", "ENXIO", "EISDIR"].includes(error?.code)) fail("input_unsafe");
    sanitize(error);
  } finally {
    if (file) { try { await file.close(); } catch { fail("input_failed"); } }
  }
}

function privateDirectory(info) {
  return info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o7777) === 0o700;
}

export async function verifyBackupDownloadDestination(input = {}) {
  let handle, signal;
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_input");
    const { directory, identity } = input; signal = input.signal;
    active(signal); supported();
    if (typeof directory !== "string" || !isAbsolute(directory) || !isOutsideDirectory(repository, directory) ||
        (identity !== undefined && (!exact(identity, ["dev", "ino"]) ||
          ![identity.dev, identity.ino].every(value => Number.isSafeInteger(value) && value >= 0)))) fail("destination_required");
    const before = await io(signal, () => lstat(directory));
    if (!privateDirectory(before) || await io(signal, () => realpath(directory)) !== directory) fail("destination_required");
    if (identity && !same(before, identity)) fail("destination_changed");
    handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    active(signal);
    const opened = await io(signal, () => handle.stat());
    if (!privateDirectory(opened) || !same(opened, before)) fail("destination_changed");
    if ((await io(signal, () => readdir(directory))).length !== 0) fail("destination_not_empty");
    const after = await io(signal, () => lstat(directory));
    if (!privateDirectory(after) || !same(after, before) || await io(signal, () => realpath(directory)) !== directory)
      fail("destination_changed");
    await handle.close(); handle = undefined; active(signal);
    return identityOf(before);
  } catch (error) {
    active(signal);
    if (error instanceof BackupCoverageError && safeCodes.has(error.code)) sanitize(error);
    fail("destination_required");
  } finally { if (handle) { try { await handle.close(); } catch { fail("input_failed"); } } }
}

function parse(bytes, code) {
  try {
    const text = bytes.toString("utf8");
    if (!Buffer.from(text).equals(bytes)) fail(code);
    return JSON.parse(text);
  } catch { fail(code); }
}

export async function prepareBackupDownload(input = {}) {
  let signal;
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_input");
    const { planFile, handoffFile } = input; signal = input.signal;
    active(signal);
    const plan = validateBackupDownloadPlan(parse(await readBackupDownloadInput(planFile, PLAN_BYTES, signal), "invalid_plan"));
    const bytes = await readBackupDownloadInput(handoffFile, HANDOFF_BYTES, signal);
    if (bytes.length !== plan.handoff.bytes || sha256(bytes) !== plan.handoff.sha256) fail("handoff_mismatch");
    const retained = parse(bytes, "handoff_mismatch");
    if (!exact(retained, ["version", "recovery", "producer"]) || retained.version !== 1) fail("handoff_mismatch");
    let record;
    try { record = { version: 1, recovery: validateBackupRecovery(retained.recovery), producer: validateBackupRecoveryProducer(retained.producer) }; }
    catch { fail("handoff_mismatch"); }
    if (!bytes.equals(Buffer.from(JSON.stringify(record) + "\n")) || record.recovery.expected.id !== plan.handoff.id ||
        record.recovery.expected.instance !== plan.handoff.instance || JSON.stringify(record.producer) !== JSON.stringify(plan.handoff.producer))
      fail("handoff_mismatch");
    if (!isOutsideDirectory(plan.destination.directory, planFile) || !isOutsideDirectory(plan.destination.directory, handoffFile))
      fail("destination_required");
    const destinationIdentity = await verifyBackupDownloadDestination({ directory: plan.destination.directory, signal });
    active(signal);
    return { plan, record, destinationIdentity };
  } catch (error) { active(signal); sanitize(error); }
}

export async function readBackupDownloadCredentials(path, signal) {
  try {
    const input = parse(await readBackupDownloadInput(path, CREDENTIAL_BYTES, signal), "credentials_invalid");
    if (!exact(input, ["accessKeyId", "secretAccessKey"]) || ![input.accessKeyId, input.secretAccessKey].every(value =>
      typeof value === "string" && value.length >= 1 && Buffer.byteLength(value) <= 8192 && !/[\s\p{Cc}]/u.test(value)))
      fail("credentials_invalid");
    active(signal);
    return { accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey };
  } catch (error) { active(signal); sanitize(error); }
}
