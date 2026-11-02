import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { fetchBackupArtifact, validateArtifactCustodyApproval } from "./backup-artifact-evidence.mjs";
import { extractArtifactCiphertext } from "./backup-artifact-archive.mjs";
import { prepareBackupDownload, readBackupDownloadInput, validateBackupDownloadPlan,
  verifyBackupDownloadDestination } from "./backup-download-input.mjs";
import { validateBackupRecovery, validateBackupRecoveryProducer } from "./backup-recovery-handoff.mjs";
import { RestoreOperationError, runRestoreCommand } from "./backup-restore-operation.mjs";
import { backupProcessEnvironment, isOutsideDirectory, sha256 } from "./backup.mjs";

const issued = new WeakMap();
const safeCodes = new Set(["artifact_disabled", "artifact_invalid_input", "artifact_approval_invalid",
  "artifact_directory_unsafe", "artifact_directory_changed", "artifact_identity_unsafe", "artifact_identity_changed",
  "artifact_fetch_failed", "artifact_archive_invalid", "artifact_decryption_failed", "artifact_handoff_mismatch",
  "artifact_command_shutdown_unconfirmed", "artifact_file_failed", "artifact_file_changed", "artifact_interrupted",
  "artifact_verification_required", "artifact_expired", "artifact_plan_invalid", "artifact_plan_attempted"]);
const fail = (code, state) => { throw Object.assign(new BackupCoverageError(`artifact_${code}`), state ? { state } : {}); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const identity = info => ({ dev: info.dev, ino: info.ino });
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
const freeze = value => { if (value && typeof value === "object") {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const active = signal => {
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail("invalid_input");
  if (signal?.aborted) fail("interrupted");
};
const sanitize = (error, signal) => {
  let code, uncertain = false;
  try {
    const property = error instanceof BackupCoverageError ? Object.getOwnPropertyDescriptor(error, "code") : undefined;
    if (property && Object.hasOwn(property, "value") && safeCodes.has(property.value)) code = property.value;
    const state = Object.getOwnPropertyDescriptor(error, "state");
    if (state && Object.hasOwn(state, "value") && state.value && typeof state.value === "object") {
      const cleanup = Object.getOwnPropertyDescriptor(state.value, "cleanupUncertain");
      const plaintext = Object.getOwnPropertyDescriptor(state.value, "plaintextRetained");
      uncertain = cleanup?.value === true && plaintext?.value === true;
    }
  } catch { /* Never execute or propagate an injected diagnostic getter/proxy. */ }
  if (code) throw Object.assign(new BackupCoverageError(code),
    code === "artifact_command_shutdown_unconfirmed" && uncertain ? { state: { cleanupUncertain: true, plaintextRetained: true } } : {});
  active(signal); fail("file_failed");
};
const privateFile = info => info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() &&
  info.nlink === 1 && (info.mode & 0o7777) === 0o600;
const currentTime = now => {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail("invalid_input");
  return value.toISOString();
};

async function directoryUnchanged(state, signal) {
  active(signal);
  const info = await lstat(state.directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() ||
      (info.mode & 0o7777) !== 0o700 || !same(info, state.identity) ||
      await realpath(state.directory) !== state.directory) fail("directory_changed");
  const allowed = new Set([...state.files.keys()].map(path => path.slice(state.directory.length + 1)));
  if ((await readdir(state.directory)).some(name => !allowed.has(name))) fail("directory_changed");
  active(signal);
}

async function checkFiles(state, signal) {
  await directoryUnchanged(state, signal);
  for (const [path, expected] of state.files) {
    const bytes = await readBackupDownloadInput(path, expected.maximum, signal);
    if (!same(await lstat(path), expected.identity) || bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256)
      fail("file_changed");
  }
  await directoryUnchanged(state, signal);
}

async function syncDirectory(state, signal) {
  let handle;
  try {
    await directoryUnchanged(state, signal);
    handle = await open(state.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (!same(await handle.stat(), state.identity)) fail("directory_changed");
    active(signal); await handle.sync(); active(signal);
  } finally { await handle?.close(); }
}

async function writePrivate(state, name, bytes, maximum, signal) {
  let file;
  try {
    await directoryUnchanged(state, signal);
    const path = join(state.directory, name);
    if (bytes.length < 1 || bytes.length > maximum) fail("file_failed");
    file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const info = await file.stat();
    // Retain uncertain writes for owner reconciliation; never overwrite or
    // automatically delete this directory or any partial output on failure.
    state.files.set(path, { identity: identity(info), bytes: bytes.length, sha256: sha256(bytes), maximum });
    if (!privateFile(info) || info.size !== 0) fail("file_failed");
    active(signal); await file.writeFile(bytes); active(signal); await file.sync();
    if (!privateFile(await file.stat()) || !same(await file.stat(), info)) fail("file_changed");
    await file.close(); file = undefined;
    await syncDirectory(state, signal);
    await checkFiles(state, signal);
    return path;
  } finally { await file?.close(); }
}

// Only a single native age identity is admitted. No encrypted/SSH/plugin
// identities, callbacks, ambient key discovery or key-generation commands.
async function readIdentity(path, signal) {
  let bytes;
  try {
    bytes = await readBackupDownloadInput(path, 4096, signal);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text).equals(bytes)) fail("identity_unsafe");
    const lines = text.trimEnd().split(/\r?\n/);
    const keys = lines.filter(line => line && !line.startsWith("#"));
    if (keys.length !== 1 || !/^AGE-SECRET-KEY-1[A-Z0-9]{58}$/.test(keys[0]) ||
        lines.some(line => /[\x00-\x08\x0b-\x1f\x7f]/.test(line))) fail("identity_unsafe");
    return { sha256: sha256(bytes), identity: identity(await lstat(path)) };
  } catch { active(signal); fail("identity_unsafe"); }
  finally { bytes?.fill(0); }
}

function validateHandoff(bytes, approval, evidence) {
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!exact(parsed, ["version", "recovery", "producer"]) || parsed.version !== 1) fail("handoff_mismatch");
    const recovery = validateBackupRecovery(parsed.recovery), producer = validateBackupRecoveryProducer(parsed.producer);
    const record = { version: 1, recovery, producer };
    if (!bytes.equals(Buffer.from(JSON.stringify(record) + "\n")) ||
        JSON.stringify(producer) !== JSON.stringify(approval.producer) ||
        recovery.expected.instance !== approval.instance || recovery.expected.recipientFingerprint !== sha256(approval.recipient) ||
        /^0+$/.test(recovery.expected.receiptSha256) ||
        Date.parse(recovery.expected.startedAt) < Date.parse(evidence.job.startedAt) ||
        Date.parse(recovery.expected.startedAt) > Date.parse(evidence.artifact.createdAt)) fail("handoff_mismatch");
    return record;
  } catch { fail("handoff_mismatch"); }
}

