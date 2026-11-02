// No real bindings are shipped. See docs/changes/2026-11-01-backup-testing-runner.md.
import { appendFile } from "node:fs/promises";
import { BackupCoverageError } from "./lib/backup-coverage.mjs";
import { preflightTestingBackup } from "./lib/backup-testing-runner.mjs";
import { executeTestingBackupCustody } from "./lib/backup-testing-custody.mjs";
import { writeBackupWorkflowOutcome } from "./lib/backup-workflow.mjs";

process.umask(0o077);
const controller = new AbortController();
let outputFailed = false;
const outputError = () => { outputFailed = true; process.exitCode = 1; controller.abort("SIGTERM"); };
process.stdout.on("error", outputError); process.stderr.on("error", outputError);
const handlers = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(signal => [signal, () => controller.abort(signal)]));
for (const [signal, handler] of handlers) process.on(signal, handler);
const safeErrors = new Set(["testing_disabled", "testing_binding_unbound", "testing_scope_refused",
  "testing_context_refused", "testing_lockfile_mismatch", "testing_toolchain_mismatch", "testing_mode_refused",
  "testing_interrupted", "testing_session_credentials_refused", "testing_recovery_unbound"]);
try {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !["--prepare", "--check", "--run"].includes(mode)) throw new Error();
  if (mode === "--run") {
    const { result, exitCode } = await executeTestingBackupCustody({ env: process.env, signal: controller.signal });
    process.exitCode = await writeBackupWorkflowOutcome({ result, exitCode, signal: controller.signal }) || (outputFailed || controller.signal.aborted ? 1 : 0);
  } else {
    const result = await preflightTestingBackup({ mode, env: process.env, signal: controller.signal,
      publish: async image => {
        if (!process.env.GITHUB_OUTPUT) throw new Error();
        await appendFile(process.env.GITHUB_OUTPUT, `image=${image}\n`);
      } });
    process.exitCode = await writeBackupWorkflowOutcome({ result, exitCode: 0, signal: controller.signal }) || (outputFailed || controller.signal.aborted ? 1 : 0);
  }
} catch (error) {
  const code = error instanceof BackupCoverageError && safeErrors.has(error.code)
    ? error.code : "testing_runner_failed";
  process.exitCode = await writeBackupWorkflowOutcome({ exitCode: 1, result: { event: "backup.failed", code },
    signal: controller.signal });
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
}
