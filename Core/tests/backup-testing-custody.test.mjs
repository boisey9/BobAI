import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeTestingBackupCustody } from "../scripts/lib/backup-testing-custody.mjs";
import { executeTestingBackup } from "../scripts/lib/backup-testing-runner.mjs";
import { runBackupWorkflow } from "../scripts/lib/backup-workflow.mjs";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { sha256 } from "../scripts/lib/backup.mjs";

const PRIVATE = "private-custody-sentinel";
const backupId = "11111111-2222-4333-8444-555555555555";
const sourceCommit = "a".repeat(40);
const image = `ghcr.io/boisey9/bob-backup-runner@sha256:${"a".repeat(64)}`;
const ciphertext = Buffer.from("synthetic age ciphertext, never sent to a service");
const directories = new Set();
const executeFile = promisify(execFile);

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories) await rm(directory, { recursive: true, force: true });
  directories.clear();
});

const binding = () => ({ version: 1, enabled: true, runner: {
  image, nodeVersion: "24.0.0", npmVersion: "11.0.0", pgDumpVersion: "pg_dump (PostgreSQL) 18.6",
  ageVersion: "v1.3.0", lockfileSha256: "b".repeat(64) },
  plan: { version: 1, enabled: true, capture: { version: 1, enabled: true, environment: "testing",
    target: { host: "source.invalid", port: 5432, database: "fixture", role: "bob_backup_capture", postgresMajor: 18 },
    project: { key: "bobai", id: "11111111-1111-4111-8111-111111111111", ownerId: "synthetic-owner", repository: "boisey9/BobAI" },
    expectedSchemaDigest: "c".repeat(64) }, ledgerRole: "bob_backup_ledger", instance: "testing-fixture",
    recipient: "age1" + "a".repeat(58), storage: { endpoint: "https://storage.invalid/", bucket: "synthetic-testing", region: "us-east-2" },
    retentionEnabled: false },
  review: { reviewedAt: "2026-11-01T15:00:00.000Z", neonProjectId: "synthetic-project", neonBranchId: "synthetic-branch",
    storageAccountId: "synthetic-account", restoreTarget: { host: "restore.invalid", database: "fixture", postgresMajor: 18 } } });

const context = () => ({ BOB_BACKUP_TESTING_ENABLED: "true", BOB_BACKUP_TESTING_APPROVED_SHA: sourceCommit,
  GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "boisey9/BobAI", GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main", GITHUB_WORKFLOW_REF: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main",
  GITHUB_SHA: sourceCommit, GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1",
  RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", RUNNER_ARCH: "X64", BOB_BACKUP_TESTING_IMAGE: image,
  BOB_BACKUP_TESTING_TEMP: "/private/synthetic-inputs", BOB_BACKUP_TESTING_RECOVERY_DIRECTORY: "/private/synthetic-recovery",
  BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY: "/private/synthetic-ciphertext",
  BOB_BACKUP_CAPTURE_DATABASE_URL: `capture-${PRIVATE}`, BOB_BACKUP_LEDGER_DATABASE_URL: `ledger-${PRIVATE}`,
  AWS_ACCESS_KEY_ID: `access-${PRIVATE}`, AWS_SECRET_ACCESS_KEY: `secret-${PRIVATE}` });

const captureResult = () => ({ event: "backup.verified", id: backupId, bytes: 321,
  retentionChecked: false, expiredObjectsRemoved: 0,
  handoff: { version: 1, sha256: "d".repeat(64), bytes: 1100 } });
const artifact = (directory = context().BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY) => ({
  name: "bob-recovery-handoff-r123-a1", path: join(directory, "recovery.json.age"), sha256: sha256(ciphertext), bytes: ciphertext.length });
const publicResult = () => ({ event: "backup.custody_prepared", artifactName: "bob-recovery-handoff-r123-a1",
  ciphertextSha256: sha256(ciphertext), ciphertextBytes: ciphertext.length });

