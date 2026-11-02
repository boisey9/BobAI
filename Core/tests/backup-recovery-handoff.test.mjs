import { afterEach, describe, expect, it, vi } from "vitest";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { prepareBackupRecoveryHandoff, retainBackupRecoveryHandoff,
  validateBackupRecovery, validateBackupRecoveryProducer } from "../scripts/lib/backup-recovery-handoff.mjs";
import { sha256 } from "../scripts/lib/backup.mjs";

const roots = [];
const recovery = () => ({ version: 1, expected: { id: "33333333-3333-4333-8333-333333333333",
  instance: "testing-fixture", startedAt: "2026-11-01T17:30:00.000Z",
  recipientFingerprint: sha256("synthetic public recipient"), receiptSha256: sha256("exact synthetic receipt bytes"),
  receiptBytes: 1000, manifestBytes: 2000 } });
const producer = () => ({ repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
  workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main", runId: "123456789", runAttempt: "1",
  image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) });
const fileName = () => `${recovery().expected.id}.recovery.json`;
const canonicalBytes = () => Buffer.from(JSON.stringify({ version: 1, recovery: recovery(), producer: producer() }) + "\n");
const failure = async (action, code) => {
  try { await (typeof action === "function" ? action() : action); throw new Error("Expected refusal"); }
  catch (error) {
    expect(error).toBeInstanceOf(BackupCoverageError); expect(error.code).toBe(code);
    expect(error.message).toBe(`backup_coverage_${code}`); expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("synthetic-private-sentinel");
  }
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-recovery-handoff-"))); roots.push(root);
  const directory = join(root, "retained"), temporaryRoot = join(root, "temporary");
  await mkdir(directory, { mode: 0o700 }); await mkdir(temporaryRoot, { mode: 0o700 });
  const input = { enabled: true, directory, temporaryRoot, producer: producer() };
  return { root, directory, temporaryRoot, input, path: join(directory, fileName()),
    prepare: () => prepareBackupRecoveryHandoff(input) };
}
async function filePrototype(f) {
  const handle = await open(join(f.root, "prototype-probe"), "wx", 0o600);
  const prototype = Object.getPrototypeOf(handle); await handle.close(); return prototype;
}

