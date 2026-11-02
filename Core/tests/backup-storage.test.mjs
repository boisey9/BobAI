import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { createBackupDownloadStorage, createBackupStorage, validateBackupStorageCredentials } from "../scripts/lib/backup-storage.mjs";
import { validateBackupJobPlan, validateBackupStorageTarget } from "../scripts/lib/backup-job.mjs";
import { objectKeys } from "../scripts/lib/backup.mjs";

// Exercise the pinned SDK's real serializers, signing, retries and response
// middleware. The injected request handler never opens a socket.
const keys = objectKeys("testing-fixture", "33333333-3333-4333-8333-333333333333", "2026-11-01T12:00:00.000Z");
const credentials = { accessKeyId: "synthetic-access-id", secretAccessKey: "synthetic-private-secret" };
const downloadExpected = () => ({ id: "33333333-3333-4333-8333-333333333333", instance: "testing-fixture",
  startedAt: "2026-11-01T12:00:00.000Z", recipientFingerprint: "a".repeat(64), receiptSha256: "b".repeat(64),
  receiptBytes: 3, manifestBytes: 4 });
const plan = () => ({ version: 1, enabled: true, capture: { version: 1, enabled: true,
  environment: "testing", target: { host: "database.invalid", port: 5432, database: "postgres",
    role: "bob_backup_capture", postgresMajor: 18 }, project: { key: "bobai",
    id: "11111111-1111-4111-8111-111111111111", ownerId: "synthetic-owner", repository: "boisey9/BobAI" },
  expectedSchemaDigest: "a".repeat(64) }, ledgerRole: "bob_backup_ledger", instance: "testing-fixture",
  recipient: "age1" + "a".repeat(58), storage: { endpoint: "https://storage.invalid/",
    bucket: "fixture-backups", region: "us-east-2" }, retentionEnabled: false });
