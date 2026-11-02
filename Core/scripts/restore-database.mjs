import { parseArgs } from "node:util";
import { runRestoreDatabase, writeRestoreOutcome } from "./lib/backup-restore-operation.mjs";

process.umask(0o077);
// Driver/tool errors and connection strings never become CLI diagnostics.
process.stdout.on("error", () => { process.exitCode = 1; });
process.stderr.on("error", () => { process.exitCode = 1; });
const controller = new AbortController();
const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
const handlers = new Map(signals.map(signal => [signal, () => controller.abort(signal)]));
for (const [signal, handler] of handlers) process.on(signal, handler);
let outcome;
try {
  const { values } = parseArgs({ strict: true, allowPositionals: false, options: {
    archive: { type: "string" }, manifest: { type: "string" }, receipt: { type: "string" },
    identity: { type: "string" }, "destination-url-file": { type: "string" },
    "confirm-empty-destination": { type: "boolean" }, "allow-legacy-counts-only": { type: "boolean" },
  } });
  outcome = await runRestoreDatabase({ archive: values.archive, manifest: values.manifest, receipt: values.receipt,
    identity: values.identity, destinationURLFile: values["destination-url-file"],
    confirmEmptyDestination: values["confirm-empty-destination"], allowLegacyCountsOnly: values["allow-legacy-counts-only"],
    age: process.env.BOB_AGE_BIN || "age", pgRestore: process.env.BOB_PG_RESTORE_BIN || "pg_restore", signal: controller.signal });
} catch {
  outcome = { exitCode: 1, result: { event: "restore.failed", code: "restore_input_invalid", phase: "input",
    destinationMayContainRestoredData: false, commitUncertain: false, cleanupUncertain: false } };
}
process.exitCode = await writeRestoreOutcome({ ...outcome, signal: controller.signal });
if (controller.signal.aborted) process.exitCode = ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[controller.signal.reason] ?? 1);
for (const [signal, handler] of handlers) process.removeListener(signal, handler);
