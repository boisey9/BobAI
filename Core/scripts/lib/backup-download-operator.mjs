import { BackupCoverageError } from "./backup-coverage.mjs";
import { downloadBackupBundle } from "./backup-download.mjs";
import { prepareBackupDownload, readBackupDownloadCredentials, verifyBackupDownloadDestination } from "./backup-download-input.mjs";

const safeCodes = new Set(["operator_disabled", "operator_invalid_input", "operator_invalid_plan", "operator_input_unsafe",
  "operator_input_changed", "operator_input_too_large", "operator_input_failed", "operator_interrupted", "operator_handoff_mismatch",
  "operator_credentials_invalid", "operator_destination_required", "operator_destination_changed", "operator_destination_not_empty",
  "download_disabled", "download_invalid_input", "download_destination_required", "download_destination_not_empty",
  "download_receipt_mismatch", "download_artifact_mismatch", "download_transport_failed", "download_file_failed",
  "download_cleanup_failed", "download_interrupted", "download_finalize_failed", "operator_output_failed"]);
const fail = code => { throw new BackupCoverageError(code); };
const active = signal => { if (signal.aborted) fail("operator_interrupted"); };
const defaultCreateStorage = async options => (await import("./backup-storage.mjs")).createBackupDownloadStorage(options);

async function acknowledgeStart(onRecord, record, signal) {
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(new BackupCoverageError("operator_interrupted"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  const delivery = Promise.resolve().then(() => { active(signal); return onRecord(record); });
  // Promise.race observes a later resolution/rejection of the losing delivery.
  try { await Promise.race([delivery, interrupted]); }
  finally { signal.removeEventListener("abort", abort); }
}

// All injections are local test seams, never selected by CLI flags or environment.
// The operator does no discovery, DB access, key decryption, upload or restoration.
export async function runBackupDownloadOperator({ mode, planFile, handoffFile, credentialsFile, signal,
  timeoutMs = 4 * 60_000, onRecord = async () => {}, prepare = prepareBackupDownload,
  readCredentials = readBackupDownloadCredentials, verifyDestination = verifyBackupDownloadDestination,
  createStorage = defaultCreateStorage, download = downloadBackupBundle } = {}) {
  let prepared, storage, closed = false, downloaded = false, result, exitCode = 1, timeout;
  if (!["--check", "--download"].includes(mode) || typeof planFile !== "string" || !planFile ||
      typeof handoffFile !== "string" || !handoffFile ||
      (mode === "--check" ? credentialsFile !== undefined : typeof credentialsFile !== "string" || !credentialsFile) ||
      (signal !== undefined && !(signal instanceof AbortSignal)) || typeof onRecord !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 4 * 60_000)
    return { exitCode: 1, result: { event: "backup.failed", code: "operator_invalid_input" } };
  const controller = new AbortController();
  const abort = () => controller.abort(["SIGINT", "SIGTERM", "SIGHUP", "TIMEOUT"].includes(signal?.reason) ? signal.reason : "CANCELLED");
  const close = async () => {
    if (!storage || closed) return;
    closed = true;
    await storage.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  timeout = setTimeout(() => controller.abort("TIMEOUT"), timeoutMs);
  try {
    active(controller.signal);
    prepared = structuredClone(await prepare({ planFile, handoffFile, signal: controller.signal }));
    active(controller.signal);
    const destination = { directory: prepared.plan.destination.directory, identity: prepared.destinationIdentity, signal: controller.signal };
    await verifyDestination(destination);
    active(controller.signal);
    if (mode === "--check") {
      result = { event: "backup.download_checked", id: prepared.record.recovery.expected.id,
        handoffSha256: prepared.plan.handoff.sha256, networkAccessed: false };
    } else {
      try { await acknowledgeStart(onRecord, { event: "backup.download_started", id: prepared.record.recovery.expected.id,
        handoffSha256: prepared.plan.handoff.sha256 }, controller.signal); }
      catch { fail("operator_output_failed"); }
      active(controller.signal);
      await verifyDestination(destination);
      active(controller.signal);
      const credentials = await readCredentials(credentialsFile, controller.signal);
      active(controller.signal);
      await verifyDestination(destination);
      active(controller.signal);
      storage = await createStorage({ storage: prepared.plan.storage, expected: prepared.record.recovery.expected,
        credentials, signal: controller.signal });
      active(controller.signal);
      const bundle = await download({ enabled: true, storage, expected: prepared.record.recovery.expected,
        directory: prepared.plan.destination.directory, directoryIdentity: prepared.destinationIdentity,
        signal: controller.signal, finalize: close });
      downloaded = true;
      active(controller.signal);
      result = { event: "backup.download_verified", id: bundle.receipt.id, bytes: bundle.receipt.bytes,
        handoffSha256: prepared.plan.handoff.sha256, receiptSha256: prepared.record.recovery.expected.receiptSha256 };
    }
    exitCode = 0;
  } catch (error) {
    const cleanupFailure = error instanceof BackupCoverageError && ["download_cleanup_failed", "download_finalize_failed"].includes(error.code);
    const cancelled = controller.signal.aborted && !cleanupFailure;
    const code = cancelled ? (controller.signal.reason === "TIMEOUT" ? "operator_timeout" : "operator_interrupted") :
      error instanceof BackupCoverageError && safeCodes.has(error.code) ? error.code : "operator_failed";
    result = { event: "backup.failed", ...(prepared ? { id: prepared.record.recovery.expected.id } : {}),
      code, ...(downloaded ? { filesRetained: true } : {}) };
    exitCode = cancelled ? ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129, TIMEOUT: 124 })[controller.signal.reason] || 1 : 1;
  } finally {
    try { await close(); }
    catch {
      result = { event: "backup.failed", ...(prepared ? { id: prepared.record.recovery.expected.id } : {}),
        code: result?.code === "download_cleanup_failed" ? "download_cleanup_failed" : "operator_storage_cleanup_failed",
        ...(result?.code === "download_cleanup_failed" ? { storageCleanupFailed: true } : {}),
        ...(downloaded ? { filesRetained: true } : {}) };
      exitCode = 1;
    }
    clearTimeout(timeout); signal?.removeEventListener("abort", abort);
  }
  const terminalSignal = controller.signal.aborted ? controller.signal : signal;
  if (exitCode === 0 && terminalSignal?.aborted) {
    result = { event: "backup.failed", ...(prepared ? { id: prepared.record.recovery.expected.id } : {}),
      code: terminalSignal.reason === "TIMEOUT" ? "operator_timeout" : "operator_interrupted",
      ...(downloaded ? { filesRetained: true } : {}) };
    exitCode = ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129, TIMEOUT: 124 })[terminalSignal.reason] || 1;
  }
  return { exitCode, result };
}