const instances = [], bodies = [];
const tick = () => new Promise(resolve => setImmediate(resolve));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function stream(value, { end = true } = {}) {
  const body = new Readable({ read() {} });
  if (value !== undefined) body.push(Buffer.from(value));
  if (end) body.push(null);
  bodies.push(body);
  return body;
}
function response(value = "", { status = 200, headers = {}, end = true } = {}) {
  const body = stream(value, { end });
  return { response: { statusCode: status, headers, body } };
}
function fixture(handle, options = {}) {
  const requestHandler = { handle: vi.fn(handle), destroy: vi.fn() };
  const storage = createBackupStorage({ plan: plan(), credentials: { ...credentials },
    requestHandler, ...options });
  instances.push(storage);
  return { storage, requestHandler };
}
function downloadFixture(handle, options = {}) {
  const requestHandler = { handle: vi.fn(handle), destroy: vi.fn() };
  const storage = createBackupDownloadStorage({ storage: plan().storage, expected: downloadExpected(),
    credentials: { ...credentials }, requestHandler, ...options });
  instances.push(storage);
  return { storage, requestHandler };
}
const errorXML = code => `<Error><Code>${code}</Code><Message>synthetic-private-secret</Message></Error>`;
const getResponse = (value = "abc", extra = {}) => response(value, {
  headers: { "content-length": String(Buffer.byteLength(value)), ...extra },
});
async function rejected(operation, code) {
  await expect(typeof operation === "function" ? Promise.resolve().then(operation) : operation).rejects.toThrow(code);
}
afterEach(() => {
  for (const storage of instances.splice(0)) storage.destroy();
  for (const body of bodies.splice(0)) body.destroy();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("backup storage through the pinned S3 SDK", () => {
  it("constructs lazily without a request and closes without discovery or network", () => {
    const f = fixture(() => { throw new Error("unexpected request"); });
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
    f.storage.destroy(); f.storage.destroy();
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled plan", { plan: { ...plan(), enabled: false } }],
    ["missing static key", { credentials: { accessKeyId: credentials.accessKeyId } }],
    ["session credential", { credentials: { ...credentials, sessionToken: "synthetic-session" } }],
    ["empty secret", { credentials: { ...credentials, secretAccessKey: "" } }],
    ["zero deadline", { timeoutMs: 0 }],
    ["excessive deadline", { timeoutMs: 60001 }],
    ["infinite deadline", { timeoutMs: Infinity }],
  ])("refuses %s before invoking transport", (_name, options) => {
    const handle = vi.fn();
    expect(() => fixture(handle, options)).toThrow();
    expect(handle).not.toHaveBeenCalled();
  });

  it("serializes exact PUT bucket/key/content and signs only with the supplied static pair", async () => {
    const bytes = Buffer.from("synthetic encrypted bytes"), f = fixture(() => response());
    await f.storage.put(keys.archive, bytes, "application/octet-stream");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce();
    const [request, options] = f.requestHandler.handle.mock.calls[0];
    expect(request).toMatchObject({ method: "PUT", protocol: "https:", hostname: "storage.invalid",
      path: `/fixture-backups/${keys.archive}` });
    expect(Buffer.from(request.body)).toEqual(bytes);
    expect(request.headers["content-type"]).toBe("application/octet-stream");
    expect(request.headers["content-length"]).toBe(String(bytes.length));
    expect(request.headers.authorization).toContain(`Credential=${credentials.accessKeyId}/`);
    expect(request.headers.authorization).not.toContain(credentials.secretAccessKey);
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("serializes the receipt's JSON content type without changing its bytes", async () => {
    const bytes = Buffer.from('{"synthetic":true}\n'), f = fixture(() => response());
    await f.storage.put(keys.receipt, bytes, "application/json");
    const request = f.requestHandler.handle.mock.calls[0][0];
    expect(request.path).toBe(`/fixture-backups/${keys.receipt}`);
    expect(request.headers["content-type"]).toBe("application/json");
    expect(Buffer.from(request.body)).toEqual(bytes);
  });

  it("serializes GET and returns the exact bounded bytes after EOF", async () => {
    const f = fixture(() => getResponse());
    expect(await f.storage.get(keys.archive, 3)).toEqual(Buffer.from("abc"));
    const request = f.requestHandler.handle.mock.calls[0][0];
    expect(request).toMatchObject({ method: "GET", hostname: "storage.invalid", path: `/fixture-backups/${keys.archive}` });
    expect(request.body).toBeUndefined();
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it.each(["../escape", keys.archive.replace("testing-fixture/", "another-instance/"),
    "testing-fixture/private-key", keys.archive.replace("/2026-11-01/", "/%2e%2e/"), keys.archive + "?redirect=x"])
  ("rejects an out-of-contract key before serialization: %s", async key => {
    const f = fixture(() => getResponse());
    await rejected(() => f.storage.get(key, 3), "storage_request_invalid");
    await rejected(() => f.storage.put(key, Buffer.from("abc"), "application/octet-stream"), "storage_request_invalid");
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
  });

  it.each([[keys.archive, 0], [keys.archive, 100 * 1024 * 1024 + 1],
    [keys.manifest, 21 * 1024 * 1024 + 1], [keys.receipt, 64 * 1024 + 1], [keys.archive, 1.5]])
  ("rejects invalid expected length for %s (%s) before transport", async (key, bytes) => {
    const f = fixture(() => getResponse());
    await rejected(() => f.storage.get(key, bytes), "storage_request_invalid");
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
  });

  it.each([[keys.archive, "application/json"], [keys.receipt, "application/octet-stream"],
    [keys.archive, "application/octet-stream\r\nX-Injected: value"]])
  ("rejects a mismatched or injected PUT content type", async (key, type) => {
    const f = fixture(() => response());
    await rejected(() => f.storage.put(key, Buffer.from("abc"), type), "storage_request_invalid");
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
  });

  it("does not allow retention operations through a capture-only plan", async () => {
    const f = fixture(() => response());
    await rejected(() => f.storage.list("testing-fixture/"), "storage_request_invalid");
    await rejected(() => f.storage.remove([keys.archive]), "storage_request_invalid");
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
  });

  it("serializes a scoped retention listing and its opaque continuation token", async () => {
    const xml = `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>true</IsTruncated><NextContinuationToken>next+token/=</NextContinuationToken><Contents><Key>${keys.archive}</Key><LastModified>2026-11-01T12:00:00.000Z</LastModified><Size>3</Size></Contents></ListBucketResult>`;
    const f = fixture(() => response(xml), { plan: { ...plan(), retentionEnabled: true } });
    expect(await f.storage.list("testing-fixture/", "opaque+token/=")).toMatchObject({ IsTruncated: true,
      NextContinuationToken: "next+token/=", Contents: [{ Key: keys.archive, Size: 3 }] });
    const request = f.requestHandler.handle.mock.calls[0][0];
    expect(request).toMatchObject({ method: "GET", path: "/fixture-backups/" });
    expect(request.query).toMatchObject({ "list-type": "2", prefix: "testing-fixture/", "continuation-token": "opaque+token/=" });
  });

  it("serializes deletion only for approved instance keys", async () => {
    const f = fixture(() => response('<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>'),
      { plan: { ...plan(), retentionEnabled: true } });
    await f.storage.remove([keys.archive, keys.manifest]);
    const request = f.requestHandler.handle.mock.calls[0][0];
    expect(request).toMatchObject({ method: "POST", path: "/fixture-backups/" });
    expect(request.query).toHaveProperty("delete");
    const body = Buffer.from(request.body).toString();
    expect(body).toContain(`<Key>${keys.archive}</Key>`);
    expect(body).toContain(`<Key>${keys.manifest}</Key>`);
    await rejected(() => f.storage.remove([keys.archive.replace("testing-fixture/", "another-instance/")]), "storage_request_invalid");
    await rejected(() => f.storage.list("another-instance/"), "storage_request_invalid");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce();
  });

  it.each([
    ["larger header", () => response("abc", { headers: { "content-length": "4" } })],
    ["malformed header", () => response("abc", { headers: { "content-length": "three" } })],
    ["short body", () => response("ab", { headers: { "content-length": "3" } })],
    ["short body without header", () => response("ab")],
    ["oversized body", () => response("abcd", { headers: { "content-length": "3" } })],
  ])("rejects GET %s and destroys the raw response", async (_name, respond) => {
    const f = fixture(respond);
    await rejected(f.storage.get(keys.archive, 3), "storage_readback_failed");
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("uses the real SDK checksum wrapper and rejects corrupt bytes", async () => {
    const checksum = createHash("sha256").update("expected different bytes").digest("base64");
    const f = fixture(() => getResponse("abc", { "x-amz-checksum-sha256": checksum }));
    await rejected(f.storage.get(keys.archive, 3), "storage_readback_failed");
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("accepts a correct SDK-verified content checksum", async () => {
    const checksum = createHash("sha256").update("abc").digest("base64");
    const f = fixture(() => getResponse("abc", { "x-amz-checksum-sha256": checksum }));
    expect(await f.storage.get(keys.archive, 3)).toEqual(Buffer.from("abc"));
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("bounds SDK retries to three attempts and cleans every 503 body", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const f = fixture(() => response(errorXML("ServiceUnavailable"), { status: 503 }), { timeoutMs: 3000 });
    await rejected(f.storage.get(keys.archive, 3), "storage_request_failed");
    expect(f.requestHandler.handle).toHaveBeenCalledTimes(3);
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("does not retry a denied request or expose service diagnostics", async () => {
    const f = fixture(() => response(errorXML("AccessDenied"), { status: 403 }));
    const error = await f.storage.get(keys.archive, 3).catch(value => value);
    expect(error.message).toContain("storage_request_failed");
    expect(error.message + JSON.stringify(error)).not.toContain(credentials.secretAccessKey);
    expect(error.message).not.toContain("AccessDenied");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce();
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it.each(["no bytes", "partial bytes", "exact bytes without EOF", "checksum-wrapped bytes"])
  ("keeps the deadline active through GET body consumption: %s", async mode => {
    const content = mode === "no bytes" ? undefined : mode === "partial bytes" ? "a" : "abc";
    const headers = { "content-length": "3", ...(mode === "checksum-wrapped bytes" ?
      { "x-amz-checksum-sha256": createHash("sha256").update("abc").digest("base64") } : {}) };
    const f = fixture(() => response(content, { headers, end: false }), { timeoutMs: 1000 });
    await rejected(f.storage.get(keys.archive, 3), "storage_operation_timeout");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce();
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("applies the same deadline while the SDK parses an unfinished XML error", async () => {
    const f = fixture(() => response("<Error><Code>AccessDenied", { status: 403, end: false }), { timeoutMs: 1000 });
    await rejected(f.storage.get(keys.archive, 3), "storage_operation_timeout");
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("bounds a non-GET response before XML deserialization", async () => {
    const f = fixture(() => response("x".repeat(2 * 1024 * 1024 + 1)), { plan: { ...plan(), retentionEnabled: true } });
    await rejected(f.storage.list("testing-fixture/"), "storage_readback_failed");
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("bounds an oversized XML error body before diagnostic parsing", async () => {
    const f = fixture(() => response("x".repeat(2 * 1024 * 1024 + 1), { status: 403 }));
    await rejected(f.storage.get(keys.archive, 3), "storage_readback_failed");
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("destroys a late response even when its injected handler ignores cancellation", async () => {
    let deliver;
    const f = fixture(() => new Promise(resolve => { deliver = resolve; }), { timeoutMs: 1000 });
    await rejected(f.storage.get(keys.archive, 3), "storage_operation_timeout");
    expect(deliver).toBeTypeOf("function");
    const late = getResponse(); deliver(late);
    await tick(); await tick();
    expect(late.response.body.destroyed).toBe(true);
    expect(f.requestHandler.handle).toHaveBeenCalledOnce();
  });

  it("refuses already-aborted work before contacting storage", async () => {
    const controller = new AbortController(); controller.abort("synthetic-private-reason");
    const f = fixture(() => getResponse(), { signal: controller.signal });
    await rejected(f.storage.get(keys.archive, 3), "storage_operation_aborted");
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
  });

  it("cancels an in-flight body and does not expose the abort reason", async () => {
    const controller = new AbortController();
    const f = fixture(() => { const result = response("a", { headers: { "content-length": "3" }, end: false });
      setImmediate(() => controller.abort("synthetic-private-reason")); return result; }, { signal: controller.signal });
    const error = await f.storage.get(keys.archive, 3).catch(value => value);
    expect(error.message).toContain("storage_operation_aborted");
    expect(error.message + JSON.stringify(error)).not.toContain("synthetic-private-reason");
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("cancels during SDK retry waiting without beginning another attempt", async () => {
    // The pinned SDK's first throttling delay is 500 ms with this value. Keep
    // observing after that delay, not merely until our caller's race settles.
    vi.spyOn(Math, "random").mockReturnValue(1);
    const controller = new AbortController();
    const unhandled = [], observe = error => unhandled.push(error);
    const f = fixture(() => { const result = response(errorXML("SlowDown"), { status: 503 });
      result.response.body.once("end", () => setImmediate(() => controller.abort()));
      return result; }, { signal: controller.signal });
    process.on("unhandledRejection", observe);
    try {
      await rejected(f.storage.get(keys.archive, 3), "storage_operation_aborted");
      await sleep(750);
      expect(f.requestHandler.handle).toHaveBeenCalledOnce();
      expect(bodies.every(body => body.destroyed)).toBe(true);
      expect(unhandled).toEqual([]);
    } finally { process.removeListener("unhandledRejection", observe); }
  });

  it("expires during retry waiting and blocks the SDK's later attempt", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const unhandled = [], observe = error => unhandled.push(error);
    // Retry-After gives a known two-second SDK wait; the whole operation has a
    // one-second deadline, with enough margin for real serialization/signing.
    const f = fixture(() => response(errorXML("ServiceUnavailable"), { status: 503,
      headers: { "retry-after": "2" } }), { timeoutMs: 1000 });
    process.on("unhandledRejection", observe);
    try {
      await rejected(f.storage.get(keys.archive, 3), "storage_operation_timeout");
      await sleep(1250);
      expect(f.requestHandler.handle).toHaveBeenCalledOnce();
      expect(bodies.every(body => body.destroyed)).toBe(true);
      expect(unhandled).toEqual([]);
    } finally { process.removeListener("unhandledRejection", observe); }
  });

  it("finishing a simultaneous operation does not destroy another operation's body", async () => {
    let stalledBody;
    const f = fixture(request => {
      if (request.path.endsWith(".dump.age")) {
        const result = response("a", { headers: { "content-length": "3" }, end: false });
        stalledBody = result.response.body; return result;
      }
      return getResponse();
    }, { timeoutMs: 1000 });
    const stalled = rejected(f.storage.get(keys.archive, 3), "storage_operation_timeout");
    expect(await f.storage.get(keys.manifest, 3)).toEqual(Buffer.from("abc"));
    expect(stalledBody).toBeDefined();
    expect(stalledBody.destroyed).toBe(false);
    await stalled;
    expect(stalledBody.destroyed).toBe(true);
    expect(f.requestHandler.handle).toHaveBeenCalledTimes(2);
  });

  it("isolates operation deadlines and permits a fresh operation after one times out", async () => {
    let calls = 0;
    const f = fixture(() => ++calls === 1 ? response(undefined, { headers: { "content-length": "3" }, end: false }) : getResponse(),
      { timeoutMs: 1000 });
    await rejected(f.storage.get(keys.archive, 3), "storage_operation_timeout");
    expect(await f.storage.get(keys.manifest, 3)).toEqual(Buffer.from("abc"));
    expect(f.requestHandler.handle).toHaveBeenCalledTimes(2);
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("closing aborts active operations and prevents reuse", async () => {
    const f = fixture(() => { const result = response("a", { headers: { "content-length": "3" }, end: false });
      setImmediate(() => f.storage.destroy()); return result; });
    await rejected(f.storage.get(keys.archive, 3), "storage_operation_aborted");
    await rejected(f.storage.get(keys.archive, 3), "storage_closed");
    await rejected(f.storage.put(keys.archive, Buffer.from("abc"), "application/octet-stream"), "storage_closed");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce();
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });
});

describe("download-only storage authority through the same pinned SDK transport", () => {
  it("validates and normalizes the same target without any database plan", () => {
    const input = { ...plan().storage, endpoint: "https://storage.invalid" };
    const checked = validateBackupStorageTarget(input);
    expect(checked).toEqual({ ...input, endpoint: "https://storage.invalid/" });
    expect(validateBackupJobPlan({ ...plan(), storage: input }).storage).toEqual(checked);
    input.endpoint = "https://changed.invalid";
    expect(checked.endpoint).toBe("https://storage.invalid/");
  });

  it.each([
    { ...plan().storage, endpoint: "http://storage.invalid" },
    { ...plan().storage, endpoint: "https://synthetic-user:synthetic-private-secret@storage.invalid" },
    { ...plan().storage, endpoint: "https://storage.invalid?secret=synthetic-private-secret" },
    { ...plan().storage, endpoint: "https://storage.invalid/#fragment" },
    { ...plan().storage, bucket: "../another-bucket" },
    { ...plan().storage, region: "us-east-2\nprivate" },
    { ...plan().storage, database: "not-a-recovery-input" },
  ])("refuses invalid shared storage target without including its contents", input => {
    expect(() => validateBackupStorageTarget(input)).toThrow("backup_coverage_invalid_job_plan");
    expect(() => validateBackupJobPlan({ ...plan(), storage: input })).toThrow("backup_coverage_invalid_job_plan");
  });

  it("snapshots explicit static credentials and rejects getters without invoking them", () => {
    const input = { ...credentials }, checked = validateBackupStorageCredentials(input);
    input.accessKeyId = "changed";
    expect(checked).toEqual(credentials); expect(checked).not.toBe(input);
    const getter = vi.fn(() => { throw Error("synthetic-private-secret"); });
    const accessor = { secretAccessKey: credentials.secretAccessKey };
    Object.defineProperty(accessor, "accessKeyId", { enumerable: true, get: getter });
    expect(() => validateBackupStorageCredentials(accessor)).toThrow("storage_configuration_invalid");
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { accessKeyId: credentials.accessKeyId },
    { ...credentials, sessionToken: "synthetic-session-secret" },
    { ...credentials, secretAccessKey: " secret-with-whitespace" },
    { ...credentials, secretAccessKey: "x".repeat(8193) },
    Object.assign(Object.create(credentials), { extra: "synthetic-private-secret" })])(
    "refuses missing, extra or ambient credential authority before transport", input => {
      vi.stubEnv("AWS_ACCESS_KEY_ID", "ambient-access"); vi.stubEnv("AWS_SECRET_ACCESS_KEY", "ambient-private-secret");
      const handle = vi.fn();
      expect(() => downloadFixture(handle, { credentials: input })).toThrow("storage_configuration_invalid");
      expect(handle).not.toHaveBeenCalled();
    });

  it("exposes only get/destroy and remains lazy without capture or ledger authority", () => {
    const f = downloadFixture(() => { throw Error("unexpected request"); });
    expect(Object.keys(f.storage)).toEqual(["get", "destroy"]); expect(Object.isFrozen(f.storage)).toBe(true);
    for (const method of ["put", "list", "remove", "operation"]) expect(f.storage).not.toHaveProperty(method);
    expect(f.requestHandler.handle).not.toHaveBeenCalled(); f.storage.destroy(); f.storage.destroy();
    expect(f.requestHandler.handle).not.toHaveBeenCalled();
  });

  it("sends only exact object GETs signed with its supplied immutable static pair", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "ambient-access"); vi.stubEnv("AWS_SECRET_ACCESS_KEY", "ambient-private-secret");
    vi.stubEnv("AWS_SESSION_TOKEN", "ambient-session-secret");
    const inputCredentials = { ...credentials }, target = plan().storage, expected = downloadExpected();
    const objects = new Map([[keys.receipt, "abc"], [keys.manifest, "abcd"], [keys.archive, "abcde"]]);
    const f = downloadFixture(request => getResponse(objects.get(request.path.slice("/fixture-backups/".length))),
      { storage: target, expected, credentials: inputCredentials });
    target.endpoint = "https://other.invalid/"; target.bucket = "another-bucket";
    expected.instance = "another-instance"; expected.receiptBytes = 1; expected.manifestBytes = 1;
    inputCredentials.accessKeyId = "changed-access"; inputCredentials.secretAccessKey = "changed-secret";
    for (const [key, value] of objects) expect(await f.storage.get(key, value.length)).toEqual(Buffer.from(value));
    expect(f.requestHandler.handle).toHaveBeenCalledTimes(3);
    for (const [index, [request, options]] of f.requestHandler.handle.mock.calls.entries()) {
      expect(request).toMatchObject({ method: "GET", protocol: "https:", hostname: "storage.invalid",
        path: `/fixture-backups/${[...objects.keys()][index]}` });
      expect(request.body).toBeUndefined();
      expect(request.headers.authorization).toContain(`Credential=${credentials.accessKeyId}/`);
      expect(request.headers.authorization).not.toMatch(/ambient|changed|synthetic-private-secret/);
      expect(request.headers).not.toHaveProperty("x-amz-security-token");
      expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    }
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it.each(["../escape", keys.archive.replace("33333333", "44444444"), keys.archive.replace("2026-11-01", "2026-11-02"),
    keys.receipt.replace("testing-fixture", "another-instance"), keys.manifest + "?private=secret", "testing-fixture/"])(
    "refuses a key outside the exact three-object set before a request: %s", async key => {
      const f = downloadFixture(() => getResponse());
      await rejected(() => f.storage.get(key, 3), "storage_request_invalid");
      expect(f.requestHandler.handle).not.toHaveBeenCalled();
    });

  it.each([[keys.receipt, 2], [keys.receipt, 4], [keys.manifest, 3], [keys.manifest, 5],
    [keys.archive, 0], [keys.archive, 100 * 1024 * 1024 + 1], [keys.archive, 1.5], [keys.archive, Infinity]])(
    "refuses an unbound or oversized length for %s (%s) before a request", async (key, bytes) => {
      const f = downloadFixture(() => getResponse());
      await rejected(() => f.storage.get(key, bytes), "storage_request_invalid");
      expect(f.requestHandler.handle).not.toHaveBeenCalled();
    });

  it.each([
    { expected: { ...downloadExpected(), id: "wrong-run" } },
    { expected: { ...downloadExpected(), receiptBytes: 0 } },
    { expected: { ...downloadExpected(), privateKey: "synthetic-private-secret" } },
    { storage: { ...plan().storage, endpoint: "http://storage.invalid" } },
    { timeoutMs: 60001 }, { signal: {} },
  ])("refuses invalid download configuration before any request", options => {
    const handle = vi.fn(); expect(() => downloadFixture(handle, options)).toThrow(); expect(handle).not.toHaveBeenCalled();
  });

  it.each([
    ["short body", () => response("ab", { headers: { "content-length": "3" } })],
    ["extra bytes", () => response("abcd", { headers: { "content-length": "3" } })],
    ["wrong length header", () => response("abc", { headers: { "content-length": "4" } })],
    ["oversized error", () => response("x".repeat(2 * 1024 * 1024 + 1), { status: 403 })],
  ])("uses the shared bounded body path for %s", async (_name, respond) => {
    const f = downloadFixture(respond);
    await rejected(f.storage.get(keys.receipt, 3), "storage_readback_failed");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce(); expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("keeps the download deadline active until EOF and destroys a stalled body", async () => {
    const f = downloadFixture(() => response("abc", { headers: { "content-length": "3" }, end: false }), { timeoutMs: 1000 });
    await rejected(f.storage.get(keys.receipt, 3), "storage_operation_timeout");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce(); expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it.each([true, false])("handles cancellation safely (before request: %s)", async before => {
    const controller = new AbortController(); if (before) controller.abort("synthetic-private-secret");
    const f = downloadFixture(() => {
      const result = response("a", { headers: { "content-length": "3" }, end: false });
      setImmediate(() => controller.abort("synthetic-private-secret")); return result;
    }, { signal: controller.signal });
    const error = await f.storage.get(keys.receipt, 3).catch(value => value);
    expect(error.code).toBe("storage_operation_aborted"); expect(JSON.stringify(error)).not.toContain(credentials.secretAccessKey);
    expect(f.requestHandler.handle).toHaveBeenCalledTimes(before ? 0 : 1);
    expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("sanitizes denied downloads without retries or source authority fallback", async () => {
    const f = downloadFixture(() => response(errorXML("AccessDenied"), { status: 403 }));
    const error = await f.storage.get(keys.receipt, 3).catch(value => value);
    expect(error.code).toBe("storage_request_failed");
    expect(error.message + JSON.stringify(error)).not.toMatch(/AccessDenied|synthetic-private-secret/);
    expect(f.requestHandler.handle).toHaveBeenCalledOnce(); expect(bodies.every(body => body.destroyed)).toBe(true);
  });

  it("destroy aborts an active download and permanently closes this adapter", async () => {
    const f = downloadFixture(() => {
      const result = response("a", { headers: { "content-length": "3" }, end: false });
      setImmediate(() => f.storage.destroy()); return result;
    });
    await rejected(f.storage.get(keys.receipt, 3), "storage_operation_aborted");
    await rejected(f.storage.get(keys.receipt, 3), "storage_closed");
    expect(f.requestHandler.handle).toHaveBeenCalledOnce(); expect(bodies.every(body => body.destroyed)).toBe(true);
  });
});
