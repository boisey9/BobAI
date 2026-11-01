import { Readable } from "node:stream";
import { setImmediate as yieldEventLoop } from "node:timers/promises";
import { BackupCoverageError } from "./backup-coverage.mjs";
import { MAX_ARCHIVE_BYTES } from "./backup.mjs";

export const MAX_BACKUP_STREAM_BYTES = MAX_ARCHIVE_BYTES;
const safeError = code => new BackupCoverageError(code);
const validMaximum = value => Number.isInteger(value) && value > 0 && value <= MAX_BACKUP_STREAM_BYTES;

// A bounded byte reader shared by successful GET bodies and pre-deserialization
// XML/error response buffering. The caller owns the operation deadline and supplies
// its signal; this reader neither resets that deadline nor creates a client.
export async function readBackupStream(body, options = {}) {
  let iterator, result, failure, destroyed = false, abortHandler, signal, aborted = false;
  let pendingCancel, cleanupFailed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    try { if (typeof body?.destroy === "function") body.destroy(); }
    catch { cleanupFailed = true; }
  };
  // Keep one cancellation waiter, rather than attaching a new reaction to one
  // never-settling abort promise for every tiny/empty chunk.
  const race = promise => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (pendingCancel === cancel) pendingCancel = undefined;
      callback(value);
    };
    const cancel = () => finish(reject, safeError("storage_operation_aborted"));
    pendingCancel = cancel;
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    if (aborted) cancel();
  });
  try {
    // An early refusal can precede creation of Node's async iterator error
    // listener. Keep a safe listener through close for asynchronous _destroy
    // errors, without publishing their raw messages or passing one to destroy.
    if (body instanceof Readable && !body.closed) {
      const ignoreError = () => {};
      body.on("error", ignoreError);
      body.once("close", () => body.removeListener("error", ignoreError));
    }
    if (!options || typeof options !== "object" || Array.isArray(options)) throw safeError("storage_readback_failed");
    const { maximumBytes, expectedBytes } = options;
    signal = options.signal;
    if (!validMaximum(maximumBytes) || (expectedBytes !== undefined &&
        (!Number.isInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maximumBytes)) ||
        (signal !== undefined && !(signal instanceof AbortSignal))) throw safeError("storage_readback_failed");
    abortHandler = () => {
      aborted = true;
      destroy();
      pendingCancel?.();
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    if (signal?.aborted) abortHandler();
    if (aborted) throw safeError("storage_operation_aborted");
    if (body instanceof Uint8Array) {
      if (body.byteLength > maximumBytes || (expectedBytes !== undefined && body.byteLength !== expectedBytes))
        throw safeError("storage_readback_failed");
      result = Buffer.from(body);
    } else {
      if (typeof body?.[Symbol.asyncIterator] !== "function") throw safeError("storage_readback_failed");
      iterator = body[Symbol.asyncIterator]();
      if (!iterator || typeof iterator.next !== "function") throw safeError("storage_readback_failed");
      let output = Buffer.alloc(0), size = 0, chunksSinceYield = 0, bytesSinceYield = 0;
      for (;;) {
        // The race observes a losing next() rejection; cancellation never
        // waits for an iterator that ignores destroy or whose return stalls.
        const next = await race(Promise.resolve().then(() => iterator.next()));
        if (aborted) throw safeError("storage_operation_aborted");
        if (!next || typeof next !== "object" || (next.done !== undefined && typeof next.done !== "boolean"))
          throw safeError("storage_readback_failed");
        if (next.done === true) break;
        const bytes = next.value;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > maximumBytes - size ||
            (expectedBytes !== undefined && bytes.byteLength > expectedBytes - size)) throw safeError("storage_readback_failed");
        const required = size + bytes.byteLength;
        if (required > output.length) {
          const capacity = Math.min(maximumBytes, Math.max(required, output.length ? output.length * 2 : 64 * 1024));
          const larger = Buffer.allocUnsafe(capacity);
          output.copy(larger, 0, 0, size); output = larger;
        }
        output.set(bytes, size); size = required;
        bytesSinceYield += bytes.byteLength;
        // Bound chunk bookkeeping as well as bytes. In particular, an infinite
        // empty/microtask stream must allow an outer timeout to run.
        if (++chunksSinceYield >= 64 || bytesSinceYield >= 1024 * 1024) {
          await race(yieldEventLoop());
          chunksSinceYield = 0; bytesSinceYield = 0;
        }
      }
      if (expectedBytes !== undefined && size !== expectedBytes) throw safeError("storage_readback_failed");
      result = output.subarray(0, size);
    }
  } catch {
    failure = aborted ? "storage_operation_aborted" : "storage_readback_failed";
  } finally {
    try { if (signal instanceof AbortSignal && abortHandler) signal.removeEventListener("abort", abortHandler); }
    catch { cleanupFailed = true; }
    destroy();
    if (failure && iterator) {
      try {
        if (typeof iterator.return === "function") Promise.resolve(iterator.return()).catch(() => {});
      } catch { /* Cancellation/error is already a safe refusal; never await cleanup indefinitely. */ }
    }
  }
  if (failure || cleanupFailed) throw safeError(failure || "storage_readback_failed");
  return result;
}

// Compatibility with the original GET helper: exact nonempty objects only.
// Invalid arguments still enter the reader's cleanup path before refusing.
export function readBoundedBackupObject(body, expectedBytes, options = {}) {
  const validOptions = options && typeof options === "object" && !Array.isArray(options);
  return readBackupStream(body, { maximumBytes: validMaximum(expectedBytes) && validOptions ? expectedBytes : 0,
    expectedBytes, signal: validOptions ? options.signal : undefined });
}
