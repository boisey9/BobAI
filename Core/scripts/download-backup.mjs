// Local/default-off operator. No environment credential discovery or activation.
import { parseArgs } from "node:util";
import { runBackupDownloadOperator } from "./lib/backup-download-operator.mjs";
import { writeBackupWorkflowOutcome } from "./lib/backup-workflow.mjs";

process.umask(0o077);
const controller = new AbortController();
let outputFailed = false;
const outputError = () => { outputFailed = true; process.exitCode = 1; controller.abort("SIGTERM"); };
process.stdout.on("error", outputError); process.stderr.on("error", outputError);
const handlers = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(name => [name, () => controller.abort(name)]));
for (const [name, handler] of handlers) process.on(name, handler);
const deadline = setTimeout(() => controller.abort("TIMEOUT"), 4 * 60_000);
try {
  const { values } = parseArgs({ strict: true, allowPositionals: false, options: {
    check: { type: "boolean" }, download: { type: "boolean" },
    "plan-file": { type: "string" }, "handoff-file": { type: "string" }, "credentials-file": { type: "string" },
  } });
  if (Boolean(values.check) === Boolean(values.download)) throw new Error();
  const outcome = await runBackupDownloadOperator({ mode: values.check ? "--check" : "--download",
    planFile: values["plan-file"], handoffFile: values["handoff-file"], credentialsFile: values["credentials-file"],
    signal: controller.signal, onRecord: record => new Promise((resolve, reject) => process.stdout.write(
      JSON.stringify(record) + "\n", error => error ? reject(error) : resolve())) });
  process.exitCode = await writeBackupWorkflowOutcome({ ...outcome, signal: controller.signal }) ||
    (outputFailed || controller.signal.aborted ? 1 : 0);
} catch {
  process.exitCode = await writeBackupWorkflowOutcome({ exitCode: 1, signal: controller.signal,
    result: { event: "backup.failed", code: "operator_arguments_refused" } });
} finally {
  clearTimeout(deadline);
  for (const [name, handler] of handlers) process.removeListener(name, handler);
}
