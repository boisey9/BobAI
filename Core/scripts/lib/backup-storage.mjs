import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { validateBackupJobPlan, validateBackupStorageTarget } from "./backup-job.mjs";
import { validateBackupDownloadExpected } from "./backup-download.mjs";
import { MAX_ARCHIVE_BYTES, MAX_MANIFEST_BYTES, objectKeys } from "./backup.mjs";
import { readBackupStream, readBoundedBackupObject } from "./backup-storage-stream.mjs";

export const BACKUP_STORAGE_TIMEOUT_MS = 60000;
export const MAX_BACKUP_STORAGE_METADATA_BYTES = 2 * 1024 * 1024;
const fail = code => { throw new BackupCoverageError(code); };
const safeCodes = new Set(["storage_readback_failed", "storage_operation_aborted", "storage_operation_timeout",
  "storage_request_failed", "storage_closed", "storage_cleanup_failed"]);
const validSignal = signal => signal === undefined || signal instanceof AbortSignal;

// Pure validation: never consult environment credentials or construct a client.
// Reject accessors/extra keys so a session token or a changing getter cannot
// become implicit additional authority after this snapshot is checked.
export function validateBackupStorageCredentials(input) {
  try {
    if (!input || typeof input !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
        Reflect.ownKeys(input).length !== 2 || !["accessKeyId", "secretAccessKey"].every(key =>
          Object.hasOwn(input, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), "value") &&
          typeof input[key] === "string" && input[key].trim() && Buffer.byteLength(input[key]) <= 8192 &&
          !/[\x00-\x20\x7f]/.test(input[key]))) fail("storage_configuration_invalid");
    return { accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey };
  } catch { fail("storage_configuration_invalid"); }
}

// requestHandler and a shorter timeout are test-only injection points, not CLI
// flags/environment settings. Production uses the SDK's default Node handler.
// Each operation owns its client/controller so cancellation cannot close a
// different operation's socket. No client is constructed until an operation.
function createStorageTransport({ storage, credentials, signal, requestHandler, timeoutMs }) {
  const staticCredentials = validateBackupStorageCredentials(credentials);
  if (!validSignal(signal) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > BACKUP_STORAGE_TIMEOUT_MS ||
      (requestHandler !== undefined && typeof requestHandler?.handle !== "function")) fail("storage_configuration_invalid");
  const pending = new Set();
  let closed = false;

  async function operation(command, consume, streaming = false) {
    if (closed) fail("storage_closed");
    if (signal?.aborted) fail("storage_operation_aborted");
    const controller = new AbortController(), bodies = new Set();
    const expiresAt = performance.now() + timeoutMs;
    let client, timer, reason, finished = false, rejectCancelled;
    const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
    // Observe cancellation even if SDK construction fails before Promise.race.
    cancelled.catch(() => {});
    const destroyBody = body => {
      try { if (body && !body.destroyed) body.destroy?.(); } catch { /* Final cleanup is checked below. */ }
    };
    const track = body => {
      if (body && typeof body.destroy === "function" && !bodies.has(body)) {
        bodies.add(body);
        // Keep a quiet listener through asynchronous close after destruction.
        const quiet = () => {};
        body.on?.("error", quiet);
        body.once?.("close", () => body.removeListener?.("error", quiet));
      }
      if (finished || reason) destroyBody(body);
      return body;
    };
    const stop = code => {
      if (reason || finished) return;
      reason = code;
      // Never forward an external reason, raw SDK error or retryable TimeoutError.
      controller.abort();
      for (const body of bodies) destroyBody(body);
      rejectCancelled(new BackupCoverageError(code));
    };
    const active = () => {
      if (!reason && performance.now() >= expiresAt) stop("storage_operation_timeout");
      if (reason) fail(reason);
      if (finished || controller.signal.aborted) fail("storage_operation_aborted");
    };
    const abort = () => stop("storage_operation_aborted");
    pending.add(abort);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    timer = setTimeout(() => stop("storage_operation_timeout"), timeoutMs);
    try {
      active();
      client = new S3Client({ region: storage.region, endpoint: storage.endpoint, forcePathStyle: true,
        maxAttempts: 3, retryMode: "standard", credentials: staticCredentials,
        ...(requestHandler ? { requestHandler } : {}) });
      // The low deserialize step sits inside the normal schema deserializer.
      // It sees every raw response before XML parsing/checksum wrapping and runs
      // on every SDK retry, identically for the default and injected handlers.
      client.middlewareStack.add(next => async args => {
        active();
        const result = await next(args);
        const response = result.response;
        if (!response) fail("storage_request_failed");
        track(response.body);
        active(); // Late bodies are tracked/destroyed before refusing their result.
        if (!streaming || response.statusCode >= 300) {
          response.body = response.body == null ? Buffer.alloc(0) : await readBackupStream(response.body,
            { maximumBytes: MAX_BACKUP_STORAGE_METADATA_BYTES, signal: controller.signal });
          active();
        } else if (response.body instanceof Uint8Array && response.body.byteLength > MAX_ARCHIVE_BYTES) {
          fail("storage_readback_failed");
        }
        return result;
      }, { name: "backupRawResponseGuard", step: "deserialize", priority: "low" });
      const work = (async () => {
        const result = await client.send(command, { abortSignal: controller.signal });
        track(result.Body);
        active();
        const value = await consume(result, controller.signal);
        active();
        return value;
      })();
      // This also observes late SDK rejection/resolution after caller cancellation.
      return await Promise.race([work, cancelled]);
    } catch (error) {
      // The SDK can decorate even our own exceptions with metadata/raw response.
      // Recreate a safe error rather than returning any SDK exception object.
      fail(reason ?? (error instanceof BackupCoverageError && safeCodes.has(error.code) ? error.code : "storage_request_failed"));
    } finally {
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      pending.delete(abort);
      controller.abort();
      let cleanupFailed = false;
      for (const body of bodies) {
        try { if (!body.destroyed) body.destroy(); } catch { cleanupFailed = true; }
      }
      try { client?.destroy(); } catch { cleanupFailed = true; }
      if (cleanupFailed) fail("storage_cleanup_failed");
    }
  }

  return {
    operation,
    get(key, expectedBytes) {
      return operation(new GetObjectCommand({ Bucket: storage.bucket, Key: key }), async (result, operationSignal) => {
        if (!result.Body || (result.ContentLength !== undefined && result.ContentLength !== expectedBytes)) fail("storage_readback_failed");
        return readBoundedBackupObject(result.Body, expectedBytes, { signal: operationSignal });
      }, true);
    },
    destroy() {
      closed = true;
      for (const abort of pending) abort();
    },
  };
}

