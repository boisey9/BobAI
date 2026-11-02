import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyArtifactCustody, createArtifactDownloadPlan } from "../scripts/lib/backup-artifact-custody.mjs";
import { prepareBackupDownload } from "../scripts/lib/backup-download-input.mjs";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { RestoreOperationError } from "../scripts/lib/backup-restore-operation.mjs";
import { sha256 } from "../scripts/lib/backup.mjs";

const execute = promisify(execFile), roots = [];
const secret = "synthetic-private-sentinel", token = "synthetic-github-token";
const nativeIdentity = "AGE-SECRET-KEY-1" + "Q".repeat(58) + "\n";
const recipient = "age1" + "q".repeat(58);
const backupId = "33333333-3333-4333-8333-333333333333";
const storage = { endpoint: "https://fixture.invalid", bucket: "testing-fixture", region: "auto" };
const review = { reviewedAt: "2026-11-01T18:10:00.000Z", storageAccountId: "owner.testing-1" };
const producer = { repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
  workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main",
  runId: "123456", runAttempt: "2", image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) };
const baseApproval = () => ({ version: 1,
  repository: { fullName: "boisey9/BobAI", id: "1310270513", owner: { login: "boisey9", id: "6569974" } },
  producer: structuredClone(producer), workflowId: "6789",
  actor: { login: "boisey9", id: "6569974" }, triggeringActor: { login: "boisey9", id: "6569974" },
  job: { id: "9876", name: "backup-testing", captureStep: "Capture synthetic backup", uploadStep: "Upload encrypted handoff" },
  artifactId: "7654", recipient, instance: "testing-fixture", storageHosts: ["fixture.blob.core.windows.net"] });
const handoffRecord = publicRecipient => ({ version: 1, recovery: { version: 1, expected: {
  id: backupId, instance: "testing-fixture", startedAt: "2026-11-01T18:02:00.000Z",
  recipientFingerprint: sha256(publicRecipient), receiptSha256: sha256("synthetic backup receipt"),
  receiptBytes: 700, manifestBytes: 1200 } }, producer: structuredClone(producer) });
const encode = record => Buffer.from(JSON.stringify(record) + "\n");

// A canonical one-entry stored ZIP fixture. It never accesses an archive tool
// or filesystem path, and its CRC/digests are recomputed for tamper scenarios.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function archiveOf(bytes) {
  const name = Buffer.from("recovery.json.age"), crc = crc32(bytes);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20);
  central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE((0o100600 << 16) >>> 0, 38);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}

