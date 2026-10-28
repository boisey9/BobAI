// Explicit opt-in only. The legacy one-credential environment cannot enable this job.
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackupCoverageError } from "./lib/backup-coverage.mjs";
import { readPrivateBackupInput } from "./lib/backup-preflight.mjs";
import { readBoundedBackupObject, runBackupJob, validateBackupJobPlan, validateBackupJobTargets } from "./lib/backup-job.mjs";

process.umask(0o077);
let directory, s3, id;
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
  const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
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
  s3 = new S3Client({ region: plan.storage.region, endpoint: plan.storage.endpoint, forcePathStyle: true,
    maxAttempts: 3, credentials: { accessKeyId, secretAccessKey } });
  const send = command => s3.send(command, { abortSignal: AbortSignal.timeout(60000) });
  const storage = {
    put: (Key, Body, ContentType) => send(new PutObjectCommand({ Bucket: plan.storage.bucket, Key, Body, ContentType })),
    get: async (Key, expectedBytes) => {
      const result = await send(new GetObjectCommand({ Bucket: plan.storage.bucket, Key }));
      if (!result.Body || (result.ContentLength !== undefined && result.ContentLength !== expectedBytes)) {
        result.Body?.destroy?.(); throw new BackupCoverageError("storage_readback_failed");
      }
      return readBoundedBackupObject(result.Body, expectedBytes);
    },
    list: (Prefix, ContinuationToken) => send(new ListObjectsV2Command({ Bucket: plan.storage.bucket, Prefix, ContinuationToken })),
    remove: keys => send(new DeleteObjectsCommand({ Bucket: plan.storage.bucket, Delete: { Objects: keys.map(Key => ({ Key })) } })),
  };
  id = randomUUID(); directory = await mkdtemp(join(tmpdir(), "bob-backup-"));
  const result = await runBackupJob({ plan, captureURL, ledgerURL, openCapture: openConnection, openLedger: openConnection,
    storage, directory, id, startedAt: new Date().toISOString(),
    pgDump: process.env.BOB_PG_DUMP_BIN || "pg_dump", age: process.env.BOB_AGE_BIN || "age" });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ event: "backup.failed", ...(id ? { id } : {}),
    code: error instanceof BackupCoverageError ? error.code : "job_failed" }));
  process.exitCode = 1;
} finally {
  s3?.destroy();
  if (directory) await rm(directory, { recursive: true, force: true });
}
