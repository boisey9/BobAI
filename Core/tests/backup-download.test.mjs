import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { downloadBackupBundle } from "../scripts/lib/backup-download.mjs";
import { INTEGRITY_ALGORITHM } from "../scripts/lib/backup-integrity.mjs";
import { MAX_MANIFEST_BYTES, objectKeys, sha256 } from "../scripts/lib/backup.mjs";

const roots = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const id = "33333333-3333-4333-8333-333333333333";
const instance = "bobcore-testing", startedAt = "2026-11-01T15:00:00.000Z";
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-download-test-"))); roots.push(root);
  const directory = join(root, "download"); await mkdir(directory, { mode: 0o700 });
  const archive = Buffer.from("synthetic archive ciphertext"), manifest = Buffer.from("synthetic encrypted manifest");
  const receipt = { version: 2, id, instance, startedAt, keys: objectKeys(instance, id, startedAt),
    archiveSha256: sha256(archive), manifestSha256: sha256(manifest), recipientFingerprint: sha256("synthetic-public-recipient"),
    bytes: archive.length, integrity: { version: 1, algorithm: INTEGRITY_ALGORITHM } };
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  const expected = { id, instance, startedAt, recipientFingerprint: receipt.recipientFingerprint,
    receiptSha256: sha256(receiptBytes), receiptBytes: receiptBytes.length, manifestBytes: manifest.length };
  const objects = new Map([[receipt.keys.receipt, receiptBytes], [receipt.keys.archive, archive], [receipt.keys.manifest, manifest]]);
  const storage = { get: vi.fn(async key => Buffer.from(objects.get(key))), put: vi.fn(), list: vi.fn(), remove: vi.fn() };
  return { root, directory, archive, manifest, receipt, expected, objects, storage,
    input: { enabled: true, storage, expected, directory } };
}
function replaceReceipt(f, receipt) {
  const bytes = Buffer.from(JSON.stringify(receipt));
  f.objects.set(f.receipt.keys.receipt, bytes); f.expected.receiptBytes = bytes.length; f.expected.receiptSha256 = sha256(bytes);
}
const failure = async (promise, expectedCode) => {
  try { await promise; throw new Error("Expected refusal"); }
  catch (error) {
    expect(error).toBeInstanceOf(BackupCoverageError);
    expect(error.code).toBe(expectedCode);
    expect(error.message).toBe(`backup_coverage_${expectedCode}`);
    expect(error.cause).toBeUndefined();
  }
};

