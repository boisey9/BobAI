import { chmod, lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { readPrivateBackupInput } from "./backup-preflight.mjs";
import { validateBackupJobPlan, validateBackupJobTargets } from "./backup-job.mjs";
import { isOutsideDirectory, sha256 } from "./backup.mjs";
import { runBackupExporter } from "./backup-exporter-process.mjs";
import { prepareBackupRecoveryHandoff, retainBackupRecoveryHandoff, validateBackupRecovery } from "./backup-recovery-handoff.mjs";

const core = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repository = resolve(core, "..");
const fail = code => { throw new BackupCoverageError(code); };
const inputNames = ["BOB_BACKUP_PLAN_JSON", "BOB_BACKUP_CAPTURE_DATABASE_URL", "BOB_BACKUP_LEDGER_DATABASE_URL"];
const failureCodes = new Set(["disabled", "adapter_input_required", "invalid_job_plan", "invalid_plan",
  "target_mismatch", "separate_credentials_required", "retention_not_supported", "storage_credentials_required",
  "session_credentials_not_supported", "runner_temp_required", "private_input_required", "unsupported_platform",
  "tool_path_required", "interrupted", "recovery_plan_required", "recovery_disabled", "recovery_invalid_input",
  "recovery_producer_invalid", "recovery_directory_required", "recovery_directory_changed", "recovery_conflict",
  "recovery_file_unsafe", "recovery_io_failed", "recovery_interrupted"]);

function boundedInput(value, maximum) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > maximum || value.includes("\0"))
    fail("adapter_input_required");
  return value.trim();
}

function throwIfAborted(signal) {
  if (signal?.aborted) fail("interrupted");
}

async function runnerRoot(path) {
  if (typeof path !== "string" || !isAbsolute(path) || path !== await realpath(path) ||
      !isOutsideDirectory(repository, path)) fail("runner_temp_required");
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o022) || info.uid !== process.getuid())
    fail("runner_temp_required");
  return path;
}

// Secrets are provided only to this execution step. No provider/owner credential,
// original input variable, NODE_OPTIONS or PostgreSQL override reaches the child.
export function backupExporterEnvironment(env, directory) {
  const child = Object.fromEntries(["PATH", "LANG", "LC_ALL"].filter(key => typeof env[key] === "string")
    .map(key => [key, env[key]]));
  for (const key of ["BOB_PG_DUMP_BIN", "BOB_AGE_BIN"]) {
    if (env[key] !== undefined) {
      if (typeof env[key] !== "string" || !isAbsolute(env[key]) || /[\x00-\x1f\x7f]/.test(env[key])) fail("tool_path_required");
      child[key] = env[key];
    }
  }
  if (env.AWS_SESSION_TOKEN) fail("session_credentials_not_supported");
  for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
    if (typeof env[key] !== "string" || !env[key].trim() || Buffer.byteLength(env[key]) > 8192 || env[key].includes("\0"))
      fail("storage_credentials_required");
    child[key] = env[key].trim();
  }
  return { ...child, TMPDIR: directory };
}

