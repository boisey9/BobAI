import { readFile, stat } from "node:fs/promises";
import { BackupCoverageError, readBackupCatalog, validateBackupLedgerCoverage } from "./backup-coverage.mjs";
import { checkBackupConnectionIdentity, validateBackupPreflightPlan, validateBackupPreflightTarget,
  withBackupCoverageSnapshot } from "./backup-preflight.mjs";
import { createEncryptedBundle, expiredBackupKeys, objectKeys, sha256, MAX_ARCHIVE_BYTES, MAX_MANIFEST_BYTES, validateBackupReceipt } from "./backup.mjs";
import { validateBackupRecovery } from "./backup-recovery-handoff.mjs";

const fail = code => { throw new BackupCoverageError(code); };
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

// Shared nonsecret target contract. Recovery does not need a capture plan or
// database authority merely to validate its explicitly selected object store.
export function validateBackupStorageTarget(input) {
  if (!exact(input, ["bucket", "endpoint", "region"]) || typeof input.endpoint !== "string" ||
      typeof input.bucket !== "string" || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(input.bucket) ||
      typeof input.region !== "string" || !/^[a-z0-9-]{1,40}$/.test(input.region)) fail("invalid_job_plan");
  let endpoint;
  try { endpoint = new URL(input.endpoint); } catch { fail("invalid_job_plan"); }
  if (endpoint.protocol !== "https:" || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    fail("invalid_job_plan");
  return { bucket: input.bucket, endpoint: endpoint.toString(), region: input.region };
}

export function validateBackupJobPlan(input) {
  if (!input || input.enabled === false || input.enabled === undefined) fail("disabled");
  if (!exact(input, ["version", "enabled", "capture", "ledgerRole", "instance", "recipient", "storage", "retentionEnabled"]) ||
      input.version !== 1 || input.enabled !== true || typeof input.retentionEnabled !== "boolean" ||
      typeof input.instance !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(input.instance) ||
      typeof input.recipient !== "string" || !/^age1[a-z0-9]{20,100}$/.test(input.recipient) ||
      typeof input.ledgerRole !== "string" || !/^bob_backup_[a-z0-9_]{1,40}$/.test(input.ledgerRole)) fail("invalid_job_plan");
  const storage = validateBackupStorageTarget(input.storage);
  const capture = validateBackupPreflightPlan(input.capture);
  if (capture.target.role === input.ledgerRole) fail("separate_credentials_required");
  return { ...structuredClone(input), capture, storage };
}

export function validateBackupJobTargets(input, captureURL, ledgerURL) {
  const plan = validateBackupJobPlan(input);
  validateBackupPreflightTarget(captureURL, plan.capture);
  validateBackupPreflightTarget(ledgerURL, { ...plan.capture, target: { ...plan.capture.target, role: plan.ledgerRole } });
  return plan;
}

// Preserve the existing import contract for callers of the bounded reader.
export { readBoundedBackupObject } from "./backup-storage-stream.mjs";

async function validateLedger(client, plan) {
  let begun = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); begun = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL search_path = pg_catalog,public");
    await checkBackupConnectionIdentity(client, { ...plan.capture.target, role: plan.ledgerRole });
    validateBackupLedgerCoverage(await readBackupCatalog(client));
  } finally {
    if (begun) {
      try { await client.query("ROLLBACK"); } catch { fail("rollback_unconfirmed"); }
    }
  }
}

async function writeLedger(client, sql, parameters, id) {
  let begun = false;
  try {
    await client.query("BEGIN READ WRITE"); begun = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    const rows = (await client.query(sql, parameters)).rows;
    if (rows.length !== 1 || rows[0].id !== id) fail("ledger_receipt_mismatch");
    await client.query("COMMIT"); begun = false;
  } finally {
    if (begun) await client.query("ROLLBACK").catch(() => {});
  }
}

