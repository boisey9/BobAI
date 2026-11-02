// Explicit opt-in only. The legacy one-credential environment cannot enable this job.
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BackupCoverageError } from "./lib/backup-coverage.mjs";
import { readPrivateBackupInput } from "./lib/backup-preflight.mjs";
import { runBackupJob, validateBackupJobPlan, validateBackupJobTargets } from "./lib/backup-job.mjs";

const writeRecord = (stream, record) => new Promise((resolve, reject) => process[stream].write(
  JSON.stringify(record) + "\n", error => error ? reject(error) : resolve()));

// Keep terminal emission behind cleanup. A successful write callback is only a
// local output acknowledgement, not durable independent recovery-anchor custody.
export async function finalizeBackupJob({ result, error, id, storage, directory, remove = rm,
  write = writeRecord } = {}) {
  let code = error instanceof BackupCoverageError ? error.code :
    error !== undefined || !result ? "job_failed" : undefined;
  try { await storage?.destroy(); } catch { code = "job_cleanup_failed"; }
  // Always attempt our directory cleanup even if storage shutdown failed.
  try { if (directory) await remove(directory, { recursive: true, force: true }); }
  catch { code = "job_cleanup_failed"; }
  if (!code) {
    try { await write("stdout", result); return 0; }
    catch { code = "job_output_failed"; }
  }
  // Do not retry output: a lost acknowledgement may mean bytes were delivered.
  try { await write("stderr", { event: "backup.failed", ...(id ? { id } : {}), code }); }
  catch { /* The nonzero exit remains authoritative when diagnostics cannot be written. */ }
  return 1;
}

async function main() {
  let directory, storage, id, result, error;
  try {
    const { values } = parseArgs({ strict: true, allowPositionals: false, options: {
      "plan-file": { type: "string" }, "capture-url-file": { type: "string" }, "ledger-url-file": { type: "string" },
    } });
    if (!values["plan-file"]) throw new BackupCoverageError("disabled");
    const plan = validateBackupJobPlan(JSON.parse(await readPrivateBackupInput(values["plan-file"], 16384)));
    const captureURL = await readPrivateBackupInput(values["capture-url-file"], 8192);
    const ledgerURL = await readPrivateBackupInput(values["ledger-url-file"], 8192);
    validateBackupJobTargets(plan, captureURL, ledgerURL);
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim(), secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    if (!accessKeyId || !secretAccessKey) throw new BackupCoverageError("storage_credentials_required");
    // Imports/clients occur only after explicit plan and both private targets validate.
    const { Pool } = await import("@neondatabase/serverless");
    const { createBackupStorage } = await import("./lib/backup-storage.mjs");
    const openConnection = async url => {
      const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15000, query_timeout: 15000,
        options: "-c default_transaction_read_only=on -c statement_timeout=10000" });
      pool.on("error", () => {});
      let client;
      try { client = await pool.connect(); }
      catch { await pool.end().catch(() => {}); throw new BackupCoverageError("connection_failed"); }
      return { query: (sql, params) => client.query(sql, params),
        close: async () => { client.release(true); await pool.end(); } };
    };
    storage = createBackupStorage({ plan, credentials: { accessKeyId, secretAccessKey } });
    id = randomUUID(); directory = await mkdtemp(join(tmpdir(), "bob-backup-"));
    const startedAt = new Date().toISOString();
    // Preserve reconciliation identity before capture/ledger/storage work begins.
    await writeRecord("stdout", { event: "backup.started", id, startedAt });
    result = await runBackupJob({ plan, captureURL, ledgerURL, openCapture: openConnection, openLedger: openConnection,
      storage, directory, id, startedAt,
      pgDump: process.env.BOB_PG_DUMP_BIN || "pg_dump", age: process.env.BOB_AGE_BIN || "age" });
  } catch (failure) { error = failure; }
  return finalizeBackupJob({ result, error, id, storage, directory });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  // Writable callbacks report broken pipes; keep their later error events from
  // escaping as raw diagnostics while the CLI performs cleanup and exits.
  let outputFailed = false;
  const outputError = () => { outputFailed = true; process.exitCode = 1; };
  process.stdout.on("error", outputError);
  process.stderr.on("error", outputError);
  const status = await main();
  process.exitCode = status || (outputFailed ? 1 : 0);
}