function fixture() {
  const env = context(), suppliedBinding = binding(), prepared = Object.freeze({ prepared: true });
  const calls = [];
  const prepare = vi.fn(async () => { calls.push("prepare"); return suppliedBinding; });
  const check = vi.fn(async () => { calls.push("check"); });
  const prepareCustody = vi.fn(async () => { calls.push("prepareCustody"); return prepared; });
  const run = vi.fn(async () => { calls.push("run"); return { exitCode: 0, result: captureResult() }; });
  const encrypt = vi.fn(async () => { calls.push("encrypt"); return artifact(env.BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY); });
  const options = { env, prepare, check, prepareCustody, run, encrypt };
  return { env, suppliedBinding, prepared, calls, prepare, check, prepareCustody, run, encrypt, options };
}

async function uploadedFixture() {
  const f = fixture();
  const directory = await mkdtemp(join(await realpath(tmpdir()), "bob-testing-custody-"));
  directories.add(directory);
  await chmod(directory, 0o700);
  f.env.BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY = directory;
  f.encrypt.mockImplementation(async () => {
    f.calls.push("encrypt");
    const value = artifact(directory);
    await writeFile(value.path, ciphertext, { mode: 0o600, flag: "wx" });
    return value;
  });
  return { ...f, directory };
}

function expectFailure(value, code, exitCode = 1) {
  expect(value).toEqual({ exitCode, result: { event: "backup.failed", code } });
  expect(JSON.stringify(value)).not.toContain(PRIVATE);
  expect(JSON.stringify(value)).not.toContain(backupId);
  expect(JSON.stringify(value)).not.toContain("d".repeat(64));
}

