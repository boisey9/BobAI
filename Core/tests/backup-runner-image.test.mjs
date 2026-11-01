import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { lstat, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { BackupRunnerImageError, validateBackupRunnerQualification, parseBackupRunnerImageArguments,
  backupRunnerQualificationProgram, qualifyBackupRunnerImage, executeBackupRunnerDocker } from "../scripts/lib/backup-runner-image.mjs";

const image = `sha256:${"a".repeat(64)}`, id = "b".repeat(64), socket = "/private/tmp/synthetic-docker.sock";
const manifest = { build: { unrelated: "reviewed separately" }, qualification: { version: 1, platform: "linux/amd64", runtimeUser: "0:0",
  versions: { node: "v24.22.2", npm: "11.16.0", pgDump: "pg_dump (PostgreSQL) 18.6", age: "v1.3.2" } } };
const checks = ["versions", "ca_bundle", "private_temporary_files", "synthetic_age_roundtrip", "corrupt_ciphertext_refused"];
const copy = () => structuredClone(manifest);

function fixture(options = {}) {
  const calls = [];
  let present = false, started = false, name, label, directory;
  const inspect = () => ({ Id: id, Name: `/${name}`, Image: image, Config: { Labels: { "bob.backup.runner-qualification": label } },
    HostConfig: { NetworkMode: "none", ReadonlyRootfs: true, Privileged: false, PortBindings: {}, Binds: null, Devices: [],
      PidMode: "", IpcMode: "private", UTSMode: "", CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges"],
      Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=64m,mode=1777" } }, Mounts: [],
    State: { Running: false, Status: started ? "exited" : "created", ExitCode: 0, OOMKilled: false, Dead: false, Error: "" } });
  const execute = vi.fn(async (args, settings) => {
    expect(args.slice(0, 3)).toEqual(["--host", `unix://${socket}`, "--config"]);
    directory = args[3];
    expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    expect((await lstat(join(directory, "config.json"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(directory, "config.json"), "utf8")).toBe("{}\n");
    expect(settings.env).toEqual({ PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C", HOME: directory });
    const command = args.slice(4); calls.push({ args: command, settings });
    if (options.onCall) await options.onCall(command, settings);
    if (command[0] === "image") {
      const value = { Id: image, Os: "linux", Architecture: "amd64", Config: {
        User: "0:0", Volumes: null, ExposedPorts: null, Entrypoint: [], Cmd: ["node", "--version"], OnBuild: null } };
      options.image?.(value);
      return { stdout: JSON.stringify([value]), stderr: "" };
    }
    if (command[0] === "create") {
      name = command[command.indexOf("--name") + 1]; label = command[command.indexOf("--label") + 1].split("=")[1]; present = true;
      if (options.createError) throw Error("synthetic secret create error");
      return { stdout: options.createOutput ?? `${id}\n`, stderr: "" };
    }
    if (command[0] === "inspect") {
      const value = inspect(); options.container?.(value, { started, calls });
      return { stdout: JSON.stringify([value]), stderr: "" };
    }
    if (command[0] === "start") {
      started = true;
      if (options.startError) throw Error("synthetic secret start error");
      return { stdout: options.output ?? JSON.stringify({ event: "backup.runner_image_checks_passed",
        versions: manifest.qualification.versions, uid: 0, gid: 0, checks }), stderr: options.stderr ?? "" };
    }
    if (command[0] === "container") return { stdout: present ? id : "", stderr: "" };
    if (command[0] === "rm") {
      if (options.removeError) throw Error("synthetic secret removal error");
      present = false; return { stdout: id, stderr: "" };
    }
    throw Error("unexpected mocked Docker command");
  });
  const inspectSocket = vi.fn(async () => {});
  const run = overrides => qualifyBackupRunnerImage({ image, socket, manifest, execute, inspectSocket, ...overrides });
  return { calls, execute, inspectSocket, run, directory: () => directory, present: () => present };
}

describe("local backup runner image qualification", () => {
  it("requires the fixed exact qualification schema while preserving separate provenance metadata", () => {
    const result = validateBackupRunnerQualification(manifest);
    expect(result).toEqual(manifest.qualification);
    result.versions.node = "changed";
    expect(manifest.qualification.versions.node).toBe("v24.22.2");
  });
  it.each([
    value => { value.qualification = null; },
    value => { value.qualification.version = 2; },
    value => { value.qualification.platform = "linux/arm64"; },
    value => { value.qualification.runtimeUser = "root"; },
    value => { value.qualification.extra = true; },
    value => { value.qualification.versions.extra = "x"; },
    value => { value.qualification.versions.node = "v22.1.0"; },
    value => { value.qualification.versions.node = ["v24.22.2"]; },
    value => { value.qualification.versions.npm = "TBD"; },
    value => { value.qualification.versions.pgDump = "pg_dump (PostgreSQL) 16.3"; },
    value => { value.qualification.versions.pgDump = "pg_dump (PostgreSQL) 18.6\nsecret"; },
    value => { value.qualification.versions.age = "latest"; }
  ])("refuses unbound or unsupported manifest values", mutate => {
    const value = copy(); mutate(value);
    expect(() => validateBackupRunnerQualification(value)).toThrow("runner_image_manifest_invalid");
  });
  it("requires the exact two explicit CLI options in either order", () => {
    expect(parseBackupRunnerImageArguments([`--socket=${socket}`, `--image=${image}`])).toEqual({ image, socket });
  });
  it.each([
    [], [`--image=${image}`], [`--image=${image}`, `--image=${image}`],
    [`--image=${image}`, `--socket=${socket}`, "--pull"],
    ["--image=postgres:18", `--socket=${socket}`], ["--image=sha256:" + "0".repeat(64), `--socket=${socket}`],
    [`--image=${image}`, "--socket=relative"], [`--image=${image}`, "--socket=tcp://remote.invalid:2375"],
    [`--image=${image}`, "--socket=/tmp/socket\nunsafe"], [42, `--socket=${socket}`]
  ])("refuses malformed or expanded invocation", args => {
    expect(() => parseBackupRunnerImageArguments(args)).toThrow("runner_image_arguments_invalid");
  });
  it("validates before touching Docker or private temporary state", async () => {
    const test = fixture();
    await expect(test.run({ image: "latest" })).rejects.toThrow("runner_image_arguments_invalid");
    expect(test.inspectSocket).not.toHaveBeenCalled(); expect(test.execute).not.toHaveBeenCalled();
    const aborted = new AbortController(); aborted.abort();
    await expect(test.run({ signal: aborted.signal })).rejects.toThrow("runner_image_interrupted");
    expect(test.inspectSocket).not.toHaveBeenCalled(); expect(test.execute).not.toHaveBeenCalled();
  });
  it("refuses regular files as local Docker sockets without executing Docker", async () => {
    const root = await mkdtemp("/tmp/bob-runner-socket-test-");
    try {
      const path = join(root, "not-a-socket"); await writeFile(path, "synthetic", { mode: 0o600 });
      const execute = vi.fn();
      await expect(qualifyBackupRunnerImage({ image, socket: path, manifest, execute })).rejects.toThrow("runner_image_local_socket_required");
      expect(execute).not.toHaveBeenCalled();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("qualifies only the exact owned isolated container and removes its config", async () => {
    const test = fixture();
    const result = await test.run();
    expect(result).toEqual({ event: "backup.runner_image_qualified", image, platform: "linux/amd64", runtimeUser: "0:0",
      versions: manifest.qualification.versions, checks, cleanup: { containerRemoved: true, dockerConfigRemoved: true } });
    const create = test.calls.find(call => call.args[0] === "create").args;
    expect(create).toEqual(expect.arrayContaining(["--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges"]));
    expect(create).not.toContain("--init"); expect(create).not.toContain("--mount"); expect(create).not.toContain("--publish");
    const start = test.calls.find(call => call.args[0] === "start");
    expect(start.settings.timeoutMs).toBe(60_000);
    expect(start.settings.input).toContain("synthetic.age-key");
    expect(test.calls.find(call => call.args[0] === "rm").args).toEqual(["rm", "--force", id]);
    expect(test.present()).toBe(false);
    await expect(lstat(test.directory())).rejects.toHaveProperty("code", "ENOENT");
  });
  it.each([
    value => { value.Id = `sha256:${"c".repeat(64)}`; },
    value => { value.Os = "windows"; },
    value => { value.Architecture = "arm64"; },
    value => { value.Config.User = "postgres"; },
    value => { value.Config.Volumes = { "/var/lib/postgresql": {} }; },
    value => { value.Config.ExposedPorts = { "5432/tcp": {} }; },
    value => { value.Config.Entrypoint = ["postgres"]; },
    value => { value.Config.Cmd = ["postgres"]; },
    value => { value.Config.Healthcheck = { Test: ["CMD", "curl", "example.invalid"] }; },
    value => { value.Config.OnBuild = ["RUN something"]; }
  ])("refuses unsafe image metadata before container creation", async mutate => {
    const test = fixture({ image: mutate });
    await expect(test.run()).rejects.toThrow("runner_image_image_mismatch");
    expect(test.calls.map(call => call.args[0])).toEqual(["image"]);
    await expect(lstat(test.directory())).rejects.toHaveProperty("code", "ENOENT");
  });
  it.each([
    value => { value.HostConfig.NetworkMode = "host"; },
    value => { value.HostConfig.ReadonlyRootfs = false; },
    value => { value.HostConfig.Privileged = true; },
    value => { value.HostConfig.PortBindings = { "5432/tcp": [{ HostPort: "5432" }] }; },
    value => { value.HostConfig.Binds = ["/host:/container"]; },
    value => { value.HostConfig.Devices = [{ PathOnHost: "/dev/test" }]; },
    value => { value.HostConfig.PidMode = "host"; },
    value => { value.HostConfig.CapDrop = []; },
    value => { value.HostConfig.SecurityOpt = []; },
    value => { value.HostConfig.Tmpfs = {}; },
    value => { value.Mounts = [{ Type: "volume", Destination: "/tmp" }]; }
  ])("refuses isolation mismatches before execution but removes its own container", async mutate => {
    const test = fixture({ container: mutate });
    await expect(test.run()).rejects.toThrow("runner_image_isolation_mismatch");
    expect(test.calls.some(call => call.args[0] === "start")).toBe(false);
    expect(test.present()).toBe(false);
  });
  it("preserves a mismatched container rather than deleting someone else's resource", async () => {
    const test = fixture({ container: value => { value.Config.Labels = {}; } });
    await expect(test.run()).rejects.toThrow("runner_image_cleanup_failed");
    expect(test.calls.some(call => call.args[0] === "rm")).toBe(false);
    expect(test.present()).toBe(true);
    await expect(lstat(test.directory())).rejects.toHaveProperty("code", "ENOENT");
  });
  it.each([{ createError: true }, { createOutput: "lost-response" }, { startError: true }])(
    "reconciles an uncertain create/start through its exact name and ownership label", async options => {
      const test = fixture(options);
      await expect(test.run()).rejects.toBeInstanceOf(BackupRunnerImageError);
      expect(test.present()).toBe(false);
      expect(test.calls.some(call => call.args[0] === "rm")).toBe(true);
    });
  it.each([
    { output: "raw synthetic secret output" }, { output: "{}" }, { stderr: "raw synthetic secret error" },
    { output: JSON.stringify({ event: "backup.runner_image_checks_passed", uid: 0 }) }
  ])("filters malformed or noisy qualification output and cleans owned resources", async options => {
    const test = fixture(options);
    await expect(test.run()).rejects.toThrow("runner_image_checks_failed");
    expect(test.present()).toBe(false);
  });
  it.each([
    value => { value.State.Running = true; }, value => { value.State.OOMKilled = true; },
    value => { value.State.ExitCode = 1; }, value => { value.State.Dead = true; }, value => { value.State.Error = "secret"; }
  ])("requires clean final state as well as a successful result", async mutate => {
    const test = fixture({ container: (value, state) => { if (state.started) mutate(value); } });
    await expect(test.run()).rejects.toThrow("runner_image_state_mismatch");
    expect(test.present()).toBe(false);
  });
  it("cancellation preserves cleanup without passing the aborted signal to cleanup commands", async () => {
    const controller = new AbortController();
    const test = fixture({ onCall: command => { if (command[0] === "start") controller.abort("SIGTERM"); } });
    await expect(test.run({ signal: controller.signal })).rejects.toThrow("runner_image_interrupted");
    const removal = test.calls.find(call => call.args[0] === "rm");
    expect(removal.settings.signal).toBeUndefined(); expect(test.present()).toBe(false);
  });
  it("fails closed if owned removal cannot be confirmed", async () => {
    const test = fixture({ removeError: true });
    await expect(test.run()).rejects.toThrow("runner_image_cleanup_failed");
    await expect(lstat(test.directory())).rejects.toHaveProperty("code", "ENOENT");
  });
  it("produces valid standalone Node syntax without installing packages or invoking Docker", async () => {
    const root = await mkdtemp("/tmp/bob-runner-program-test-");
    try {
      const file = join(root, "program.mjs"); await writeFile(file, backupRunnerQualificationProgram(manifest.qualification), { mode: 0o600 });
      const result = await promisify(execFile)(process.execPath, ["--check", file], {
        env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, timeout: 5000, maxBuffer: 4096 });
      expect(result.stdout).toBe(""); expect(result.stderr).toBe("");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe("bounded Docker command supervision (mock children only)", () => {
  function childFixture() {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = vi.fn(() => { queueMicrotask(() => child.emit("close", null)); return true; });
    const spawnChild = vi.fn(() => child);
    return { child, spawnChild };
  }
  it("passes a sanitized environment and scripted stdin without a shell", async () => {
    const { child, spawnChild } = childFixture();
    const env = { PATH: "/usr/bin:/bin" };
    const pending = executeBackupRunnerDocker(["inspect", id], { env, input: "synthetic", spawnChild });
    expect(spawnChild.mock.calls[0][2]).toEqual({ env, stdio: ["pipe", "pipe", "pipe"], shell: false });
    child.stdout.write("safe"); child.emit("close", 0);
    await expect(pending).resolves.toEqual({ stdout: "safe", stderr: "" });
  });
  it("maps raw errors and nonzero exits to safe failures", async () => {
    const { child, spawnChild } = childFixture();
    const pending = executeBackupRunnerDocker([], { env: {}, spawnChild });
    child.stderr.write("synthetic secret"); child.emit("close", 1);
    await expect(pending).rejects.toThrow("runner_image_command_failed");
  });
  it("bounds combined stdout and stderr", async () => {
    const { child, spawnChild } = childFixture();
    const pending = executeBackupRunnerDocker([], { env: {}, spawnChild });
    child.stdout.write(Buffer.alloc(65_536)); child.stderr.write("overflow");
    await expect(pending).rejects.toThrow("runner_image_output_limit");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("cancels the owned command and awaits its close", async () => {
    const { child, spawnChild } = childFixture(), controller = new AbortController();
    const pending = executeBackupRunnerDocker([], { env: {}, spawnChild, signal: controller.signal });
    controller.abort("SIGTERM");
    await expect(pending).rejects.toThrow("runner_image_interrupted");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("bounds stalled commands", async () => {
    const { child, spawnChild } = childFixture();
    await expect(executeBackupRunnerDocker([], { env: {}, spawnChild, timeoutMs: 5 })).rejects.toThrow("runner_image_command_timeout");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("refuses pre-aborted commands before spawning", async () => {
    const { spawnChild } = childFixture(), controller = new AbortController(); controller.abort();
    await expect(executeBackupRunnerDocker([], { env: {}, spawnChild, signal: controller.signal })).rejects.toThrow("runner_image_interrupted");
    expect(spawnChild).not.toHaveBeenCalled();
  });
  it("never inherits the full host environment when called without one", async () => {
    const { child, spawnChild } = childFixture();
    const pending = executeBackupRunnerDocker([], { spawnChild });
    expect(spawnChild.mock.calls[0][2].env).toEqual({});
    child.emit("close", 0); await pending;
  });
  it("escalates and fails boundedly when the owned CLI cannot be observed closed", async () => {
    vi.useFakeTimers();
    try {
      const { child, spawnChild } = childFixture(); child.kill = vi.fn(() => true);
      const pending = executeBackupRunnerDocker([], { spawnChild, timeoutMs: 5 });
      const assertion = expect(pending).rejects.toThrow("runner_image_command_shutdown_failed");
      await vi.advanceTimersByTimeAsync(2005); await assertion;
      expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
    } finally { vi.useRealTimers(); }
  });
  it("does not mistake a live child error for proof that the CLI has stopped", async () => {
    vi.useFakeTimers();
    try {
      const { child, spawnChild } = childFixture(); child.pid = 123; child.kill = vi.fn(() => false);
      let settled = false;
      const pending = executeBackupRunnerDocker([], { spawnChild }).finally(() => { settled = true; });
      const assertion = expect(pending).rejects.toThrow("runner_image_command_shutdown_failed");
      child.emit("error", Error("synthetic permission error"));
      await vi.advanceTimersByTimeAsync(1); expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1999); await assertion;
    } finally { vi.useRealTimers(); }
  });
});