function unexpired(state) {
  const now = currentTime(state.now);
  if (state.receipt.readbackAt < state.receipt.evidence.verifiedAt ||
      now < state.receipt.evidence.verifiedAt || now < state.receipt.readbackAt ||
      Date.parse(now) >= Date.parse(state.receipt.evidence.artifact.expiresAt))
    fail("expired");
  return now;
}

// This is a private operator library, deliberately not wired to a CLI, workflow,
// environment flag, backup store or global fetch. The caller must supply a
// separately approved read-only transport; tests supply synthetic Response data.
export async function verifyArtifactCustody({ enabled = false, approval, directory, identityFile, token, signal } = {}, {
  fetch, runCommand = runRestoreCommand, now = () => new Date(),
} = {}) {
  if (enabled !== true) fail("disabled");
  try {
    active(signal);
    if (typeof fetch !== "function" || typeof runCommand !== "function" || typeof now !== "function") fail("invalid_input");
    let checked;
    try { checked = validateArtifactCustodyApproval(approval); } catch { fail("approval_invalid"); }
    currentTime(now);
    let initial;
    try { initial = await verifyBackupDownloadDestination({ directory, signal }); }
    catch { active(signal); fail("directory_unsafe"); }
    if (typeof identityFile !== "string" || !isOutsideDirectory(directory, identityFile)) fail("identity_unsafe");
    const key = await readIdentity(identityFile, signal);
    const state = { directory, identity: initial, files: new Map(), now, planAttempted: false };
    let fetched;
    try { fetched = await fetchBackupArtifact({ enabled: true, approval: checked, token, signal }, { fetch, now }); }
    catch { active(signal); fail("fetch_failed"); }
    let ciphertext;
    try { ciphertext = extractArtifactCiphertext(fetched.archive); } catch { fail("archive_invalid"); }
    active(signal);
    // Identity and output directory are rechecked after the untrusted transfer
    // before any invocation of the installed local decryption tool.
    const keyBefore = await readIdentity(identityFile, signal);
    if (keyBefore.sha256 !== key.sha256 || !same(keyBefore.identity, key.identity)) fail("identity_changed");
    const ciphertextFile = await writePrivate(state, "recovery.json.age", ciphertext, 16384, signal);
    const handoffFile = join(directory, "recovery.json");
    try {
      await runCommand("/usr/local/bin/age", ["--decrypt", "--identity", identityFile, "--output", handoffFile,
        ciphertextFile], backupProcessEnvironment(), "Artifact handoff decryption", 60_000, signal);
    } catch (error) {
      let settled = false;
      try {
        const state = Object.getOwnPropertyDescriptor(error, "state");
        if (error instanceof RestoreOperationError) {
          if (!state || Object.hasOwn(state, "value") && state.value === undefined) settled = true;
          else if (Object.hasOwn(state, "value") && state.value && typeof state.value === "object") {
            const unsettled = Object.getOwnPropertyDescriptor(state.value, "commandUnsettled");
            settled = !unsettled || Object.hasOwn(unsettled, "value") && unsettled.value === false;
          }
        }
      } catch { /* Unknown supervision state cannot establish child shutdown. */ }
      if (!settled)
        fail("command_shutdown_unconfirmed", { cleanupUncertain: true, plaintextRetained: true });
      active(signal); fail("decryption_failed");
    }
    active(signal);
    let output;
    try {
      output = await open(handoffFile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = await output.stat();
      if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1 || info.size < 1 || info.size > 4096)
        fail("handoff_mismatch");
      await output.chmod(0o600); await output.sync();
      const bytes = await readBackupDownloadInput(handoffFile, 4096, signal);
      if (!same(await lstat(handoffFile), info)) fail("file_changed");
      const record = validateHandoff(bytes, checked, fetched.evidence);
      state.files.set(handoffFile, { identity: identity(info), bytes: bytes.length, sha256: sha256(bytes), maximum: 4096 });
      const keyAfter = await readIdentity(identityFile, signal);
      if (keyAfter.sha256 !== key.sha256 || !same(keyAfter.identity, key.identity)) fail("identity_changed");
      const handoff = { sha256: sha256(bytes), bytes: bytes.length, id: record.recovery.expected.id,
        instance: checked.instance, producer: record.producer };
      // These three hashes describe different bytes. Never substitute the
      // archive digest or ciphertext digest for the retained handoff anchor.
      state.receipt = freeze({ version: 1, source: "github-artifact", evidence: fetched.evidence, readbackAt: currentTime(now),
        ciphertext: { sha256: sha256(ciphertext), bytes: ciphertext.length }, handoff, recovery: record.recovery });
      unexpired(state);
    } finally { await output?.close(); }
    await checkFiles(state, signal);
    const receiptFile = await writePrivate(state, "custody-receipt.json", Buffer.from(JSON.stringify(state.receipt) + "\n"), 16384, signal);
    await checkFiles(state, signal); unexpired(state); active(signal);
    const verified = freeze({ receipt: state.receipt, receiptFile, handoffFile, ciphertextFile });
    issued.set(verified, state);
    return verified;
  } catch (error) { sanitize(error, signal); }
}

