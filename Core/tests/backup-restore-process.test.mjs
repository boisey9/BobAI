import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRestoreCommand } from "../scripts/lib/backup-restore-operation.mjs";

const roots = [], nativeKill = process.kill.bind(process);
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sentinel = "synthetic-restore-private-sentinel";
function probe(pid) {
  try { nativeKill(-pid, 0); return "present"; }
  catch (error) { return error.code; }
}
async function ownedPid(root) {
  try {
    const pid = Number(await readFile(join(root, "owned.pid"), "utf8"));
    return Number.isSafeInteger(pid) && pid > 1 ? pid : undefined;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function cleanupGroup(pid) {
  if (!pid) return;
  let delivered = false;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const status = probe(pid);
    if (status === "ESRCH") return;
    if (!["present", "EPERM"].includes(status)) throw Error("Owned restore fixture group inspection failed");
    if (status === "present" && !delivered) {
      delivered = true;
      try { nativeKill(-pid, "SIGKILL"); }
      catch (error) { if (error.code === "ESRCH") return; if (error.code !== "EPERM") throw error; }
    }
    await pause(20);
  }
  throw Error("Owned restore fixture group shutdown was not confirmed");
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    await cleanupGroup(await ownedPid(root));
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture(source) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-restore-process-"))); roots.push(root);
  const script = join(root, "fixture.mjs");
  await writeFile(script, `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(join(root, "owned.pid"))},String(process.pid),{mode:0o600});\n${source}`, { mode: 0o600 });
  return { root, script, run: (timeout = 5000, signal) => runRestoreCommand(process.execPath, [script],
    { PATH: "/usr/bin:/bin" }, "synthetic restore command", timeout, signal) };
}
function safeFailure(error, code = "restore_command_failed") {
  expect(error).toMatchObject({ name: "RestoreOperationError", message: code, code });
  expect(String(error)).not.toContain(sentinel);
  expect(JSON.stringify(error)).not.toContain(sentinel);
}

// Actual local child processes only: no age identity, database or network. Each
// fixture records its own PID before work; cleanup only targets that owned group
// and requires native ESRCH, even after injected signal-probe failures.
describe.skipIf(process.platform === "win32")("restore command process lifecycle", { timeout: 15_000 }, () => {
  it("returns only after the successful owned process closes and disappears", async () => {
    const f = await fixture(`console.log(${JSON.stringify(sentinel)});console.error(${JSON.stringify(sentinel)});`);
    await expect(f.run()).resolves.toBeUndefined();
    expect(probe(await ownedPid(f.root))).toBe("ESRCH");
  });

  it("reports a nonzero exit without forwarding private diagnostics", async () => {
    const f = await fixture(`console.error(${JSON.stringify(sentinel)});process.exitCode=7;`);
    safeFailure(await f.run().catch(error => error));
    expect(probe(await ownedPid(f.root))).toBe("ESRCH");
  });

  it("sanitizes failed command creation without inventing a live child", async () => {
    const f = await fixture("throw Error('must not execute');");
    safeFailure(await runRestoreCommand(join(f.root, sentinel), [], { PATH: "/usr/bin:/bin" }, sentinel, 2000).catch(error => error));
    expect(await ownedPid(f.root)).toBeUndefined();
  });

  it("kills a TERM-resistant timed-out process and confirms absence before rejecting", async () => {
    const f = await fixture("process.on('SIGTERM',()=>{});setInterval(()=>{},1000);");
    const started = Date.now();
    safeFailure(await f.run(1200).catch(error => error));
    const pid = await ownedPid(f.root); expect(pid).toBeGreaterThan(1);
    expect(probe(pid)).toBe("ESRCH");
    expect(Date.now() - started).toBeLessThan(8000);
  });

  it("refuses a pre-aborted command before creating a child", async () => {
    const f = await fixture("throw Error('must not execute');"), controller = new AbortController();
    controller.abort(sentinel);
    safeFailure(await f.run(5000, controller.signal).catch(error => error), "restore_interrupted");
    expect(await ownedPid(f.root)).toBeUndefined();
  });

  it("cancels a running TERM-resistant child without returning before shutdown", async () => {
    const f = await fixture("process.on('SIGTERM',()=>{});writeFileSync(new URL('./ready',import.meta.url),'ready');setInterval(()=>{},1000);"), controller = new AbortController();
    const outcome = f.run(8000, controller.signal).catch(error => error);
    let pid;
    try {
      const readyUntil = Date.now() + 5000;
      let ready = false;
      while (!ready && Date.now() < readyUntil) {
        try { ready = await readFile(join(f.root, "ready"), "utf8") === "ready"; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        if (!ready) await pause(10);
      }
      expect(ready).toBe(true); pid = await ownedPid(f.root);
      expect(pid).toBeGreaterThan(1);
      controller.abort(sentinel);
      safeFailure(await outcome, "restore_interrupted");
      expect(probe(pid)).toBe("ESRCH");
    } finally { controller.abort(sentinel); await outcome; }
  });

  it("fails a prematurely successful parent after cleaning its residual grandchild", async () => {
    const grandchild = "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000);";
    const f = await fixture(`import {spawn} from 'node:child_process';
      const child=spawn(process.execPath,['--eval',${JSON.stringify(grandchild)}],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','ignore','ignore','ipc']});
      child.once('message',()=>{child.disconnect();child.unref();process.exit(0);});`);
    safeFailure(await f.run().catch(error => error));
    expect(probe(await ownedPid(f.root))).toBe("ESRCH");
  });

  it("treats transient signal-zero EPERM as unknown until native ESRCH", async () => {
    const f = await fixture("process.exit(0);");
    let pid, probes = 0;
    vi.spyOn(process, "kill").mockImplementation((target, signal) => {
      if (target < -1) {
        pid ??= -target; expect(target).toBe(-pid);
        if (signal === 0 && ++probes <= 3) throw Object.assign(Error(sentinel), { code: "EPERM" });
      }
      return nativeKill(target, signal);
    });
    await expect(f.run()).resolves.toBeUndefined();
    expect(probes).toBeGreaterThanOrEqual(4);
    expect(pid).toBe(await ownedPid(f.root)); expect(probe(pid)).toBe("ESRCH");
  });

  it("fails closed after persistent probe denial, even when the child really exited", async () => {
    const f = await fixture("process.exit(0);");
    let pid;
    vi.spyOn(process, "kill").mockImplementation((target, signal) => {
      if (target < -1) {
        pid ??= -target; expect(target).toBe(-pid);
        if (signal === 0) throw Object.assign(Error(sentinel), { code: "EPERM" });
      }
      return nativeKill(target, signal);
    });
    const error = await f.run().catch(error => error);
    safeFailure(error, "restore_command_shutdown_unconfirmed");
    expect(error.state).toMatchObject({ commandUnsettled: true, cleanupUncertain: true });
    expect(pid).toBe(await ownedPid(f.root)); expect(probe(pid)).toBe("ESRCH");
  });

  it("never treats denied signal delivery as cleanup or tries another process group", async () => {
    const f = await fixture("process.on('SIGTERM',()=>{});setInterval(()=>{},1000);");
    let pid; const attempted = [];
    vi.spyOn(process, "kill").mockImplementation((target, signal) => {
      if (target < -1) {
        pid ??= -target; expect(target).toBe(-pid);
        if (signal !== 0) { attempted.push(signal); throw Object.assign(Error(sentinel), { code: "EPERM" }); }
      }
      return nativeKill(target, signal);
    });
    const error = await f.run(1200).catch(error => error);
    safeFailure(error, "restore_command_shutdown_unconfirmed");
    expect(error.state).toMatchObject({ commandUnsettled: true, cleanupUncertain: true });
    expect(attempted).toEqual(["SIGTERM"]); expect(pid).toBe(await ownedPid(f.root));
    expect(probe(pid)).toBe("present");
  });
});
