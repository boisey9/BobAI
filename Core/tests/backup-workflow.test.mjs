import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, objectKeys } from "../scripts/lib/backup.mjs";
import { runBackupWorkflow, writeBackupWorkflowOutcome } from "../scripts/lib/backup-workflow.mjs";
import { runBackupExporter } from "../scripts/lib/backup-exporter-process.mjs";
import { downloadBackupBundle } from "../scripts/lib/backup-download.mjs";
import { prepareBackupRecoveryHandoff, retainBackupRecoveryHandoff } from "../scripts/lib/backup-recovery-handoff.mjs";

const id = "33333333-3333-4333-8333-333333333333";
const core = fileURLToPath(new URL("../", import.meta.url));
const secret = "synthetic-secret-sentinel";
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

function plan() {
  return { version: 1, enabled: true, capture: { version: 1, enabled: true, environment: "testing",
    target: { host: "fixture.invalid", port: 5432, database: "postgres", role: "bob_backup_capture", postgresMajor: 18 },
    project: { key: "bobai", id, ownerId: "fixture-owner", repository: "boisey9/BobAI" }, expectedSchemaDigest: "a".repeat(64) },
    ledgerRole: "bob_backup_ledger", instance: "fixture", recipient: "age1" + "a".repeat(58),
    storage: { endpoint: "https://storage.invalid", bucket: "fixture-backups", region: "us-east-2" }, retentionEnabled: false };
}
const url = role => `postgresql://${role}:${secret}@fixture.invalid/postgres?sslmode=verify-full`;
const start = { event: "backup.started", id, startedAt: "2026-11-01T15:00:00.000Z" };
const producer = { repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
  workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main", runId: "123", runAttempt: "1",
  image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) };
const recovery = { version: 1, expected: { id, instance: "fixture", startedAt: start.startedAt,
  recipientFingerprint: sha256(plan().recipient), receiptSha256: "c".repeat(64), receiptBytes: 700, manifestBytes: 500 } };
const verified = { exitCode: 0, result: { event: "backup.verified", id, bytes: 20, retentionChecked: false, expiredObjectsRemoved: 0, recovery } };
const handoffBytes = Buffer.from(JSON.stringify({ version: 1, recovery, producer }) + "\n");
const retained = { exitCode: 0, result: { event: "backup.verified", id, bytes: 20, retentionChecked: false, expiredObjectsRemoved: 0,
  handoff: { version: 1, sha256: sha256(handoffBytes), bytes: handoffBytes.length } } };
const complete = input => { input.onRecord(start); return structuredClone(verified); };
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-adapter-test-"))); roots.push(root);
  const recoveryDirectory = await realpath(await mkdtemp(join(tmpdir(), "bob-handoff-test-"))); roots.push(recoveryDirectory);
  const env = { PATH: process.env.PATH, RUNNER_TEMP: root, BOB_BACKUP_ADAPTER_ENABLED: "true",
    BOB_BACKUP_PLAN_JSON: JSON.stringify(plan()), BOB_BACKUP_CAPTURE_DATABASE_URL: url("bob_backup_capture"),
    BOB_BACKUP_LEDGER_DATABASE_URL: url("bob_backup_ledger"), AWS_ACCESS_KEY_ID: "synthetic-access", AWS_SECRET_ACCESS_KEY: secret };
  return { root, env, recovery: { enabled: true, directory: recoveryDirectory, producer }, execute: vi.fn(async input => complete(input)) };
}

