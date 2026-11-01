// Not wired into a schedule. Explicit runner inputs and both plan gates required.
import { runBackupWorkflow, writeBackupWorkflowOutcome, BACKUP_WORKFLOW_INPUT_NAMES } from "./lib/backup-workflow.mjs";

process.umask(0o077);
const controller = new AbortController();
let outputFailed = false;
const outputError = () => { outputFailed = true; process.exitCode = 1; controller.abort("SIGTERM"); };
process.stdout.on("error", outputError); process.stderr.on("error", outputError);
const handlers = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(signal => [signal, () => controller.abort(signal)]));
for (const [signal, handler] of handlers) process.on(signal, handler);
const env = { ...process.env };
// Do not leave input secrets in this process's environment for future children.
for (const name of BACKUP_WORKFLOW_INPUT_NAMES) delete process.env[name];
try {
  if (process.argv.length !== 2) {
    process.exitCode = await writeBackupWorkflowOutcome({ exitCode: 1,
      result: { event: "backup.failed", code: "adapter_arguments_refused" } });
  } else {
    const { result, exitCode } = await runBackupWorkflow({ env, signal: controller.signal,
      onRecord: record => { process.stdout.write(JSON.stringify(record) + "\n", error => { if (error) outputError(); }); } });
    process.exitCode = await writeBackupWorkflowOutcome({ result, exitCode, signal: controller.signal }) || (outputFailed || controller.signal.aborted ? 1 : 0);
  }
} catch {
  process.exitCode = await writeBackupWorkflowOutcome({ exitCode: 1,
    result: { event: "backup.failed", code: "adapter_failed" } });
} finally {
  for (const name of BACKUP_WORKFLOW_INPUT_NAMES) delete env[name];
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
}