function networkFixture(approval, archive) {
  const api = "https://api.github.com/repos/boisey9/BobAI", run = `${api}/actions/runs/123456`;
  const owner = { login: "boisey9", id: 6569974, type: "User" };
  const repository = { id: 1310270513, full_name: "boisey9/BobAI", name: "BobAI", owner, private: false };
  const runRecord = { id: 123456, run_attempt: 2, workflow_id: 6789, path: ".github/workflows/backups-testing.yml",
    repository, head_repository: repository, head_sha: producer.sourceCommit, head_branch: "main", event: "workflow_dispatch",
    actor: owner, triggering_actor: owner, status: "completed", conclusion: "success", pull_requests: [],
    created_at: "2026-11-01T17:00:00Z", run_started_at: "2026-11-01T18:00:00Z", updated_at: "2026-11-01T18:05:00Z" };
  const job = { id: 9876, name: approval.job.name, run_id: 123456, run_attempt: 2, run_url: run,
    head_sha: producer.sourceCommit, head_branch: "main", status: "completed", conclusion: "success",
    started_at: "2026-11-01T18:00:00Z", completed_at: "2026-11-01T18:05:00Z", steps: [
      { number: 1, name: approval.job.captureStep, status: "completed", conclusion: "success",
        started_at: "2026-11-01T18:01:00Z", completed_at: "2026-11-01T18:03:00Z" },
      { number: 2, name: approval.job.uploadStep, status: "completed", conclusion: "success",
        started_at: "2026-11-01T18:04:00Z", completed_at: "2026-11-01T18:04:40Z" },
    ] };
  const artifact = { id: 7654, name: "bob-recovery-handoff-r123456-a2", size_in_bytes: archive.length,
    expired: false, created_at: "2026-11-01T18:04:10Z", updated_at: "2026-11-01T18:04:20Z", expires_at: "2026-11-05T18:04:10Z",
    digest: `sha256:${sha256(archive)}`, url: `${api}/actions/artifacts/7654`,
    archive_download_url: `${api}/actions/artifacts/7654/zip`, workflow_run: { id: 123456, repository_id: 1310270513,
      head_repository_id: 1310270513, head_branch: "main", head_sha: producer.sourceCommit } };
  const records = new Map([[api, repository], [`${run}/attempts/2`, runRecord],
    [`${run}/attempts/2/jobs?per_page=100`, { total_count: 1, jobs: [job] }],
    [`${run}/artifacts?per_page=100`, { total_count: 1, artifacts: [artifact] }], [`${api}/actions/artifacts/7654`, artifact]]);
  const download = "https://fixture.blob.core.windows.net/artifact.zip?sig=synthetic-private-sentinel";
  const fetch = vi.fn(async (url, options) => {
    const value = String(url);
    if (records.has(value)) return new Response(JSON.stringify(records.get(value)), { status: 200,
      headers: { "content-type": "application/json" } });
    if (value === `${api}/actions/artifacts/7654/zip`) return new Response(null, { status: 302, headers: { location: download } });
    if (value === download) return new Response(archive, { status: 200, headers: { "content-length": String(archive.length) } });
    throw Error(`Unexpected synthetic path: ${value}; ${secret}`);
  });
  return { fetch, records, repository, runRecord, job, artifact, download };
}

