import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareBackupCustody, encryptBackupCustody } from "../scripts/lib/backup-custody-encryption.mjs";
import { RestoreOperationError } from "../scripts/lib/backup-restore-operation.mjs";
import { sha256 } from "../scripts/lib/backup.mjs";

const execute = promisify(execFile), roots = [];
const id = "33333333-3333-4333-8333-333333333333", instance = "testing-fixture";
const recipient = "age1" + "q".repeat(58), secret = "synthetic-private-sentinel";
const producer = { repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
  workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main",
  runId: "123456", runAttempt: "2", image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) };
const ciphertext = Buffer.from("age-encryption.org/v1\nsynthetic ciphertext fixture\n");
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture(publicRecipient = recipient) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-custody-test-"))); roots.push(root);
  const directory = join(root, "ciphertext"), recoveryDirectory = join(root, "handoff"), temporaryRoot = join(root, "temporary");
  for (const path of [directory, recoveryDirectory, temporaryRoot]) await mkdir(path, { mode: 0o700 });
  const options = { enabled: true, directory, recoveryDirectory, temporaryRoot, producer: structuredClone(producer),
    recipient: publicRecipient, instance };
  const record = { version: 1, recovery: { version: 1, expected: { id, instance, startedAt: "2026-11-01T18:00:00.000Z",
    recipientFingerprint: sha256(publicRecipient), receiptSha256: "c".repeat(64), receiptBytes: 700, manifestBytes: 1200 } }, producer: structuredClone(producer) };
  const bytes = Buffer.from(JSON.stringify(record) + "\n"), handoffFile = join(recoveryDirectory, `${id}.recovery.json`);
  const result = { event: "backup.verified", id, bytes: 1234, retentionChecked: false, expiredObjectsRemoved: 0,
    handoff: { version: 1, sha256: sha256(bytes), bytes: bytes.length } };
  const stages = [], commands = [];
  const runCommand = vi.fn(async (command, args, env, label, timeout, signal) => {
    commands.push({ command, args, env, label, timeout, signal });
    expect(command).toBe("/usr/local/bin/age"); expect(args.slice(0, 3)).toEqual(["--encrypt", "--recipient", publicRecipient]);
    expect(timeout).toBe(60000); expect(args).not.toContain("--identity");
    const input = args.at(-1), output = args[args.indexOf("--output") + 1]; stages.push(dirname(input));
    expect(await readFile(input)).toEqual(bytes); expect((await stat(input)).mode & 0o7777).toBe(0o600);
    expect((await stat(dirname(input))).mode & 0o7777).toBe(0o700);
    expect(Object.keys(env).every(key => ["PATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "WINDIR"].includes(key))).toBe(true);
    await writeFile(output, ciphertext, { mode: 0o644 });
  });
  const prepare = () => prepareBackupCustody(options);
  const ready = async () => { const prepared = await prepare(); await writeFile(handoffFile, bytes, { mode: 0o600 }); return prepared; };
  return { root, options, record, bytes, result, handoffFile, runCommand, commands, stages, prepare, ready };
}
async function failure(promise, code) {
  const error = await promise.then(() => undefined, error => error);
  expect(error).toBeDefined(); expect(error.name).toBe("BackupCoverageError");
  if (code) expect(error.code).toBe(`custody_${code}`);
  else expect(error.code).toMatch(/^custody_[a-z_]+$/);
  expect(String(error)).not.toContain(secret); expect(JSON.stringify(error)).not.toContain(secret);
  return error;
}

describe("default-off custody preparation", () => {
  it.each([undefined, false, "true"])("refuses enable value %j before filesystem work", async enabled => {
    await failure(prepareBackupCustody({ enabled, directory: "/missing/ciphertext", producer: { secret } }), "disabled");
  });
  it("performs no preparation writes and returns an opaque frozen handle", async () => {
    const f = await fixture(), prepared = await f.prepare();
    expect(Object.keys(prepared)).toEqual([]); expect(Object.isFrozen(prepared)).toBe(true);
    for (const path of [f.options.directory, f.options.recoveryDirectory, f.options.temporaryRoot]) expect(await readdir(path)).toEqual([]);
  });
  it.each(["directory", "recoveryDirectory", "temporaryRoot"])("requires private owned permissions for %s", async name => {
    const f = await fixture(); await chmod(f.options[name], 0o755);
    await failure(f.prepare(), "directory_changed");
  });
  it.each(["directory", "recoveryDirectory", "temporaryRoot"])("requires empty %s before capture", async name => {
    const f = await fixture(); await writeFile(join(f.options[name], "existing"), "preserve", { mode: 0o600 });
    await failure(f.prepare(), "directory_not_empty"); expect(await readFile(join(f.options[name], "existing"), "utf8")).toBe("preserve");
  });
  it("refuses aliases, symlinks and ancestor overlap", async () => {
    const f = await fixture();
    await failure(prepareBackupCustody({ ...f.options, temporaryRoot: f.options.directory }), "directory_unsafe");
    await failure(prepareBackupCustody({ ...f.options, temporaryRoot: f.root }), "directory_unsafe");
    const alias = join(f.root, "alias"); await symlink(f.options.directory, alias);
    await failure(prepareBackupCustody({ ...f.options, directory: alias }), "directory_unsafe");
  });
  it.each([
    { recipient: "AGE-SECRET-KEY-" + secret }, { instance: "../" + secret },
    { producer: { ...producer, repository: "another/repository" } },
    { producer: { ...producer, sourceCommit: "0".repeat(40) } },
    { producer: { ...producer, workflow: producer.workflow.replace("main", "feature") } },
  ])("rejects invalid recipient, instance or provenance before capture", async change => {
    const f = await fixture(); await failure(prepareBackupCustody({ ...f.options, ...change }));
    expect(await readdir(f.options.directory)).toEqual([]);
  });
  it("refuses pre-aborted preparation without creating files", async () => {
    const f = await fixture(), controller = new AbortController(); controller.abort(secret);
    await failure(prepareBackupCustody({ ...f.options, signal: controller.signal }), "interrupted");
  });
});

describe("exact handoff encryption and retained ciphertext", () => {
  it("encrypts canonical retained bytes once, acknowledges exact ciphertext, and removes only private staging", async () => {
    const f = await fixture(), prepared = await f.ready();
    const result = await encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand });
    expect(result).toEqual({ name: "bob-recovery-handoff-r123456-a2", path: join(f.options.directory, "recovery.json.age"),
      sha256: sha256(ciphertext), bytes: ciphertext.length });
    expect(await readFile(result.path)).toEqual(ciphertext); expect((await stat(result.path)).mode & 0o7777).toBe(0o600);
    expect(await readdir(f.options.temporaryRoot)).toEqual([]); expect(await readFile(f.handoffFile)).toEqual(f.bytes);
    expect(f.runCommand).toHaveBeenCalledTimes(1);
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand }), "preparation_required");
    expect(f.runCommand).toHaveBeenCalledTimes(1); expect(await readFile(result.path)).toEqual(ciphertext);
  });
  it.each([
    { event: "backup.failed" }, { id: "../../" + secret }, { bytes: 0 }, { retentionChecked: true },
    { expiredObjectsRemoved: 1 }, { extra: secret }, { handoff: { version: 1, sha256: "a".repeat(64), bytes: 4097 } },
  ])("rejects an invalid completed outcome before commands", async change => {
    const f = await fixture(), prepared = await f.ready();
    await failure(encryptBackupCustody({ prepared, result: { ...f.result, ...change } }, { runCommand: f.runCommand }), "result_invalid");
    expect(f.runCommand).not.toHaveBeenCalled(); expect(await readdir(f.options.directory)).toEqual([]);
  });
  it("does not accept a forged or cloned preparation", async () => {
    const f = await fixture(); await failure(encryptBackupCustody({ prepared: {}, result: f.result }, { runCommand: f.runCommand }), "preparation_required");
    expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each(["hash", "length", "newline", "id", "instance", "recipient", "producer", "extra"])
  ("refuses handoff %s mismatch before encryption", async mismatch => {
    const f = await fixture(), prepared = await f.ready();
    let bytes = f.bytes;
    if (mismatch === "hash") f.result.handoff.sha256 = "f".repeat(64);
    else if (mismatch === "length") f.result.handoff.bytes++;
    else {
      if (mismatch === "id") f.record.recovery.expected.id = "44444444-4444-4444-8444-444444444444";
      if (mismatch === "instance") f.record.recovery.expected.instance = "testing-other";
      if (mismatch === "recipient") f.record.recovery.expected.recipientFingerprint = "d".repeat(64);
      if (mismatch === "producer") f.record.producer.runAttempt = "3";
      if (mismatch === "extra") f.record.extra = secret;
      bytes = Buffer.from(JSON.stringify(f.record) + (mismatch === "newline" ? "" : "\n"));
      await writeFile(f.handoffFile, bytes); f.result.handoff = { version: 1, sha256: sha256(bytes), bytes: bytes.length };
    }
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand }), "handoff_mismatch");
    expect(f.runCommand).not.toHaveBeenCalled(); expect(await readdir(f.options.temporaryRoot)).toEqual([]);
  });
  it("selects only the exact completed UUID and preserves unrelated handoffs", async () => {
    const f = await fixture(), prepared = await f.ready(), other = join(f.options.recoveryDirectory, "newest.recovery.json");
    await writeFile(other, secret, { mode: 0o600 }); await rm(f.handoffFile);
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand }));
    expect(f.runCommand).not.toHaveBeenCalled(); expect(await readFile(other, "utf8")).toBe(secret);
  });
  it.each(["symlink", "hardlink", "permissions", "oversize"])("refuses unsafe handoff %s", async kind => {
    const f = await fixture(), prepared = await f.ready();
    if (kind === "symlink") { await rename(f.handoffFile, join(f.root, "original")); await symlink(join(f.root, "original"), f.handoffFile); }
    if (kind === "hardlink") await link(f.handoffFile, join(f.root, "second-link"));
    if (kind === "permissions") await chmod(f.handoffFile, 0o644);
    if (kind === "oversize") await writeFile(f.handoffFile, Buffer.alloc(4097));
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand })); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each(["directory", "recoveryDirectory", "temporaryRoot"])("refuses replacement of prepared %s", async name => {
    const f = await fixture(), prepared = await f.ready(), path = f.options[name];
    await rename(path, path + "-original"); await mkdir(path, { mode: 0o700 });
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand }), "directory_changed");
    expect(f.runCommand).not.toHaveBeenCalled();
  });
  it("preserves ciphertext that appeared after preparation", async () => {
    const f = await fixture(), prepared = await f.ready(), path = join(f.options.directory, "recovery.json.age");
    await writeFile(path, "preserve", { mode: 0o600 });
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand }), "directory_not_empty");
    expect(await readFile(path, "utf8")).toBe("preserve"); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it("refuses a raced ciphertext file without overwriting it", async () => {
    const f = await fixture(), prepared = await f.ready();
    const runCommand = async (...args) => { await f.runCommand(...args); await writeFile(join(f.options.directory, "recovery.json.age"), "preserve", { mode: 0o600 }); };
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand }), "directory_not_empty");
    expect(await readFile(join(f.options.directory, "recovery.json.age"), "utf8")).toBe("preserve");
    expect(await readdir(f.options.temporaryRoot)).toEqual([]);
  });
  it("keeps ciphertext after cleanup failure without a success descriptor or re-encryption", async () => {
    const f = await fixture(), prepared = await f.ready();
    const error = await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand, cleanup: async () => { throw Error(secret); } }), "cleanup_failed");
    expect(error.state).toMatchObject({ cleanupUncertain: true, plaintextRetained: true });
    expect(await readFile(join(f.options.directory, "recovery.json.age"))).toEqual(ciphertext);
    expect(await readdir(f.options.temporaryRoot)).toHaveLength(1);
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand }), "preparation_required");
    expect(f.runCommand).toHaveBeenCalledTimes(1);
  });
  it("cleans settled encryption failure and preserves the original handoff", async () => {
    const f = await fixture(), prepared = await f.ready();
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: async () => { throw new RestoreOperationError("restore_command_failed"); } }), "encryption_failed");
    expect(await readdir(f.options.temporaryRoot)).toEqual([]); expect(await readFile(f.handoffFile)).toEqual(f.bytes);
  });
  it.each(["empty", "oversized", "plaintext"])("refuses %s tool output without publishing it and cleans its admitted stage", async kind => {
    const f = await fixture(), prepared = await f.ready();
    const runCommand = async (...args) => { await f.runCommand(...args);
      await writeFile(args[1][args[1].indexOf("--output") + 1], kind === "empty" ? Buffer.alloc(0) : kind === "oversized" ? Buffer.alloc(16385) : f.bytes); };
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand }), "ciphertext_invalid");
    expect(await readdir(f.options.directory)).toEqual([]); expect(await readdir(f.options.temporaryRoot)).toEqual([]);
    expect(await readFile(f.handoffFile)).toEqual(f.bytes);
  });
  it("rejects a tool-created FIFO without blocking and preserves the unadmitted inode", async () => {
    const f = await fixture(), prepared = await f.ready(); let fifo, timer, guardFile, guardUsed = false, settle;
    const settled = new Promise(resolve => { settle = resolve; });
    const runCommand = async (_command, args) => {
      fifo = args[args.indexOf("--output") + 1];
      await execute("/usr/bin/mkfifo", [fifo], { env: { PATH: "/usr/bin:/bin" }, timeout: 5000 });
      // Bound a regression that removes O_NONBLOCK rather than stranding the
      // worker. The escape opener must remain unused on the correct path.
      timer = setTimeout(() => { guardUsed = true;
        open(fifo, constants.O_RDWR | constants.O_NONBLOCK).then(file => { guardFile = file; }, () => {}).finally(settle);
      }, 2000);
    };
    try {
      await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand }), "cleanup_failed");
      expect(guardUsed).toBe(false); expect((await lstat(fifo)).isFIFO()).toBe(true);
      await expect(lstat(join(dirname(fifo), "recovery.json"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readdir(f.options.directory)).toEqual([]);
    } finally { clearTimeout(timer); if (guardUsed) await settled; await guardFile?.close(); }
  }, 10000);
  it.each(["bytes", "inode", "directory"])("withholds success when final ciphertext %s changes during cleanup", async kind => {
    const f = await fixture(), prepared = await f.ready(), path = join(f.options.directory, "recovery.json.age");
    const cleanup = async stage => {
      await rm(stage, { recursive: true });
      if (kind === "bytes") await writeFile(path, Buffer.alloc(ciphertext.length, 33));
      if (kind === "inode") { await rename(path, join(f.root, "preserved-ciphertext")); await writeFile(path, ciphertext, { mode: 0o600 }); }
      if (kind === "directory") { await rename(f.options.directory, f.options.directory + "-original"); await mkdir(f.options.directory, { mode: 0o700 }); }
    };
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand: f.runCommand, cleanup }),
      kind === "directory" ? "directory_changed" : "ciphertext_mismatch");
    expect(f.runCommand).toHaveBeenCalledTimes(1); expect(await readdir(f.options.temporaryRoot)).toEqual([]);
    expect(await readFile(f.handoffFile)).toEqual(f.bytes);
  });
  it("refuses pre-aborted encryption without touching retained files or invoking age", async () => {
    const f = await fixture(), prepared = await f.ready(), controller = new AbortController(); controller.abort(secret);
    await failure(encryptBackupCustody({ prepared, result: f.result, signal: controller.signal }, { runCommand: f.runCommand }), "interrupted");
    expect(f.runCommand).not.toHaveBeenCalled(); expect(await readdir(f.options.temporaryRoot)).toEqual([]);
    expect(await readFile(f.handoffFile)).toEqual(f.bytes);
  });
  it.each([false, true])("retains private plaintext on unconfirmed tool shutdown, abort=%j", async abort => {
    const f = await fixture(), prepared = await f.ready(), controller = new AbortController();
    const error = await failure(encryptBackupCustody({ prepared, result: f.result, signal: controller.signal }, {
      runCommand: async () => { if (abort) controller.abort(secret); throw new RestoreOperationError("restore_command_shutdown_unconfirmed", { commandUnsettled: true }); },
    }), "command_shutdown_unconfirmed");
    expect(error.state).toMatchObject({ cleanupUncertain: true, plaintextRetained: true });
    const entries = await readdir(f.options.temporaryRoot); expect(entries).toHaveLength(1);
    expect(await readFile(join(f.options.temporaryRoot, entries[0], "recovery.json"))).toEqual(f.bytes);
    expect(await readdir(f.options.directory)).toEqual([]);
  });
  it("does not delete unknown staging files while cleaning its own plaintext", async () => {
    const f = await fixture(), prepared = await f.ready(); let unknown;
    const runCommand = async (...args) => { await f.runCommand(...args); unknown = join(dirname(args[1].at(-1)), "unknown"); await writeFile(unknown, "preserve", { mode: 0o600 }); };
    await failure(encryptBackupCustody({ prepared, result: f.result }, { runCommand }), "cleanup_failed");
    expect(await readFile(unknown, "utf8")).toBe("preserve"); await expect(lstat(join(dirname(unknown), "recovery.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("refuses cancellation after a settled tool before publishing ciphertext", async () => {
    const f = await fixture(), prepared = await f.ready(), controller = new AbortController();
    const runCommand = async (...args) => { await f.runCommand(...args); controller.abort(secret); };
    await failure(encryptBackupCustody({ prepared, result: f.result, signal: controller.signal }, { runCommand }), "interrupted");
    expect(await readdir(f.options.directory)).toEqual([]); expect(await readdir(f.options.temporaryRoot)).toEqual([]);
  });
});

it.skipIf(!existsSync("/usr/local/bin/age") || !existsSync("/usr/local/bin/age-keygen"))("round-trips with installed age using only a generated disposable identity", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-custody-age-"))); roots.push(root);
  const key = join(root, "synthetic.agekey"), decrypted = join(root, "decrypted.json");
  const env = { PATH: "/usr/local/bin:/usr/bin:/bin" };
  await execute("/usr/local/bin/age-keygen", ["-o", key], { env, timeout: 10000 }); await chmod(key, 0o600);
  const recipient = (await execute("/usr/local/bin/age-keygen", ["-y", key], { env, timeout: 10000 })).stdout.trim();
  const f = await fixture(recipient), prepared = await f.ready();
  const descriptor = await encryptBackupCustody({ prepared, result: f.result });
  expect(descriptor.bytes).toBeLessThanOrEqual(16384); expect(await readFile(descriptor.path)).not.toEqual(f.bytes);
  await execute("/usr/local/bin/age", ["--decrypt", "--identity", key, "--output", decrypted, descriptor.path], { env, timeout: 10000 });
  expect(await readFile(decrypted)).toEqual(f.bytes); expect(await readdir(f.options.temporaryRoot)).toEqual([]);
  expect(await readFile(f.handoffFile)).toEqual(f.bytes);
}, 15000);
