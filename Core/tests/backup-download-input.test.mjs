import { afterEach, describe, expect, it, vi } from "vitest";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { prepareBackupDownload, readBackupDownloadCredentials, readBackupDownloadInput,
  validateBackupDownloadPlan, verifyBackupDownloadDestination } from "../scripts/lib/backup-download-input.mjs";
import { sha256 } from "../scripts/lib/backup.mjs";

const roots = [];
const producer = () => ({ repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
  workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main", runId: "12345678901234567890", runAttempt: "1",
  image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) });
const record = () => ({ version: 1, recovery: { version: 1, expected: {
  id: "33333333-3333-4333-8333-333333333333", instance: "testing-fixture", startedAt: "2026-11-01T17:30:00.000Z",
  recipientFingerprint: sha256("synthetic public recipient"), receiptSha256: sha256("synthetic exact receipt bytes"),
  receiptBytes: 1000, manifestBytes: 2000 } }, producer: producer() });
const bytes = () => Buffer.from(JSON.stringify(record()) + "\n");
const plan = directory => ({ version: 1, enabled: true,
  storage: { endpoint: "https://fixture.invalid", bucket: "testing-fixture", region: "auto" },
  handoff: { sha256: sha256(bytes()), bytes: bytes().length, id: record().recovery.expected.id, instance: "testing-fixture", producer: producer() },
  review: { reviewedAt: "2026-11-01T18:30:00.000Z", storageAccountId: "owner.testing-1", custodyReference: "offline:review-1" },
  destination: { directory } });
const failure = async (action, code) => {
  try { await (typeof action === "function" ? action() : action); throw Error("Expected refusal"); }
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
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-download-input-"))); roots.push(root);
  const directory = join(root, "destination"), planFile = join(root, "plan.json"), handoffFile = join(root, "handoff.json");
  await mkdir(directory, { mode: 0o700 });
  const value = plan(directory);
  await writeFile(planFile, JSON.stringify(value), { mode: 0o600 });
  await writeFile(handoffFile, bytes(), { mode: 0o600 });
  return { root, directory, planFile, handoffFile, value,
    save: () => writeFile(planFile, JSON.stringify(value)),
    prepare: signal => prepareBackupDownload({ planFile, handoffFile, signal }) };
}
async function filePrototype(f) {
  const handle = await open(join(f.root, "prototype-probe"), "wx", 0o600);
  const prototype = Object.getPrototypeOf(handle); await handle.close(); return prototype;
}

