import { spawn } from "node:child_process";
import { validateBackupRecovery } from "./backup-recovery-handoff.mjs";

const MAX_OUTPUT_BYTES = 16 * 1024;
const MAX_LINE_BYTES = 4096;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SAFE_FAILURES = new Set([
  "disabled", "invalid_plan", "invalid_job_plan", "private_input_required", "target_mismatch",
  "separate_credentials_required", "storage_credentials_required", "connection_failed",
  "source_mismatch", "source_unavailable", "rollback_unconfirmed", "catalog_unavailable",
  "invalid_catalog", "empty_catalog", "restricted_role_required", "excess_privilege",
  "large_objects_unsupported", "read_privilege_required", "relation_kind_unsupported",
  "capture_relation_unsupported", "rls_review_required", "schema_changed", "snapshot_required",
  "ledger_privilege_mismatch", "invalid_run", "capture_failed", "capture_receipt_mismatch",
  "capture_artifact_changed", "ledger_receipt_mismatch", "storage_readback_failed",
  "storage_operation_timeout", "storage_operation_aborted", "storage_request_failed",
  "storage_closed", "storage_cleanup_failed", "storage_configuration_invalid", "storage_request_invalid",
  "ledger_close_failed", "retention_failed", "retention_inventory_incomplete",
  "retention_bound_exceeded", "job_failed", "job_cleanup_failed", "job_output_failed",
]);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const isId = value => typeof value === "string" && UUID.test(value);
const isTime = value => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function interruption(signal) {
  const code = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal?.reason] ?? 143;
  return { exitCode: code, code: "exporter_interrupted" };
}