describe("versioned nonsecret recovery handoff contract", () => {
  it("clones canonical recovery and producer records without retaining caller objects", () => {
    const input = recovery(), assertion = producer();
    const checked = validateBackupRecovery(input), provenance = validateBackupRecoveryProducer(assertion);
    expect(checked).toEqual(input); expect(checked).not.toBe(input); expect(checked.expected).not.toBe(input.expected);
    expect(provenance).toEqual(assertion); expect(provenance).not.toBe(assertion);
    input.expected.receiptBytes = 1; assertion.runId = "2";
    expect(checked.expected.receiptBytes).toBe(1000); expect(provenance.runId).toBe("123456789");
  });
  it.each([
    ["wrong version", value => { value.version = 2; }],
    ["extra field", value => { value.privateKey = "synthetic-private-sentinel"; }],
    ["missing anchor", value => { delete value.expected.receiptSha256; }],
    ["extra anchor", value => { value.expected.url = "synthetic-private-sentinel"; }],
    ["invalid UUID", value => { value.expected.id = "../escape"; }],
    ["invalid instance", value => { value.expected.instance = "other/escape"; }],
    ["impossible date", value => { value.expected.startedAt = "2026-02-30T17:30:00.000Z"; }],
    ["noncanonical date", value => { value.expected.startedAt = "2026-11-01T17:30:00Z"; }],
    ["uppercase hash", value => { value.expected.receiptSha256 = "A".repeat(64); }],
    ["missing recipient", value => { value.expected.recipientFingerprint = ""; }],
    ["zero receipt", value => { value.expected.receiptBytes = 0; }],
    ["large receipt", value => { value.expected.receiptBytes = 65537; }],
    ["large manifest", value => { value.expected.manifestBytes = 21 * 1024 * 1024 + 1; }],
    ["fractional length", value => { value.expected.manifestBytes = 1.5; }],
    ["accessor", value => { Object.defineProperty(value.expected, "receiptBytes", { get() { throw Error("synthetic-private-sentinel"); } }); }],
  ])("rejects recovery %s", async (_name, mutate) => {
    const input = recovery(); mutate(input);
    await failure(() => validateBackupRecovery(input), "recovery_invalid_input");
  });
  it.each([
    ["wrong repository", value => { value.repository = "other/BobAI"; }],
    ["wrong workflow", value => { value.workflow = value.workflow.replace("main", "testing"); }],
    ["zero commit", value => { value.sourceCommit = "0".repeat(40); }],
    ["invalid commit", value => { value.sourceCommit = "a".repeat(39); }],
    ["zero run", value => { value.runId = "0"; }],
    ["leading zero", value => { value.runAttempt = "01"; }],
    ["numeric run", value => { value.runId = 123; }],
    ["long run", value => { value.runId = "1".repeat(21); }],
    ["negative attempt", value => { value.runAttempt = "-1"; }],
    ["floating attempt", value => { value.runAttempt = "1.0"; }],
    ["local image ID", value => { value.image = "sha256:" + "b".repeat(64); }],
    ["mutable tag", value => { value.image = "ghcr.io/boisey9/bob-backup-runner:latest"; }],
    ["zero image", value => { value.image = "ghcr.io/boisey9/bob-backup-runner@sha256:" + "0".repeat(64); }],
    ["extra credential", value => { value.token = "synthetic-private-sentinel"; }],
    ["missing field", value => { delete value.sourceCommit; }],
  ])("rejects producer %s", async (_name, mutate) => {
    const input = producer(); mutate(input);
    await failure(() => validateBackupRecoveryProducer(input), "recovery_producer_invalid");
  });
  it("retains all twenty decimal digits without numeric precision loss", () => {
    const input = { ...producer(), runId: "12345678901234567890", runAttempt: "99999999999999999999" };
    expect(validateBackupRecoveryProducer(input)).toEqual(input);
  });
});