describe("exact opt-in download plan", () => {
  it("clones the reviewed fields and uses the existing target normalization", () => {
    const input = plan("/private/tmp/fixture-destination"), checked = validateBackupDownloadPlan(input);
    expect(checked.storage.endpoint).toBe("https://fixture.invalid/");
    expect(checked.handoff.producer.runId).toBe("12345678901234567890");
    input.handoff.producer.runId = "2"; input.review.custodyReference = "changed";
    expect(checked.handoff.producer.runId).toBe("12345678901234567890");
    expect(checked.review.custodyReference).toBe("offline:review-1");
  });
  it.each([undefined, null, {}, { enabled: false }, { enabled: "true" }, { enabled: 1 }])("refuses non-opt-in %j first", async input => {
    await failure(() => validateBackupDownloadPlan(input), "operator_disabled");
  });
  it("never invokes enabled or other accessors", async () => {
    const getter = vi.fn(() => { throw Error("synthetic-private-sentinel"); });
    const input = { get enabled() { return getter(); }, get storage() { return getter(); } };
    await failure(() => validateBackupDownloadPlan(input), "operator_disabled"); expect(getter).not.toHaveBeenCalled();
  });
  it.each([
    ["wrong version", p => { p.version = 2; }],
    ["extra top-level authority", p => { p.approved = true; }],
    ["symbol field", p => { p[Symbol("extra")] = true; }],
    ["custom prototype", p => { Object.setPrototypeOf(p, { approved: true }); }],
    ["HTTP endpoint", p => { p.storage.endpoint = "http://fixture.invalid"; }],
    ["credential endpoint", p => { p.storage.endpoint = "https://synthetic-private-sentinel@fixture.invalid"; }],
    ["query endpoint", p => { p.storage.endpoint = "https://fixture.invalid/?token=synthetic-private-sentinel"; }],
    ["storage credential", p => { p.storage.secretAccessKey = "synthetic-private-sentinel"; }],
    ["accessor storage", p => { Object.defineProperty(p.storage, "bucket", { get() { throw Error("synthetic-private-sentinel"); } }); }],
    ["wrong bucket", p => { p.storage.bucket = "../escape"; }],
    ["wrong region", p => { p.storage.region = "unknown region"; }],
    ["zero hash", p => { p.handoff.sha256 = "0".repeat(64); }],
    ["uppercase hash", p => { p.handoff.sha256 = "A".repeat(64); }],
    ["wrong hash length", p => { p.handoff.sha256 = "a".repeat(63); }],
    ["zero length", p => { p.handoff.bytes = 0; }],
    ["fractional length", p => { p.handoff.bytes = 1.5; }],
    ["oversize handoff", p => { p.handoff.bytes = 4097; }],
    ["noncanonical UUID", p => { p.handoff.id = "A3333333-3333-4333-8333-333333333333"; }],
    ["unsafe instance", p => { p.handoff.instance = "../production"; }],
    ["other producer", p => { p.handoff.producer.repository = "other/BobAI"; }],
    ["mutable image", p => { p.handoff.producer.image = "ghcr.io/boisey9/bob-backup-runner:latest"; }],
    ["missing review", p => { delete p.review; }],
    ["impossible date", p => { p.review.reviewedAt = "2026-02-30T18:30:00.000Z"; }],
    ["noncanonical date", p => { p.review.reviewedAt = "2026-11-01T18:30:00Z"; }],
    ["offset date", p => { p.review.reviewedAt = "2026-11-01T18:30:00.000+00:00"; }],
    ["account URL", p => { p.review.storageAccountId = "https://fixture.invalid"; }],
    ["custody path", p => { p.review.custodyReference = "/private/key"; }],
    ["custody whitespace", p => { p.review.custodyReference = "record secret"; }],
    ["long reference", p => { p.review.custodyReference = "a".repeat(129); }],
    ["empty reference", p => { p.review.custodyReference = ""; }],
    ["extra review", p => { p.review.token = "synthetic-private-sentinel"; }],
    ["relative destination", p => { p.destination.directory = "relative"; }],
    ["NUL destination", p => { p.destination.directory = "/private/tmp/\0secret"; }],
    ["extra destination", p => { p.destination.create = true; }],
  ])("rejects %s without raw diagnostics", async (_name, mutate) => {
    const input = plan("/private/tmp/fixture-destination"); mutate(input);
    await failure(() => validateBackupDownloadPlan(input), "operator_invalid_plan");
  });
});