// No output from the child is forwarded. Only this small, validated protocol is
// exposed; the caller publishes the terminal outcome after its own file cleanup.
// onRecord is synchronous and receives only the single safe start record.
export async function runBackupExporter({ command = process.execPath, args, cwd, env,
  recoveryBinding, signal, timeoutMs = 12 * 60_000, graceMs = 1000, onRecord = () => {} } = {}) {
  let started, terminal, terminalStream, child, closed = false, code = null;
  let totalBytes = 0, failure, stopPromise, timeout, resolveDone;
  const buffers = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  const failed = (reason, exitCode = 1) => ({ exitCode,
    result: { event: "backup.failed", ...(started ? { id: started.id } : {}), code: reason } });
  if (process.platform === "win32") return failed("exporter_disabled_platform");
  if (typeof command !== "string" || !command || !Array.isArray(args) ||
      args.some(arg => typeof arg !== "string") || typeof cwd !== "string" || !cwd ||
      !env || typeof env !== "object" || Array.isArray(env) ||
      Object.values(env).some(value => typeof value !== "string") ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12 * 60_000 ||
      !Number.isInteger(graceMs) || graceMs < 1 || graceMs > 10_000 ||
      typeof onRecord !== "function" || (signal !== undefined && !(signal instanceof AbortSignal)))
    return failed("exporter_invalid_invocation");
  if (!exact(recoveryBinding, ["instance", "recipientFingerprint"]) ||
      typeof recoveryBinding.instance !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(recoveryBinding.instance) ||
      typeof recoveryBinding.recipientFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(recoveryBinding.recipientFingerprint))
    return failed("exporter_invalid_invocation");
  const expectedBinding = { ...recoveryBinding };
  if (signal?.aborted) {
    const interrupted = interruption(signal);
    return failed(interrupted.code, interrupted.exitCode);
  }

  // The detached child's PID identifies a process group created solely for this
  // invocation. Never discover or signal a process by executable name.
  const groupExists = () => {
    if (!child?.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) {
      if (error.code === "ESRCH") return false;
      // Darwin can return EPERM while an existing group contains only exiting
      // or zombie members. Treat denied inspection as unknown, never as gone:
      // retry within the existing deadline and require ESRCH before success.
      // A persistent denial still fails shutdown; signal delivery stays strict.
      if (error.code === "EPERM") return true;
      throw error;
    }
  };
  const killGroup = termination => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, termination); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const waitGone = async milliseconds => {
    const deadline = Date.now() + milliseconds;
    do {
      if (!groupExists()) return true;
      await pause(Math.min(20, Math.max(1, deadline - Date.now())));
    } while (Date.now() < deadline);
    return !groupExists();
  };
  const stop = () => stopPromise ??= (async () => {
    try {
      killGroup("SIGTERM");
      if (!await waitGone(graceMs)) {
        killGroup("SIGKILL");
        if (!await waitGone(Math.max(1000, graceMs))) throw new Error("unsettled");
      }
      const deadline = Date.now() + Math.max(1000, graceMs);
      while (!closed && child?.pid && Date.now() < deadline) await pause(10);
      if (child?.pid && !closed) throw new Error("unsettled");
    } catch { failure = { code: "exporter_shutdown_failed", exitCode: 1 }; }
  })();
  const refuse = (reason, exitCode = 1) => {
    failure ??= { code: reason, exitCode };
    void stop().then(() => resolveDone?.());
  };
  const parseLine = (line, stream) => {
    if (failure) return;
    let value;
    try { value = JSON.parse(line.toString("utf8")); }
    catch { return refuse("exporter_output_invalid"); }
    if (exact(value, ["event", "id", "startedAt"]) && value.event === "backup.started" &&
        isId(value.id) && isTime(value.startedAt)) {
      if (started || (terminal && (terminalStream === stream || !terminal.id || terminal.id !== value.id)))
        return refuse("exporter_output_invalid");
      started = { event: value.event, id: value.id, startedAt: value.startedAt };
      try {
        const callback = onRecord({ ...started });
        if (callback && typeof callback.then === "function") {
          Promise.resolve(callback).catch(() => {});
          refuse("exporter_failed");
        }
      }
      catch { refuse("exporter_failed"); }
      return;
    }
    if (terminal) return refuse("exporter_output_invalid");
    if (exact(value, ["event", "id", "bytes", "retentionChecked", "expiredObjectsRemoved", "recovery"]) &&
        value.event === "backup.verified" && started && value.id === started.id &&
        Number.isInteger(value.bytes) && value.bytes > 0 && value.bytes <= 100 * 1024 * 1024 &&
        value.retentionChecked === false && value.expiredObjectsRemoved === 0) {
      let recovery;
      try { recovery = validateBackupRecovery(value.recovery); }
      catch { return refuse("exporter_output_invalid"); }
      if (recovery.expected.id !== started.id || recovery.expected.startedAt !== started.startedAt ||
          recovery.expected.instance !== expectedBinding.instance ||
          recovery.expected.recipientFingerprint !== expectedBinding.recipientFingerprint)
        return refuse("exporter_output_invalid");
      terminal = { event: value.event, id: value.id, bytes: value.bytes,
        retentionChecked: false, expiredObjectsRemoved: 0, recovery };
      terminalStream = stream;
      return;
    }
    if ((exact(value, ["event", "code"]) || exact(value, ["event", "id", "code"])) &&
        value.event === "backup.failed" && typeof value.code === "string" &&
        (!Object.hasOwn(value, "id") || isId(value.id)) &&
        (!started || value.id === started.id)) {
      terminal = { event: value.event, ...(value.id ? { id: value.id } : {}),
        code: SAFE_FAILURES.has(value.code) ? value.code : "exporter_failed" };
      terminalStream = stream;
      return;
    }
    refuse("exporter_output_invalid");
  };
  const consume = (bytes, stream) => {
    if (failure) return;
    totalBytes += bytes.length;
    if (totalBytes > MAX_OUTPUT_BYTES) return refuse("exporter_output_limit");
    buffers[stream] = Buffer.concat([buffers[stream], bytes]);
    let newline;
    while ((newline = buffers[stream].indexOf(10)) !== -1 && !failure) {
      if (newline > MAX_LINE_BYTES) return refuse("exporter_output_limit");
      const line = buffers[stream].subarray(0, newline);
      buffers[stream] = buffers[stream].subarray(newline + 1);
      if (line.length) parseLine(line, stream);
    }
    if (buffers[stream].length > MAX_LINE_BYTES) refuse("exporter_output_limit");
  };
  const onAbort = () => {
    const interrupted = interruption(signal);
    refuse(interrupted.code, interrupted.exitCode);
  };
  try {
    child = spawn(command, args, { cwd, env: { ...env }, detached: true,
      stdio: ["ignore", "pipe", "pipe"] });
    const done = new Promise(resolve => {
      resolveDone = resolve;
      child.once("error", () => { refuse("exporter_failed"); resolve(); });
      child.once("exit", exitCode => { code = exitCode; void stop().then(resolve); });
      child.once("close", () => { closed = true; resolve(); });
    });
    child.stdout.on("data", bytes => consume(bytes, "stdout"));
    child.stderr.on("data", bytes => consume(bytes, "stderr"));
    for (const stream of ["stdout", "stderr"]) {
      child[stream].once("error", () => refuse("exporter_failed"));
      child[stream].once("end", () => {
        if (buffers[stream].length && !failure) parseLine(buffers[stream], stream);
        buffers[stream] = Buffer.alloc(0);
      });
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    timeout = setTimeout(() => refuse("exporter_timeout", 124), timeoutMs);
    await done;
    await stop();
    if (failure) return failed(failure.code, failure.exitCode);
    if (terminal?.event === "backup.failed") {
      // stdout/stderr delivery can race. A failure carrying a run UUID must
      // ultimately pair with the start record, whichever pipe arrived first.
      if (terminal.id && (!started || terminal.id !== started.id)) return failed("exporter_output_invalid");
      return { exitCode: code || 1, result: terminal };
    }
    if (code !== 0 || !started || terminal?.event !== "backup.verified") return failed("exporter_failed");
    return { exitCode: 0, result: terminal };
  } catch { return failed("exporter_failed"); }
  finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    if (child) await stop();
    child?.stdout?.destroy(); child?.stderr?.destroy();
  }
}
