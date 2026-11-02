import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { runBackupDownloadOperator } from "../scripts/lib/backup-download-operator.mjs";
import { createBackupDownloadStorage } from "../scripts/lib/backup-storage.mjs";
import { prepareBackupDownload, readBackupDownloadCredentials } from "../scripts/lib/backup-download-input.mjs";
import { writeBackupWorkflowOutcome } from "../scripts/lib/backup-workflow.mjs";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { objectKeys, sha256 } from "../scripts/lib/backup.mjs";

const roots = [];
const id = "33333333-3333-4333-8333-333333333333", instance = "testing-fixture";
const startedAt = "2026-11-01T18:00:00.000Z", secret = "synthetic-private-sentinel";
const producer = { repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
  workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main", runId: "123", runAttempt: "1",
  image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) };
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-download-operator-test-"))); roots.push(root);
  const directory = join(root, "destination"); await mkdir(directory, { mode: 0o700 });
  const archive = Buffer.from("synthetic ciphertext archive"), manifest = Buffer.from("synthetic ciphertext manifest");
  const receipt = { version: 2, id, instance, startedAt, keys: objectKeys(instance, id, startedAt), bytes: archive.length,
    archiveSha256: sha256(archive), manifestSha256: sha256(manifest), recipientFingerprint: sha256("synthetic recipient"),
    integrity: { version: 1, algorithm: "sha256-jsonb-row-multiset-v1" } };
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  const record = { version: 1, recovery: { version: 1, expected: { id, instance, startedAt,
    recipientFingerprint: receipt.recipientFingerprint, receiptSha256: sha256(receiptBytes), receiptBytes: receiptBytes.length,
    manifestBytes: manifest.length } }, producer };
  const handoffBytes = Buffer.from(JSON.stringify(record) + "\n");
  const plan = { version: 1, enabled: true, storage: { endpoint: "https://storage.invalid/", bucket: "synthetic-backups", region: "us-east-2" },
    handoff: { sha256: sha256(handoffBytes), bytes: handoffBytes.length, id, instance, producer },
    review: { reviewedAt: startedAt, storageAccountId: "synthetic-account", custodyReference: "owner-review-123" },
    destination: { directory } };
  const planFile = join(root, "plan.json"), handoffFile = join(root, "handoff.json"), credentialsFile = join(root, "credentials.json");
  await writeFile(planFile, JSON.stringify(plan), { mode: 0o600 }); await writeFile(handoffFile, handoffBytes, { mode: 0o600 });
  await writeFile(credentialsFile, JSON.stringify({ accessKeyId: "synthetic-access", secretAccessKey: secret }), { mode: 0o600 });
  const objects = new Map([[receipt.keys.receipt, receiptBytes], [receipt.keys.archive, archive], [receipt.keys.manifest, manifest]]);
  const requests = [], bodies = [];
  const handle = vi.fn(async request => {
    requests.push(request); expect(request.method).toBe("GET"); expect(request.hostname).toBe("storage.invalid");
    const key = request.path.slice("/synthetic-backups/".length), bytes = objects.get(key);
    expect(bytes).toBeDefined(); const body = Readable.from([Buffer.from(bytes)]); bodies.push(body);
    return { response: { statusCode: 200, headers: { "content-length": String(bytes.length) }, body } };
  });
  const destroy = vi.fn();
  const createStorage = vi.fn(async options => {
    const storage = createBackupDownloadStorage({ ...options, requestHandler: { handle, destroy() {} } });
    return { get: storage.get, destroy: async () => { destroy(); storage.destroy(); } };
  });
  return { root, directory, plan, planFile, handoffFile, credentialsFile, createStorage, handle, destroy, objects, requests, bodies,
    receipt, archive, manifest, record, mode: "--download" };
}

