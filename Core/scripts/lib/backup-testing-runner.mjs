// Local/default-off preparation. Review metadata is not proof of remote authority.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { validateBackupJobPlan } from "./backup-job.mjs";
import { sha256 } from "./backup.mjs";
import { runBackupWorkflow } from "./backup-workflow.mjs";
import { validateBackupRecoveryProducer } from "./backup-recovery-handoff.mjs";

const executeFile = promisify(execFile);
const fail = code => { throw new BackupCoverageError(`testing_${code}`); };
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const safeName = v => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v);
const sha = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v) && !/^0+$/.test(v);
const productionProject = "10000000-0000-4000-8000-000000000001";
const bindingPath = new URL("../backup-testing-binding.json", import.meta.url);
const lockPath = new URL("../../package-lock.json", import.meta.url);
const active = signal => { if (signal?.aborted) fail("interrupted"); };

export function validateTestingBackupBinding(input) {
  if (input?.enabled !== true) fail("disabled");
  if (!exact(input, ["version", "enabled", "runner", "plan", "review"]) || input.version !== 1 ||
      !exact(input.runner, ["image", "nodeVersion", "npmVersion", "pgDumpVersion", "ageVersion", "lockfileSha256"]) ||
      typeof input.runner.image !== "string" ||
      !/^ghcr\.io\/boisey9\/bob-backup-runner@sha256:[a-f0-9]{64}$/.test(input.runner.image) ||
      input.runner.image.endsWith("0".repeat(64)) || typeof input.runner.nodeVersion !== "string" ||
      !/^24\.[0-9]+\.[0-9]+$/.test(input.runner.nodeVersion) || typeof input.runner.npmVersion !== "string" ||
      !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(input.runner.npmVersion) ||
      typeof input.runner.pgDumpVersion !== "string" || input.runner.pgDumpVersion.length > 120 ||
      !/^pg_dump \(PostgreSQL\) (17|18)\.[0-9]+(?: [\w .()+~-]+)?$/.test(input.runner.pgDumpVersion) ||
      typeof input.runner.ageVersion !== "string" || !/^v?1\.[0-9]+\.[0-9]+$/.test(input.runner.ageVersion) ||
      !sha(input.runner.lockfileSha256)) fail("binding_unbound");
  let plan;
  try { plan = validateBackupJobPlan(input.plan); } catch { fail("binding_unbound"); }
  if (plan.capture.environment !== "testing" || plan.capture.project.id === productionProject ||
      !/^testing-[a-z0-9][a-z0-9-]*$/.test(plan.instance) || plan.retentionEnabled ||
      !input.runner.pgDumpVersion.startsWith(`pg_dump (PostgreSQL) ${plan.capture.target.postgresMajor}.`)) fail("scope_refused");
  const review = input.review;
  if (!exact(review, ["reviewedAt", "neonProjectId", "neonBranchId", "storageAccountId", "restoreTarget"]) ||
      typeof review.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(review.reviewedAt) ||
      !Number.isFinite(Date.parse(review.reviewedAt)) ||
      !safeName(review.neonProjectId) || !safeName(review.neonBranchId) || !safeName(review.storageAccountId) ||
      !exact(review.restoreTarget, ["host", "database", "postgresMajor"]) ||
      !safeName(review.restoreTarget.host) || !safeName(review.restoreTarget.database) ||
      review.restoreTarget.postgresMajor !== plan.capture.target.postgresMajor ||
      (review.restoreTarget.host === plan.capture.target.host && review.restoreTarget.database === plan.capture.target.database))
    fail("binding_unbound");
  return { ...structuredClone(input), plan };
}

export function validateTestingRunnerContext(env) {
  if (env.BOB_BACKUP_TESTING_ENABLED !== "true") fail("disabled");
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "boisey9/BobAI" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_WORKFLOW_REF !== "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main" ||
      env.RUNNER_ENVIRONMENT !== "github-hosted" || env.RUNNER_OS !== "Linux" || env.RUNNER_ARCH !== "X64" ||
      typeof env.GITHUB_SHA !== "string" || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA) ||
      env.GITHUB_SHA !== env.BOB_BACKUP_TESTING_APPROVED_SHA) fail("context_refused");
}