export function createBackupStorage({ plan: input, credentials, signal, requestHandler,
  timeoutMs = BACKUP_STORAGE_TIMEOUT_MS } = {}) {
  const plan = validateBackupJobPlan(input);
  const transport = createStorageTransport({ storage: plan.storage, credentials, signal, requestHandler, timeoutMs });
  const pattern = new RegExp(`^${plan.instance}/\\d{4}-\\d{2}-\\d{2}/[a-zA-Z0-9-]{8,100}\\.(dump\\.age|manifest\\.age|receipt\\.json)$`);
  function objectLimit(key) {
    if (typeof key !== "string" || !pattern.test(key)) fail("storage_request_invalid");
    return key.endsWith(".receipt.json") ? 64 * 1024 : key.endsWith(".manifest.age") ? MAX_MANIFEST_BYTES : MAX_ARCHIVE_BYTES;
  }
  return {
    put(key, body, contentType) {
      const maximum = objectLimit(key), json = key.endsWith(".receipt.json");
      if (!(body instanceof Uint8Array) || body.byteLength < 1 || body.byteLength > maximum ||
          contentType !== (json ? "application/json" : "application/octet-stream")) fail("storage_request_invalid");
      return transport.operation(new PutObjectCommand({ Bucket: plan.storage.bucket, Key: key, Body: body, ContentType: contentType }), result => result);
    },
    get(key, expectedBytes) {
      const maximum = objectLimit(key);
      if (!Number.isInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > maximum) fail("storage_request_invalid");
      return transport.get(key, expectedBytes);
    },
    list(prefix, continuationToken) {
      if (!plan.retentionEnabled || prefix !== `${plan.instance}/` || (continuationToken !== undefined &&
          (typeof continuationToken !== "string" || !continuationToken || Buffer.byteLength(continuationToken) > 8192))) fail("storage_request_invalid");
      return transport.operation(new ListObjectsV2Command({ Bucket: plan.storage.bucket, Prefix: prefix,
        ContinuationToken: continuationToken, MaxKeys: 1000 }), result => result);
    },
    remove(keys) {
      if (!plan.retentionEnabled || !Array.isArray(keys) || keys.length < 1 || keys.length > 1000) fail("storage_request_invalid");
      keys.forEach(objectLimit);
      return transport.operation(new DeleteObjectsCommand({ Bucket: plan.storage.bucket, Delete: { Objects: keys.map(Key => ({ Key })) } }), result => result);
    },
    destroy: transport.destroy,
  };
}

// Recovery accepts no database/capture plan and exposes no upload, listing or
// deletion methods. The caller must supply independently trusted anchors; these
// syntactic checks do not establish provenance or verify a server-side IAM grant.
export function createBackupDownloadStorage({ storage: input, expected: inputExpected, credentials,
  signal, requestHandler, timeoutMs = BACKUP_STORAGE_TIMEOUT_MS } = {}) {
  const storage = validateBackupStorageTarget(input);
  const expected = validateBackupDownloadExpected(inputExpected);
  const keys = objectKeys(expected.instance, expected.id, expected.startedAt);
  const transport = createStorageTransport({ storage, credentials, signal, requestHandler, timeoutMs });
  return Object.freeze({
    get(key, expectedBytes) {
      if (typeof key !== "string" || !Number.isInteger(expectedBytes) || expectedBytes < 1 ||
          (key === keys.receipt ? expectedBytes !== expected.receiptBytes :
            key === keys.manifest ? expectedBytes !== expected.manifestBytes :
              key === keys.archive ? expectedBytes > MAX_ARCHIVE_BYTES : true)) fail("storage_request_invalid");
      return transport.get(key, expectedBytes);
    },
    destroy: transport.destroy,
  });
}