describe.skipIf(process.platform === "win32")("private bounded byte inputs", () => {
  it("returns exact untrimmed raw bytes and accepts the exact maximum", async () => {
    const f = await fixture(), value = Buffer.from(" \nraw\r\n "); await writeFile(f.handoffFile, value);
    expect(await readBackupDownloadInput(f.handoffFile, value.length)).toEqual(value);
  });
  it.each([0, -1, 1.5, 20481, undefined])("rejects maximum %j before filesystem access", async maximum => {
    await failure(readBackupDownloadInput("/missing/synthetic-private-sentinel", maximum), "operator_invalid_input");
  });
  it.each(["symlink", "ancestor-alias", "hardlink", "mode", "special-mode", "directory", "relative", "inside-repo", "missing"])
  ("refuses %s input", async kind => {
    const f = await fixture(); let path = f.handoffFile, code = "operator_input_unsafe";
    if (kind === "symlink") { path = join(f.root, "alias"); await symlink(f.handoffFile, path); }
    if (kind === "ancestor-alias") { const alias = `${f.root}-alias`; roots.push(alias); await symlink(f.root, alias); path = join(alias, "handoff.json"); }
    if (kind === "hardlink") await link(f.handoffFile, join(f.root, "linked"));
    if (kind === "mode") await chmod(path, 0o640);
    if (kind === "special-mode") { await chmod(path, 0o1600); expect((await lstat(path)).mode & 0o7777).toBe(0o1600); }
    if (kind === "directory") path = f.directory;
    if (kind === "relative") { path = "relative"; code = "operator_invalid_input"; }
    if (kind === "inside-repo") { path = fileURLToPath(import.meta.url); code = "operator_invalid_input"; }
    if (kind === "missing") { path = join(f.root, "synthetic-private-sentinel"); code = "operator_input_failed"; }
    await failure(readBackupDownloadInput(path, 4096), code);
  });
  it("refuses oversize metadata without reading contents", async () => {
    const f = await fixture(), prototype = await filePrototype(f); await writeFile(f.handoffFile, Buffer.alloc(4097));
    const spy = vi.spyOn(prototype, "read");
    await failure(readBackupDownloadInput(f.handoffFile, 4096), "operator_input_too_large"); expect(spy).not.toHaveBeenCalled();
  });
  it("rejects inode substitution with identical bytes after an open read", async () => {
    const f = await fixture(), prototype = await filePrototype(f), original = prototype.read;
    vi.spyOn(prototype, "read").mockImplementationOnce(async function(...args) {
      const result = await original.apply(this, args);
      await rename(f.handoffFile, `${f.handoffFile}.original`); await writeFile(f.handoffFile, bytes(), { mode: 0o600 });
      return result;
    });
    await failure(readBackupDownloadInput(f.handoffFile, 4096), "operator_input_changed");
    expect(await readFile(`${f.handoffFile}.original`)).toEqual(bytes()); expect(await readFile(f.handoffFile)).toEqual(bytes());
  });
  it("rejects changed raw bytes even if stat timestamps are unchanged", async () => {
    const f = await fixture(), prototype = await filePrototype(f), read = prototype.read, stat = prototype.stat;
    const unchanged = await lstat(f.handoffFile);
    vi.spyOn(prototype, "stat").mockImplementation(async function(...args) { await stat.apply(this, args); return unchanged; });
    let reads = 0;
    vi.spyOn(prototype, "read").mockImplementation(async function(...args) {
      const result = await read.apply(this, args);
      if (++reads === 2) await writeFile(f.handoffFile, Buffer.alloc(bytes().length, "x"));
      return result;
    });
    await failure(readBackupDownloadInput(f.handoffFile, 4096), "operator_input_changed");
  });
  it("rejects growth beyond the byte limit during reading", async () => {
    const f = await fixture(), prototype = await filePrototype(f), original = prototype.stat;
    vi.spyOn(prototype, "stat").mockImplementationOnce(async function(...args) {
      const info = await original.apply(this, args); await writeFile(f.handoffFile, Buffer.alloc(4097)); return info;
    });
    await failure(readBackupDownloadInput(f.handoffFile, 4096), "operator_input_too_large");
  });
  it("rejects an unexpected owner on the open descriptor", async () => {
    const f = await fixture(), prototype = await filePrototype(f), original = prototype.stat;
    vi.spyOn(prototype, "stat").mockImplementationOnce(async function(...args) {
      const info = await original.apply(this, args); info.uid += 1; return info;
    });
    await failure(readBackupDownloadInput(f.handoffFile, 4096), "operator_input_unsafe");
  });
  it("checks cancellation before opening and after reads, closing the descriptor", async () => {
    const f = await fixture(), controller = new AbortController(); controller.abort();
    await failure(readBackupDownloadInput("/missing", 4096, controller.signal), "operator_interrupted");
    const next = new AbortController(), prototype = await filePrototype(f), original = prototype.read; let handle;
    vi.spyOn(prototype, "read").mockImplementationOnce(async function(...args) {
      handle = this; const result = await original.apply(this, args); next.abort(); return result;
    });
    await failure(readBackupDownloadInput(f.handoffFile, 4096, next.signal), "operator_interrupted"); expect(handle.fd).toBe(-1);
  });
  it("sanitizes read and close failures", async () => {
    const f = await fixture(), prototype = await filePrototype(f), original = prototype.read;
    vi.spyOn(prototype, "read").mockImplementationOnce(async function(...args) {
      await original.apply(this, args); const close = this.close;
      this.close = async () => { await close(); throw Error("synthetic-private-sentinel"); };
      throw Error("synthetic-private-sentinel");
    });
    await failure(readBackupDownloadInput(f.handoffFile, 4096), "operator_input_failed");
  });
  it("preserves cancellation when the pending read itself rejects", async () => {
    const f = await fixture(), prototype = await filePrototype(f), controller = new AbortController(); let handle;
    vi.spyOn(prototype, "read").mockImplementationOnce(async function() {
      handle = this; controller.abort(); throw Error("synthetic-private-sentinel");
    });
    await failure(readBackupDownloadInput(f.handoffFile, 4096, controller.signal), "operator_interrupted"); expect(handle.fd).toBe(-1);
  });
  it("refuses a FIFO without waiting for a writer", async () => {
    const f = await fixture(), path = join(f.root, "fifo");
    await promisify(execFile)("/usr/bin/mkfifo", [path]); await chmod(path, 0o600);
    let escaped = false, escape;
    const timer = setTimeout(() => { escaped = true; escape = open(path, constants.O_RDWR | constants.O_NONBLOCK); }, 1500);
    try { await failure(readBackupDownloadInput(path, 4096), "operator_input_unsafe"); expect(escaped).toBe(false); }
    finally { clearTimeout(timer); if (escape) await (await escape).close(); }
  });
});

