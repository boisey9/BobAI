import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { validateTestingBackupBinding, validateTestingRunnerContext, prepareTestingBackup,
  checkTestingToolchain, preflightTestingBackup, executeTestingBackup } from "../scripts/lib/backup-testing-runner.mjs";
import { sha256 } from "../scripts/lib/backup.mjs";

const lock = Buffer.from("synthetic locked dependency bytes");
const binding = () => ({ version: 1, enabled: true, runner: {
  image: `ghcr.io/boisey9/bob-backup-runner@sha256:${"a".repeat(64)}`,
  nodeVersion: "24.0.0", npmVersion: "11.0.0", pgDumpVersion: "pg_dump (PostgreSQL) 18.6", ageVersion: "v1.3.0",
  lockfileSha256: sha256(lock) },
  plan: { version: 1, enabled: true, capture: { version: 1, enabled: true, environment: "testing",
    target: { host: "source.invalid", port: 5432, database: "fixture", role: "bob_backup_capture", postgresMajor: 18 },
    project: { key: "bobai", id: "11111111-1111-4111-8111-111111111111", ownerId: "synthetic-owner", repository: "boisey9/BobAI" },
    expectedSchemaDigest: "c".repeat(64) }, ledgerRole: "bob_backup_ledger", instance: "testing-fixture",
    recipient: "age1" + "a".repeat(58), storage: { endpoint: "https://storage.invalid/", bucket: "synthetic-testing", region: "us-east-2" }, retentionEnabled: false },
  review: { reviewedAt: "2026-11-01T15:00:00.000Z", neonProjectId: "synthetic-project", neonBranchId: "synthetic-branch",
    storageAccountId: "synthetic-account", restoreTarget: { host: "restore.invalid", database: "fixture", postgresMajor: 18 } } });
