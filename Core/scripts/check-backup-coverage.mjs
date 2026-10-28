// Explicit, read-only operator check. No unattended job imports this entry point.
import { parseArgs } from "node:util";
import { BackupCoverageError } from "./lib/backup-coverage.mjs";
import { readPrivateBackupInput, validateBackupPreflightPlan, validateBackupPreflightTarget, runBackupCoveragePreflight } from "./lib/backup-preflight.mjs";

let pool, client;
try {
  const { values } = parseArgs({ strict: true, allowPositionals: false, options: {
    "plan-file": { type: "string" }, "database-url-file": { type: "string" },
  } });
  if (!values["plan-file"]) throw new BackupCoverageError("disabled");
  const plan = validateBackupPreflightPlan(JSON.parse(await readPrivateBackupInput(values["plan-file"], 16384)));
  const databaseURL = validateBackupPreflightTarget(await readPrivateBackupInput(values["database-url-file"], 8192), plan);
  // A disabled/invalid plan or mismatched target never constructs a connection.
  const { Pool } = await import("@neondatabase/serverless");
  pool = new Pool({ connectionString: databaseURL, max: 1, connectionTimeoutMillis: 15000,
    query_timeout: 15000, options: "-c default_transaction_read_only=on -c statement_timeout=10000" });
  pool.on("error", () => {}); // Never serialize driver connection objects.
  client = await pool.connect();
  const evidence = await runBackupCoveragePreflight(client, plan);
  client.release(); client = undefined;
  await pool.end(); pool = undefined;
  console.log(JSON.stringify(evidence));
} catch (error) {
  console.error(JSON.stringify({ event: "backup.coverage.refused",
    code: error instanceof BackupCoverageError ? error.code : "check_failed" }));
  process.exitCode = 1;
} finally {
  if (client) client.release(true);
  if (pool) await pool.end().catch(() => {});
}