describe.skipIf(process.platform === "win32")("anchored preparation and destination binding", () => {
  it.each([null, false, "synthetic-private-sentinel", []])("sanitizes malformed preparation arguments %j", async input => {
    await failure(prepareBackupDownload(input), "operator_invalid_input");
    await failure(verifyBackupDownloadDestination(input), "operator_invalid_input");
  });
  it("verifies the exact canonical handoff and returns an empty destination identity without writes", async () => {
    const f = await fixture(), before = await lstat(f.directory), result = await f.prepare();
    expect(result.record).toEqual(record()); expect(result.plan).toEqual(validateBackupDownloadPlan(f.value));
    expect(result.destinationIdentity).toEqual({ dev: before.dev, ino: before.ino });
    expect(await readdir(f.directory)).toEqual([]); expect(await readdir(f.root)).toEqual(["destination", "handoff.json", "plan.json"]);
    expect(await readFile(f.handoffFile)).toEqual(bytes());
  });
  it("refuses a disabled plan before missing handoff or destination reads", async () => {
    const f = await fixture(); f.value.enabled = false; f.value.destination.directory = "/missing"; await f.save();
    await failure(prepareBackupDownload({ planFile: f.planFile, handoffFile: "/missing" }), "operator_disabled");
  });
  it("bounds plan bytes separately", async () => {
    const f = await fixture(); await writeFile(f.planFile, " ".repeat(16385));
    await failure(f.prepare(), "operator_input_too_large");
  });
  it.each(["hash", "length", "UUID", "instance", "producer", "extra", "wrong-version", "invalid-recovery", "invalid-producer", "missing-newline", "extra-newline", "reordered", "pretty", "invalid-json", "duplicate-field", "invalid-UTF8"])
  ("refuses %s handoff", async kind => {
    const f = await fixture(), value = record(); let raw = bytes();
    if (kind === "hash") f.value.handoff.sha256 = "f".repeat(64);
    if (kind === "length") f.value.handoff.bytes += 1;
    if (kind === "UUID") f.value.handoff.id = "44444444-4444-4444-8444-444444444444";
    if (kind === "instance") f.value.handoff.instance = "other";
    if (kind === "producer") f.value.handoff.producer.runId = "2";
    if (kind === "extra") { value.secret = "synthetic-private-sentinel"; raw = Buffer.from(JSON.stringify(value) + "\n"); }
    if (kind === "wrong-version") { value.version = 2; raw = Buffer.from(JSON.stringify(value) + "\n"); }
    if (kind === "invalid-recovery") { value.recovery.expected.receiptBytes = 0; raw = Buffer.from(JSON.stringify(value) + "\n"); }
    if (kind === "invalid-producer") { value.producer.sourceCommit = "0".repeat(40); raw = Buffer.from(JSON.stringify(value) + "\n"); }
    if (kind === "missing-newline") raw = Buffer.from(JSON.stringify(value));
    if (kind === "extra-newline") raw = Buffer.concat([raw, Buffer.from("\n")]);
    if (kind === "reordered") raw = Buffer.from(JSON.stringify({ recovery: value.recovery, version: 1, producer: value.producer }) + "\n");
    if (kind === "pretty") raw = Buffer.from(JSON.stringify(value, null, 2) + "\n");
    if (kind === "invalid-json") raw = Buffer.from("{synthetic-private-sentinel");
    if (kind === "duplicate-field") raw = Buffer.from(bytes().toString().replace('{"version":1,', '{"version":1,"version":1,'));
    if (kind === "invalid-UTF8") raw = Buffer.concat([Buffer.from([0xff]), raw]);
    if (!["hash", "length", "UUID", "instance", "producer"].includes(kind)) {
      f.value.handoff.sha256 = sha256(raw); f.value.handoff.bytes = raw.length;
    }
    await writeFile(f.handoffFile, raw); await f.save();
    await failure(f.prepare(), "operator_handoff_mismatch"); expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["missing", "relative", "symlink", "alias-parent", "permissive", "special-mode", "file", "inside-repo", "nonempty", "contains-input"])
  ("refuses %s destination", async kind => {
    const f = await fixture(); let code = "operator_destination_required";
    if (kind === "missing") f.value.destination.directory = join(f.root, "missing");
    if (kind === "relative") { f.value.destination.directory = "relative"; code = "operator_invalid_plan"; }
    if (kind === "symlink") { const alias = join(f.root, "alias"); await symlink(f.directory, alias); f.value.destination.directory = alias; }
    if (kind === "alias-parent") { const alias = `${f.root}-alias`; roots.push(alias); await symlink(f.root, alias); f.value.destination.directory = join(alias, "destination"); }
    if (kind === "permissive") await chmod(f.directory, 0o755);
    if (kind === "special-mode") await chmod(f.directory, 0o1700);
    if (kind === "file") f.value.destination.directory = f.handoffFile;
    if (kind === "inside-repo") f.value.destination.directory = dirname(fileURLToPath(import.meta.url));
    if (kind === "nonempty") { await writeFile(join(f.directory, "preserve"), "owner-content"); code = "operator_destination_not_empty"; }
    if (kind === "contains-input") f.value.destination.directory = f.root;
    await f.save(); await failure(f.prepare(), code);
  });
  it("refuses an inode replacement on later verification", async () => {
    const f = await fixture(), { destinationIdentity } = await f.prepare();
    await rename(f.directory, `${f.directory}.original`); await mkdir(f.directory, { mode: 0o700 });
    await failure(verifyBackupDownloadDestination({ directory: f.directory, identity: destinationIdentity }), "operator_destination_changed");
    expect(await readdir(f.directory)).toEqual([]); expect(await readdir(`${f.directory}.original`)).toEqual([]);
  });
  it("refuses a directory replaced while its descriptor is held", async () => {
    const f = await fixture(), prototype = await filePrototype(f), original = prototype.stat;
    vi.spyOn(prototype, "stat").mockImplementationOnce(async function(...args) {
      const result = await original.apply(this, args);
      await rename(f.directory, `${f.directory}.original`); await mkdir(f.directory, { mode: 0o700 }); return result;
    });
    await failure(verifyBackupDownloadDestination({ directory: f.directory }), "operator_destination_changed");
  });
  it("refuses an unexpected directory owner on its held descriptor", async () => {
    const f = await fixture(), prototype = await filePrototype(f), original = prototype.stat;
    vi.spyOn(prototype, "stat").mockImplementationOnce(async function(...args) {
      const info = await original.apply(this, args); info.uid += 1; return info;
    });
    await failure(verifyBackupDownloadDestination({ directory: f.directory }), "operator_destination_changed");
  });
  it("rechecks cancellation and closes an opened directory descriptor", async () => {
    const f = await fixture(), prototype = await filePrototype(f), original = prototype.stat, controller = new AbortController(); let handle;
    vi.spyOn(prototype, "stat").mockImplementationOnce(async function(...args) {
      handle = this; const result = await original.apply(this, args); controller.abort(); return result;
    });
    await failure(verifyBackupDownloadDestination({ directory: f.directory, signal: controller.signal }), "operator_interrupted");
    expect(handle.fd).toBe(-1);
  });
});

describe.skipIf(process.platform === "win32")("private static Get-only credential inputs", () => {
  it("returns only the exact static pair", async () => {
    const f = await fixture(), value = { accessKeyId: "synthetic-key", secretAccessKey: "synthetic-private-sentinel" };
    await writeFile(f.handoffFile, JSON.stringify(value)); expect(await readBackupDownloadCredentials(f.handoffFile)).toEqual(value);
  });
  it.each([
    ["missing field", value => { delete value.secretAccessKey; }],
    ["session token", value => { value.sessionToken = "synthetic-private-sentinel"; }],
    ["extra key", value => { value.region = "auto"; }],
    ["empty string", value => { value.secretAccessKey = ""; }],
    ["number", value => { value.accessKeyId = 1; }],
    ["long key", value => { value.accessKeyId = "x".repeat(8193); }],
    ["long secret", value => { value.secretAccessKey = "x".repeat(8193); }],
    ["UTF8 byte length", value => { value.secretAccessKey = "é".repeat(4097); }],
    ["space", value => { value.secretAccessKey = " secret"; }],
    ["tab", value => { value.secretAccessKey = "secret\t"; }],
    ["newline", value => { value.secretAccessKey = "secret\n"; }],
    ["NUL", value => { value.secretAccessKey = "secret\0"; }],
    ["DEL", value => { value.secretAccessKey = "secret\x7f"; }],
    ["unicode whitespace", value => { value.secretAccessKey = "secret\u00a0"; }],
  ])("rejects %s without revealing values", async (_name, mutate) => {
    const f = await fixture(), value = { accessKeyId: "synthetic-key", secretAccessKey: "synthetic-private-sentinel" }; mutate(value);
    await writeFile(f.handoffFile, JSON.stringify(value)); await failure(readBackupDownloadCredentials(f.handoffFile), "operator_credentials_invalid");
  });
  it("enforces the separate credential file byte limit", async () => {
    const f = await fixture(); await writeFile(f.handoffFile, Buffer.alloc(20481));
    await failure(readBackupDownloadCredentials(f.handoffFile), "operator_input_too_large");
  });
  it("rejects invalid UTF8 even inside a JSON string", async () => {
    const f = await fixture();
    await writeFile(f.handoffFile, Buffer.concat([Buffer.from('{"accessKeyId":"key","secretAccessKey":"'), Buffer.from([0xff]), Buffer.from('"}')]));
    await failure(readBackupDownloadCredentials(f.handoffFile), "operator_credentials_invalid");
  });
});