// No storage or ledger side effect occurs until complete capture, rollback and
// connection close succeed. Injected transports allow entirely isolated acceptance.
export async function runBackupJob({ plan: input, captureURL, ledgerURL, openCapture, openLedger,
  storage, directory, id, startedAt, pgDump, age, exportBundle = createEncryptedBundle }) {
  const plan = validateBackupJobTargets(input, captureURL, ledgerURL);
  if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) ||
      typeof startedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startedAt) ||
      !Number.isFinite(Date.parse(startedAt)) || new Date(startedAt).toISOString() !== startedAt) fail("invalid_run");
  const expectedKeys = objectKeys(plan.instance, id, startedAt);
  let capture, ledger, bundle, result, registered = false;
  try {
    capture = await openCapture(captureURL);
    try {
      bundle = await withBackupCoverageSnapshot(capture, plan.capture, async evidence => {
        try {
          return await exportBundle({ client: capture, connectionString: captureURL, directory,
            recipient: plan.recipient, id, instance: plan.instance, startedAt, pgDump, age,
            expectedTables: evidence.catalog.relations.map(({ schema, name }) => ({ schema, name })),
            coverage: { version: 1, environment: plan.capture.environment, projectId: plan.capture.project.id,
              schemaDigest: evidence.schemaDigest, tableCount: evidence.tableCount } });
        } catch { fail("capture_failed"); }
      }, { strictCapture: true });
    } finally { await capture.close(); }
    const receipt = bundle?.receipt;
    if (!receipt || receipt.id !== id || receipt.instance !== plan.instance || receipt.startedAt !== startedAt ||
        receipt.recipientFingerprint !== sha256(plan.recipient) ||
        Object.keys(expectedKeys).some(k => receipt.keys?.[k] !== expectedKeys[k])) fail("capture_receipt_mismatch");
    try { validateBackupReceipt(receipt, { requireIntegrity: true }); }
    catch { fail("capture_receipt_mismatch"); }
    // Check the complete local artifact set before any ledger or storage side effect.
    // Recheck while uploading too, since capture output must remain immutable.
    try {
      if ((await stat(bundle.archive)).size !== receipt.bytes ||
          (await stat(bundle.manifestFile)).size > MAX_MANIFEST_BYTES) fail("capture_artifact_changed");
      const archiveBytes = await readFile(bundle.archive), manifestBytes = await readFile(bundle.manifestFile);
      if (archiveBytes.length !== receipt.bytes || sha256(archiveBytes) !== receipt.archiveSha256 ||
          manifestBytes.length < 1 || sha256(manifestBytes) !== receipt.manifestSha256) fail("capture_artifact_changed");
    } catch { fail("capture_artifact_changed"); }

    ledger = await openLedger(ledgerURL);
    if (ledger === capture) fail("separate_credentials_required");
    await validateLedger(ledger, plan);
    const owner = plan.capture.project.ownerId, instance = plan.instance;
    await writeLedger(ledger, `INSERT INTO public.bob_backup_runs(id,owner_id,instance_key,started_at,status)
      VALUES($1::uuid,$2,$3,$4::timestamptz,'running') RETURNING id::text AS id`, [id, owner, instance, startedAt], id);
    registered = true;
    let uploadedManifestBytes;
    for (const [file, key, hash] of [[bundle.archive, receipt.keys.archive, receipt.archiveSha256],
      [bundle.manifestFile, receipt.keys.manifest, receipt.manifestSha256]]) {
      if ((await stat(file)).size > (file === bundle.archive ? MAX_ARCHIVE_BYTES : MAX_MANIFEST_BYTES)) fail("capture_artifact_changed");
      const bytes = await readFile(file);
      if (sha256(bytes) !== hash) fail("capture_artifact_changed");
      await storage.put(key, bytes, "application/octet-stream");
      if (sha256(await storage.get(key, bytes.length)) !== hash) fail("storage_readback_failed");
      if (key === receipt.keys.manifest) uploadedManifestBytes = bytes.length;
    }
    const receiptBytes = Buffer.from(JSON.stringify(receipt));
    const receiptSha256 = sha256(receiptBytes);
    await storage.put(receipt.keys.receipt, receiptBytes, "application/json");
    if (sha256(await storage.get(receipt.keys.receipt, receiptBytes.length)) !== receiptSha256) fail("storage_readback_failed");
    await writeLedger(ledger, `UPDATE public.bob_backup_runs SET status='verified',verified_at=now(),
      archive_key=$4,manifest_key=$5,receipt_key=$6,ciphertext_sha256=$7,size_bytes=$8::bigint
      WHERE id=$1::uuid AND owner_id=$2 AND instance_key=$3 AND status='running' RETURNING id::text AS id`,
    [id, owner, instance, receipt.keys.archive, receipt.keys.manifest, receipt.keys.receipt, receipt.archiveSha256, receipt.bytes], id);

    let expired = [];
    if (plan.retentionEnabled) {
      const objects = [], seen = new Set(); let continuation, pages = 0;
      do {
        if (++pages > 100) fail("retention_bound_exceeded");
        const page = await storage.list(`${instance}/`, continuation);
        objects.push(...(page.Contents || []));
        if (objects.length > 20000) fail("retention_bound_exceeded");
        continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && (!continuation || seen.has(continuation))) fail("retention_inventory_incomplete");
        seen.add(continuation);
      } while (continuation);
      expired = expiredBackupKeys(objects, instance, Date.now(), Object.values(receipt.keys));
      for (let offset = 0; offset < expired.length; offset += 1000) {
        if ((await storage.remove(expired.slice(offset, offset + 1000)))?.Errors?.length) fail("retention_failed");
      }
      await writeLedger(ledger, `UPDATE public.bob_backup_runs SET retention_checked_at=now()
        WHERE id=$1::uuid AND owner_id=$2 AND instance_key=$3 AND status='verified' RETURNING id::text AS id`, [id, owner, instance], id);
    }
    result = { event: "backup.verified", id, bytes: receipt.bytes,
      retentionChecked: plan.retentionEnabled, expiredObjectsRemoved: expired.length,
      recovery: validateBackupRecovery({ version: 1, expected: { id, instance, startedAt,
        recipientFingerprint: receipt.recipientFingerprint, receiptSha256,
        receiptBytes: receiptBytes.length, manifestBytes: uploadedManifestBytes } }) };
  } catch (error) {
    if (registered) await writeLedger(ledger, `UPDATE public.bob_backup_runs
      SET status=CASE WHEN status='verified' THEN status ELSE 'failed' END,failure_code='backup_job_failed',failed_at=now()
      WHERE id=$1::uuid AND owner_id=$2 AND instance_key=$3 RETURNING id::text AS id`,
    [id, plan.capture.project.ownerId, plan.instance], id).catch(() => {});
    if (error instanceof BackupCoverageError) throw error;
    fail("job_failed");
  } finally {
    if (ledger) {
      try { await ledger.close(); } catch { fail("ledger_close_failed"); }
    }
  }
  // These anchors describe the exact verified upload. The caller must retain
  // them independently; they are not a durable custody acknowledgement.
  return result;
}