describe("default-off recovery download operator", () => {
  it.each(["timeout", "signal"])("bounds a stalled start acknowledgement by %s before reading credentials", async kind => {
    const f = await fixture(), prepared = await prepareBackupDownload(f), controller = new AbortController();
    const readCredentials = vi.fn(), onRecord = vi.fn(() => {
      if (kind === "signal") controller.abort("SIGTERM");
      return new Promise(() => {});
    });
    const result = await runBackupDownloadOperator({ ...f, prepare: async () => prepared, verifyDestination: async () => {},
      readCredentials, onRecord, signal: controller.signal, timeoutMs: kind === "timeout" ? 25 : 1000 });
    expect(result).toEqual({ exitCode: kind === "timeout" ? 124 : 143, result: { event: "backup.failed", id,
      code: kind === "timeout" ? "operator_timeout" : "operator_interrupted" } });
    expect(onRecord).toHaveBeenCalledOnce(); expect(readCredentials).not.toHaveBeenCalled(); expect(f.createStorage).not.toHaveBeenCalled();
  });
  it("preserves uncertain file cleanup when storage shutdown also fails", async () => {
    const f = await fixture(), destroy = vi.fn(async () => { throw Error(secret); });
    const result = await runBackupDownloadOperator({ ...f,
      createStorage: async () => ({ get: vi.fn(), destroy }),
      download: async () => { throw new BackupCoverageError("download_cleanup_failed"); } });
    expect(result).toEqual({ exitCode: 1, result: { event: "backup.failed", id,
      code: "download_cleanup_failed", storageCleanupFailed: true } });
    expect(destroy).toHaveBeenCalledOnce();
  });
  it.each([undefined, "--restore", "--upload"])("refuses mode %s without preparing inputs", async mode => {
    const prepare = vi.fn(); expect((await runBackupDownloadOperator({ mode, prepare })).result.code).toBe("operator_invalid_input");
    expect(prepare).not.toHaveBeenCalled();
  });
  it("checks local evidence without reading credentials or constructing transport", async () => {
    const f = await fixture(), readCredentials = vi.fn(); await rm(f.credentialsFile);
    const { credentialsFile: _unused, ...input } = f;
    expect(await runBackupDownloadOperator({ ...input, mode: "--check", readCredentials })).toEqual({ exitCode: 0,
      result: { event: "backup.download_checked", id, handoffSha256: f.plan.handoff.sha256, networkAccessed: false } });
    expect(readCredentials).not.toHaveBeenCalled(); expect(f.createStorage).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]);
  });
  it.each(["disabled", "wrong-hash", "wrong-run", "wrong-producer", "nonempty", "check-with-credentials"])
  ("refuses %s before credential or transport effects", async kind => {
    const f = await fixture(), readCredentials = vi.fn();
    if (kind === "disabled") f.plan.enabled = false;
    if (kind === "wrong-hash") f.plan.handoff.sha256 = "c".repeat(64);
    if (kind === "wrong-run") f.plan.handoff.id = "44444444-4444-4444-8444-444444444444";
    if (kind === "wrong-producer") f.plan.handoff.producer = { ...producer, runAttempt: "2" };
    if (kind === "nonempty") await writeFile(join(f.directory, "preserve"), "existing");
    await writeFile(f.planFile, JSON.stringify(f.plan), { mode: 0o600 });
    const result = await runBackupDownloadOperator({ ...f, readCredentials, mode: kind === "check-with-credentials" ? "--check" : "--download" });
    expect(result.exitCode).toBe(1); expect(readCredentials).not.toHaveBeenCalled(); expect(f.createStorage).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(secret);
    if (kind === "nonempty") expect(await readFile(join(f.directory, "preserve"), "utf8")).toBe("existing");
  });
  it("downloads the exact three objects through the real locked SDK using independently bound local handoff bytes", async () => {
    const f = await fixture(), onRecord = vi.fn();
    const outcome = await runBackupDownloadOperator({ ...f, onRecord });
    expect(outcome).toEqual({ exitCode: 0, result: { event: "backup.download_verified", id, bytes: f.archive.length,
      handoffSha256: f.plan.handoff.sha256, receiptSha256: f.record.recovery.expected.receiptSha256 } });
    expect(onRecord).toHaveBeenCalledExactlyOnceWith({ event: "backup.download_started", id, handoffSha256: f.plan.handoff.sha256 });
    expect(f.requests.map(r => r.path)).toEqual([f.receipt.keys.receipt, f.receipt.keys.archive, f.receipt.keys.manifest].map(k => "/synthetic-backups/" + k));
    expect(f.destroy).toHaveBeenCalledOnce(); expect(f.bodies.every(b => b.destroyed)).toBe(true);
    expect(await readdir(f.directory)).toEqual(["archive.dump.age", "manifest.age", "receipt.json"]);
    expect(await readFile(join(f.directory, "archive.dump.age"))).toEqual(f.archive);
    expect(await readFile(join(f.directory, "manifest.age"))).toEqual(f.manifest);
    expect(JSON.stringify(outcome)).not.toContain(secret);
    const priorRequests = f.requests.length;
    expect((await runBackupDownloadOperator(f)).result.code).toBe("operator_destination_not_empty");
    expect(f.requests).toHaveLength(priorRequests); // No overwrite or implicit retry after success.
  });
  it("preserves completed files when only final output acknowledgement is lost", async () => {
    const f = await fixture(), outcome = await runBackupDownloadOperator(f);
    const write = vi.fn().mockRejectedValue(new Error(secret));
    expect(await writeBackupWorkflowOutcome({ ...outcome, write })).toBe(1);
    expect(write.mock.calls[1]).toEqual(["stderr", { event: "backup.failed", id, code: "adapter_output_failed" }]);
    expect(await readFile(join(f.directory, "archive.dump.age"))).toEqual(f.archive);
    expect(f.requests).toHaveLength(3); expect(f.destroy).toHaveBeenCalledOnce();
  });
  it("clones prepared values so later caller changes cannot retarget downloads", async () => {
    const f = await fixture(), shared = await prepareBackupDownload(f);
    const outcome = await runBackupDownloadOperator({ ...f, prepare: async () => shared, onRecord: () => {
      shared.plan.storage.bucket = "wrong-bucket"; shared.record.recovery.expected.instance = "wrong-instance";
    } });
    expect(outcome.exitCode).toBe(0); expect(f.requests).toHaveLength(3);
  });
  it("refuses a substituted destination before reading credentials", async () => {
    const f = await fixture(), readCredentials = vi.fn();
    const outcome = await runBackupDownloadOperator({ ...f, readCredentials, onRecord: async () => {
      await rename(f.directory, f.directory + "-original"); await mkdir(f.directory, { mode: 0o700 });
    } });
    expect(outcome.result.code).toBe("operator_destination_changed"); expect(outcome.result.id).toBe(id);
    expect(readCredentials).not.toHaveBeenCalled(); expect(f.createStorage).not.toHaveBeenCalled();
  });
  it("refuses a substituted destination after reading credentials but before client creation", async () => {
    const f = await fixture();
    const outcome = await runBackupDownloadOperator({ ...f, readCredentials: async (...args) => {
      const credentials = await readBackupDownloadCredentials(...args);
      await rename(f.directory, f.directory + "-original"); await mkdir(f.directory, { mode: 0o700 }); return credentials;
    } });
    expect(outcome.result.code).toBe("operator_destination_changed"); expect(f.createStorage).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3])("cleans owned files after object %i fails authentication", async n => {
    const f = await fixture(), key = [f.receipt.keys.receipt, f.receipt.keys.archive, f.receipt.keys.manifest][n - 1];
    const corrupt = Buffer.from(f.objects.get(key)); corrupt[0] ^= 1; f.objects.set(key, corrupt);
    const result = await runBackupDownloadOperator(f);
    expect(result.result).toEqual({ event: "backup.failed", id, code: "download_artifact_mismatch" });
    expect(await readdir(f.directory)).toEqual([]); expect(f.destroy).toHaveBeenCalledOnce();
  });
  it("treats shutdown failure as a download failure and cleans owned files", async () => {
    const f = await fixture(), original = f.createStorage;
    f.createStorage = async input => { const storage = await original(input); return { get: storage.get,
      destroy: async () => { await storage.destroy(); throw Error(secret); } }; };
    expect((await runBackupDownloadOperator(f)).result).toEqual({ event: "backup.failed", id, code: "download_finalize_failed" });
    expect(await readdir(f.directory)).toEqual([]); expect(f.destroy).toHaveBeenCalledOnce();
  });
  it("does not hide failed transport shutdown behind simultaneous cancellation", async () => {
    const f = await fixture(), controller = new AbortController(), original = f.createStorage;
    f.createStorage = async input => { const storage = await original(input); return { get: storage.get,
      destroy: async () => { await storage.destroy(); controller.abort("SIGTERM"); throw Error(secret); } }; };
    expect(await runBackupDownloadOperator({ ...f, signal: controller.signal })).toEqual({ exitCode: 1,
      result: { event: "backup.failed", id, code: "download_finalize_failed" } });
    expect(await readdir(f.directory)).toEqual([]); expect(f.destroy).toHaveBeenCalledOnce();
  });
  it("does not start remote work when the start acknowledgement fails", async () => {
    const f = await fixture(), readCredentials = vi.fn();
    expect((await runBackupDownloadOperator({ ...f, readCredentials, onRecord: () => { throw Error(secret); } })).result)
      .toEqual({ event: "backup.failed", id, code: "operator_output_failed" });
    expect(readCredentials).not.toHaveBeenCalled(); expect(f.createStorage).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3])("cancels object %i, destroys transport and removes only owned files", async n => {
    const f = await fixture(), controller = new AbortController(), original = f.handle.getMockImplementation(); let count = 0;
    f.handle.mockImplementation(async request => {
      const response = await original(request); if (++count === n) controller.abort("SIGINT"); return response;
    });
    const result = await runBackupDownloadOperator({ ...f, signal: controller.signal });
    expect(result).toEqual({ exitCode: 130, result: { event: "backup.failed", id, code: "operator_interrupted" } });
    expect(await readdir(f.directory)).toEqual([]); expect(f.destroy).toHaveBeenCalledOnce();
  });
  it("times out a stalled transport and retains the run identity", async () => {
    const f = await fixture(); f.handle.mockImplementation((_request, { abortSignal }) => new Promise((_resolve, reject) => {
      abortSignal.addEventListener("abort", () => reject(Error(secret)), { once: true });
    }));
    const result = await runBackupDownloadOperator({ ...f, timeoutMs: 1000 });
    expect(result).toEqual({ exitCode: 124, result: { event: "backup.failed", id, code: "operator_timeout" } });
    expect(await readdir(f.directory)).toEqual([]); expect(f.destroy).toHaveBeenCalledOnce();
  });
  it("refuses an already aborted invocation without preparing or reading anything", async () => {
    const f = await fixture(), controller = new AbortController(), prepare = vi.fn(); controller.abort("SIGHUP");
    expect(await runBackupDownloadOperator({ ...f, prepare, signal: controller.signal })).toEqual({ exitCode: 129,
      result: { event: "backup.failed", code: "operator_interrupted" } });
    expect(prepare).not.toHaveBeenCalled(); expect(f.createStorage).not.toHaveBeenCalled();
  });
  it("the actual CLI checks locally and refuses disabled plans or secret-bearing arguments", async () => {
    const f = await fixture(), cli = new URL("../scripts/download-backup.mjs", import.meta.url).pathname;
    const invoke = args => { try { return { status: 0, stdout: execFileSync(process.execPath, [cli, ...args], {
      env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 10000, stdio: "pipe" }) }; }
      catch (error) { return { status: error.status, stdout: String(error.stdout), stderr: String(error.stderr) }; } };
    const checked = invoke(["--check", "--plan-file", f.planFile, "--handoff-file", f.handoffFile]);
    expect(checked.status).toBe(0); expect(JSON.parse(checked.stdout).event).toBe("backup.download_checked");
    await writeFile(f.planFile, JSON.stringify({ enabled: false }), { mode: 0o600 });
    const disabled = invoke(["--download", "--plan-file", f.planFile, "--handoff-file", "/not-read", "--credentials-file", "/not-read"]);
    expect(disabled.status).toBe(1); expect(JSON.parse(disabled.stderr).code).toBe("operator_disabled");
    const rejected = invoke([`--secret=${secret}`]); expect(rejected.status).toBe(1); expect(rejected.stderr).not.toContain(secret);
    expect(JSON.parse(rejected.stderr).code).toBe("operator_arguments_refused");
  });
});