const context = () => ({ BOB_BACKUP_TESTING_ENABLED: "true", BOB_BACKUP_TESTING_APPROVED_SHA: "a".repeat(40),
  GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "boisey9/BobAI", GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main", GITHUB_WORKFLOW_REF: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main",
  GITHUB_SHA: "a".repeat(40), GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1",
  BOB_BACKUP_TESTING_RECOVERY_DIRECTORY: "/private/recovery-fixture", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", RUNNER_ARCH: "X64" });

describe("disabled testing-runner preparation", () => {
  it("ships unbound and disabled; refuses before tool, credential or client work", async () => {
    const shipped = JSON.parse(await readFile(new URL("../scripts/backup-testing-binding.json", import.meta.url), "utf8"));
    expect(shipped).toEqual({ version: 1, enabled: false, runner: null, plan: null, review: null });
    expect(() => validateTestingBackupBinding(shipped)).toThrow("testing_disabled");
    const read = vi.fn();
    await expect(prepareTestingBackup({ env: {}, read })).rejects.toThrow("testing_disabled");
    expect(read).not.toHaveBeenCalled();
  });
  it("accepts and clones a complete synthetic binding only", () => {
    const input = binding(), result = validateTestingBackupBinding(input);
    expect(result).toEqual(input);
    result.plan.capture.target.host = "changed.invalid";
    expect(input.plan.capture.target.host).toBe("source.invalid");
  });
  it.each([
    ["enabled", b => { b.enabled = "true"; }], ["unknown", b => { b.privateKey = "sentinel"; }],
    ["image", b => { b.runner.image = "postgres:18"; }], ["image-zero", b => { b.runner.image = b.runner.image.replace(/a{64}$/, "0".repeat(64)); }],
    ["other-registry", b => { b.runner.image = b.runner.image.replace("ghcr.io", "evil.invalid"); }],
    ["node", b => { b.runner.nodeVersion = "24"; }], ["node-coercion", b => { b.runner.nodeVersion = ["24.0.0"]; }],
    ["age-coercion", b => { b.runner.ageVersion = ["v1.3.0"]; }], ["npm-coercion", b => { b.runner.npmVersion = ["11.0.0"]; }],
    ["pg-major", b => { b.runner.pgDumpVersion = "pg_dump (PostgreSQL) 17.11"; }],
    ["lock-unbound", b => { b.runner.lockfileSha256 = "0".repeat(64); }],
    ["production", b => { b.plan.capture.environment = "production"; }],
    ["production-project", b => { b.plan.capture.project.id = "10000000-0000-4000-8000-000000000001"; }],
    ["retention", b => { b.plan.retentionEnabled = true; }], ["legacy-instance", b => { b.plan.instance = "personal"; }],
    ["same-principal", b => { b.plan.ledgerRole = b.plan.capture.target.role; }],
    ["restore-source", b => { b.review.restoreTarget.host = b.plan.capture.target.host; }],
    ["restore-major", b => { b.review.restoreTarget.postgresMajor = 17; }],
    ["unbound-review", b => { b.review = null; }], ["review-date", b => { b.review.reviewedAt = "unknown"; }],
    ["review-secret", b => { b.review.storageAccountId = "https://username:password@invalid"; }],
  ])("rejects %s", (_name, mutate) => {
    const b = binding(); mutate(b);
    expect(() => validateTestingBackupBinding(b)).toThrow("backup_coverage_testing_");
  });
  it.each([
    ["GITHUB_ACTIONS", "false"], ["GITHUB_REPOSITORY", "other/repo"], ["GITHUB_EVENT_NAME", "pull_request_target"],
    ["GITHUB_REF", "refs/heads/codex/test"], ["GITHUB_WORKFLOW_REF", "other.yml@refs/heads/main"],
    ["RUNNER_ENVIRONMENT", "self-hosted"], ["RUNNER_OS", "macOS"], ["RUNNER_ARCH", "ARM64"],
    ["GITHUB_SHA", "main"], ["BOB_BACKUP_TESTING_APPROVED_SHA", "b".repeat(40)],
  ])("refuses invalid %s before reading any input", async (key, value) => {
    const env = { ...context(), [key]: value }, read = vi.fn();
    expect(() => validateTestingRunnerContext(env)).toThrow("testing_context_refused");
    await expect(prepareTestingBackup({ env, read })).rejects.toThrow("testing_context_refused");
    expect(read).not.toHaveBeenCalled();
  });
  it("checks committed lock identity with no executable or network", async () => {
    const read = vi.fn(async path => path.pathname.endsWith(".json") && path.pathname.includes("binding") ? Buffer.from(JSON.stringify(binding())) : lock);
    await expect(prepareTestingBackup({ env: context(), read })).resolves.toEqual(binding());
    expect(read).toHaveBeenCalledTimes(2);
    read.mockImplementation(async path => path.pathname.includes("binding") ? Buffer.from(JSON.stringify(binding())) : Buffer.from("changed"));
    await expect(prepareTestingBackup({ env: context(), read })).rejects.toThrow("testing_lockfile_mismatch");
  });
  it.each(["{}", "invalid", "x".repeat(16385)])("rejects malformed/unbound/oversized reviewed input", async value => {
    await expect(prepareTestingBackup({ env: context(), read: async () => Buffer.from(value) })).rejects.toThrow("backup_coverage_testing_");
  });
  it("probes fixed tools without inheriting secret or execution overrides", async () => {
    const b = binding(), probe = vi.fn()
      .mockResolvedValueOnce({ stdout: "11.0.0\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "pg_dump (PostgreSQL) 18.6\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "v1.3.0\n", stderr: "" });
    await checkTestingToolchain(b, { env: { BOB_BACKUP_TESTING_IMAGE: b.runner.image, NODE_OPTIONS: "secret", AWS_SECRET_ACCESS_KEY: "secret" },
      nodeVersion: "24.0.0", platform: "linux", arch: "x64", probe });
    expect(probe.mock.calls.map(([tool]) => tool)).toEqual(["/usr/local/bin/npm", "/usr/bin/pg_dump", "/usr/local/bin/age"]);
    for (const [, args, options] of probe.mock.calls) {
      expect(args).toEqual(["--version"]); expect(options.timeout).toBe(5000); expect(options.maxBuffer).toBe(1024);
      expect(Object.keys(options.env).sort()).toEqual(["LANG", "LC_ALL", "PATH"]);
    }
  });
  it.each(["image", "version", "platform", "arch", "stderr", "output", "error"])("refuses toolchain %s", async fault => {
    const b = binding(), probe = vi.fn(async () => ({ stdout: "11.0.0", stderr: "" }));
    const options = { env: { BOB_BACKUP_TESTING_IMAGE: b.runner.image }, nodeVersion: "24.0.0", platform: "linux", arch: "x64", probe };
    if (fault === "image") options.env.BOB_BACKUP_TESTING_IMAGE += "changed";
    if (fault === "version") options.nodeVersion = "24.1.0";
    if (fault === "platform") options.platform = "darwin";
    if (fault === "arch") options.arch = "arm64";
    if (fault === "stderr") probe.mockResolvedValue({ stdout: "11.0.0", stderr: "private-sentinel" });
    if (fault === "output") probe.mockResolvedValue({ stdout: "wrong-private-sentinel", stderr: "" });
    if (fault === "error") probe.mockRejectedValue(new Error("private-sentinel"));
    await expect(checkTestingToolchain(b, options)).rejects.toThrow("testing_toolchain_mismatch");
    if (["image", "version", "platform", "arch"].includes(fault)) expect(probe).not.toHaveBeenCalled();
  });
  it("passes only bound plan and selected testing inputs to existing adapter", async () => {
    const b = binding(), prepare = vi.fn(async () => b), check = vi.fn(), run = vi.fn(async () => ({ exitCode: 0 }));
    const env = { ...context(), RUNNER_TEMP: "/unowned/original", BOB_BACKUP_TESTING_TEMP: "/private/fixture", BOB_BACKUP_CAPTURE_DATABASE_URL: "capture-secret",
      BOB_BACKUP_LEDGER_DATABASE_URL: "ledger-secret", AWS_ACCESS_KEY_ID: "storage-id", AWS_SECRET_ACCESS_KEY: "storage-secret",
      BOB_BACKUP_PLAN_JSON: "unreviewed", BOB_BACKUP_ADAPTER_ENABLED: "false", NODE_OPTIONS: "unsafe", OPENAI_API_KEY: "provider-secret" };
    await executeTestingBackup({ env, prepare, check, run });
    const selected = run.mock.calls[0][0].env;
    expect(selected.BOB_BACKUP_PLAN_JSON).toBe(JSON.stringify(b.plan));
    expect(selected.BOB_BACKUP_ADAPTER_ENABLED).toBe("true");
    expect(selected.RUNNER_TEMP).toBe("/private/fixture");
    expect(selected.BOB_PG_DUMP_BIN).toBe("/usr/bin/pg_dump"); expect(selected.BOB_AGE_BIN).toBe("/usr/local/bin/age");
    expect(selected.NODE_OPTIONS).toBeUndefined(); expect(selected.OPENAI_API_KEY).toBeUndefined();
    expect(selected.BOB_BACKUP_CAPTURE_DATABASE_URL).toBe("capture-secret");
    expect(check).toHaveBeenCalledBefore(run);
    expect(run.mock.calls[0][0].recovery).toEqual({ enabled: true, directory: "/private/recovery-fixture",
      producer: { repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
        workflow: context().GITHUB_WORKFLOW_REF, runId: "123", runAttempt: "1", image: b.runner.image } });
    expect(selected).not.toHaveProperty("BOB_BACKUP_TESTING_RECOVERY_DIRECTORY");
  });
  it.each([["GITHUB_RUN_ID", undefined], ["GITHUB_RUN_ID", "0"], ["GITHUB_RUN_ATTEMPT", "01"],
    ["GITHUB_RUN_ATTEMPT", "private-secret"], ["BOB_BACKUP_TESTING_RECOVERY_DIRECTORY", undefined]])
  ("refuses unbound recovery %s before invoking capture", async (key, value) => {
    const run = vi.fn();
    await expect(executeTestingBackup({ env: { ...context(), [key]: value }, prepare: async () => binding(),
      check: vi.fn(), run })).rejects.toThrow("testing_recovery_unbound");
    expect(run).not.toHaveBeenCalled();
  });
  it.each(["prepare", "check", "session"])("does not invoke the adapter after %s refusal", async stage => {
    const run = vi.fn(), env = context(), prepare = vi.fn(async () => binding()), check = vi.fn();
    if (stage === "prepare") prepare.mockRejectedValue(new Error("refused"));
    if (stage === "check") check.mockRejectedValue(new Error("refused"));
    if (stage === "session") env.AWS_SESSION_TOKEN = "unsupported";
    await expect(executeTestingBackup({ env, prepare, check, run })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it.each(["before", "prepare", "check", "publish"])("cannot report successful preflight when cancelled during %s", async stage => {
    const controller = new AbortController();
    const prepare = vi.fn(async () => { if (stage === "prepare") controller.abort("SIGTERM"); return binding(); });
    const check = vi.fn(async (_binding, { signal }) => { expect(signal).toBe(controller.signal); controller.abort("SIGINT"); });
    const publish = vi.fn(async () => { if (stage === "publish") controller.abort("SIGHUP"); });
    if (stage === "before") controller.abort("SIGTERM");
    await expect(preflightTestingBackup({ mode: stage === "check" ? "--check" : "--prepare", env: context(),
      signal: controller.signal, prepare, check, publish })).rejects.toThrow("testing_interrupted");
    if (stage !== "publish") expect(publish).not.toHaveBeenCalled();
    if (stage === "before") expect(prepare).not.toHaveBeenCalled();
  });
  it("aborts the bounded tool probe and does not execute later probes", async () => {
    const controller = new AbortController(), b = binding();
    const probe = vi.fn(async (_path, _args, { signal }) => {
      expect(signal).toBe(controller.signal); controller.abort("SIGTERM"); throw new Error("private-error");
    });
    await expect(checkTestingToolchain(b, { env: { BOB_BACKUP_TESTING_IMAGE: b.runner.image }, signal: controller.signal,
      nodeVersion: "24.0.0", platform: "linux", arch: "x64", probe })).rejects.toThrow("testing_interrupted");
    expect(probe).toHaveBeenCalledOnce();
  });
  it.each(["--prepare", "--check"])("emits a safe successful %s preflight only after completion", async mode => {
    const publish = vi.fn(), check = vi.fn();
    expect(await preflightTestingBackup({ mode, env: context(), prepare: async () => binding(), check, publish }))
      .toEqual({ event: "backup.testing_preflight_passed", mode });
    if (mode === "--prepare") expect(publish).toHaveBeenCalledWith(binding().runner.image);
    else { expect(check).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled(); }
  });
  it("CLI refuses the shipped disabled configuration without exposing environment values", () => {
    const path = new URL("../scripts/run-backup-testing.mjs", import.meta.url);
    for (const mode of ["--prepare", "--check", "--run"]) {
      try {
        execFileSync(process.execPath, [path.pathname, mode], { env: { PATH: process.env.PATH, AWS_SECRET_ACCESS_KEY: "private-sentinel" }, encoding: "utf8", stdio: "pipe" });
        throw new Error("expected refusal");
      } catch (error) {
        expect(error.status).toBe(1); expect(error.stdout).toBe("");
        expect(JSON.parse(error.stderr)).toEqual({ event: "backup.failed", code: "testing_disabled" });
      }
    }
  });
  it("ships manual-only, two source holds and execution-step-only testing secrets", async () => {
    const workflow = await readFile(new URL("../../.github/workflows/backups-testing.yml", import.meta.url), "utf8");
    expect(workflow.match(/if: \$\{\{ false &&/g)).toHaveLength(2);
    expect(workflow).toContain("workflow_dispatch:"); expect(workflow).not.toMatch(/^\s+(schedule|push|pull_request|workflow_call):/m);
    expect(workflow).toContain("contents: read"); expect(workflow).not.toContain("id-token:");
    expect(workflow).toContain("npm ci --ignore-scripts --no-audit --no-fund");
    expect(workflow).toMatch(/container:\n\s+image:.*\n\s+# Reap orphaned children[^\n]*\n\s+options: --init\n/);
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(2);
    expect([...workflow.matchAll(/uses: (\S+)/g)].map(match => match[1])).toEqual(Array(2).fill("actions/checkout@11d5960a326750d5838078e36cf38b85af677262"));
    const beforeSecrets = workflow.slice(0, workflow.indexOf("      - name: Run explicitly approved"));
    expect(beforeSecrets).not.toContain("secrets."); expect(workflow.match(/secrets\./g)).toHaveLength(4);
    expect(workflow).not.toMatch(/upload-artifact|actions\/cache|AWS_SESSION_TOKEN|BOB_BACKUP_RECIPIENT|identity-file/);
  });
});
