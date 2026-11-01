import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBackupExporter } from "../scripts/lib/backup-exporter-process.mjs";

const id = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const start = { event: "backup.started", id, startedAt: "2026-11-01T15:00:00.000Z" };
const recoveryBinding = { instance: "testing-fixture", recipientFingerprint: "a".repeat(64) };
const recovery = { version: 1, expected: { id, ...recoveryBinding, startedAt: start.startedAt,
  receiptSha256: "b".repeat(64), receiptBytes: 700, manifestBytes: 500 } };
const verified = { event: "backup.verified", id, bytes: 123, retentionChecked: false, expiredObjectsRemoved: 0, recovery };
const roots = [];
const emit = value => `console.log(${JSON.stringify(JSON.stringify(value))});`;
async function fixture(source) {
  const cwd = await mkdtemp(join(tmpdir(), "bob-exporter-test-")); roots.push(cwd);
  const script = join(cwd, "fixture.mjs");
  await writeFile(script, source, { mode: 0o600 });
  // Allow startup contention from the other local CLI suites and use the actual
  // production shutdown grace, rather than a fragile 50ms process-reaping window.
  // Individual timeout cases still supply their own execution deadline.
  return { cwd, args: [script], recoveryBinding, env: { PATH: process.env.PATH || "/usr/bin:/bin" }, timeoutMs: 10_000, graceMs: 1000 };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

const probeGroup = (nativeKill, pid) => {
  try { nativeKill(-pid, 0); return "present"; }
  catch (error) { return error.code; }
};
async function cleanupOwnedGroup(nativeKill, pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return;
  const deadline = Date.now() + 5000;
  let attempted = false;
  while (Date.now() < deadline) {
    const state = probeGroup(nativeKill, pid);
    if (state === "ESRCH") return;
    if (!["present", "EPERM"].includes(state)) throw new Error("Owned synthetic process group could not be inspected");
    if (state === "present" && !attempted) {
      attempted = true;
      try { nativeKill(-pid, "SIGKILL"); }
      catch (error) {
        if (error.code === "ESRCH") return;
        // A fixture already exiting after TERM can become zombie-only between
        // inspection and cleanup. Still require a subsequent ESRCH; never use
        // denied delivery as cleanup proof or retry with elevated privileges.
        if (error.code !== "EPERM") throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Owned synthetic process group did not disappear");
}

describe.skipIf(process.platform === "win32")("owned backup exporter process", { timeout: 15_000 }, () => {
  it("accepts one bounded start and verified result only after process close", async () => {
    const input = await fixture(emit(start) + emit(verified));
    const records = [];
    expect(await runBackupExporter({ ...input, onRecord: event => { records.push(event); event.id = otherId; } }))
      .toEqual({ exitCode: 0, result: verified });
    expect(records).toHaveLength(1);
  });

  it("never defaults to the calling process environment", async () => {
    const input = await fixture(emit(start) + emit(verified));
    expect(await runBackupExporter({ ...input, env: undefined })).toEqual({ exitCode: 1,
      result: { event: "backup.failed", code: "exporter_invalid_invocation" } });
  });

  it.each(["disabled", "private_input_required", "target_mismatch"])("preserves safe preflight failure %s without a UUID", async code => {
    const failure = { event: "backup.failed", code };
    const input = await fixture(`console.error(${JSON.stringify(JSON.stringify(failure))});process.exitCode=1;`);
    expect(await runBackupExporter(input)).toEqual({ exitCode: 1, result: failure });
  });

  it("preserves the run UUID on known failure and hides unknown error details", async () => {
    const failure = { event: "backup.failed", id, code: "private-secret-sentinel" };
    const input = await fixture(emit(start) + `console.error(${JSON.stringify(JSON.stringify(failure))});process.exitCode=1;`);
    const result = await runBackupExporter(input);
    expect(result).toEqual({ exitCode: 1, result: { event: "backup.failed", id, code: "exporter_failed" } });
    expect(JSON.stringify(result)).not.toContain("private-secret-sentinel");
  });

  it.each(["storage_operation_timeout", "storage_operation_aborted", "storage_request_failed", "storage_closed",
    "storage_cleanup_failed", "storage_configuration_invalid", "storage_request_invalid"])(
    "preserves owned storage failure %s and its run UUID through child supervision", async code => {
      const failure = { event: "backup.failed", id, code }, records = [];
      const input = await fixture(emit(start) + `console.error(${JSON.stringify(JSON.stringify(failure))});process.exitCode=1;`);
      expect(await runBackupExporter({ ...input, onRecord: record => records.push(record) }))
        .toEqual({ exitCode: 1, result: failure });
      expect(records).toEqual([start]);
    });

  it.each([
    ["missing recovery", emit(start) + emit(Object.fromEntries(Object.entries(verified).filter(([k]) => k !== "recovery")))],
    ...Object.entries({ id: otherId, startedAt: "2026-11-01T14:00:00.000Z", instance: "other",
      recipientFingerprint: "b".repeat(64), receiptSha256: "private-secret-sentinel", receiptBytes: 0,
      manifestBytes: 22 * 1024 * 1024, extra: "private-secret-sentinel" }).map(([key, value]) =>
      ["invalid recovery " + key, emit(start) + emit({ ...verified, recovery: { version: 1, expected: { ...recovery.expected, [key]: value } } })]),
    ["mismatched terminal UUID", emit(start) + emit({ ...verified, id: otherId })],
    ["duplicate start", emit(start) + emit(start) + emit(verified)],
    ["duplicate outcome", emit(start) + emit(verified) + emit(verified)],
    ["outcome before start", emit(verified) + emit(start)],
    ["failure before start on same stream", emit({ event: "backup.failed", id, code: "job_failed" }) + emit(start)],
    ["unexpected record fields", emit(start) + emit({ ...verified, secret: "private-secret-sentinel" })],
    ["retention enabled", emit(start) + emit({ ...verified, retentionChecked: true })],
    ["zero archive", emit(start) + emit({ ...verified, bytes: 0 })],
    ["oversized archive", emit(start) + emit({ ...verified, bytes: 100 * 1024 * 1024 + 1 })],
    ["invalid start timestamp", emit({ ...start, startedAt: "not-a-date" })],
    ["failure UUID mismatch", emit(start) + emit({ event: "backup.failed", id: otherId, code: "job_failed" })],
    ["orphan failure UUID", emit({ event: "backup.failed", id, code: "job_failed" })],
  ])("refuses %s", async (_name, source) => {
    const result = await runBackupExporter(await fixture(source));
    expect(result.exitCode).not.toBe(0);
    expect(result.result.code).toBe("exporter_output_invalid");
    expect(JSON.stringify(result)).not.toContain("private-secret-sentinel");
  });

  it("handles independent stdout/stderr delivery without misclassifying an honest failure", async () => {
    const failure = { event: "backup.failed", id, code: "connection_failed" };
    const input = await fixture(`console.error(${JSON.stringify(JSON.stringify(failure))});` + emit(start) + "process.exitCode=1;");
    expect(await runBackupExporter(input)).toEqual({ exitCode: 1, result: failure });
  });

  it("refuses raw noisy diagnostics without forwarding their content", async () => {
    const input = await fixture(emit(start) + "console.error('postgres://private-secret-sentinel');setInterval(()=>{},1000);");
    const output = vi.fn();
    const result = await runBackupExporter({ ...input, onRecord: output });
    expect(result).toEqual({ exitCode: 1, result: { event: "backup.failed", id, code: "exporter_output_invalid" } });
    expect(output).toHaveBeenCalledExactlyOnceWith(start);
    expect(JSON.stringify(result)).not.toContain("private-secret-sentinel");
  });

  it.each([
    ["line", "process.stdout.write('x'.repeat(4097));"],
    ["total", "process.stdout.write('\\n'.repeat(16385));"],
  ])("bounds %s output before buffering unbounded data", async (_name, source) => {
    const result = await runBackupExporter(await fixture(source + "setInterval(()=>{},1000);"));
    expect(result.result.code).toBe("exporter_output_limit");
  });

  it("rejects success output if the child exits unsuccessfully", async () => {
    const input = await fixture(emit(start) + emit(verified) + "process.exitCode=7;");
    expect(await runBackupExporter(input)).toEqual({ exitCode: 1,
      result: { event: "backup.failed", id, code: "exporter_failed" } });
  });

  it("sanitizes spawn errors and observer exceptions", async () => {
    const input = await fixture(emit(start) + emit(verified));
    expect((await runBackupExporter({ ...input, command: "/nonexistent/private-secret-sentinel" })).result.code).toBe("exporter_failed");
    const result = await runBackupExporter({ ...input, onRecord: () => { throw new Error("private-secret-sentinel"); } });
    expect(result.result).toEqual({ event: "backup.failed", id, code: "exporter_failed" });
  });

  it("refuses a pre-aborted request without spawning", async () => {
    const controller = new AbortController(); controller.abort("SIGINT");
    const input = await fixture("throw new Error('should not run');");
    expect(await runBackupExporter({ ...input, signal: controller.signal })).toEqual({ exitCode: 130,
      result: { event: "backup.failed", code: "exporter_interrupted" } });
  });

  it.each([["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]])("stops a running owned group on %s", async (signalName, exitCode) => {
    const controller = new AbortController();
    const input = await fixture("process.on('SIGTERM',()=>{});" + emit(start) + "setInterval(()=>{},1000);");
    const result = await runBackupExporter({ ...input, signal: controller.signal,
      onRecord: () => controller.abort(signalName) });
    expect(result).toEqual({ exitCode, result: { event: "backup.failed", id, code: "exporter_interrupted" } });
  });

  it("retries transient signal-zero EPERM and requires confirmed group absence", async () => {
    const nativeKill = process.kill.bind(process), controller = new AbortController();
    const input = await fixture(emit(start) + "setInterval(()=>{},1000);");
    let ownedPid, probes = 0;
    const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid < -1) {
        ownedPid ??= -pid;
        if (pid !== -ownedPid) throw new Error("Unexpected synthetic process group");
        if (signal === 0 && ++probes <= 3) throw Object.assign(new Error("Denied inspection"), { code: "EPERM" });
      }
      return nativeKill(pid, signal);
    });
    try {
      expect(await runBackupExporter({ ...input, signal: controller.signal,
        onRecord: () => controller.abort("SIGTERM") })).toEqual({ exitCode: 143,
        result: { event: "backup.failed", id, code: "exporter_interrupted" } });
      expect(probes).toBeGreaterThanOrEqual(4);
      expect(probeGroup(nativeKill, ownedPid)).toBe("ESRCH");
    } finally { spy.mockRestore(); await cleanupOwnedGroup(nativeKill, ownedPid); }
  });

  it("fails closed when signal-zero EPERM persists throughout bounded shutdown", async () => {
    const nativeKill = process.kill.bind(process), controller = new AbortController();
    const input = await fixture(emit(start) + "setInterval(()=>{},1000);");
    let ownedPid, probes = 0;
    const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid < -1) {
        ownedPid ??= -pid;
        if (pid !== -ownedPid) throw new Error("Unexpected synthetic process group");
        if (signal === 0) { probes++; throw Object.assign(new Error("Denied inspection"), { code: "EPERM" }); }
      }
      return nativeKill(pid, signal);
    });
    try {
      expect(await runBackupExporter({ ...input, signal: controller.signal,
        onRecord: () => controller.abort("SIGTERM") })).toEqual({ exitCode: 1,
        result: { event: "backup.failed", id, code: "exporter_shutdown_failed" } });
      expect(probes).toBeGreaterThan(1);
      expect(probeGroup(nativeKill, ownedPid)).toBe("ESRCH");
    } finally { spy.mockRestore(); await cleanupOwnedGroup(nativeKill, ownedPid); }
  });

  it("keeps denied signal delivery fatal without substituting privileged termination", async () => {
    const nativeKill = process.kill.bind(process), controller = new AbortController();
    const input = await fixture(emit(start) + "setInterval(()=>{},1000);");
    let ownedPid;
    const signals = [];
    const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid < -1) {
        ownedPid ??= -pid;
        if (pid !== -ownedPid) throw new Error("Unexpected synthetic process group");
        signals.push(signal);
        if (signal === "SIGTERM") throw Object.assign(new Error("Denied delivery"), { code: "EPERM" });
      }
      return nativeKill(pid, signal);
    });
    try {
      expect(await runBackupExporter({ ...input, signal: controller.signal,
        onRecord: () => controller.abort("SIGTERM") })).toEqual({ exitCode: 1,
        result: { event: "backup.failed", id, code: "exporter_shutdown_failed" } });
      expect(signals).toEqual(["SIGTERM"]);
      expect(probeGroup(nativeKill, ownedPid)).toBe("present");
    } finally { spy.mockRestore(); await cleanupOwnedGroup(nativeKill, ownedPid); }
  });

  it("fails immediately on other process-group inspection errors", async () => {
    const nativeKill = process.kill.bind(process), controller = new AbortController();
    const input = await fixture(emit(start) + "setInterval(()=>{},1000);");
    let ownedPid, probes = 0;
    const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid < -1) {
        ownedPid ??= -pid;
        if (pid !== -ownedPid) throw new Error("Unexpected synthetic process group");
        if (signal === 0) { probes++; throw Object.assign(new Error("Invalid inspection"), { code: "EINVAL" }); }
      }
      return nativeKill(pid, signal);
    });
    try {
      expect(await runBackupExporter({ ...input, signal: controller.signal,
        onRecord: () => controller.abort("SIGTERM") })).toEqual({ exitCode: 1,
        result: { event: "backup.failed", id, code: "exporter_shutdown_failed" } });
      expect(probes).toBe(1);
    } finally { spy.mockRestore(); await cleanupOwnedGroup(nativeKill, ownedPid); }
  });

  it("escalates a resistant child after timeout and retains its run UUID", async () => {
    const input = await fixture("process.on('SIGTERM',()=>{});" + emit(start) + "setInterval(()=>{},1000);");
    expect(await runBackupExporter({ ...input, timeoutMs: 3000 })).toEqual({ exitCode: 124,
      result: { event: "backup.failed", id, code: "exporter_timeout" } });
  }, 10_000);

  it.each(["abort", "normal-exit"])("stops residual grandchildren on %s", async mode => {
    const controller = new AbortController();
    const grandchild = "process.on('SIGTERM',()=>{});console.log('READY');setInterval(()=>{},1000);";
    const input = await fixture(`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';
      const grandchild=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{env:{},stdio:['ignore','pipe','ignore']});
      grandchild.stdout.once('data',()=>{writeFileSync('grandchild.pid',String(grandchild.pid));
        ${emit(start)}
        ${mode === "normal-exit" ? emit(verified) + "process.exit(0);" : "setInterval(()=>{},1000);"}
      });`);
    const result = await runBackupExporter({ ...input, signal: controller.signal,
      onRecord: () => { if (mode === "abort") controller.abort("SIGTERM"); } });
    expect(result.result.code).not.toBe("exporter_shutdown_failed");
    expect(result.exitCode).toBe(mode === "abort" ? 143 : 0);
    const grandchildPid = Number(await readFile(join(input.cwd, "grandchild.pid"), "utf8"));
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  });
});