describe("testing custody composition", () => {
  it("prepares directories before capture and reports preparation only after encryption", async () => {
    const f = fixture(), controller = new AbortController();
    const value = await executeTestingBackupCustody({ ...f.options, signal: controller.signal });
    expect(f.calls).toEqual(["prepare", "check", "prepareCustody", "run", "encrypt"]);
    expect(value).toEqual({ exitCode: 0, result: publicResult(), artifact: artifact() });
    expect(f.prepareCustody).toHaveBeenCalledWith({ enabled: true,
      directory: f.env.BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY,
      recoveryDirectory: f.env.BOB_BACKUP_TESTING_RECOVERY_DIRECTORY, temporaryRoot: f.env.BOB_BACKUP_TESTING_TEMP,
      producer: { repository: "boisey9/BobAI", sourceCommit, workflow: f.env.GITHUB_WORKFLOW_REF,
        runId: "123", runAttempt: "1", image }, recipient: f.suppliedBinding.plan.recipient,
      instance: "testing-fixture", signal: controller.signal });
    expect(f.encrypt).toHaveBeenCalledWith({ prepared: f.prepared, result: captureResult(), signal: controller.signal });
    expect(JSON.stringify(value.result)).not.toMatch(/uploaded|verified|private|recovery\.json/);
  });

  it.each(["prepare", "check"])("a safe %s refusal cannot reach custody or capture", async stage => {
    const f = fixture();
    f[stage].mockRejectedValue(new BackupCoverageError("testing_disabled"));
    await expect(executeTestingBackupCustody(f.options)).rejects.toThrow("testing_disabled");
    expect(f.prepareCustody).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
    expect(f.encrypt).not.toHaveBeenCalled();
  });

  it("revalidates injected binding before any directory or capture work", async () => {
    const f = fixture(); f.suppliedBinding.plan.capture.environment = "production";
    await expect(executeTestingBackupCustody(f.options)).rejects.toThrow("testing_");
    expect(f.prepareCustody).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
  });

  it("a directory preparation failure refuses capture and masks its private diagnostic", async () => {
    const f = fixture(), upload = vi.fn();
    f.prepareCustody.mockRejectedValue(new Error(`unsafe directory: ${PRIVATE}`));
    expectFailure(await executeTestingBackupCustody({ ...f.options, upload }), "testing_custody_failed");
    expect(f.run).not.toHaveBeenCalled(); expect(f.encrypt).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });

  it("snapshots environment before awaiting preparation and never rereads changed producer inputs", async () => {
    const f = fixture();
    const original = { ...f.env };
    f.prepare.mockImplementation(async ({ env }) => {
      expect(env).not.toBe(f.env);
      f.env.GITHUB_RUN_ID = "999"; f.env.GITHUB_RUN_ATTEMPT = "2";
      f.env.GITHUB_SHA = "e".repeat(40); f.env.AWS_SECRET_ACCESS_KEY = "replacement-secret";
      f.env.BOB_BACKUP_TESTING_RECOVERY_DIRECTORY = "/private/replacement-recovery";
      await Promise.resolve();
      expect(env.GITHUB_SHA).toBe(sourceCommit);
      return f.suppliedBinding;
    });
    const value = await executeTestingBackupCustody(f.options);
    expect(value.result).toEqual(publicResult());
    const runOptions = f.run.mock.calls[0][0];
    expect(runOptions.env).toEqual(original);
    expect(f.prepareCustody.mock.calls[0][0].producer.runId).toBe("123");
    expect(f.prepareCustody.mock.calls[0][0].recoveryDirectory).toBe(original.BOB_BACKUP_TESTING_RECOVERY_DIRECTORY);
  });

  it("clones and deeply freezes the validated binding before later asynchronous consumers", async () => {
    const f = fixture(), original = structuredClone(f.suppliedBinding);
    f.check.mockImplementation(async (checked, { env }) => {
      expect(checked).not.toBe(f.suppliedBinding);
      expect(Object.isFrozen(checked)).toBe(true); expect(Object.isFrozen(checked.plan.capture.target)).toBe(true);
      // A consumer may receive a defensive copy; changing it must never change
      // the snapshot used by later custody/capture stages.
      if (!Object.isFrozen(env)) env.GITHUB_RUN_ID = "999";
      f.suppliedBinding.plan.recipient = "age1" + "b".repeat(58);
      f.suppliedBinding.runner.image = image.replace(/a{64}$/, "f".repeat(64));
      f.suppliedBinding.plan.capture.target.host = "replacement.invalid";
      await Promise.resolve();
    });
    f.run.mockImplementation(async ({ prepare, check, env }) => {
      expect(env.GITHUB_RUN_ID).toBe("123");
      const selected = await prepare({ env: { GITHUB_SHA: "untrusted" } });
      expect(selected).toEqual(original);
      await check(selected, { env: {} });
      return { exitCode: 0, result: captureResult() };
    });
    expect((await executeTestingBackupCustody(f.options)).result).toEqual(publicResult());
    expect(f.check).toHaveBeenCalledOnce();
    expect(f.prepareCustody.mock.calls[0][0].recipient).toBe(original.plan.recipient);
  });

  it("does not forward rich capture records or caller callbacks to public output", async () => {
    const f = fixture(), onRecord = vi.fn();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    f.run.mockImplementation(async ({ onRecord: consume }) => {
      consume?.({ event: "backup.started", id: backupId, debug: PRIVATE });
      consume?.({ ...captureResult(), debug: PRIVATE });
      return { exitCode: 0, result: captureResult() };
    });
    const value = await executeTestingBackupCustody({ ...f.options, onRecord });
    expect(value.result).toEqual(publicResult());
    expect(onRecord).not.toHaveBeenCalled(); expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
    expect(JSON.stringify(value.result)).not.toContain(backupId);
    expect(JSON.stringify(value.result)).not.toContain("d".repeat(64));
  });

  it.each([
    ["failed capture", { exitCode: 1, result: { event: "backup.failed", id: backupId, code: PRIVATE } }],
    ["retention failure", { exitCode: 1, result: { ...captureResult(), code: PRIVATE } }],
    ["noninteger status", { exitCode: "0", result: captureResult() }],
    ["missing result", { exitCode: 0 }],
    ["wrong success event", { exitCode: 0, result: { ...captureResult(), event: "backup.started" } }],
    ["missing retained handoff", { exitCode: 0, result: { ...captureResult(), handoff: undefined } }],
    ["unrequested retention", { exitCode: 0, result: { ...captureResult(), retentionChecked: true } }],
    ["malformed handoff acknowledgement", { exitCode: 0, result: { ...captureResult(), handoff: { version: 1, sha256: PRIVATE, bytes: 1100 } } }],
    ["extra private terminal field", { exitCode: 0, result: { ...captureResult(), debug: PRIVATE } }],
  ])("never encrypts or uploads after %s", async (_name, outcome) => {
    const f = fixture(), upload = vi.fn(); f.run.mockResolvedValue(outcome);
    expectFailure(await executeTestingBackupCustody({ ...f.options, upload }), "testing_capture_failed");
    expect(f.encrypt).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });

  it("masks capture exceptions without recapturing or exposing diagnostic fields", async () => {
    const f = fixture(), upload = vi.fn();
    f.run.mockRejectedValue(Object.assign(new Error(PRIVATE), { id: backupId, stderr: PRIVATE }));
    expectFailure(await executeTestingBackupCustody({ ...f.options, upload }), "testing_capture_failed");
    expect(f.run).toHaveBeenCalledOnce(); expect(f.encrypt).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });

  it("encryption/cleanup failure suppresses success without invoking upload", async () => {
    const f = fixture(), upload = vi.fn();
    f.encrypt.mockRejectedValue(Object.assign(new Error(PRIVATE), { cleanupUncertain: true, path: PRIVATE }));
    expectFailure(await executeTestingBackupCustody({ ...f.options, upload }), "testing_custody_failed");
    expect(f.encrypt).toHaveBeenCalledOnce(); expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong run", value => { value.name = "bob-recovery-handoff-r999-a1"; }],
    ["wrong attempt", value => { value.name = "bob-recovery-handoff-r123-a2"; }],
    ["wrong path", value => { value.path = "/private/elsewhere/recovery.json.age"; }],
    ["uppercase digest", value => { value.sha256 = "A".repeat(64); }],
    ["unbound digest", value => { value.sha256 = "0".repeat(64); }],
    ["empty ciphertext", value => { value.bytes = 0; }],
    ["oversized ciphertext", value => { value.bytes = 16385; }],
    ["fractional size", value => { value.bytes = 1.5; }],
    ["private extra field", value => { value.plaintext = PRIVATE; }],
  ])("refuses an encrypted descriptor with %s before any upload", async (_name, mutate) => {
    const f = fixture(), upload = vi.fn(), value = artifact(); mutate(value); f.encrypt.mockResolvedValue(value);
    expectFailure(await executeTestingBackupCustody({ ...f.options, upload }), "testing_custody_failed");
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(["prepareCustody", "run", "encrypt"])("cancellation during %s prevents all later effects", async stage => {
    const f = fixture(), controller = new AbortController(), upload = vi.fn();
    const initial = f[stage].getMockImplementation();
    f[stage].mockImplementation(async (...args) => { const value = await initial(...args); controller.abort("SIGTERM"); return value; });
    expectFailure(await executeTestingBackupCustody({ ...f.options, signal: controller.signal, upload }), "testing_interrupted", 143);
    if (stage === "prepareCustody") expect(f.run).not.toHaveBeenCalled();
    if (stage !== "encrypt") expect(f.encrypt).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(["before", "prepare", "check"])("cancellation at %s refuses capture with the same safe interrupt outcome", async stage => {
    const f = fixture(), controller = new AbortController(), upload = vi.fn();
    if (stage === "before") controller.abort("SIGTERM");
    else {
      const initial = f[stage].getMockImplementation();
      f[stage].mockImplementation(async (...args) => {
        const value = await initial(...args); controller.abort("SIGTERM"); return value;
      });
    }
    expectFailure(await executeTestingBackupCustody({ ...f.options, signal: controller.signal, upload }), "testing_interrupted", 143);
    if (stage === "before") expect(f.prepare).not.toHaveBeenCalled();
    if (stage !== "check") expect(f.check).not.toHaveBeenCalled();
    expect(f.prepareCustody).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
    expect(f.encrypt).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });

  it.each([["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129], ["unknown", 1]])
  ("maps an interrupted capture %s without leaking its result", async (reason, code) => {
    const f = fixture(), controller = new AbortController();
    f.run.mockImplementation(async () => { controller.abort(reason); throw new Error(PRIVATE); });
    expectFailure(await executeTestingBackupCustody({ ...f.options, signal: controller.signal }), "testing_interrupted", code);
    expect(f.encrypt).not.toHaveBeenCalled();
  });
});

describe("synthetic custody consumer", () => {
  it.skipIf(!existsSync("/usr/local/bin/age") || !existsSync("/usr/local/bin/age-keygen"))
  ("composes real workflow retention and age encryption before an exact private consumer handoff", async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), "bob-custody-composed-"));
    directories.add(root);
    const temporaryRoot = join(root, "inputs"), recoveryDirectory = join(root, "recovery"), directory = join(root, "ciphertext");
    for (const path of [temporaryRoot, recoveryDirectory, directory]) await mkdir(path, { mode: 0o700 });
    const key = join(root, "disposable.agekey"), decrypted = join(root, "decrypted.json");
    const toolOptions = { env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, timeout: 10000 };
    await executeFile("/usr/local/bin/age-keygen", ["-o", key], toolOptions);
    await chmod(key, 0o600);
    const recipient = (await executeFile("/usr/local/bin/age-keygen", ["-y", key], toolOptions)).stdout.trim();
    const selected = binding(); selected.plan.recipient = recipient;
    const env = { ...context(), BOB_BACKUP_TESTING_TEMP: temporaryRoot,
      BOB_BACKUP_TESTING_RECOVERY_DIRECTORY: recoveryDirectory, BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY: directory,
      BOB_BACKUP_CAPTURE_DATABASE_URL: `postgresql://bob_backup_capture:${PRIVATE}@source.invalid/fixture?sslmode=verify-full`,
      BOB_BACKUP_LEDGER_DATABASE_URL: `postgresql://bob_backup_ledger:${PRIVATE}@source.invalid/fixture?sslmode=verify-full` };
    const controller = new AbortController(), startedAt = "2026-11-01T18:00:00.000Z";
    const recovery = { version: 1, expected: { id: backupId, instance: selected.plan.instance, startedAt,
      recipientFingerprint: sha256(recipient), receiptSha256: "c".repeat(64), receiptBytes: 700, manifestBytes: 1200 } };
    const producer = { repository: env.GITHUB_REPOSITORY, sourceCommit: env.GITHUB_SHA,
      workflow: env.GITHUB_WORKFLOW_REF, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, image };
    const expectedHandoff = Buffer.from(JSON.stringify({ version: 1, recovery, producer }) + "\n");
    const execute = vi.fn(async input => {
      // Only capture is synthetic. The surrounding workflow still creates and
      // verifies private inputs, then removes them before actual local retention.
      expect(input.signal).toBe(controller.signal);
      expect(input.recoveryBinding).toEqual({ instance: selected.plan.instance, recipientFingerprint: sha256(recipient) });
      expect(JSON.parse(await readFile(input.args[2], "utf8"))).toEqual(selected.plan);
      expect(await readFile(input.args[4], "utf8")).toBe(env.BOB_BACKUP_CAPTURE_DATABASE_URL);
      expect(await readFile(input.args[6], "utf8")).toBe(env.BOB_BACKUP_LEDGER_DATABASE_URL);
      await input.onRecord({ event: "backup.started", id: backupId, startedAt });
      return { exitCode: 0, result: { event: "backup.verified", id: backupId, bytes: 321,
        retentionChecked: false, expiredObjectsRemoved: 0, recovery } };
    });
    const upload = vi.fn(async (descriptor, options) => {
      expect(Object.keys(descriptor).sort()).toEqual(["bytes", "name", "path", "sha256"]);
      expect(options).toEqual({ signal: controller.signal });
      expect(descriptor.path).toBe(join(directory, "recovery.json.age"));
      expect(descriptor.name).toBe("bob-recovery-handoff-r123-a1");
      const bytes = await readFile(descriptor.path);
      expect(bytes.length).toBe(descriptor.bytes); expect(sha256(bytes)).toBe(descriptor.sha256);
      expect(bytes).not.toEqual(expectedHandoff);
      expect(await readdir(temporaryRoot)).toEqual([]);
      expect(await readFile(join(recoveryDirectory, `${backupId}.recovery.json`))).toEqual(expectedHandoff);
    });
    const value = await executeTestingBackupCustody({ env, signal: controller.signal,
      prepare: async () => selected, check: vi.fn(), upload,
      run: options => executeTestingBackup({ ...options,
        run: workflow => runBackupWorkflow({ ...workflow, execute }) }) });
    expect(value.exitCode).toBe(0); expect(execute).toHaveBeenCalledOnce(); expect(upload).toHaveBeenCalledOnce();
    expect(value.result).toEqual({ event: "backup.custody_prepared", artifactName: value.artifact.name,
      ciphertextSha256: value.artifact.sha256, ciphertextBytes: value.artifact.bytes });
    const publicJSON = JSON.stringify(value.result);
    for (const privateValue of [PRIVATE, backupId, sha256(expectedHandoff), root]) expect(publicJSON).not.toContain(privateValue);
    await executeFile("/usr/local/bin/age", ["--decrypt", "--identity", key, "--output", decrypted, value.artifact.path], toolOptions);
    expect(await readFile(decrypted)).toEqual(expectedHandoff);
    expect(await readdir(temporaryRoot)).toEqual([]);
    expect(await readdir(recoveryDirectory)).toEqual([`${backupId}.recovery.json`]);
    expect(await readdir(directory)).toEqual(["recovery.json.age"]);
  }, 20000);

  it("receives only a verified cloned descriptor and signal, without changing preparation into upload acceptance", async () => {
    const f = await uploadedFixture(), controller = new AbortController();
    let supplied;
    const upload = vi.fn(async (descriptor, options) => {
      supplied = descriptor;
      expect(descriptor).toEqual(artifact(f.directory));
      expect(options).toEqual({ signal: controller.signal });
      expect(await readFile(descriptor.path)).toEqual(ciphertext);
      return { uploaded: true, debug: PRIVATE };
    });
    const value = await executeTestingBackupCustody({ ...f.options, signal: controller.signal, upload });
    expect(upload).toHaveBeenCalledOnce(); expect(value.result).toEqual(publicResult());
    expect(value.artifact).not.toBe(supplied);
    expect(JSON.stringify(value.result)).not.toContain(PRIVATE);
    expect(await readFile(value.artifact.path)).toEqual(ciphertext);
  });

  it("refuses actual ciphertext bytes that disagree with the descriptor before a consumer sees them", async () => {
    const f = await uploadedFixture(), upload = vi.fn(), initial = f.encrypt.getMockImplementation();
    f.encrypt.mockImplementation(async () => { const value = await initial(); await writeFile(value.path, "different bytes"); return value; });
    expectFailure(await executeTestingBackupCustody({ ...f.options, upload }), "testing_custody_failed");
    expect(upload).not.toHaveBeenCalled();
    expect(await readFile(artifact(f.directory).path, "utf8")).toBe("different bytes");
  });

  it("retains ciphertext after a lost consumer acknowledgement and never retries capture, encryption or upload", async () => {
    const f = await uploadedFixture(), upload = vi.fn(async () => { throw new Error(`lost acknowledgement ${PRIVATE}`); });
    expectFailure(await executeTestingBackupCustody({ ...f.options, upload }), "testing_custody_failed");
    expect(f.run).toHaveBeenCalledOnce(); expect(f.encrypt).toHaveBeenCalledOnce(); expect(upload).toHaveBeenCalledOnce();
    expect(await readFile(artifact(f.directory).path)).toEqual(ciphertext);
  });

  it("cancellation during a successful consumer acknowledgement suppresses success and preserves ciphertext", async () => {
    const f = await uploadedFixture(), controller = new AbortController();
    const upload = vi.fn(async () => { controller.abort("SIGINT"); });
    expectFailure(await executeTestingBackupCustody({ ...f.options, signal: controller.signal, upload }), "testing_interrupted", 130);
    expect(upload).toHaveBeenCalledOnce(); expect(await readFile(artifact(f.directory).path)).toEqual(ciphertext);
  });

  it("interrupts a nonresponsive consumer, observes its late rejection and never retries", async () => {
    const f = await uploadedFixture(), controller = new AbortController();
    let acknowledgeStart, rejectConsumer, deadline;
    const started = new Promise(resolve => { acknowledgeStart = resolve; });
    const consumer = new Promise((_resolve, reject) => { rejectConsumer = reject; });
    const upload = vi.fn(() => { acknowledgeStart(); return consumer; });
    const unhandled = [], observeUnhandled = error => { unhandled.push(error); };
    process.on("unhandledRejection", observeUnhandled);
    try {
      const pending = executeTestingBackupCustody({ ...f.options, signal: controller.signal, upload });
      await started;
      controller.abort("SIGTERM");
      const value = await Promise.race([pending, new Promise((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("custody cancellation did not settle")), 1000);
      })]);
      expectFailure(value, "testing_interrupted", 143);
      rejectConsumer(new Error(`late ${PRIVATE}`));
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(f.run).toHaveBeenCalledOnce(); expect(f.encrypt).toHaveBeenCalledOnce(); expect(upload).toHaveBeenCalledOnce();
      expect(await readFile(artifact(f.directory).path)).toEqual(ciphertext);
    } finally {
      clearTimeout(deadline);
      rejectConsumer(new Error(`late cleanup ${PRIVATE}`));
      await new Promise(resolve => setImmediate(resolve));
      process.removeListener("unhandledRejection", observeUnhandled);
    }
  });

  it("bounds an unresponsive consumer at sixty seconds without retrying or deleting ciphertext", async () => {
    const f = await uploadedFixture();
    let acknowledgeStart, rejectConsumer;
    const started = new Promise(resolve => { acknowledgeStart = resolve; });
    const consumer = new Promise((_resolve, reject) => { rejectConsumer = reject; });
    const upload = vi.fn(() => { acknowledgeStart(); return consumer; });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = executeTestingBackupCustody({ ...f.options, upload });
      let settled = false;
      pending.then(() => { settled = true; }, () => { settled = true; });
      await started;
      await vi.advanceTimersByTimeAsync(59_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expectFailure(await pending, "testing_custody_failed");
      rejectConsumer(new Error(`late timeout ${PRIVATE}`));
      await Promise.resolve();
      expect(f.run).toHaveBeenCalledOnce(); expect(f.encrypt).toHaveBeenCalledOnce(); expect(upload).toHaveBeenCalledOnce();
      expect(await readFile(artifact(f.directory).path)).toEqual(ciphertext);
    } finally {
      rejectConsumer(new Error(`late cleanup ${PRIVATE}`));
      vi.useRealTimers();
    }
  });
});

describe("dormant public-workflow wiring", () => {
  it("routes CLI run through custody without a public raw-record callback", async () => {
    const source = await readFile(new URL("../scripts/run-backup-testing.mjs", import.meta.url), "utf8");
    expect(source).toContain("executeTestingBackupCustody");
    expect(source).not.toMatch(/onRecord\s*:/);
    expect(source).not.toContain("upload-artifact");
  });

  it("keeps both holds and null binding, with three distinct private directories and no artifact action", async () => {
    const source = await readFile(new URL("../../.github/workflows/backups-testing.yml", import.meta.url), "utf8");
    const shipped = JSON.parse(await readFile(new URL("../scripts/backup-testing-binding.json", import.meta.url), "utf8"));
    expect(shipped).toEqual({ version: 1, enabled: false, runner: null, plan: null, review: null });
    expect(source.match(/if: \$\{\{ false &&/g)).toHaveLength(2);
    expect(source).toContain("workflow_dispatch:");
    expect(source).not.toMatch(/^\s+(schedule|push|pull_request|workflow_call):/m);
    expect(source).not.toMatch(/upload-artifact|download-artifact|actions\/cache|packages:\s*write|contents:\s*write/);
    for (const name of ["temporary", "recovery", "ciphertext"]) expect(source).toContain(`steps.inputs.outputs.${name}`);
    expect(source).toContain("BOB_BACKUP_TESTING_RECOVERY_DIRECTORY:");
    expect(source).toContain("BOB_BACKUP_TESTING_CIPHERTEXT_DIRECTORY:");
    const siblingTemplates = [...source.matchAll(/mktemp -d "\$RUNNER_TEMP\/([^"/]+)"/g)].map(match => match[1]);
    expect(siblingTemplates).toHaveLength(3); expect(new Set(siblingTemplates).size).toBe(3);
    const lines = source.split("\n");
    const mask = lines.findIndex(line => line.includes("::add-mask::"));
    const output = lines.findIndex(line => line.includes('>> "$GITHUB_OUTPUT"'));
    expect(mask).toBeGreaterThanOrEqual(0); expect(output).toBeGreaterThan(mask);
    for (const variable of ["bob_testing_temp", "bob_testing_recovery", "bob_testing_ciphertext"]) {
      expect(lines[mask]).toContain(`"$${variable}"`);
      expect(lines[output]).toContain(`"$${variable}"`);
    }
  });
});