describe("private-file backup workflow adapter", () => {
  it("does not wait indefinitely for success or diagnostic writes after cancellation", async () => {
    const controller = new AbortController(), write = vi.fn(() => new Promise(() => {}));
    const pending = writeBackupWorkflowOutcome({ ...retained, signal: controller.signal, write });
    controller.abort("SIGTERM");
    expect(await pending).toBe(143); expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual(["stderr", { event: "backup.failed", id, code: "interrupted" }]);
  });
  it.each([["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]])
  ("cannot finish successfully when %s arrives during final output acknowledgement", async (name, code) => {
    const controller = new AbortController(); let acknowledge;
    const write = vi.fn().mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
    const pending = writeBackupWorkflowOutcome({ ...retained, signal: controller.signal, write });
    controller.abort(name); acknowledge();
    expect(await pending).toBe(code);
    expect(write.mock.calls).toEqual([["stdout", retained.result],
      ["stderr", { event: "backup.failed", id, code: "interrupted" }]]);
  });
  it("does not emit successful output if cancellation preceded final acknowledgement", async () => {
    const controller = new AbortController(); controller.abort("SIGTERM"); const write = vi.fn();
    expect(await writeBackupWorkflowOutcome({ ...retained, signal: controller.signal, write })).toBe(143);
    expect(write).toHaveBeenCalledExactlyOnceWith("stderr", { event: "backup.failed", id, code: "interrupted" });
  });
  it("awaits final outcome acknowledgement without changing the retained receipt", async () => {
    let acknowledge, settled = false;
    const write = vi.fn(() => new Promise(resolve => { acknowledge = resolve; }));
    const pending = writeBackupWorkflowOutcome({ ...retained, write }).then(code => { settled = true; return code; });
    expect(settled).toBe(false); expect(write).toHaveBeenCalledWith("stdout", retained.result);
    acknowledge(); expect(await pending).toBe(0);
  });
  it.each([false, true])("reports uncertain outcome delivery with its UUID, even when diagnostic delivery fails (%s)", async diagnosticFails => {
    const write = vi.fn().mockRejectedValueOnce(new Error(secret));
    if (diagnosticFails) write.mockRejectedValueOnce(new Error(secret));
    expect(await writeBackupWorkflowOutcome({ ...retained, write })).toBe(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual(["stderr", { event: "backup.failed", id, code: "adapter_output_failed" }]);
    expect(JSON.stringify(write.mock.calls)).not.toContain(secret);
  });
  it("does not retry an already failed outcome when stderr acknowledgement is lost", async () => {
    const write = vi.fn().mockRejectedValue(new Error(secret));
    expect(await writeBackupWorkflowOutcome({ exitCode: 143, result: { event: "backup.failed", id, code: "interrupted" }, write })).toBe(1);
    expect(write).toHaveBeenCalledOnce();
  });
  it.each(["missing", "disabled", "nested", "producer"])("refuses %s recovery configuration before capture", async mode => {
    const f = await fixture();
    if (mode === "missing") delete f.recovery;
    if (mode === "disabled") f.recovery.enabled = false;
    if (mode === "nested") f.recovery.directory = f.root;
    if (mode === "producer") f.recovery.producer = { ...producer, sourceCommit: secret };
    const result = await runBackupWorkflow(f);
    expect(result.exitCode).toBe(1); expect(f.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(secret); expect(await readdir(f.root)).toEqual([]);
  });

  it("loads only an explicitly enabled bounded private recovery plan", async () => {
    const f = await fixture(), file = join(f.root, "recovery-plan.json");
    await writeFile(file, JSON.stringify({ version: 1, ...f.recovery }), { mode: 0o600 });
    delete f.recovery; f.env.BOB_BACKUP_RECOVERY_PLAN_FILE = file;
    expect(await runBackupWorkflow(f)).toEqual(retained);
    expect(f.execute.mock.calls[0][0].env).not.toHaveProperty("BOB_BACKUP_RECOVERY_PLAN_FILE");
  });

  it("retains only after owned input cleanup and does not recapture after a lost retention acknowledgement", async () => {
    const f = await fixture(); let owned, prepared;
    f.execute.mockImplementation(async input => { owned = dirname(input.args[2]); return complete(input); });
    const prepareRecovery = async input => { prepared = await prepareBackupRecoveryHandoff(input); return prepared; };
    const retainRecovery = vi.fn(async input => {
      await expect(lstat(owned)).rejects.toMatchObject({ code: "ENOENT" });
      await retainBackupRecoveryHandoff(input);
      throw new Error(secret);
    });
    expect(await runBackupWorkflow({ ...f, prepareRecovery, retainRecovery })).toEqual({ exitCode: 1,
      result: { event: "backup.failed", id, code: "recovery_retention_failed" } });
    const file = join(f.recovery.directory, `${id}.recovery.json`), before = await lstat(file);
    expect(await retainBackupRecoveryHandoff({ prepared, recovery })).toEqual(retained.result.handoff);
    expect((await lstat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(f.execute).toHaveBeenCalledOnce(); expect(retainRecovery).toHaveBeenCalledOnce();
  });

  it("keeps a locally retained record but reports interruption if acknowledgement is cancelled", async () => {
    const f = await fixture(), controller = new AbortController();
    const result = await runBackupWorkflow({ ...f, signal: controller.signal, retainRecovery: async input => {
      const receipt = await retainBackupRecoveryHandoff(input); controller.abort("SIGTERM"); return receipt;
    } });
    expect(result).toEqual({ exitCode: 143, result: { event: "backup.failed", id, code: "interrupted" } });
    expect(JSON.parse(await readFile(join(f.recovery.directory, `${id}.recovery.json`), "utf8")).recovery).toEqual(recovery);
  });

  it("carries a supervised terminal record into retained anchors and downloads only from those anchors", async () => {
    const f = await fixture(), archive = Buffer.from("synthetic encrypted archive"), manifest = Buffer.from("synthetic encrypted manifest");
    const receipt = { version: 2, id, instance: plan().instance, startedAt: start.startedAt,
      keys: objectKeys(plan().instance, id, start.startedAt), bytes: archive.length,
      archiveSha256: sha256(archive), manifestSha256: sha256(manifest), recipientFingerprint: sha256(plan().recipient),
      integrity: { version: 1, algorithm: "sha256-jsonb-row-multiset-v1" } };
    const receiptBytes = Buffer.from(JSON.stringify(receipt));
    const emitted = { ...verified.result, bytes: archive.length, recovery: { version: 1, expected: {
      id, instance: receipt.instance, startedAt: start.startedAt, recipientFingerprint: receipt.recipientFingerprint,
      receiptSha256: sha256(receiptBytes), receiptBytes: receiptBytes.length, manifestBytes: manifest.length } } };
    const objects = new Map([[receipt.keys.archive, archive], [receipt.keys.manifest, manifest], [receipt.keys.receipt, receiptBytes]]);
    const script = join(f.root, "synthetic-exporter.mjs"), originals = [];
    for (const [name, bytes] of [["archive", archive], ["manifest", manifest], ["receipt", receiptBytes]]) {
      const file = join(f.root, name); originals.push(file); await writeFile(file, bytes);
    }
    await writeFile(script, [start, emitted].map(r => `console.log(${JSON.stringify(JSON.stringify(r))});`).join("\n"));
    f.execute.mockImplementation(input => runBackupExporter({ ...input, args: [script] }));
    const result = await runBackupWorkflow(f);
    expect(result.exitCode).toBe(0); expect(result.result).not.toHaveProperty("recovery");
    for (const file of originals) await rm(file);
    await rm(script);
    const saved = await readFile(join(f.recovery.directory, `${id}.recovery.json`));
    expect(sha256(saved)).toBe(result.result.handoff.sha256);
    const independent = JSON.parse(saved), destination = join(f.root, "download"); await mkdir(destination, { mode: 0o700 });
    const downloaded = await downloadBackupBundle({ enabled: true, directory: destination, expected: independent.recovery.expected,
      storage: { get: async (key, bytes) => { expect(objects.get(key).length).toBe(bytes); return Buffer.from(objects.get(key)); } } });
    expect(await readFile(downloaded.archive)).toEqual(archive);
    expect(await readFile(downloaded.manifestFile)).toEqual(manifest);
    expect(await readFile(downloaded.receiptFile)).toEqual(receiptBytes);
  });
  it.each([undefined, "false", "TRUE", "1"])("is inert without the exact adapter opt-in (%s)", async gate => {
    const f = await fixture(); f.env.BOB_BACKUP_ADAPTER_ENABLED = gate;
    f.env.BOB_BACKUP_SCHEDULE_ENABLED = "true"; f.env.BOB_BACKUP_DATABASE_URL = secret;
    expect(await runBackupWorkflow(f)).toEqual({ exitCode: 1, result: { event: "backup.failed", code: "disabled" } });
    expect(f.execute).not.toHaveBeenCalled(); expect(await readdir(f.root)).toEqual([]);
  });

  it.each(["missing-plan", "disabled-plan", "disabled-capture", "invalid-json", "invalid-plan", "wrong-target", "same-role",
    "missing-capture", "missing-ledger", "oversized-plan", "oversized-url", "retention", "session-token", "missing-storage", "relative-tool"])
  ("refuses %s before files or child execution", async mode => {
    const f = await fixture(), changed = plan();
    if (mode === "disabled-plan") changed.enabled = false;
    if (mode === "disabled-capture") changed.capture.enabled = false;
    if (mode === "invalid-plan") changed.unexpected = true;
    if (mode === "same-role") changed.ledgerRole = changed.capture.target.role;
    if (mode === "retention") changed.retentionEnabled = true;
    f.env.BOB_BACKUP_PLAN_JSON = JSON.stringify(changed);
    if (mode === "missing-plan") delete f.env.BOB_BACKUP_PLAN_JSON;
    if (mode === "invalid-json") f.env.BOB_BACKUP_PLAN_JSON = `{${secret}`;
    if (mode === "wrong-target") f.env.BOB_BACKUP_LEDGER_DATABASE_URL = url("bob_backup_ledger").replace("fixture.invalid", "wrong.invalid");
    if (mode === "missing-capture") delete f.env.BOB_BACKUP_CAPTURE_DATABASE_URL;
    if (mode === "missing-ledger") delete f.env.BOB_BACKUP_LEDGER_DATABASE_URL;
    if (mode === "oversized-plan") f.env.BOB_BACKUP_PLAN_JSON = "é".repeat(8193);
    if (mode === "oversized-url") f.env.BOB_BACKUP_CAPTURE_DATABASE_URL = "é".repeat(4097);
    if (mode === "session-token") f.env.AWS_SESSION_TOKEN = secret;
    if (mode === "missing-storage") delete f.env.AWS_SECRET_ACCESS_KEY;
    if (mode === "relative-tool") f.env.BOB_PG_DUMP_BIN = "./pg_dump";
    const result = await runBackupWorkflow(f);
    expect(result.exitCode).toBe(1); expect(JSON.stringify(result)).not.toContain(secret);
    expect(f.execute).not.toHaveBeenCalled(); expect(await readdir(f.root)).toEqual([]);
  });

  it.each(["missing", "relative", "symlink", "permissive", "checkout"])("rejects %s runner temp without touching siblings", async mode => {
    const f = await fixture(); await writeFile(join(f.root, "keep"), "untouched");
    if (mode === "missing") delete f.env.RUNNER_TEMP;
    if (mode === "relative") f.env.RUNNER_TEMP = ".";
    if (mode === "checkout") f.env.RUNNER_TEMP = core;
    if (mode === "permissive") await chmod(f.root, 0o777);
    if (mode === "symlink") { await symlink(f.root, join(f.root, "alias")); f.env.RUNNER_TEMP = join(f.root, "alias"); }
    expect((await runBackupWorkflow(f)).exitCode).toBe(1);
    expect(f.execute).not.toHaveBeenCalled(); expect(await readFile(join(f.root, "keep"), "utf8")).toBe("untouched");
    expect((await readdir(f.root)).filter(name => name.startsWith("bob-backup-inputs-"))).toEqual([]);
  });

  it("materializes private bounded files and uses only paths, with a minimal child environment", async () => {
    const f = await fixture();
    Object.assign(f.env, { NODE_OPTIONS: secret, OPENAI_API_KEY: secret, BOB_CORE_DEVICE_TOKEN: secret, PGOPTIONS: secret,
      PGPASSWORD: secret, AGE_IDENTITY: secret, BOB_BACKUP_DATABASE_URL: secret, HOME: "/not-forwarded", TMPDIR: "/not-forwarded" });
    await writeFile(join(f.root, "keep"), "untouched");
    let owned;
    f.execute.mockImplementation(async input => {
      expect(input.command).toBe(process.execPath); expect(input.cwd).toBe(core.replace(/\/$/, ""));
      expect(input.args[0]).toBe(join(core, "scripts/backup-database.mjs"));
      expect(input.args.filter((_, i) => i % 2 === 1)).toEqual(["--plan-file", "--capture-url-file", "--ledger-url-file"]);
      const files = input.args.filter((_, i) => i > 0 && i % 2 === 0); owned = dirname(files[0]);
      expect(dirname(owned)).toBe(f.root); expect(input.env.TMPDIR).toBe(owned);
      expect((await lstat(owned)).mode & 0o777).toBe(0o700);
      for (const file of files) {
        const info = await lstat(file); expect(info.isFile()).toBe(true); expect(info.isSymbolicLink()).toBe(false);
        expect(info.mode & 0o777).toBe(0o600); expect(info.uid).toBe(process.getuid());
      }
      expect(JSON.parse(await readFile(files[0], "utf8"))).toEqual({ ...plan(),
        storage: { ...plan().storage, endpoint: "https://storage.invalid/" } });
      expect(await readFile(files[1], "utf8")).toBe(f.env.BOB_BACKUP_CAPTURE_DATABASE_URL);
      expect(await readFile(files[2], "utf8")).toBe(f.env.BOB_BACKUP_LEDGER_DATABASE_URL);
      expect(Object.keys(input.env).sort()).toEqual(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "PATH", "TMPDIR"]);
      expect(JSON.stringify(input.args)).not.toContain(secret);
      // Exporter-owned bundles also stay under the adapter's owned temp directory.
      await writeFile(join(owned, "fixture-ciphertext"), "synthetic-only");
      return complete(input);
    });
    expect(await runBackupWorkflow(f)).toEqual(retained);
    await expect(lstat(owned)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(f.root)).toEqual(["keep"]);
  });

  it.each(["refusal", "exception", "signal", "late-signal"])("removes owned inputs on %s without claiming success", async mode => {
    const f = await fixture(), controller = new AbortController();
    f.execute.mockImplementation(async () => {
      if (mode === "exception") throw new Error(secret);
      if (["signal", "late-signal"].includes(mode)) controller.abort("SIGTERM");
      return mode === "late-signal" ? verified : { exitCode: 1, result: { event: "backup.failed", id, code: "source_mismatch" } };
    });
    const result = await runBackupWorkflow({ ...f, signal: controller.signal });
    expect(result.exitCode).not.toBe(0); expect(result.result.event).toBe("backup.failed");
    if (mode !== "exception") expect(result.result.id).toBe(id);
    expect(JSON.stringify(result)).not.toContain(secret); expect(await readdir(f.root)).toEqual([]);
  });

  it("does no work for an already cancelled request", async () => {
    const f = await fixture(), controller = new AbortController(); controller.abort("SIGINT");
    expect((await runBackupWorkflow({ ...f, signal: controller.signal })).exitCode).toBe(130);
    expect(f.execute).not.toHaveBeenCalled(); expect(await readdir(f.root)).toEqual([]);
  });

  it("preserves uncertain shutdown failure when cancellation was requested", async () => {
    const f = await fixture(), controller = new AbortController();
    f.execute.mockImplementation(async () => {
      controller.abort("SIGTERM");
      return { exitCode: 1, result: { event: "backup.failed", id, code: "exporter_shutdown_failed" } };
    });
    expect(await runBackupWorkflow({ ...f, signal: controller.signal })).toEqual({ exitCode: 1,
      result: { event: "backup.failed", id, code: "exporter_shutdown_failed" } });
    expect(await readdir(f.root)).toEqual([]);
  });

  it.skipIf(process.getuid?.() === 0)("reports cleanup failure instead of success and retains the run identity", async () => {
    const f = await fixture(); let owned;
    f.execute.mockImplementation(async input => {
      owned = dirname(input.args[2]);
      await chmod(owned, 0o500);
      return complete(input);
    });
    try {
      const completed = await runBackupWorkflow(f);
      expect(completed).toEqual({ exitCode: 1, result: { event: "backup.failed", id, code: "input_cleanup_failed" } });
    } finally {
      // Synthetic acceptance owns this residual; never sweep another run's files.
      if (owned) await chmod(owned, 0o700);
    }
  });

  it("does not remove residual directories left by another run", async () => {
    const f = await fixture(), prior = join(f.root, "bob-backup-inputs-prior");
    const { mkdir } = await import("node:fs/promises"); await mkdir(prior, { mode: 0o700 });
    await writeFile(join(prior, "operator-held"), "synthetic-residual");
    expect(await runBackupWorkflow(f)).toEqual(retained);
    expect(await readFile(join(prior, "operator-held"), "utf8")).toBe("synthetic-residual");
    expect(await readdir(f.root)).toEqual(["bob-backup-inputs-prior"]);
  });

  it("the actual CLI refuses legacy activation and secret-bearing arguments without echoing them", () => {
    const cli = join(core, "scripts/run-backup-workflow.mjs");
    for (const args of [[], [`--url=${secret}`]]) {
      const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10000,
        env: { PATH: process.env.PATH, BOB_BACKUP_SCHEDULE_ENABLED: "true", BOB_BACKUP_DATABASE_URL: secret } });
      expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).not.toContain(secret);
      expect(JSON.parse(result.stderr).code).toBe(args.length ? "adapter_arguments_refused" : "disabled");
    }
  });
});