// No dependencies, credentials, SDK client or executable is needed for preparation.
export async function prepareTestingBackup({ env, read = readFile } = {}) {
  validateTestingRunnerContext(env ?? {});
  let binding;
  try {
    const bytes = await read(bindingPath);
    if (bytes.length > 16384) fail("binding_unbound");
    binding = validateTestingBackupBinding(JSON.parse(bytes.toString("utf8")));
    if (sha256(await read(lockPath)) !== binding.runner.lockfileSha256) fail("lockfile_mismatch");
  } catch (error) {
    if (error instanceof BackupCoverageError) throw error;
    fail("binding_unbound");
  }
  return binding;
}

export async function checkTestingToolchain(binding, { env, signal, nodeVersion = process.versions.node,
  platform = process.platform, arch = process.arch, probe = executeFile } = {}) {
  active(signal);
  if (platform !== "linux" || arch !== "x64" || nodeVersion !== binding.runner.nodeVersion ||
      env?.BOB_BACKUP_TESTING_IMAGE !== binding.runner.image) fail("toolchain_mismatch");
  const toolEnv = { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
  try {
    for (const [path, expected] of [["/usr/local/bin/npm", binding.runner.npmVersion],
      ["/usr/bin/pg_dump", binding.runner.pgDumpVersion], ["/usr/local/bin/age", binding.runner.ageVersion]]) {
      const result = await probe(path, ["--version"], { env: toolEnv, signal, timeout: 5000, maxBuffer: 1024 });
      active(signal);
      if (result.stderr || result.stdout.trim() !== expected) fail("toolchain_mismatch");
    }
  } catch { active(signal); fail("toolchain_mismatch"); }
}

export async function preflightTestingBackup({ mode, env, signal, prepare = prepareTestingBackup,
  check = checkTestingToolchain, publish = async () => {} } = {}) {
  active(signal);
  if (!["--prepare", "--check"].includes(mode)) fail("mode_refused");
  const binding = await prepare({ env });
  active(signal);
  if (mode === "--check") await check(binding, { env, signal });
  active(signal);
  if (mode === "--prepare") await publish(binding.runner.image);
  active(signal);
  return { event: "backup.testing_preflight_passed", mode };
}

// Execution cannot be selected by a plan flag alone. The CLI also checks the
// published manual workflow, approved source SHA and committed toolchain binding.
export async function executeTestingBackup({ env, signal, onRecord, prepare = prepareTestingBackup,
  check = checkTestingToolchain, run = runBackupWorkflow } = {}) {
  active(signal);
  const binding = await prepare({ env });
  active(signal);
  await check(binding, { env, signal });
  active(signal);
  if (env.AWS_SESSION_TOKEN) fail("session_credentials_refused");
  let producer;
  try {
    // prepare/check already bound the published source, workflow and image.
    // Run identity adds provenance; this does not attest independent custody.
    producer = validateBackupRecoveryProducer({ repository: env.GITHUB_REPOSITORY,
      sourceCommit: env.GITHUB_SHA, workflow: env.GITHUB_WORKFLOW_REF,
      runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, image: binding.runner.image });
    if (typeof env.BOB_BACKUP_TESTING_RECOVERY_DIRECTORY !== "string" || !env.BOB_BACKUP_TESTING_RECOVERY_DIRECTORY)
      fail("recovery_unbound");
  } catch { fail("recovery_unbound"); }
  const selected = Object.fromEntries(["BOB_BACKUP_CAPTURE_DATABASE_URL",
    "BOB_BACKUP_LEDGER_DATABASE_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
    .map(key => [key, env[key]]));
  return run({ signal, onRecord, recovery: { enabled: true, directory: env.BOB_BACKUP_TESTING_RECOVERY_DIRECTORY, producer },
    env: { ...selected, RUNNER_TEMP: env.BOB_BACKUP_TESTING_TEMP, BOB_BACKUP_ADAPTER_ENABLED: "true",
    BOB_BACKUP_PLAN_JSON: JSON.stringify(binding.plan), PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C",
    BOB_PG_DUMP_BIN: "/usr/bin/pg_dump", BOB_AGE_BIN: "/usr/local/bin/age" } });
}
