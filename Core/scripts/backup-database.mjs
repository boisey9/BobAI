import { observeDatabaseErrors } from "./lib/database-errors.mjs";
// No private recovery identity belongs on this runner. It encrypts with a public recipient.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { createEncryptedBundle, expiredBackupKeys, postgresEnvironment, sha256 } from "./lib/backup.mjs";

process.umask(0o077);
const required = name => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}.`); return value; };
const databaseURL = required("BOB_BACKUP_DATABASE_URL");
postgresEnvironment(databaseURL);
const ownerId = required("BOB_BACKUP_OWNER_ID");
const instance = required("BOB_BACKUP_INSTANCE");
const bucket = required("BOB_BACKUP_BUCKET");
const recipient = required("BOB_BACKUP_RECIPIENT");
const endpoint = new URL(required("AWS_ENDPOINT_URL_S3"));
if (endpoint.protocol !== "https:") throw new Error("Private object storage requires HTTPS.");
required("AWS_ACCESS_KEY_ID"); required("AWS_SECRET_ACCESS_KEY");
const s3 = new S3Client({ region: required("AWS_REGION"), endpoint: endpoint.toString(), forcePathStyle: true, maxAttempts: 3 });
const send = command => s3.send(command, { abortSignal: AbortSignal.timeout(60_000) });
const pool = observeDatabaseErrors(new Pool({ connectionString: databaseURL, max: 2, connectionTimeoutMillis: 15_000 }));
const id = randomUUID();
const startedAt = new Date().toISOString();
const directory = await mkdtemp(join(tmpdir(), "bob-backup-"));
let registered = false;
try {
  await pool.query("INSERT INTO bob_backup_runs(id,owner_id,instance_key,started_at,status) VALUES($1,$2,$3,$4,'running')", [id, ownerId, instance, startedAt]);
  registered = true;
  const client = await pool.connect();
  let bundle;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    bundle = await createEncryptedBundle({ client, connectionString: databaseURL, directory, recipient, id, instance, startedAt,
      pgDump: process.env.BOB_PG_DUMP_BIN || "pg_dump", age: process.env.BOB_AGE_BIN || "age" });
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
  for (const [file, key, hash] of [[bundle.archive, bundle.receipt.keys.archive, bundle.receipt.archiveSha256],
    [bundle.manifestFile, bundle.receipt.keys.manifest, bundle.receipt.manifestSha256]]) {
    await send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: await readFile(file), ContentType: "application/octet-stream" }));
    const downloaded = await send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!downloaded.Body || sha256(await downloaded.Body.transformToByteArray()) !== hash)
      throw new Error("Encrypted backup read-back verification failed.");
  }
  await send(new PutObjectCommand({ Bucket: bucket, Key: bundle.receipt.keys.receipt,
    Body: JSON.stringify(bundle.receipt), ContentType: "application/json" }));
  // A successful upload is recorded independently from housekeeping. Failures
  // remain visible without concealing the availability of a recoverable archive.
  await pool.query("UPDATE bob_backup_runs SET status='verified',verified_at=now(),archive_key=$2,manifest_key=$3,receipt_key=$4,ciphertext_sha256=$5,size_bytes=$6 WHERE id=$1",
    [id, bundle.receipt.keys.archive, bundle.receipt.keys.manifest, bundle.receipt.keys.receipt, bundle.receipt.archiveSha256, bundle.receipt.bytes]);
  const objects = [];
  let continuation;
  do {
    const page = await send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${instance}/`, ContinuationToken: continuation }));
    objects.push(...(page.Contents || []));
    if (objects.length > 20_000) throw new Error("Retention inventory exceeds its bound.");
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !continuation) throw new Error("Incomplete storage inventory.");
  } while (continuation);
  const expired = expiredBackupKeys(objects, instance, Date.now(), Object.values(bundle.receipt.keys));
  for (let offset = 0; offset < expired.length; offset += 1000) {
    const deleted = await send(new DeleteObjectsCommand({ Bucket: bucket,
      Delete: { Objects: expired.slice(offset, offset + 1000).map(Key => ({ Key })) } }));
    if (deleted.Errors?.length) throw new Error("Backup retention cleanup failed.");
  }
  await pool.query("UPDATE bob_backup_runs SET retention_checked_at=now() WHERE id=$1", [id]);
  console.log(JSON.stringify({ event: "backup.verified", id, bytes: bundle.receipt.bytes, expiredObjectsRemoved: expired.length }));
} catch (error) {
  if (registered) await pool.query("UPDATE bob_backup_runs SET status=CASE WHEN status='verified' THEN status ELSE 'failed' END, failure_code='backup_job_failed',failed_at=now() WHERE id=$1", [id]).catch(() => {});
  console.error(JSON.stringify({ event: "backup.failed", id, code: "backup_job_failed", error: error.name }));
  process.exitCode = 1;
} finally { await pool.end(); s3.destroy(); await rm(directory, { recursive: true, force: true }); }