// Dependency injection is for local synthetic acceptance, never selected by CLI
// flags or environment. The executable and working directory are fixed in source.
export async function runBackupWorkflow({ env, recovery, signal, onRecord = () => {}, execute = runBackupExporter,
  prepareRecovery = prepareBackupRecoveryHandoff, retainRecovery = retainBackupRecoveryHandoff } = {}) {
  let directory, result, started, preparedRecovery, recoveryBinding, exitCode = 1;
  try {
    if (env?.BOB_BACKUP_ADAPTER_ENABLED !== "true") fail("disabled");
    if (process.platform === "win32" || !process.getuid) fail("unsupported_platform");
    throwIfAborted(signal);
    const planJSON = boundedInput(env[inputNames[0]], 16384);
    let parsed;
    try { parsed = JSON.parse(planJSON); } catch { fail("invalid_job_plan"); }
    const plan = validateBackupJobPlan(parsed);
    if (plan.retentionEnabled) fail("retention_not_supported");
    const captureURL = boundedInput(env[inputNames[1]], 8192);
    const ledgerURL = boundedInput(env[inputNames[2]], 8192);
    if (/[\x00-\x20\x7f]/.test(captureURL + ledgerURL)) fail("target_mismatch");
    validateBackupJobTargets(plan, captureURL, ledgerURL);
    // Validate all inputs before creating files or starting any executable.
    const childEnv = backupExporterEnvironment(env, "");
    const root = await runnerRoot(env.RUNNER_TEMP);
    if (!recovery) {
      try {
        recovery = JSON.parse(await readPrivateBackupInput(env.BOB_BACKUP_RECOVERY_PLAN_FILE, 4096));
        if (!recovery || typeof recovery !== "object" || Array.isArray(recovery) ||
            Object.keys(recovery).length !== 4 || !["version", "enabled", "directory", "producer"].every(k => Object.hasOwn(recovery, k)) ||
            recovery.version !== 1 || recovery.enabled !== true) fail("recovery_plan_required");
      } catch { fail("recovery_plan_required"); }
    }
    preparedRecovery = await prepareRecovery({ enabled: recovery.enabled, directory: recovery.directory,
      producer: recovery.producer, temporaryRoot: root });
    recoveryBinding = { instance: plan.instance, recipientFingerprint: sha256(plan.recipient) };
    throwIfAborted(signal);
    directory = await mkdtemp(join(root, "bob-backup-inputs-"));
    await chmod(directory, 0o700);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700 ||
        await realpath(directory) !== directory) fail("private_input_required");
    const paths = ["plan.json", "capture.url", "ledger.url"].map(name => join(directory, name));
    const values = [JSON.stringify(plan), captureURL, ledgerURL];
    for (let i = 0; i < paths.length; i++) {
      throwIfAborted(signal);
      await writeFile(paths[i], values[i], { flag: "wx", mode: 0o600 });
      // Reuse the exporter reader's no-symlink, ownership and byte-bound checks.
      if (await readPrivateBackupInput(paths[i], i === 0 ? 16384 : 8192) !== values[i]) fail("private_input_required");
    }
    throwIfAborted(signal);
    const completed = await execute({ command: process.execPath, cwd: core,
      args: [join(core, "scripts/backup-database.mjs"), "--plan-file", paths[0],
        "--capture-url-file", paths[1], "--ledger-url-file", paths[2]],
      env: { ...childEnv, TMPDIR: directory }, recoveryBinding, signal,
      onRecord: record => {
        // The supervisor validates and clones this start record before callback.
        started = { ...record };
        return onRecord({ ...record });
      } });
    result = completed.result; exitCode = completed.exitCode;
  } catch (error) {
    result = { event: "backup.failed", ...(started ? { id: started.id } : {}),
      code: error instanceof BackupCoverageError && failureCodes.has(error.code) ? error.code : "adapter_failed" };
  } finally {
    if (directory) {
      try { await rm(directory, { recursive: true, force: true }); }
      catch { result = { event: "backup.failed", ...(result?.id ? { id: result.id } : {}), code: "input_cleanup_failed" }; exitCode = 1; }
    }
  }
  if (signal?.aborted && !["input_cleanup_failed", "exporter_shutdown_failed"].includes(result?.code)) {
    result = { event: "backup.failed", ...(result?.id ? { id: result.id } : {}), code: "interrupted" };
    exitCode = ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 })[signal.reason] || 1;
  }
  if (exitCode === 0) {
    try {
      if (result?.event !== "backup.verified" || !started || result.id !== started.id) fail("recovery_retention_failed");
      const anchors = validateBackupRecovery(result.recovery);
      if (anchors.expected.id !== started.id || anchors.expected.startedAt !== started.startedAt ||
          anchors.expected.instance !== recoveryBinding.instance ||
          anchors.expected.recipientFingerprint !== recoveryBinding.recipientFingerprint) fail("recovery_retention_failed");
      throwIfAborted(signal);
      const handoff = await retainRecovery({ prepared: preparedRecovery, recovery: anchors, signal });
      throwIfAborted(signal);
      // Only local retention is acknowledged. Independent custody is a separate
      // operator/hosted gate; neither stdout nor this local file proves it.
      result = { event: result.event, id: result.id, bytes: result.bytes,
        retentionChecked: result.retentionChecked, expiredObjectsRemoved: result.expiredObjectsRemoved, handoff };
    } catch {
      result = { event: "backup.failed", ...(started ? { id: started.id } : result?.id ? { id: result.id } : {}),
        code: signal?.aborted ? "interrupted" : "recovery_retention_failed" };
      exitCode = signal?.aborted ? ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 })[signal.reason] || 1 : 1;
    }
  }
  return { exitCode, result };
}

export const BACKUP_WORKFLOW_INPUT_NAMES = inputNames;

// Output acknowledgement is separate from local file retention. If the final
// write is uncertain, keep the retained UUID file and never rerun capture here.
export async function writeBackupWorkflowOutcome({ result, exitCode, signal,
  write = (stream, record) => new Promise((resolve, reject) => process[stream].write(
    JSON.stringify(record) + "\n", error => error ? reject(error) : resolve())) } = {}) {
  const interrupted = { event: "backup.failed", ...(result?.id ? { id: result.id } : {}), code: "interrupted" };
  const interruptionCode = () => ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129, TIMEOUT: 124 })[signal?.reason] || 1;
  const acknowledge = async (stream, record) => {
    const delivery = Promise.resolve(write(stream, record));
    if (!signal) return delivery;
    let abort;
    const interrupted = new Promise((_, reject) => {
      abort = () => reject(new BackupCoverageError("interrupted"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    try { return await Promise.race([delivery, interrupted]); }
    finally { signal.removeEventListener("abort", abort); }
  };
  if (exitCode === 0 && signal?.aborted) { result = interrupted; exitCode = interruptionCode(); }
  try { await acknowledge(exitCode === 0 ? "stdout" : "stderr", result); }
  catch {
    if (signal?.aborted) {
      if (exitCode === 0) {
        try { await acknowledge("stderr", interrupted); } catch { /* Cancellation must not wait for another stalled write. */ }
      }
      return exitCode || interruptionCode();
    }
    if (exitCode === 0) {
      try { await acknowledge("stderr", { event: "backup.failed", ...(result?.id ? { id: result.id } : {}), code: "adapter_output_failed" }); }
      catch { /* Nonzero exit is the remaining acknowledgement. */ }
    }
    return 1;
  }
  if (exitCode === 0 && signal?.aborted) {
    // Success bytes might already have reached the observer. Do not recapture
    // or delete the retained record; make the final process outcome nonzero.
    try { await acknowledge("stderr", interrupted); } catch { /* Exit status remains nonzero. */ }
    return interruptionCode();
  }
  return exitCode;
}
