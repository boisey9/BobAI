import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { setImmediate as immediate } from "node:timers/promises";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { MAX_BACKUP_STREAM_BYTES, readBackupStream, readBoundedBackupObject } from "../scripts/lib/backup-storage-stream.mjs";

const failure = async (promise, code = "storage_readback_failed") => {
  try { await promise; throw new Error("Expected refusal"); }
  catch (error) {
    expect(error).toBeInstanceOf(BackupCoverageError); expect(error.code).toBe(code);
    expect(error.message).toBe(`backup_coverage_${code}`); expect(error.cause).toBeUndefined();
  }
};
const fake = (values = []) => ({
  async *[Symbol.asyncIterator]() { yield* values; }, destroy: vi.fn(),
});
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Reader did not settle")), 1000); })]); }
  finally { clearTimeout(timer); }
}

describe("bounded backup storage stream", () => {
  it("returns exact bytes from a real Node Readable and destroys it", async () => {
    const body = Readable.from([Buffer.from("a"), Buffer.from("bc")]);
    expect(await readBackupStream(body, { maximumBytes: 10, expectedBytes: 3 })).toEqual(Buffer.from("abc"));
    expect(body.destroyed).toBe(true);
  });
  it("accepts an empty collector response and optional exact zero", async () => {
    for (const expectedBytes of [undefined, 0]) {
      const body = fake(); expect(await readBackupStream(body, { maximumBytes: 10, expectedBytes })).toEqual(Buffer.alloc(0));
      expect(body.destroy).toHaveBeenCalledOnce();
    }
  });
  it("copies a direct Uint8Array without retaining mutable transport storage", async () => {
    const body = new Uint8Array([1, 2, 3]), output = await readBackupStream(body, { maximumBytes: 3, expectedBytes: 3 });
    body[0] = 9; expect(Buffer.isBuffer(output)).toBe(true); expect(output).toEqual(Buffer.from([1, 2, 3]));
    expect(await readBackupStream(new Uint8Array(), { maximumBytes: 1 })).toEqual(Buffer.alloc(0));
  });
  it.each([
    ["missing options", undefined], ["null options", null], ["array options", []],
    ["missing maximum", {}], ["zero maximum", { maximumBytes: 0 }], ["negative maximum", { maximumBytes: -1 }],
    ["fractional maximum", { maximumBytes: 2.5 }], ["string maximum", { maximumBytes: "3" }],
    ["too large maximum", { maximumBytes: MAX_BACKUP_STREAM_BYTES + 1 }],
    ["negative exact size", { maximumBytes: 3, expectedBytes: -1 }],
    ["fractional exact size", { maximumBytes: 3, expectedBytes: 1.5 }],
    ["string exact size", { maximumBytes: 3, expectedBytes: "3" }],
    ["exact exceeds maximum", { maximumBytes: 3, expectedBytes: 4 }],
    ["invalid signal", { maximumBytes: 3, signal: { aborted: false, removeEventListener: "unsafe" } }],
  ])("refuses %s and still destroys an available body", async (_, options) => {
    const body = fake([Buffer.from("abc")]); await failure(readBackupStream(body, options)); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it.each([undefined, null, "abc", {}, { [Symbol.asyncIterator]: 1 }, { [Symbol.asyncIterator]: () => ({}) }])("refuses malformed body %# safely", async body => {
    await failure(readBackupStream(body, { maximumBytes: 10 }));
  });
  it.each(["abc", null, undefined, 7, {}, [1, 2]])("refuses non-byte chunk %#", async value => {
    const body = fake([value]); await failure(readBackupStream(body, { maximumBytes: 10 })); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("refuses a string-decoding Node stream instead of re-encoding ciphertext", async () => {
    const body = Readable.from([Buffer.from("abc")]); body.setEncoding("utf8");
    await failure(readBackupStream(body, { maximumBytes: 10 })); expect(body.destroyed).toBe(true);
  });
  it.each([2, 4])("refuses size mismatch against %i bytes", async expectedBytes => {
    const body = fake([Buffer.from("a"), Buffer.from("bc")]);
    await failure(readBackupStream(body, { maximumBytes: 5, expectedBytes })); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("rejects an oversized chunk before retaining it", async () => {
    const body = fake([new Uint8Array(100)]); await failure(readBackupStream(body, { maximumBytes: 5 }));
    expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("bounds direct buffers and exact-size checks", async () => {
    await failure(readBackupStream(Buffer.from("abcd"), { maximumBytes: 3 }));
    await failure(readBackupStream(Buffer.from("abc"), { maximumBytes: 5, expectedBytes: 4 }));
  });
  it("rejects iterator protocol errors with safe diagnostics", async () => {
    for (const next of [null, 1, { done: "yes" }, { done: false }]) {
      const body = { [Symbol.asyncIterator]: () => ({ next: async () => next }), destroy: vi.fn() };
      await failure(readBackupStream(body, { maximumBytes: 3 })); expect(body.destroy).toHaveBeenCalledOnce();
    }
  });
  it("sanitizes synchronous iterator throws and asynchronous stream errors", async () => {
    const body = { [Symbol.asyncIterator]() { throw new Error("private endpoint credential"); }, destroy: vi.fn() };
    await failure(readBackupStream(body, { maximumBytes: 3 })); expect(body.destroy).toHaveBeenCalledOnce();
    const stream = new Readable({ read() { this.destroy(new Error("private response body")); } });
    await failure(readBackupStream(stream, { maximumBytes: 3 })); expect(stream.destroyed).toBe(true);
  });
  it("handles asynchronous destroy errors even when validation refuses before iteration", async () => {
    const body = new Readable({ read() {}, destroy(_error, callback) { setImmediate(() => callback(new Error("private cleanup error"))); } });
    const closed = new Promise(resolve => body.once("close", resolve));
    await failure(readBackupStream(body, { maximumBytes: 0 })); await bounded(closed);
    expect(body.destroyed).toBe(true); expect(body.listenerCount("error")).toBe(0);
  });
  it("reports cleanup failure safely instead of claiming success", async () => {
    const body = fake([Buffer.from("abc")]); body.destroy.mockImplementation(() => { throw new Error("private cleanup error"); });
    await failure(readBackupStream(body, { maximumBytes: 3, expectedBytes: 3 })); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("rejects pre-aborted reads and destroys without iterating", async () => {
    const controller = new AbortController(); controller.abort("private cancellation reason");
    const body = fake([Buffer.from("abc")]), iterate = vi.spyOn(body, Symbol.asyncIterator);
    await failure(readBackupStream(body, { maximumBytes: 3, signal: controller.signal }), "storage_operation_aborted");
    expect(iterate).not.toHaveBeenCalled(); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("cancels a real Readable stalled before the first byte", async () => {
    const controller = new AbortController(), body = new Readable({ read() {} });
    const result = readBackupStream(body, { maximumBytes: 3, expectedBytes: 3, signal: controller.signal });
    controller.abort(); await bounded(failure(result, "storage_operation_aborted")); expect(body.destroyed).toBe(true);
  });
  it("does not succeed after exact bytes until EOF and cancels a stalled EOF", async () => {
    const controller = new AbortController(); let pushed = false;
    const body = new Readable({ read() { if (!pushed) { pushed = true; this.push(Buffer.from("abc")); } } });
    let settled = false;
    const result = readBackupStream(body, { maximumBytes: 3, expectedBytes: 3, signal: controller.signal });
    result.then(() => { settled = true; }, () => { settled = true; });
    await immediate(); expect(pushed).toBe(true); expect(settled).toBe(false);
    controller.abort(); await bounded(failure(result, "storage_operation_aborted")); expect(body.destroyed).toBe(true);
  });
  it("rejects an extra byte after the expected length", async () => {
    const body = fake([Buffer.from("abc"), Buffer.from("d")]);
    await failure(readBackupStream(body, { maximumBytes: 4, expectedBytes: 3 })); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("settles cancellation despite a stubborn next and return, observing late rejection", async () => {
    const controller = new AbortController(); let rejectNext, rejectReturn;
    const next = new Promise((_, reject) => { rejectNext = reject; }), returned = new Promise((_, reject) => { rejectReturn = reject; });
    const iterator = { next: vi.fn(() => next), return: vi.fn(() => returned) };
    const body = { [Symbol.asyncIterator]: () => iterator, destroy: vi.fn() };
    const result = readBackupStream(body, { maximumBytes: 3, signal: controller.signal });
    await immediate(); controller.abort(); await bounded(failure(result, "storage_operation_aborted"));
    expect(body.destroy).toHaveBeenCalledOnce(); expect(iterator.return).toHaveBeenCalledOnce();
    rejectNext(new Error("private late next error")); rejectReturn(new Error("private late cleanup error")); await immediate();
  });
  it("does not await or leak synchronous iterator-return failure", async () => {
    const body = { [Symbol.asyncIterator]: () => ({ next: async () => ({ value: "wrong" }),
      return() { throw new Error("private return error"); } }), destroy: vi.fn() };
    await bounded(failure(readBackupStream(body, { maximumBytes: 3 }))); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("lets a timer cancel an endless empty/microtask stream", async () => {
    const controller = new AbortController(); let chunks = 0;
    const body = { async *[Symbol.asyncIterator]() { for (;;) { chunks++; yield new Uint8Array(); } }, destroy: vi.fn() };
    const timer = setTimeout(() => controller.abort(), 5);
    try { await bounded(failure(readBackupStream(body, { maximumBytes: 3, signal: controller.signal }), "storage_operation_aborted")); }
    finally { clearTimeout(timer); }
    expect(chunks).toBeGreaterThanOrEqual(64); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("handles many tiny chunks without retaining an unbounded chunk array", async () => {
    const bytes = new Uint8Array([97]);
    const body = { async *[Symbol.asyncIterator]() { for (let i = 0; i < 10001; i++) yield bytes; }, destroy: vi.fn() };
    const result = await readBackupStream(body, { maximumBytes: 10001, expectedBytes: 10001 });
    expect(result).toEqual(Buffer.alloc(10001, 97)); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("copies chunks before the producer mutates them", async () => {
    const bytes = new Uint8Array([97]);
    const body = { async *[Symbol.asyncIterator]() { yield bytes; bytes[0] = 98; yield bytes; }, destroy: vi.fn() };
    expect(await readBackupStream(body, { maximumBytes: 2 })).toEqual(Buffer.from("ab"));
  });
  it("removes cancellation listeners after success and refusal", async () => {
    for (const expectedBytes of [3, 4]) {
      const controller = new AbortController(), add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener");
      const body = fake([Buffer.from("abc")]);
      const result = readBackupStream(body, { maximumBytes: 4, expectedBytes, signal: controller.signal });
      if (expectedBytes === 3) await result; else await failure(result);
      expect(add).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
      controller.abort(); expect(body.destroy).toHaveBeenCalledOnce();
    }
  });
});

describe("compatible exact backup object reader", () => {
  it.each([2, 3, 4])("retains exact-length behavior for %i bytes", async expectedBytes => {
    const body = fake([Buffer.from("a"), Buffer.from("bc")]);
    if (expectedBytes === 3) expect(await readBoundedBackupObject(body, expectedBytes)).toEqual(Buffer.from("abc"));
    else await failure(readBoundedBackupObject(body, expectedBytes));
    expect(body.destroy).toHaveBeenCalledOnce();
  });
  it.each([undefined, 0, -1, 1.5, "3", MAX_BACKUP_STREAM_BYTES + 1])("refuses invalid exact bound %# and destroys", async expectedBytes => {
    const body = fake(); await failure(readBoundedBackupObject(body, expectedBytes)); expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("passes optional cancellation through without changing the original two-argument call", async () => {
    const controller = new AbortController(); controller.abort(); const body = fake();
    await failure(readBoundedBackupObject(body, 1, { signal: controller.signal }), "storage_operation_aborted");
    expect(body.destroy).toHaveBeenCalledOnce();
  });
  it("sanitizes malformed optional argument", async () => {
    const body = fake(); await failure(readBoundedBackupObject(body, 1, null)); expect(body.destroy).toHaveBeenCalledOnce();
  });
});