describe.skipIf(process.platform === "win32")("exclusive locally synced recovery records", () => {
  it("is default-off before filesystem access or producer validation", async () => {
    await failure(prepareBackupRecoveryHandoff(), "recovery_disabled");
    await failure(prepareBackupRecoveryHandoff({ enabled: false, directory: "/missing", producer: {} }), "recovery_disabled");
  });
  it("prepares an immutable cloned identity without writing, and permits unrelated retained records", async () => {
    const f = await fixture(); await writeFile(join(f.directory, "previous-owner-record"), "preserve", { mode: 0o600 });
    const prepared = await f.prepare();
    expect(Object.isFrozen(prepared)).toBe(true); expect(Object.isFrozen(prepared.producer)).toBe(true);
    expect(Object.isFrozen(prepared.identity)).toBe(true);
    expect(prepared.identity).toEqual({ dev: (await lstat(f.directory)).dev, ino: (await lstat(f.directory)).ino });
    f.input.producer.runId = "2"; expect(prepared.producer.runId).toBe("123456789");
    expect(await readdir(f.directory)).toEqual(["previous-owner-record"]);
  });
  it.each(["relative", "missing", "file", "symlink", "permissive", "inside-repo", "same-temp", "under-temp", "contains-temp", "temp-symlink"])
  ("refuses %s retention topology", async kind => {
    const f = await fixture();
    if (kind === "relative") f.input.directory = "relative";
    if (kind === "missing") f.input.directory = join(f.root, "missing");
    if (kind === "file") { f.input.directory = join(f.root, "file"); await writeFile(f.input.directory, "preserve", { mode: 0o600 }); }
    if (kind === "symlink") { f.input.directory = join(f.root, "alias"); await symlink(f.directory, f.input.directory); }
    if (kind === "permissive") await chmod(f.directory, 0o755);
    if (kind === "inside-repo") {
      f.input.directory = await mkdtemp(join(dirname(fileURLToPath(import.meta.url)), "handoff-refusal-"));
      roots.push(f.input.directory); await chmod(f.input.directory, 0o700);
    }
    if (kind === "same-temp") f.input.temporaryRoot = f.directory;
    if (kind === "under-temp") f.input.temporaryRoot = f.root;
    if (kind === "contains-temp") f.input.directory = f.root;
    if (kind === "temp-symlink") { f.input.temporaryRoot = join(f.root, "temp-alias"); await symlink(f.temporaryRoot, f.input.temporaryRoot); }
    await failure(f.prepare(), "recovery_directory_required");
    expect(await readdir(f.directory)).toEqual([]);
  });
  it("writes only canonical nonsecret bytes and returns no path or false off-device receipt", async () => {
    const f = await fixture(), prepared = await f.prepare(), prototype = await filePrototype(f);
    const syncKinds = [], original = prototype.sync;
    vi.spyOn(prototype, "sync").mockImplementation(async function () {
      syncKinds.push((await this.stat()).isDirectory() ? "directory" : "file"); return original.call(this);
    });
    const receipt = await retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), bytes = canonicalBytes();
    expect(receipt).toEqual({ version: 1, sha256: sha256(bytes), bytes: bytes.length });
    expect(bytes.length).toBeLessThanOrEqual(4096); expect(await readFile(f.path)).toEqual(bytes);
    const info = await lstat(f.path);
    expect(info.isFile()).toBe(true); expect(info.nlink).toBe(1); expect(info.mode & 0o7777).toBe(0o600);
    expect(info.uid).toBe(process.getuid()); expect(syncKinds).toEqual(["file", "directory"]);
    expect(await readdir(f.directory)).toEqual([fileName()]);
  });
  it("uses prepared provenance even if caller input changes later", async () => {
    const f = await fixture(), prepared = await f.prepare(); f.input.producer.runId = "2";
    await retainBackupRecoveryHandoff({ prepared, recovery: recovery() });
    expect(JSON.parse(await readFile(f.path, "utf8")).producer).toEqual(producer());
  });
  it("reads back an identical retry without rewriting or replacing its inode", async () => {
    const f = await fixture(), prepared = await f.prepare();
    const first = await retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), before = await lstat(f.path);
    const reordered = { expected: Object.fromEntries(Object.entries(recovery().expected).reverse()), version: 1 };
    const second = await retainBackupRecoveryHandoff({ prepared, recovery: reordered });
    expect(second).toEqual(first); expect((await lstat(f.path)).ino).toBe(before.ino);
    expect((await lstat(f.path)).mtimeMs).toBe(before.mtimeMs); expect(await readFile(f.path)).toEqual(canonicalBytes());
  });
  it("can confirm a complete identical file after an earlier acknowledgement was lost", async () => {
    const f = await fixture(), prepared = await f.prepare(); await writeFile(f.path, canonicalBytes(), { mode: 0o600 });
    const before = await lstat(f.path);
    expect(await retainBackupRecoveryHandoff({ prepared, recovery: recovery() })).toEqual({ version: 1,
      sha256: sha256(canonicalBytes()), bytes: canonicalBytes().length });
    expect((await lstat(f.path)).ino).toBe(before.ino);
  });
  it.each(["different recovery", "different producer", "partial file", "noncanonical JSON"])
  ("preserves and refuses %s on the same UUID", async kind => {
    const f = await fixture(), prepared = await f.prepare(), input = recovery();
    let bytes = canonicalBytes();
    if (kind === "partial file") bytes = bytes.subarray(0, 10);
    if (kind === "noncanonical JSON") bytes = Buffer.from(JSON.stringify(JSON.parse(bytes), null, 2));
    await writeFile(f.path, bytes, { mode: 0o600 });
    if (kind === "different recovery") input.expected.receiptSha256 = "c".repeat(64);
    let selected = prepared;
    if (kind === "different producer") { f.input.producer.runId = "2"; selected = await f.prepare(); }
    await failure(retainBackupRecoveryHandoff({ prepared: selected, recovery: input }), "recovery_conflict");
    expect(await readFile(f.path)).toEqual(bytes);
  });
  it.each(["symlink", "hardlink", "permissive", "directory"])("preserves unsafe existing %s", async kind => {
    const f = await fixture(), prepared = await f.prepare(), other = join(f.root, "preserve");
    await writeFile(other, canonicalBytes(), { mode: 0o600 });
    if (kind === "symlink") await symlink(other, f.path);
    if (kind === "hardlink") await link(other, f.path);
    if (kind === "permissive") { await writeFile(f.path, canonicalBytes(), { mode: 0o600 }); await chmod(f.path, 0o644); }
    if (kind === "directory") await mkdir(f.path, { mode: 0o700 });
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_file_unsafe");
    expect(await readFile(other)).toEqual(canonicalBytes()); expect(await lstat(f.path)).toBeDefined();
  });
  it("refuses forged or cloned preparation objects before creating files", async () => {
    const f = await fixture(), prepared = await f.prepare();
    await failure(retainBackupRecoveryHandoff({ prepared: { ...prepared }, recovery: recovery() }), "recovery_invalid_input");
    expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["replacement", "symlink", "temporary-root replacement"])("refuses %s after preparation", async kind => {
    const f = await fixture(), prepared = await f.prepare();
    const target = kind === "temporary-root replacement" ? f.temporaryRoot : f.directory;
    await rename(target, target + "-old");
    if (kind === "symlink") await symlink(target + "-old", target);
    else await mkdir(target, { mode: 0o700 });
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }),
      kind === "symlink" ? "recovery_directory_required" : "recovery_directory_changed");
    expect(await readdir(f.directory)).toEqual([]);
  });
  it("preserves a partial write failure and refuses to overwrite it on retry", async () => {
    const f = await fixture(), prepared = await f.prepare(), prototype = await filePrototype(f), original = prototype.writeFile;
    vi.spyOn(prototype, "writeFile").mockImplementationOnce(async function (bytes) {
      await original.call(this, bytes.subarray(0, 10)); throw Error("synthetic-private-sentinel");
    });
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_io_failed");
    expect(await readFile(f.path)).toEqual(canonicalBytes().subarray(0, 10));
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_conflict");
    expect(await readFile(f.path)).toEqual(canonicalBytes().subarray(0, 10));
  });
  it.each(["file sync", "directory sync", "close after sync"])("preserves %s failure for identical retry", async kind => {
    const f = await fixture(), prepared = await f.prepare(), prototype = await filePrototype(f);
    if (kind === "close after sync") {
      const original = prototype.sync;
      vi.spyOn(prototype, "sync").mockImplementationOnce(async function () {
        await original.call(this);
        const close = this.close;
        this.close = vi.fn(close).mockImplementationOnce(async () => { await close(); throw Error("synthetic-private-sentinel"); });
      });
    } else {
      const original = prototype.sync; let n = 0;
      vi.spyOn(prototype, "sync").mockImplementation(async function () {
        if (++n === (kind === "file sync" ? 1 : 2)) throw Error("synthetic-private-sentinel");
        return original.call(this);
      });
    }
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_io_failed");
    expect(await readFile(f.path)).toEqual(canonicalBytes()); vi.restoreAllMocks();
    expect(await retainBackupRecoveryHandoff({ prepared, recovery: recovery() })).toMatchObject({ version: 1, sha256: sha256(canonicalBytes()) });
  });
  it("detects replacement of the directory during a write without deleting either tree", async () => {
    const f = await fixture(), prepared = await f.prepare(), prototype = await filePrototype(f), original = prototype.sync;
    vi.spyOn(prototype, "sync").mockImplementationOnce(async function () {
      await original.call(this); await rename(f.directory, f.directory + "-old"); await mkdir(f.directory, { mode: 0o700 });
      await writeFile(join(f.directory, "foreign"), "preserve", { mode: 0o600 });
    });
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_directory_changed");
    expect(await readFile(join(f.directory + "-old", fileName()))).toEqual(canonicalBytes());
    expect(await readFile(join(f.directory, "foreign"), "utf8")).toBe("preserve");
  });
  it("attempts directory descriptor cleanup even when file close fails", async () => {
    const f = await fixture(), prepared = await f.prepare(), prototype = await filePrototype(f);
    const originalStat = prototype.stat; let directoryHandle, closeFile;
    vi.spyOn(prototype, "stat").mockImplementation(async function (...args) {
      const info = await originalStat.apply(this, args);
      if (info.isDirectory()) directoryHandle = this;
      return info;
    });
    vi.spyOn(prototype, "writeFile").mockImplementationOnce(async function () {
      closeFile = this.close; this.close = async () => { throw Error("synthetic-private-sentinel"); };
      throw Error("synthetic-private-sentinel");
    });
    try {
      await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_io_failed");
      expect(directoryHandle.fd).toBe(-1); expect((await lstat(f.path)).size).toBe(0);
    } finally { await closeFile?.(); }
  });
  it("refuses an inode replacement during identical retry even when replacement bytes match", async () => {
    const f = await fixture(), prepared = await f.prepare(), prototype = await filePrototype(f), original = prototype.read;
    await writeFile(f.path, canonicalBytes(), { mode: 0o600 });
    vi.spyOn(prototype, "read").mockImplementationOnce(async function (...args) {
      const result = await original.apply(this, args);
      await rename(f.path, f.path + "-original"); await writeFile(f.path, canonicalBytes(), { mode: 0o600 });
      return result;
    });
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_conflict");
    expect(await readFile(f.path)).toEqual(canonicalBytes()); expect(await readFile(f.path + "-original")).toEqual(canonicalBytes());
  });
  it("refuses pre-cancelled retention without writing", async () => {
    const f = await fixture(), prepared = await f.prepare(), controller = new AbortController(); controller.abort("synthetic-private-sentinel");
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery(), signal: controller.signal }), "recovery_interrupted");
    expect(await readdir(f.directory)).toEqual([]);
  });
  it("preserves a cancelled completed write for a later exact retry", async () => {
    const f = await fixture(), prepared = await f.prepare(), controller = new AbortController();
    const prototype = await filePrototype(f), original = prototype.writeFile;
    vi.spyOn(prototype, "writeFile").mockImplementationOnce(async function (bytes) {
      await original.call(this, bytes); controller.abort("synthetic-private-sentinel");
    });
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery(), signal: controller.signal }), "recovery_interrupted");
    expect(await readFile(f.path)).toEqual(canonicalBytes());
    expect(await retainBackupRecoveryHandoff({ prepared, recovery: recovery() })).toMatchObject({ version: 1 });
  });
  it("cancels read-only identical retry without altering the retained file", async () => {
    const f = await fixture(), prepared = await f.prepare(), controller = new AbortController();
    await writeFile(f.path, canonicalBytes(), { mode: 0o600 }); const before = await lstat(f.path);
    const prototype = await filePrototype(f), original = prototype.read;
    vi.spyOn(prototype, "read").mockImplementationOnce(async function (...args) {
      const result = await original.apply(this, args); controller.abort("synthetic-private-sentinel"); return result;
    });
    await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery(), signal: controller.signal }), "recovery_interrupted");
    expect(await readFile(f.path)).toEqual(canonicalBytes());
    const after = await lstat(f.path); expect(after.ino).toBe(before.ino); expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(await retainBackupRecoveryHandoff({ prepared, recovery: recovery() })).toMatchObject({ version: 1 });
  });
  it("does not block opening a substituted FIFO", async () => {
    const f = await fixture(), prepared = await f.prepare();
    await promisify(execFile)("/usr/bin/mkfifo", [f.path], { env: { PATH: "/usr/bin:/bin" }, timeout: 5000 });
    let escaped = false, escapeHandle, settle;
    const escapedDone = new Promise(resolve => { settle = resolve; });
    const escape = setTimeout(() => { escaped = true;
      open(f.path, constants.O_RDWR | constants.O_NONBLOCK).then(handle => { escapeHandle = handle; }, () => {}).finally(settle);
    }, 2000);
    try {
      await failure(retainBackupRecoveryHandoff({ prepared, recovery: recovery() }), "recovery_file_unsafe");
      expect(escaped).toBe(false); expect((await lstat(f.path)).isFIFO()).toBe(true);
    } finally { clearTimeout(escape); if (escaped) await escapedDone; await escapeHandle?.close(); }
  }, 10000);
});
