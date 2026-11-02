import { join } from "node:path";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { prepareTestingBackup, checkTestingToolchain, executeTestingBackup,
  validateTestingBackupBinding } from "./backup-testing-runner.mjs";
import { validateBackupRecoveryProducer } from "./backup-recovery-handoff.mjs";
import { prepareBackupCustody, encryptBackupCustody, validateBackupCustodyResult } from "./backup-custody-encryption.mjs";
import { readBackupDownloadInput } from "./backup-download-input.mjs";
import { sha256 } from "./backup.mjs";

const inputNames = ["BOB_BACKUP_TESTING_ENABLED", "BOB_BACKUP_TESTING_APPROVED_SHA", "BOB_BACKUP_TESTING_IMAGE",
  "GITHUB_ACTIONS", "GITHUB_REPOSITORY", "GITHUB_EVENT_NAME", "GITHUB_REF", "GITHUB_WORKFLOW_REF", "GITHUB_SHA",
  "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "RUNNER_ENVIRONMENT", "RUNNER_OS", "RUNNER_ARCH",
  "BOB_BACKUP_TESTING_TEMP", "BOB_BACKUP_TESTING_RECOVERY_DIRECTORY", "BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY",
  "BOB_BACKUP_CAPTURE_DATABASE_URL", "BOB_BACKUP_LEDGER_DATABASE_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN"];
const secretNames = ["BOB_BACKUP_CAPTURE_DATABASE_URL", "BOB_BACKUP_LEDGER_DATABASE_URL",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"];
const freeze = value => {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};
const interruptedExit = signal => ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129, TIMEOUT: 124 }[signal?.reason] ?? 1);
const active = signal => { if (signal?.aborted) throw new Error("interrupted"); };
const failure = (code, signal) => ({ exitCode: signal?.aborted ? interruptedExit(signal) : 1,
  result: { event: "backup.failed", code: signal?.aborted ? "testing_interrupted" : code } });

function checkedArtifact(value, producer, directory) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 4 ||
      !["name", "path", "sha256", "bytes"].every(key => Object.hasOwn(value, key)) ||
      value.name !== `bob-recovery-handoff-r${producer.runId}-a${producer.runAttempt}` ||
      value.path !== join(directory, "recovery.json.age") || typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256) || /^0+$/.test(value.sha256) ||
      !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > 16384) throw new Error("invalid artifact");
  return Object.freeze({ name: value.name, path: value.path, sha256: value.sha256, bytes: value.bytes });
}

async function deliverSyntheticArtifact(upload, artifact, signal) {
  active(signal);
  let abort, timer;
  const delivered = Promise.resolve().then(() => {
    active(signal);
    return upload(Object.freeze({ ...artifact }), { signal });
  });
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(new Error("uncertain delivery"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    timer = setTimeout(abort, 60_000);
  });
  // A consumer can ignore cancellation. Stop waiting boundedly, observe its
  // eventual rejection, and retain ciphertext; neither timeout nor abort proves
  // that an upload failed or authorizes a retry.
  try { await Promise.race([delivered, interrupted]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

// This testing-only boundary suppresses the private adapter's start, terminal
// and error records. No network uploader is installed or selected by the CLI.
// The optional consumer exists for synthetic integration acceptance; a future
// hosted upload requires its own reviewed action and operator acknowledgement.
export async function executeTestingBackupCustody({ env, signal, prepare = prepareTestingBackup,
  check = checkTestingToolchain, run = executeTestingBackup, prepareCustody = prepareBackupCustody,
  encrypt = encryptBackupCustody, upload } = {}) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) return failure("testing_custody_failed");
  if (signal?.aborted) return failure("testing_interrupted", signal);
  if (upload !== undefined && typeof upload !== "function") return failure("testing_custody_failed");
  // Take one snapshot before any await. Unknown variables (including private
  // keys, runtime overrides and unrelated provider credentials) are excluded.
  const selected = Object.fromEntries(inputNames.filter(name => typeof env?.[name] === "string")
    .map(name => [name, env[name]]));
  try {
    const binding = freeze(validateTestingBackupBinding(await prepare({ env: { ...selected } })));
    active(signal);
    await check(binding, { env: { ...selected }, signal });
    active(signal);
    if (selected.AWS_SESSION_TOKEN) throw new BackupCoverageError("testing_session_credentials_refused");
    const producer = validateBackupRecoveryProducer({ repository: selected.GITHUB_REPOSITORY,
      sourceCommit: selected.GITHUB_SHA, workflow: selected.GITHUB_WORKFLOW_REF,
      runId: selected.GITHUB_RUN_ID, runAttempt: selected.GITHUB_RUN_ATTEMPT, image: binding.runner.image });
    try {
      // Filesystem topology is qualified before capture can create backup state.
      const prepared = await prepareCustody({ enabled: true,
        directory: selected.BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY,
        recoveryDirectory: selected.BOB_BACKUP_TESTING_RECOVERY_DIRECTORY,
        temporaryRoot: selected.BOB_BACKUP_TESTING_TEMP, producer,
        recipient: binding.plan.recipient, instance: binding.plan.instance, signal });
      active(signal);
      let completed;
      try {
        completed = await run({ env: { ...selected }, signal, onRecord: () => {},
          prepare: async () => binding, check: async () => { active(signal); } });
        if (completed?.exitCode !== 0) return failure("testing_capture_failed", signal);
        validateBackupCustodyResult(completed.result);
      } catch { return failure("testing_capture_failed", signal); }
      active(signal);
      const artifact = checkedArtifact(await encrypt({ prepared, result: completed.result, signal }), producer,
        selected.BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY);
      active(signal);
      if (upload) {
        // Recheck exact bounded ciphertext immediately before a synthetic
        // consumer receives it. Neither plaintext nor credentials are passed.
        const bytes = await readBackupDownloadInput(artifact.path, 16384, signal);
        if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error("changed artifact");
        await deliverSyntheticArtifact(upload, artifact, signal);
        active(signal);
      }
      // An upload callback or local file cannot establish independent custody.
      // Only these fixed, validated fields may reach public workflow output.
      return { exitCode: 0, result: { event: "backup.custody_prepared", artifactName: artifact.name,
        ciphertextSha256: artifact.sha256, ciphertextBytes: artifact.bytes }, artifact };
    } catch { return failure("testing_custody_failed", signal); }
  } catch (error) {
    if (signal?.aborted) return failure("testing_interrupted", signal);
    // Preparation/toolchain failures retain the existing safe testing contract.
    // The executable boundary below uses an explicit whitelist, never messages.
    throw error;
  } finally {
    for (const name of secretNames) delete selected[name];
  }
}