async function fixture({ actualAge = false } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-artifact-custody-test-"))); roots.push(root);
  const directory = join(root, "custody"), identityFile = join(root, "identity.txt"), destination = join(root, "download");
  await mkdir(directory, { mode: 0o700 }); await mkdir(destination, { mode: 0o700 });
  const approval = baseApproval();
  if (actualAge) {
    await execute("/usr/local/bin/age-keygen", ["--output", identityFile]); await chmod(identityFile, 0o600);
    const generated = await execute("/usr/local/bin/age-keygen", ["--y", identityFile]); approval.recipient = generated.stdout.trim();
  } else await writeFile(identityFile, nativeIdentity, { mode: 0o600 });
  const record = handoffRecord(approval.recipient); let plaintext = encode(record);
  let ciphertext = Buffer.from("age-encryption.org/v1\nsynthetic encrypted payload\n");
  if (actualAge) {
    const plain = join(root, "synthetic-source.json"), encrypted = join(root, "synthetic-source.age");
    await writeFile(plain, plaintext, { mode: 0o600 });
    await execute("/usr/local/bin/age", ["--encrypt", "--recipient", approval.recipient, "--output", encrypted, plain]);
    ciphertext = await readFile(encrypted); await rm(plain); await rm(encrypted);
  }
  const archive = archiveOf(ciphertext), network = networkFixture(approval, archive);
  const now = vi.fn(() => new Date("2026-11-01T18:10:00.000Z"));
  const runCommand = vi.fn(async (command, args, env, label, timeout, signal) => {
    expect(command).toBe("/usr/local/bin/age");
    expect(args).toEqual(["--decrypt", "--identity", identityFile, "--output", join(directory, "recovery.json"), join(directory, "recovery.json.age")]);
    expect(timeout).toBe(60000);
    expect(Object.keys(env).every(key => ["PATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "WINDIR"].includes(key))).toBe(true);
    expect(await readFile(args.at(-1))).toEqual(ciphertext);
    expect((await lstat(args.at(-1))).mode & 0o7777).toBe(0o600);
    await writeFile(join(directory, "recovery.json"), plaintext, { mode: 0o600 });
  });
  const options = { enabled: true, approval, directory, identityFile, token };
  const deps = { fetch: network.fetch, now, ...(actualAge ? {} : { runCommand }) };
  const verify = (changes = {}, dependencyChanges = {}) => verifyArtifactCustody({ ...options, ...changes }, { ...deps, ...dependencyChanges });
  return { root, directory, identityFile, destination, approval, record, ciphertext, archive, network, now, runCommand, options, deps, verify,
    setPlaintext: value => { plaintext = Buffer.from(value); },
    plan: (verified, changes = {}) => createArtifactDownloadPlan({ verified, storage, review,
      destination: { directory: destination }, ...changes }) };
}

async function refuse(promise, excluded = []) {
  const error = await promise.then(() => undefined, error => error);
  expect(error).toBeInstanceOf(BackupCoverageError); expect(error.code).toMatch(/^artifact_[a-z_]+$/);
  expect(error.cause).toBeUndefined();
  for (const value of [secret, token, nativeIdentity.trim(), ...excluded]) {
    expect(String(error)).not.toContain(value); expect(JSON.stringify(error)).not.toContain(value);
  }
  return error;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("artifact custody opt-in and private inputs", () => {
  it.each([undefined, false, "true", 1])("refuses enabled=%j before fetch or decryption", async enabled => {
    const fetch = vi.fn(), runCommand = vi.fn();
    await refuse(verifyArtifactCustody({ enabled, directory: "/missing/private", identityFile: "/missing/private" }, { fetch, runCommand }));
    expect(fetch).not.toHaveBeenCalled(); expect(runCommand).not.toHaveBeenCalled();
  });
  it("has no ambient fetch transport or credential discovery", async () => {
    const f = await fixture();
    const ambient = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw Error(secret); });
    await refuse(verifyArtifactCustody(f.options, { runCommand: f.runCommand, now: f.now }), [f.root]);
    expect(ambient).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each([
    ["directory permissions", async f => chmod(f.directory, 0o755)],
    ["nonempty directory", async f => writeFile(join(f.directory, "existing"), secret, { mode: 0o600 })],
    ["missing directory", async f => rm(f.directory, { recursive: true })],
    ["symlink directory", async f => { await rename(f.directory, `${f.directory}-real`); await symlink(`${f.directory}-real`, f.directory); }],
    ["key permissions", async f => chmod(f.identityFile, 0o644)],
    ["key symlink", async f => { await rename(f.identityFile, `${f.identityFile}-real`); await symlink(`${f.identityFile}-real`, f.identityFile); }],
    ["key hardlink", async f => link(f.identityFile, join(f.root, "identity-copy"))],
    ["oversized key", async f => writeFile(f.identityFile, "Q".repeat(4097))],
    ["plugin identity", async f => writeFile(f.identityFile, "AGE-PLUGIN-SYNTHETIC-1SECRET\n")],
    ["multiple identities", async f => writeFile(f.identityFile, nativeIdentity.repeat(2))],
    ["key in output", async f => { await rename(f.identityFile, join(f.directory, "identity")); f.options.identityFile = join(f.directory, "identity"); }],
  ])("refuses %s before API access", async (_label, mutate) => {
    const f = await fixture(); await mutate(f);
    await refuse(f.verify(), [f.root]); expect(f.network.fetch).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it("refuses an already aborted operation without effects", async () => {
    const f = await fixture(), control = new AbortController(); control.abort(secret);
    await refuse(f.verify({ signal: control.signal }), [f.root]);
    expect(f.network.fetch).not.toHaveBeenCalled(); expect(await readdir(f.directory)).toEqual([]);
  });
  it.each([
    ["allowed code with sensitive fields", () => Object.assign(new BackupCoverageError("artifact_invalid_input"), {
      message: secret, details: secret, cause: secret, state: { secret },
    })],
    ["throwing code getter", () => Object.defineProperty(new BackupCoverageError("artifact_invalid_input"), "code", {
      get() { throw Error(secret); },
    })],
    ["hostile exception proxy", () => new Proxy(new BackupCoverageError("artifact_invalid_input"), {
      get() { throw Error(secret); }, getPrototypeOf() { throw Error(secret); },
    })],
  ])("sanitizes a clock exception with %s", async (_label, makeError) => {
    const f = await fixture(); f.now.mockImplementation(() => { throw makeError(); });
    const error = await refuse(f.verify(), [f.root]);
    expect(error.message).toBe(`backup_coverage_${error.code}`);
    expect(Object.keys(error).sort()).toEqual(["code", "name"]);
    expect(f.network.fetch).not.toHaveBeenCalled(); expect(await readdir(f.directory)).toEqual([]);
  });
});

describe("bounded handoff acceptance and private receipt", () => {
  it("writes private exact artifacts and a private receipt with distinct digest meanings", async () => {
    const f = await fixture(), verified = await f.verify();
    expect(Object.isFrozen(verified)).toBe(true); expect(Object.isFrozen(verified.receipt)).toBe(true);
    expect(verified.handoffFile).toBe(join(f.directory, "recovery.json"));
    expect(verified.ciphertextFile).toBe(join(f.directory, "recovery.json.age"));
    expect(verified.receiptFile).toBe(join(f.directory, "custody-receipt.json"));
    expect(await readFile(verified.handoffFile)).toEqual(encode(f.record));
    expect(await readFile(verified.ciphertextFile)).toEqual(f.ciphertext);
    expect(await readFile(verified.receiptFile, "utf8")).toBe(JSON.stringify(verified.receipt) + "\n");
    const receiptText = JSON.stringify(verified.receipt);
    for (const digest of [sha256(f.archive), sha256(f.ciphertext), sha256(encode(f.record))]) expect(receiptText).toContain(digest);
    for (const bad of [secret, token, nativeIdentity.trim(), f.root, "fixture.blob.core.windows.net"]) expect(receiptText).not.toContain(bad);
    expect(receiptText).toContain(producer.image); expect(receiptText).toContain(backupId);
    for (const path of [verified.handoffFile, verified.ciphertextFile, verified.receiptFile]) {
      const info = await lstat(path); expect(info.mode & 0o7777).toBe(0o600); expect(info.nlink).toBe(1);
    }
    expect((await lstat(f.directory)).mode & 0o7777).toBe(0o700);
    expect(f.runCommand).toHaveBeenCalledTimes(1);
    for (const [url, request] of f.network.fetch.mock.calls) {
      expect(request.method).toBe("GET"); expect(request.redirect).toBe("manual");
      expect(request.credentials).toBe("omit"); expect(request.headers["Accept-Encoding"]).toBe("identity");
      if (String(url).startsWith("https://api.github.com/")) expect(request.headers.Authorization).toBe(`Bearer ${token}`);
      else expect(request.headers).toEqual({ Accept: "application/octet-stream", "Accept-Encoding": "identity" });
    }
  });
  it("records decrypted handoff readback separately from earlier archive verification", async () => {
    const f = await fixture(), original = f.runCommand.getMockImplementation();
    f.runCommand.mockImplementation(async (...args) => {
      await original(...args); f.now.mockReturnValue(new Date("2026-11-01T18:11:00.000Z"));
    });
    const verified = await f.verify();
    expect(verified.receipt.evidence.verifiedAt).toBe("2026-11-01T18:10:00.000Z");
    expect(verified.receipt.readbackAt).toBe("2026-11-01T18:11:00.000Z");
    expect(JSON.parse(await readFile(verified.receiptFile, "utf8")).readbackAt).toBe(verified.receipt.readbackAt);
  });
  it("refuses a clock rollback between archive verification and decrypted readback", async () => {
    const f = await fixture(), original = f.runCommand.getMockImplementation();
    f.runCommand.mockImplementation(async (...args) => {
      await original(...args);
      // The clock recovers for later checks: the explicit readback-vs-archive
      // ordering gate must still refuse this evidence rather than hide it.
      f.now.mockReturnValueOnce(new Date("2026-11-01T18:09:59.999Z"))
        .mockReturnValue(new Date("2026-11-01T18:11:00.000Z"));
    });
    await refuse(f.verify(), [f.root]); expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
  });
  it.each([
    ["wrong repository", r => { r.producer.repository = "unapproved/BobAI"; }],
    ["wrong source", r => { r.producer.sourceCommit = "c".repeat(40); }],
    ["wrong run", r => { r.producer.runId = "123457"; }],
    ["wrong attempt", r => { r.producer.runAttempt = "3"; }],
    ["wrong image", r => { r.producer.image = "ghcr.io/boisey9/bob-backup-runner@sha256:" + "c".repeat(64); }],
    ["wrong instance", r => { r.recovery.expected.instance = "production"; }],
    ["wrong recipient", r => { r.recovery.expected.recipientFingerprint = "f".repeat(64); }],
    ["extra authority", r => { r.ownerApproved = true; }],
    ["wrong version", r => { r.version = 2; }],
    ["invalid backup UUID", r => { r.recovery.expected.id = "../../escape"; }],
    ["unbounded receipt", r => { r.recovery.expected.receiptBytes = Number.MAX_SAFE_INTEGER; }],
    ["capture predating job", r => { r.recovery.expected.startedAt = "2026-11-01T17:59:59.999Z"; }],
    ["capture after artifact", r => { r.recovery.expected.startedAt = "2026-11-01T18:04:10.001Z"; }],
    ["zero receipt anchor", r => { r.recovery.expected.receiptSha256 = "0".repeat(64); }],
  ])("refuses decrypted %s without accepting receipt", async (_label, mutate) => {
    const f = await fixture(); mutate(f.record); f.setPlaintext(encode(f.record));
    await refuse(f.verify(), [f.root]); expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
    expect(f.runCommand).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["missing newline", bytes => bytes.subarray(0, bytes.length - 1)],
    ["extra newline", bytes => Buffer.concat([bytes, Buffer.from("\n")])],
    ["leading whitespace", bytes => Buffer.concat([Buffer.from(" "), bytes])],
    ["invalid UTF-8", () => Buffer.from([0xff])],
    ["JSON primitive", () => Buffer.from("null\n")],
    ["over 4 KiB", () => Buffer.alloc(4097, 65)],
    ["empty plaintext", () => Buffer.alloc(0)],
  ])("refuses %s rather than normalizing custody anchors", async (_label, mutate) => {
    const f = await fixture(); f.setPlaintext(mutate(encode(f.record)));
    await refuse(f.verify(), [f.root]); expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
  });
  it("refuses invalid API evidence before writing files or invoking age", async () => {
    const f = await fixture(); f.network.runRecord.conclusion = "failure";
    await refuse(f.verify(), [f.root]); expect(f.runCommand).not.toHaveBeenCalled(); expect(await readdir(f.directory)).toEqual([]);
  });
  it("refuses archive digest mismatch before decryption", async () => {
    const f = await fixture(); f.network.artifact.digest = "sha256:" + "f".repeat(64);
    await refuse(f.verify(), [f.root]); expect(f.runCommand).not.toHaveBeenCalled(); expect(await readdir(f.directory)).toEqual([]);
  });
  it("sanitizes a settled decryption failure and preserves exact ciphertext", async () => {
    const f = await fixture(); f.runCommand.mockRejectedValue(new RestoreOperationError("restore_command_failed"));
    await refuse(f.verify(), [f.root]); expect(await readFile(join(f.directory, "recovery.json.age"))).toEqual(f.ciphertext);
    expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
  });
  it("preserves uncertain outputs and marks unconfirmed child shutdown", async () => {
    const f = await fixture(); f.runCommand.mockImplementation(async () => {
      await writeFile(join(f.directory, "recovery.json"), secret, { mode: 0o600 }); throw Error(secret);
    });
    const error = await refuse(f.verify(), [f.root]);
    expect(error.state?.commandUnsettled || error.state?.cleanupUncertain).toBe(true);
    expect(await readFile(join(f.directory, "recovery.json"), "utf8")).toBe(secret);
    expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
  });
  it.each([
    ["throwing state getter", () => Object.defineProperty(new RestoreOperationError("restore_command_failed"), "state", {
      get() { throw Error(secret); },
    })],
    ["hostile command exception proxy", () => new Proxy(new RestoreOperationError("restore_command_failed"), {
      get() { throw Error(secret); }, getPrototypeOf() { throw Error(secret); },
    })],
  ])("preserves uncertain command output after %s without leaking exception details", async (_label, makeError) => {
    const f = await fixture(); f.runCommand.mockImplementation(async () => {
      await writeFile(join(f.directory, "recovery.json"), secret, { mode: 0o600 }); throw makeError();
    });
    const error = await refuse(f.verify(), [f.root]);
    expect(error.state?.cleanupUncertain).toBe(true);
    expect(error.message).toBe(`backup_coverage_${error.code}`);
    expect(await readFile(join(f.directory, "recovery.json"), "utf8")).toBe(secret);
    expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
  });
  it("refuses a replaced key after command completion", async () => {
    const f = await fixture(), original = f.runCommand.getMockImplementation();
    f.runCommand.mockImplementation(async (...args) => { await original(...args); await writeFile(f.identityFile, "AGE-SECRET-KEY-1" + "R".repeat(58) + "\n"); });
    await refuse(f.verify(), [f.root]); expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
  });
  it("refuses symlink plaintext without following or deleting the target", async () => {
    const f = await fixture(), target = join(f.root, "do-not-touch"); await writeFile(target, encode(f.record), { mode: 0o600 });
    f.runCommand.mockImplementation(async () => symlink(target, join(f.directory, "recovery.json")));
    await refuse(f.verify(), [f.root]); expect(await readFile(target)).toEqual(encode(f.record));
    expect((await lstat(join(f.directory, "recovery.json"))).isSymbolicLink()).toBe(true);
  });
  it("refuses hardlinked plaintext", async () => {
    const f = await fixture(), target = join(f.root, "do-not-touch"); await writeFile(target, encode(f.record), { mode: 0o600 });
    f.runCommand.mockImplementation(async () => link(target, join(f.directory, "recovery.json")));
    await refuse(f.verify(), [f.root]); expect(await readFile(target)).toEqual(encode(f.record));
  });
  it("does not retry a completed directory after lost acknowledgement", async () => {
    const f = await fixture(), verified = await f.verify(), receipt = await readFile(verified.receiptFile);
    f.network.fetch.mockClear(); f.runCommand.mockClear();
    await refuse(f.verify(), [f.root]); expect(f.network.fetch).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
    expect(await readFile(verified.receiptFile)).toEqual(receipt);
  });
  it("cannot accept evidence whose expiry elapsed during decryption", async () => {
    const f = await fixture(), original = f.runCommand.getMockImplementation();
    f.runCommand.mockImplementation(async (...args) => { await original(...args); f.now.mockReturnValue(new Date("2026-11-06T00:00:00.000Z")); });
    await refuse(f.verify(), [f.root]); expect(await readdir(f.directory)).not.toContain("custody-receipt.json");
  });
});

describe("accepted custody to existing private download plan", () => {
  it("binds exact handoff anchors and validates through the existing no-effect operator", async () => {
    const f = await fixture(), verified = await f.verify();
    const result = await f.plan(verified);
    expect(result.handoffFile).toBe(verified.handoffFile); expect(result.planFile).toBe(join(f.directory, "download-plan.json"));
    expect(result.plan.handoff).toEqual({ sha256: sha256(encode(f.record)), bytes: encode(f.record).length,
      id: backupId, instance: "testing-fixture", producer });
    expect(result.plan.review).toEqual({ ...review, custodyReference: "github-artifact:7654" });
    expect((await lstat(result.planFile)).mode & 0o7777).toBe(0o600);
    const checked = await prepareBackupDownload({ planFile: result.planFile, handoffFile: result.handoffFile });
    expect(checked.record).toEqual(f.record); expect(checked.plan).toEqual(result.plan);
    expect(await readdir(f.destination)).toEqual([]);
    expect(f.network.fetch.mock.calls.every(([url]) => !String(url).includes("fixture.invalid"))).toBe(true);
  });
  it("rejects a forged result even with identical private receipt fields", async () => {
    const f = await fixture(), verified = await f.verify();
    await refuse(f.plan({ ...verified }), [f.root]); expect(await readdir(f.directory)).not.toContain("download-plan.json");
  });
  it.each(["receiptFile", "handoffFile", "ciphertextFile"])("refuses changed %s before creating a plan", async name => {
    const f = await fixture(), verified = await f.verify(); await writeFile(verified[name], secret);
    await refuse(f.plan(verified), [f.root]); expect(await readdir(f.directory)).not.toContain("download-plan.json");
    expect(await readdir(f.destination)).toEqual([]);
  });
  it.each(["receiptFile", "handoffFile", "ciphertextFile"])("refuses replaced inode for %s even with identical bytes", async name => {
    const f = await fixture(), verified = await f.verify(), bytes = await readFile(verified[name]);
    await rename(verified[name], `${verified[name]}.old`); await writeFile(verified[name], bytes, { mode: 0o600 });
    await refuse(f.plan(verified), [f.root]); expect(await readdir(f.directory)).not.toContain("download-plan.json");
  });
  it("refuses expiry between readback and plan generation", async () => {
    const f = await fixture(), verified = await f.verify(); f.now.mockReturnValue(new Date("2026-11-06T00:00:00.000Z"));
    await refuse(f.plan(verified), [f.root]); expect(await readdir(f.directory)).not.toContain("download-plan.json");
  });
  it("refuses a clock rollback behind the accepted handoff readback", async () => {
    const f = await fixture(), original = f.runCommand.getMockImplementation();
    f.runCommand.mockImplementation(async (...args) => {
      await original(...args); f.now.mockReturnValue(new Date("2026-11-01T18:11:00.000Z"));
    });
    const verified = await f.verify(); f.now.mockReturnValue(new Date("2026-11-01T18:10:30.000Z"));
    await refuse(f.plan(verified), [f.root]); expect(await readdir(f.directory)).not.toContain("download-plan.json");
  });
  it("preserves an existing plan instead of overwriting on retry", async () => {
    const f = await fixture(), verified = await f.verify(), result = await f.plan(verified), previous = await readFile(result.planFile);
    await refuse(f.plan(verified), [f.root]); expect(await readFile(result.planFile)).toEqual(previous);
  });
  it("commits only one plan when consumers race the same accepted handle", async () => {
    const f = await fixture(), verified = await f.verify();
    const results = await Promise.allSettled([f.plan(verified), f.plan(verified)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected.reason).toBeInstanceOf(BackupCoverageError);
    const accepted = results.find(result => result.status === "fulfilled").value;
    expect(JSON.parse(await readFile(accepted.planFile, "utf8"))).toEqual(accepted.plan);
    expect(await readdir(f.destination)).toEqual([]);
  });
  it("rejects a nonempty download destination without contacting its storage", async () => {
    const f = await fixture(), verified = await f.verify(); await writeFile(join(f.destination, "existing"), secret, { mode: 0o600 });
    await refuse(f.plan(verified), [f.root]); expect(await readFile(join(f.destination, "existing"), "utf8")).toBe(secret);
  });
  it("refuses a caller-supplied custody reference or credentials in review", async () => {
    const f = await fixture(), verified = await f.verify();
    await refuse(f.plan(verified, { review: { ...review, custodyReference: "forged", secretAccessKey: secret } }), [f.root]);
    expect(await readdir(f.directory)).not.toContain("download-plan.json");
  });
  it("refuses cancellation before plan effects", async () => {
    const f = await fixture(), verified = await f.verify(), controller = new AbortController(); controller.abort(secret);
    await refuse(f.plan(verified, { signal: controller.signal }), [f.root]);
    expect(await readdir(f.directory)).not.toContain("download-plan.json");
  });
});

it.skipIf(!existsSync("/usr/local/bin/age") || !existsSync("/usr/local/bin/age-keygen"))(
  "accepts a real disposable-age roundtrip through synthetic GitHub custody and existing operator preparation", async () => {
    const f = await fixture({ actualAge: true }), verified = await f.verify(), result = await f.plan(verified);
    const checked = await prepareBackupDownload({ planFile: result.planFile, handoffFile: result.handoffFile });
    expect(checked.record).toEqual(f.record); expect(await readFile(verified.handoffFile)).toEqual(encode(f.record));
    expect(await readFile(verified.ciphertextFile)).toEqual(f.ciphertext);
    expect(checked.plan.review.custodyReference).toBe("github-artifact:7654");
    expect(await readdir(f.destination)).toEqual([]);
  });