// Adapt only an in-process verified handle, never a caller-fabricated or loaded
// receipt. There is intentionally no storage client or automatic download here.
export async function createArtifactDownloadPlan({ verified, storage, review, destination, signal } = {}) {
  try {
    active(signal);
    const state = issued.get(verified);
    if (!state) fail("verification_required");
    if (state.planAttempted) fail("plan_attempted");
    let plan;
    try {
      if (!exact(review, ["reviewedAt", "storageAccountId"]) || !exact(destination, ["directory"])) fail("plan_invalid");
      plan = validateBackupDownloadPlan({ version: 1, enabled: true, storage, handoff: verified.receipt.handoff,
        review: { reviewedAt: review.reviewedAt, storageAccountId: review.storageAccountId,
          custodyReference: `github-artifact:${verified.receipt.evidence.artifact.id}` }, destination });
      if (plan.review.reviewedAt > currentTime(state.now) || !isOutsideDirectory(destination.directory, state.directory) ||
          !isOutsideDirectory(state.directory, destination.directory)) fail("plan_invalid");
      plan = freeze(plan);
    } catch { fail("plan_invalid"); }
    unexpired(state);
    // Claim the single plan attempt before the first await. Concurrent callers
    // cannot both pass validation and race exclusive output creation.
    state.planAttempted = true;
    await checkFiles(state, signal);
    await verifyBackupDownloadDestination({ directory: plan.destination.directory, signal });
    const planFile = await writePrivate(state, "download-plan.json", Buffer.from(JSON.stringify(plan) + "\n"), 16384, signal);
    const prepared = await prepareBackupDownload({ planFile, handoffFile: verified.handoffFile, signal });
    if (JSON.stringify(prepared.plan) !== JSON.stringify(plan)) fail("file_changed");
    await checkFiles(state, signal); unexpired(state); active(signal);
    return freeze({ plan, planFile, handoffFile: verified.handoffFile });
  } catch (error) { sanitize(error, signal); }
}