describe.skipIf(process.platform === "win32")("private backup artifact download", () => {
  it("is default-off before any storage or filesystem effects", async () => {
    await failure(downloadBackupBundle(), "download_disabled");
    const f = await fixture();
    await failure(downloadBackupBundle({ ...f.input, enabled: false }), "download_disabled");
    expect(f.storage.get).not.toHaveBeenCalled(); expect(await readdir(f.directory)).toEqual([]);
  });
  it("refuses an already aborted download before GET, writes or finalization", async () => {
    const f = await fixture(), controller = new AbortController(), finalize = vi.fn();
    controller.abort("synthetic-private-abort-reason");
    await failure(downloadBackupBundle({ ...f.input, signal: controller.signal, finalize }), "download_interrupted");
    expect(f.storage.get).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["receipt", "archive", "manifest"])("cancels during the %s GET and cleans only its earlier outputs", async kind => {
    const f = await fixture(), controller = new AbortController(), finalize = vi.fn();
    const earlier = { receipt: [], archive: ["receipt.json"], manifest: ["archive.dump.age", "receipt.json"] };
    f.storage.get.mockImplementation(async key => {
      if (key === f.receipt.keys[kind]) {
        expect((await readdir(f.directory)).sort()).toEqual(earlier[kind]);
        controller.abort("synthetic-private-abort-reason");
      }
      return Buffer.from(f.objects.get(key));
    });
    await failure(downloadBackupBundle({ ...f.input, signal: controller.signal, finalize }), "download_interrupted");
    expect(f.storage.get).toHaveBeenCalledTimes({ receipt: 1, archive: 2, manifest: 3 }[kind]);
    expect(finalize).not.toHaveBeenCalled(); expect(await readdir(f.directory)).toEqual([]);
    expect(f.storage.put).not.toHaveBeenCalled(); expect(f.storage.list).not.toHaveBeenCalled(); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it("preserves interruption when the cancelled transport also rejects with a private error", async () => {
    const f = await fixture(), controller = new AbortController(), finalize = vi.fn();
    f.storage.get.mockImplementation(async key => {
      if (key === f.receipt.keys.archive) { controller.abort("synthetic-private-reason"); throw Error("synthetic-private-transport-error"); }
      return Buffer.from(f.objects.get(key));
    });
    await failure(downloadBackupBundle({ ...f.input, signal: controller.signal, finalize }), "download_interrupted");
    expect(f.storage.get).toHaveBeenCalledTimes(2); expect(finalize).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]);
  });
  it("cleans all three owned files when cancellation occurs during finalization", async () => {
    const f = await fixture(), controller = new AbortController();
    const finalize = vi.fn(async () => {
      expect((await readdir(f.directory)).sort()).toEqual(["archive.dump.age", "manifest.age", "receipt.json"]);
      expect(await readFile(join(f.directory, "archive.dump.age"))).toEqual(f.archive);
      expect(await readFile(join(f.directory, "manifest.age"))).toEqual(f.manifest);
      controller.abort("synthetic-private-abort-reason");
    });
    await failure(downloadBackupBundle({ ...f.input, signal: controller.signal, finalize }), "download_interrupted");
    expect(f.storage.get).toHaveBeenCalledTimes(3); expect(finalize).toHaveBeenCalledOnce();
    expect(await readdir(f.directory)).toEqual([]); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it("cleans all three owned files and sanitizes a finalizer failure", async () => {
    const f = await fixture();
    const finalize = vi.fn(async () => {
      expect((await readdir(f.directory)).sort()).toEqual(["archive.dump.age", "manifest.age", "receipt.json"]);
      throw Error("synthetic-private-finalizer-error");
    });
    await failure(downloadBackupBundle({ ...f.input, finalize }), "download_finalize_failed");
    expect(finalize).toHaveBeenCalledOnce(); expect(await readdir(f.directory)).toEqual([]);
    expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it("awaits finalization before acknowledging a successful download", async () => {
    const f = await fixture(); let release, entered, settled = false;
    const atFinalizer = new Promise(resolve => { entered = resolve; });
    const finalization = new Promise(resolve => { release = resolve; });
    const finalize = vi.fn(() => { entered(); return finalization; });
    const pending = downloadBackupBundle({ ...f.input, finalize }).then(result => { settled = true; return result; });
    await atFinalizer;
    expect(settled).toBe(false); expect(f.storage.get).toHaveBeenCalledTimes(3);
    release(); const result = await pending;
    expect(finalize).toHaveBeenCalledOnce(); expect(settled).toBe(true);
    expect(await readFile(result.archive)).toEqual(f.archive);
    expect((await readdir(f.directory)).sort()).toEqual(["archive.dump.age", "manifest.age", "receipt.json"]);
  });
  it.each(["receipt", "archive", "manifest"])("does not finalize after corrupt %s transport content", async kind => {
    const f = await fixture(), finalize = vi.fn(), bytes = Buffer.from(f.objects.get(f.receipt.keys[kind]));
    bytes[0] ^= 1; f.objects.set(f.receipt.keys[kind], bytes);
    await failure(downloadBackupBundle({ ...f.input, finalize }), "download_artifact_mismatch");
    expect(finalize).not.toHaveBeenCalled(); expect(await readdir(f.directory)).toEqual([]);
  });
  it("accepts the matching prepared directory identity", async () => {
    const f = await fixture(), prepared = await lstat(f.directory), finalize = vi.fn();
    const result = await downloadBackupBundle({ ...f.input, directoryIdentity: { dev: prepared.dev, ino: prepared.ino }, finalize });
    expect(result.receipt).toEqual(f.receipt); expect(finalize).toHaveBeenCalledOnce();
  });
  it("refuses replacement of the prepared directory before GET or finalization", async () => {
    const f = await fixture(), prepared = await lstat(f.directory), moved = join(f.root, "original"), finalize = vi.fn();
    await rename(f.directory, moved); await mkdir(f.directory, { mode: 0o700 });
    const replacement = await lstat(f.directory); expect(replacement.ino).not.toBe(prepared.ino);
    await failure(downloadBackupBundle({ ...f.input, directoryIdentity: { dev: prepared.dev, ino: prepared.ino }, finalize }),
      "download_destination_required");
    expect(f.storage.get).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]); expect(await readdir(moved)).toEqual([]);
  });
  it.each([
    ["null signal", { signal: null }], ["signal lookalike", { signal: { aborted: false } }],
    ["null finalizer", { finalize: null }], ["nonfunction finalizer", { finalize: true }],
    ["null identity", { directoryIdentity: null }], ["missing identity fields", { directoryIdentity: {} }],
    ["string device", { directoryIdentity: { dev: "1", ino: 1 } }],
    ["fractional inode", { directoryIdentity: { dev: 1, ino: 1.5 } }],
    ["nonfinite device", { directoryIdentity: { dev: Infinity, ino: 1 } }],
    ["unsafe inode", { directoryIdentity: { dev: 1, ino: Number.MAX_SAFE_INTEGER + 1 } }],
    ["extra identity field", { directoryIdentity: { dev: 1, ino: 1, extra: "synthetic-private-value" } }]
  ])("refuses %s before transport, output writes or finalization", async (_, options) => {
    const f = await fixture(), finalize = vi.fn();
    await failure(downloadBackupBundle({ ...f.input, finalize, ...options }), "download_invalid_input");
    expect(f.storage.get).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]);
  });
  it("downloads exactly the three anchored objects into private exclusive files", async () => {
    const f = await fixture(), result = await downloadBackupBundle(f.input);
    expect(result).toEqual({ receipt: f.receipt, archive: join(f.directory, "archive.dump.age"),
      manifestFile: join(f.directory, "manifest.age"), receiptFile: join(f.directory, "receipt.json") });
    expect(f.storage.get.mock.calls).toEqual([[f.receipt.keys.receipt, f.expected.receiptBytes],
      [f.receipt.keys.archive, f.archive.length], [f.receipt.keys.manifest, f.manifest.length]]);
    expect(await readFile(result.archive)).toEqual(f.archive); expect(await readFile(result.manifestFile)).toEqual(f.manifest);
    expect(sha256(await readFile(result.receiptFile))).toBe(f.expected.receiptSha256);
    for (const path of [result.archive, result.manifestFile, result.receiptFile]) {
      const info = await lstat(path); expect(info.isFile()).toBe(true); expect(info.uid).toBe(process.getuid());
      expect(info.mode & 0o777).toBe(0o600); expect(info.nlink).toBe(1);
    }
    expect((await lstat(f.directory)).mode & 0o777).toBe(0o700);
    expect(f.storage.put).not.toHaveBeenCalled(); expect(f.storage.list).not.toHaveBeenCalled(); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it.each([
    ["missing anchor", f => { delete f.expected.receiptSha256; }],
    ["extra anchor", f => { f.expected.endpoint = "https://unapproved.invalid"; }],
    ["invalid UUID", f => { f.expected.id = "../bad"; }],
    ["invalid instance", f => { f.expected.instance = "../bad"; }],
    ["invalid timestamp", f => { f.expected.startedAt = "2026-02-30T15:00:00.000Z"; }],
    ["invalid digest", f => { f.expected.receiptSha256 = "A".repeat(64); }],
    ["zero receipt", f => { f.expected.receiptBytes = 0; }],
    ["oversized receipt", f => { f.expected.receiptBytes = 65537; }],
    ["fractional receipt", f => { f.expected.receiptBytes = 2.5; }],
    ["zero manifest", f => { f.expected.manifestBytes = 0; }],
    ["oversized manifest", f => { f.expected.manifestBytes = MAX_MANIFEST_BYTES + 1; }],
    ["missing transport", f => { f.input.storage = {}; }],
  ])("refuses %s before transport", async (_, mutate) => {
    const f = await fixture(); mutate(f);
    await failure(downloadBackupBundle(f.input), "download_invalid_input"); expect(f.storage.get).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["relative", "missing", "file", "permissive", "symlink", "inside-repo"])("refuses %s destination before transport", async kind => {
    const f = await fixture();
    if (kind === "relative") f.input.directory = "relative";
    if (kind === "missing") f.input.directory = join(f.root, "missing");
    if (kind === "file") { f.input.directory = join(f.root, "file"); await writeFile(f.input.directory, "preserve", { mode: 0o600 }); }
    if (kind === "permissive") await chmod(f.directory, 0o755);
    if (kind === "symlink") { f.input.directory = join(f.root, "link"); await symlink(f.directory, f.input.directory); }
    if (kind === "inside-repo") {
      f.input.directory = await mkdtemp(join(dirname(fileURLToPath(import.meta.url)), "bob-download-refusal-"));
      roots.push(f.input.directory); await chmod(f.input.directory, 0o700);
    }
    await failure(downloadBackupBundle(f.input), "download_destination_required"); expect(f.storage.get).not.toHaveBeenCalled();
  });
  it("refuses an existing nonempty destination and preserves caller files", async () => {
    const f = await fixture(), file = join(f.directory, "receipt.json"); await writeFile(file, "preserve", { mode: 0o600 });
    await failure(downloadBackupBundle(f.input), "download_destination_not_empty");
    expect(await readFile(file, "utf8")).toBe("preserve"); expect(f.storage.get).not.toHaveBeenCalled();
  });
  it.each(["id", "instance", "startedAt", "recipientFingerprint"])("refuses wrong receipt %s before ciphertext reads", async field => {
    const f = await fixture(), receipt = structuredClone(f.receipt);
    receipt[field] = { id: "44444444-4444-4444-8444-444444444444", instance: "other-testing",
      startedAt: "2026-11-02T15:00:00.000Z", recipientFingerprint: sha256("other") }[field];
    receipt.keys = objectKeys(receipt.instance, receipt.id, receipt.startedAt); replaceReceipt(f, receipt);
    await failure(downloadBackupBundle(f.input), "download_receipt_mismatch");
    expect(f.storage.get).toHaveBeenCalledTimes(1); expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["legacy", "keys", "descriptor", "extra", "json"])("refuses malformed %s receipt before ciphertext reads", async kind => {
    const f = await fixture(), receipt = structuredClone(f.receipt);
    if (kind === "legacy") { receipt.version = 1; delete receipt.integrity; }
    if (kind === "keys") receipt.keys.archive = "../unsafe";
    if (kind === "descriptor") receipt.integrity.algorithm = "md5";
    if (kind === "extra") receipt.privateKey = "never accepted";
    replaceReceipt(f, receipt);
    if (kind === "json") { const bytes = Buffer.from("not JSON"); f.objects.set(f.receipt.keys.receipt, bytes); f.expected.receiptBytes = bytes.length; f.expected.receiptSha256 = sha256(bytes); }
    await failure(downloadBackupBundle(f.input), "download_receipt_mismatch");
    expect(f.storage.get).toHaveBeenCalledTimes(1); expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["receipt", "archive", "manifest"])("detects %s ciphertext/hash corruption and cleans only created outputs", async kind => {
    const f = await fixture(), bytes = Buffer.from(f.objects.get(f.receipt.keys[kind])); bytes[0] ^= 1; f.objects.set(f.receipt.keys[kind], bytes);
    await failure(downloadBackupBundle(f.input), "download_artifact_mismatch"); expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["receipt", "archive", "manifest"])("detects truncated %s content", async kind => {
    const f = await fixture(), bytes = f.objects.get(f.receipt.keys[kind]); f.objects.set(f.receipt.keys[kind], bytes.subarray(1));
    await failure(downloadBackupBundle(f.input), "download_artifact_mismatch"); expect(await readdir(f.directory)).toEqual([]);
  });
  it("does not treat serialization reordering as object corruption when trusted bytes match", async () => {
    const f = await fixture(), reordered = Object.fromEntries(Object.entries(f.receipt).reverse());
    reordered.keys = Object.fromEntries(Object.entries(reordered.keys).reverse()); replaceReceipt(f, reordered);
    const result = await downloadBackupBundle(f.input); expect(result.receipt).toEqual(f.receipt);
  });
  it("still binds exact receipt bytes when transport changes their serialization", async () => {
    const f = await fixture(), reordered = Object.fromEntries(Object.entries(f.receipt).reverse());
    f.objects.set(f.receipt.keys.receipt, Buffer.from(JSON.stringify(reordered)));
    await failure(downloadBackupBundle(f.input), "download_artifact_mismatch"); expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["receipt", "archive", "manifest"])("sanitizes %s transport failures and cleans partial output", async kind => {
    const f = await fixture();
    f.storage.get.mockImplementation(async key => { if (key === f.receipt.keys[kind]) throw new Error("postgres://private-secret-sentinel"); return Buffer.from(f.objects.get(key)); });
    await failure(downloadBackupBundle(f.input), "download_transport_failed"); expect(await readdir(f.directory)).toEqual([]);
    expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it("rejects string or stream transport output without coercion", async () => {
    const f = await fixture(); f.storage.get.mockResolvedValue(f.objects.get(f.receipt.keys.receipt).toString());
    await failure(downloadBackupBundle(f.input), "download_artifact_mismatch"); expect(await readdir(f.directory)).toEqual([]);
  });
  it("does not overwrite a symlink injected after the empty-directory check", async () => {
    const f = await fixture(), outside = join(f.root, "preserve"); await writeFile(outside, "preserve", { mode: 0o600 });
    f.storage.get.mockImplementationOnce(async key => { await symlink(outside, join(f.directory, "receipt.json")); return Buffer.from(f.objects.get(key)); });
    await failure(downloadBackupBundle(f.input), "download_destination_not_empty");
    expect(await readFile(outside, "utf8")).toBe("preserve"); expect((await lstat(join(f.directory, "receipt.json"))).isSymbolicLink()).toBe(true);
  });
  it("tracks an exclusive file before partial write failure and removes it", async () => {
    const f = await fixture(), probe = await open(join(f.root, "prototype-probe"), "wx", 0o600);
    const prototype = Object.getPrototypeOf(probe), original = prototype.writeFile; await probe.close();
    vi.spyOn(prototype, "writeFile").mockImplementationOnce(async function (bytes) {
      await original.call(this, bytes.subarray(0, 3)); throw new Error("private partial-write diagnostic");
    });
    await failure(downloadBackupBundle(f.input), "download_file_failed"); expect(await readdir(f.directory)).toEqual([]);
  });
  it("rechecks stored ciphertext before reporting success", async () => {
    const f = await fixture(); f.storage.get.mockImplementation(async key => {
      if (key === f.receipt.keys.manifest) await writeFile(join(f.directory, "archive.dump.age"), Buffer.alloc(f.archive.length, 0));
      return Buffer.from(f.objects.get(key));
    });
    await failure(downloadBackupBundle(f.input), "download_artifact_mismatch"); expect(await readdir(f.directory)).toEqual([]);
  });
  it("preserves unrelated files appearing during a failed download", async () => {
    const f = await fixture(); f.storage.get.mockImplementation(async key => {
      if (key === f.receipt.keys.manifest) { await writeFile(join(f.directory, "preserve"), "foreign", { mode: 0o600 }); throw new Error("transport failed"); }
      return Buffer.from(f.objects.get(key));
    });
    await failure(downloadBackupBundle(f.input), "download_transport_failed");
    expect(await readdir(f.directory)).toEqual(["preserve"]); expect(await readFile(join(f.directory, "preserve"), "utf8")).toBe("foreign");
  });
  it("refuses substituted destination identity without deleting replacement contents", async () => {
    const f = await fixture(), moved = join(f.root, "moved"), replacement = join(f.root, "replacement");
    await mkdir(replacement, { mode: 0o700 }); await writeFile(join(replacement, "preserve"), "foreign", { mode: 0o600 });
    f.storage.get.mockImplementation(async key => {
      if (key === f.receipt.keys.manifest) { await rename(f.directory, moved); await symlink(replacement, f.directory); }
      return Buffer.from(f.objects.get(key));
    });
    await failure(downloadBackupBundle(f.input), "download_cleanup_failed");
    expect(await readFile(join(replacement, "preserve"), "utf8")).toBe("foreign");
    expect((await readdir(moved)).sort()).toEqual(["archive.dump.age", "receipt.json"]);
  });
  it("preserves replacement files instead of deleting unowned inodes during cleanup", async () => {
    const f = await fixture(); f.storage.get.mockImplementation(async key => {
      if (key === f.receipt.keys.manifest) {
        await rename(join(f.directory, "receipt.json"), join(f.root, "moved-receipt"));
        await writeFile(join(f.directory, "receipt.json"), "foreign", { mode: 0o600 }); throw new Error("transport failed");
      }
      return Buffer.from(f.objects.get(key));
    });
    await failure(downloadBackupBundle(f.input), "download_cleanup_failed");
    expect(await readdir(f.directory)).toEqual(["receipt.json"]); expect(await readFile(join(f.directory, "receipt.json"), "utf8")).toBe("foreign");
  });
  it("rejects a substituted FIFO without blocking and preserves the replacement inode", async () => {
    const f = await fixture(), fifo = join(f.directory, "receipt.json");
    let guardTimer, guardFile, guardUsed = false, settleGuard;
    const guardSettled = new Promise(resolve => { settleGuard = resolve; });
    f.storage.get.mockImplementation(async key => {
      if (key === f.receipt.keys.manifest) {
        await rename(fifo, join(f.root, "moved-receipt"));
        await promisify(execFile)("/usr/bin/mkfifo", [fifo], { env: { PATH: "/usr/bin:/bin" }, timeout: 5000 });
        // If O_NONBLOCK regresses, release the blocked reader after a bounded
        // delay, then fail the assertion. Never leave a Vitest worker stuck in
        // a pending FIFO open. The escape opener itself is nonblocking.
        guardTimer = setTimeout(() => {
          guardUsed = true;
          open(fifo, constants.O_RDWR | constants.O_NONBLOCK).then(file => { guardFile = file; }, () => {})
            .finally(settleGuard);
        }, 2000);
      }
      return Buffer.from(f.objects.get(key));
    });
    try {
      await failure(downloadBackupBundle(f.input), "download_cleanup_failed");
      expect(guardUsed).toBe(false);
      expect((await lstat(fifo)).isFIFO()).toBe(true);
      expect(await readdir(f.directory)).toEqual(["receipt.json"]);
    } finally {
      clearTimeout(guardTimer);
      if (guardUsed) await guardSettled;
      await guardFile?.close();
    }
  }, 10_000);
});
