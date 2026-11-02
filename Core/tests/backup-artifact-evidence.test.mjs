import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { fetchBackupArtifact, validateArtifactCustodyApproval } from "../scripts/lib/backup-artifact-evidence.mjs";
import { sha256 } from "../scripts/lib/backup.mjs";

const API = "https://api.github.com/repos/boisey9/BobAI";
const secret = "synthetic-token-and-error-sentinel";
const archive = Buffer.from("synthetic archive bytes (ZIP parser is a separate boundary)");
const timestamp = "2026-11-01T20:10:00.000Z";
const recipient = "age1" + "q".repeat(58);
function fixture() {
  const repository = { id: 1310270513, full_name: "boisey9/BobAI", owner: { id: 6569974, login: "boisey9" } };
  const actor = { id: 6569974, login: "boisey9" };
  const producer = { repository: "boisey9/BobAI", sourceCommit: "a".repeat(40),
    workflow: "boisey9/BobAI/.github/workflows/backups-testing.yml@refs/heads/main", runId: "123456", runAttempt: "2",
    image: "ghcr.io/boisey9/bob-backup-runner@sha256:" + "b".repeat(64) };
  const approval = { version: 1, repository: { fullName: "boisey9/BobAI", id: "1310270513", owner: { login: "boisey9", id: "6569974" } },
    producer, workflowId: "456", actor: { login: "boisey9", id: "6569974" }, triggeringActor: { login: "boisey9", id: "6569974" },
    job: { id: "789", name: "capture", captureStep: "Capture synthetic testing backup", uploadStep: "Upload reviewed ciphertext" },
    artifactId: "987", recipient, instance: "testing-fixture", storageHosts: ["fixture.blob.core.windows.net"] };
  const run = { id: 123456, run_attempt: 2, workflow_id: 456, repository, head_repository: structuredClone(repository),
    path: ".github/workflows/backups-testing.yml", head_branch: "main", head_sha: producer.sourceCommit,
    event: "workflow_dispatch", status: "completed", conclusion: "success", actor, triggering_actor: structuredClone(actor), pull_requests: [],
    created_at: "2026-11-01T20:00:00Z", run_started_at: "2026-11-01T20:01:00Z", updated_at: "2026-11-01T20:09:00Z" };
  const job = { id: 789, name: "capture", run_id: 123456, run_attempt: 2, run_url: `${API}/actions/runs/123456`,
    head_sha: producer.sourceCommit, head_branch: "main", status: "completed", conclusion: "success",
    started_at: "2026-11-01T20:02:00Z", completed_at: "2026-11-01T20:08:00Z", steps: [
      { name: approval.job.captureStep, number: 5, status: "completed", conclusion: "success", started_at: "2026-11-01T20:03:00Z", completed_at: "2026-11-01T20:05:00Z" },
      { name: approval.job.uploadStep, number: 6, status: "completed", conclusion: "success", started_at: "2026-11-01T20:06:00Z", completed_at: "2026-11-01T20:07:00Z" },
    ] };
  const artifact = { id: 987, name: "bob-recovery-handoff-r123456-a2", size_in_bytes: archive.length,
    url: `${API}/actions/artifacts/987`, archive_download_url: `${API}/actions/artifacts/987/zip`, expired: false,
    created_at: "2026-11-01T20:06:30Z", updated_at: "2026-11-01T20:06:30Z", expires_at: "2026-11-08T20:06:30Z",
    digest: `sha256:${sha256(archive)}`, workflow_run: { id: 123456, repository_id: 1310270513, head_repository_id: 1310270513,
      head_branch: "main", head_sha: producer.sourceCommit } };
  const responses = [repository, run, { total_count: 1, jobs: [job] }, { total_count: 1, artifacts: [structuredClone(artifact)] }, artifact];
  const location = "https://fixture.blob.core.windows.net/artifacts/fixture.zip?sig=synthetic-signed-url";
  const calls = [];
  const fetch = vi.fn(async (url, options) => {
    calls.push({ url, options }); const index = calls.length - 1;
    if (index < 5) return Response.json(responses[index]);
    if (index === 5) return new Response(null, { status: 302, headers: { location } });
    if (index === 6) return new Response(archive);
    throw new Error(secret);
  });
  const now = vi.fn(() => new Date(timestamp));
  const execute = (input = {}, dependencies = {}) => fetchBackupArtifact({ enabled: true, approval, token: secret, ...input }, { fetch, now, ...dependencies });
  return { approval, repository, run, job, artifact, responses, location, calls, fetch, now, execute };
}
async function failure(promise, code) {
  const error = await promise.then(() => undefined, error => error);
  expect(error).toBeInstanceOf(BackupCoverageError); expect(error.code).toBe(`artifact_${code}`);
  expect(JSON.stringify(error)).not.toContain(secret); expect(String(error)).not.toContain(secret);
  expect(JSON.stringify(error)).not.toContain("synthetic-signed-url");
  return error;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("explicit artifact custody approval", () => {
  it("clones and freezes independently reviewed identity without effects", () => {
    const f = fixture(), approved = validateArtifactCustodyApproval(f.approval);
    expect(approved).toEqual(f.approval); expect(approved).not.toBe(f.approval);
    expect(Object.isFrozen(approved.repository.owner)).toBe(true); expect(Object.isFrozen(approved.storageHosts)).toBe(true);
    f.approval.producer.sourceCommit = "c".repeat(40); expect(approved.producer.sourceCommit).toBe("a".repeat(40));
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([
    a => { a.version = 2; }, a => { a.extra = secret; }, a => { a.repository.id = "1310270514"; },
    a => { a.repository.fullName = "another/repository"; }, a => { a.repository.owner.id = "6569975"; },
    a => { a.repository.owner.login = "another"; }, a => { a.producer.sourceCommit = "0".repeat(40); },
    a => { a.producer.runId = "9007199254740992"; }, a => { a.producer.runAttempt = "0"; },
    a => { a.producer.image = "ghcr.io/boisey9/bob-backup-runner:latest"; },
    a => { a.workflowId = "001"; }, a => { a.actor.id = 6569974; }, a => { a.triggeringActor.login = "../escape"; },
    a => { a.job.id = "-1"; }, a => { a.job.name = ""; }, a => { a.job.captureStep = a.job.uploadStep; },
    a => { a.job.uploadStep = "untrusted\nstep"; }, a => { a.artifactId = "987/zip"; },
    a => { a.recipient = "AGE-SECRET-KEY-" + secret; }, a => { a.instance = "../instance"; },
    a => { a.storageHosts = []; }, a => { a.storageHosts = ["127.0.0.1"]; },
    a => { a.storageHosts = ["example.com"]; }, a => { a.storageHosts = ["*.blob.core.windows.net"]; },
    a => { a.storageHosts = ["blob.core.windows.net"]; }, a => { a.storageHosts = ["x.blob.core.windows.net.evil.example"]; },
    a => { a.storageHosts.push(a.storageHosts[0]); }, a => { a.storageHosts = ["x.blob.core.windows.net:443"]; },
  ])("rejects invalid or broadened approval %# before transport", async change => {
    const f = fixture(); change(f.approval); await failure(f.execute(), "invalid_approval"); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("refuses accessor approval without evaluating it", () => {
    const f = fixture(), getter = vi.fn(() => 1); Object.defineProperty(f.approval, "version", { get: getter });
    expect(() => validateArtifactCustodyApproval(f.approval)).toThrow("artifact_invalid_approval"); expect(getter).not.toHaveBeenCalled();
  });
});

describe("default-off bounded fixture transport", () => {
  it.each([undefined, false, "true"])("refuses enable value %j before approval or fetch", async enabled => {
    const f = fixture(); await failure(f.execute({ enabled, approval: null }), "disabled"); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("requires an injected transport and never calls ambient fetch", async () => {
    const f = fixture(), ambient = vi.spyOn(globalThis, "fetch");
    await failure(fetchBackupArtifact({ enabled: true, approval: f.approval }), "transport_required"); expect(ambient).not.toHaveBeenCalled();
  });
  it.each(["bad\ntoken", "", " ", "a".repeat(4097)])("refuses invalid explicit token", async token => {
    const f = fixture(); await failure(f.execute({ token }), "invalid_input"); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("accepts absent token without discovering environment credentials", async () => {
    const f = fixture(); const result = await f.execute({ token: undefined });
    expect(result.archive).toEqual(archive); expect(f.calls.every(c => c.options.headers.Authorization === undefined)).toBe(true);
  });
  it("returns only fixed identity/digests and keeps storage authorization isolated", async () => {
    const f = fixture(), result = await f.execute();
    expect(f.calls.map(c => c.url)).toEqual([API, `${API}/actions/runs/123456/attempts/2`,
      `${API}/actions/runs/123456/attempts/2/jobs?per_page=100`, `${API}/actions/runs/123456/artifacts?per_page=100`,
      `${API}/actions/artifacts/987`, `${API}/actions/artifacts/987/zip`, f.location]);
    expect(f.calls.slice(0, 6).every(c => c.options.headers.Authorization === `Bearer ${secret}`)).toBe(true);
    expect(f.calls[6].options.headers).toEqual({ Accept: "application/octet-stream", "Accept-Encoding": "identity" });
    expect(f.calls.every(c => c.options.headers["Accept-Encoding"] === "identity")).toBe(true);
    expect(f.calls.every(c => c.options.method === "GET" && c.options.redirect === "manual" && c.options.credentials === "omit" && c.options.cache === "no-store")).toBe(true);
    expect(result.archive).toEqual(archive); expect(result.evidence.artifact).toEqual({ id: "987", name: "bob-recovery-handoff-r123456-a2",
      createdAt: "2026-11-01T20:06:30.000Z", expiresAt: "2026-11-08T20:06:30.000Z", archiveSha256: sha256(archive), archiveBytes: archive.length });
    expect(result.evidence.verifiedAt).toBe(timestamp); expect(result.evidence.producer).toEqual(f.approval.producer);
    expect(Object.isFrozen(result.evidence.artifact)).toBe(true); expect(JSON.stringify(result.evidence)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("synthetic-signed-url");
  });
  it("snapshots approval before awaited transport", async () => {
    const f = fixture(), delegate = f.fetch;
    const fetch = vi.fn(async (...args) => { const result = await delegate(...args); f.approval.producer.runAttempt = "3"; f.approval.storageHosts[0] = "evil.example"; return result; });
    const result = await f.execute({}, { fetch }); expect(result.approval.producer.runAttempt).toBe("2"); expect(result.archive).toEqual(archive);
  });
  it("sanitizes raw transport and forged prefixed failures", async () => {
    for (const error of [new Error(secret), new BackupCoverageError(`artifact_${secret}`)]) {
      const f = fixture(); await failure(f.execute({}, { fetch: async () => { throw error; } }), "transport_failed");
    }
  });
  it("sanitizes transport failures with hostile code getters without evaluating them", async () => {
    const f = fixture(), error = new BackupCoverageError("untrusted"), getter = vi.fn(() => { throw new Error(secret); });
    Object.defineProperty(error, "code", { get: getter });
    await failure(f.execute({}, { fetch: async () => { throw error; } }), "transport_failed"); expect(getter).not.toHaveBeenCalled();
  });
  it("sanitizes a hostile exception proxy", async () => {
    const f = fixture(), error = new Proxy({}, { getPrototypeOf() { throw new Error(secret); } });
    await failure(f.execute({}, { fetch: async () => { throw error; } }), "transport_failed");
  });
  it("refuses pre-aborted cancellation before requests", async () => {
    const f = fixture(), controller = new AbortController(); controller.abort(secret);
    await failure(f.execute({ signal: controller.signal }), "interrupted"); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("bounds a stalled fetch by deadline and observes late rejection", async () => {
    vi.useFakeTimers(); const f = fixture(); let rejectLate;
    const pending = f.execute({}, { fetch: () => new Promise((_, reject) => { rejectLate = reject; }) });
    const checked = failure(pending, "timeout"); await vi.advanceTimersByTimeAsync(60000); await checked;
    rejectLate(new Error(secret)); await Promise.resolve();
  });
  it("cancels a late fetch response after timeout without awaiting its stalled cancel hook", async () => {
    vi.useFakeTimers(); const f = fixture(); let resolveLate;
    const cancel = vi.fn(() => new Promise(() => {}));
    const pending = f.execute({}, { fetch: () => new Promise(resolve => { resolveLate = resolve; }) });
    const checked = failure(pending, "timeout"); await vi.advanceTimersByTimeAsync(60000); await checked;
    resolveLate(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("cancels a stalled body without waiting for its cancel hook", async () => {
    const f = fixture(), controller = new AbortController(), cancelled = vi.fn(() => new Promise(() => {}));
    const response = new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel: cancelled }));
    const pending = f.execute({ signal: controller.signal }, { fetch: async () => response });
    const checked = failure(pending, "interrupted"); await new Promise(resolve => setTimeout(resolve, 0)); controller.abort(secret); await checked;
  });
  it("bounds a stalled body even with no caller cancellation", async () => {
    vi.useFakeTimers(); const f = fixture();
    const response = new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }));
    const pending = f.execute({}, { fetch: async () => response });
    const checked = failure(pending, "timeout"); await vi.advanceTimersByTimeAsync(60000); await checked;
  });
  it.each([404, 410, 401, 403, 429, 500, 302])("refuses metadata status %s without retries", async status => {
    const f = fixture(), fetch = vi.fn(async () => new Response(secret, { status }));
    await failure(f.execute({}, { fetch }), "response_invalid"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    () => new Response("{"), () => new Response(Buffer.from([0xff])),
    () => new Response("{}", { headers: { "content-length": "1" } }),
    () => new Response("{}", { headers: { "content-length": "-1" } }),
    () => new Response("{}", { headers: { "content-encoding": "gzip" } }),
    () => new Response("{}", { headers: { "set-cookie": secret } }),
  ])("refuses malformed response %#", async response => {
    const f = fixture(); await failure(f.execute({}, { fetch: async () => response() }), "response_invalid");
  });
  it.each([false, true])("bounds metadata body (declared=%s)", async declared => {
    const f = fixture(), body = "x".repeat(262145);
    await failure(f.execute({}, { fetch: async () => new Response(body, { headers: declared ? { "content-length": String(body.length) } : {} }) }), "response_too_large");
  });
  it("refuses zero-length chunks rather than allowing an unbounded empty stream", async () => {
    const f = fixture(), response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(0)); } }));
    await failure(f.execute({}, { fetch: async () => response }), "response_invalid");
  });
  it("refuses even successful auto-redirected responses", async () => {
    const f = fixture(), response = Response.json(f.repository); Object.defineProperty(response, "redirected", { value: true });
    await failure(f.execute({}, { fetch: async () => response }), "response_invalid");
  });
  it("refuses an unexpected effective response URL", async () => {
    const f = fixture(), response = Response.json(f.repository); Object.defineProperty(response, "url", { value: "https://evil.example/" });
    await failure(f.execute({}, { fetch: async () => response }), "response_invalid");
  });
});

describe("repository, run and successful job evidence", () => {
  it.each([
    f => { f.repository.id++; }, f => { f.repository.owner.id++; }, f => { f.repository.owner.login = "impostor"; },
    f => { f.repository.full_name = "boisey9/other"; }, f => { f.repository.id = "1310270513"; },
  ])("refuses mismatched repository %#", async change => { const f = fixture(); change(f); await failure(f.execute(), "identity_mismatch"); expect(f.calls).toHaveLength(1); });
  it.each([
    r => { r.id++; }, r => { r.run_attempt++; }, r => { r.workflow_id++; }, r => { r.head_repository.id++; },
    r => { r.head_repository.owner.id++; }, r => { r.head_sha = "c".repeat(40); }, r => { r.head_branch = "feature"; },
    r => { r.path = ".github/workflows/other.yml"; }, r => { r.event = "push"; }, r => { r.status = "in_progress"; },
    r => { r.conclusion = "failure"; }, r => { r.actor = { ...r.actor, id: 1 }; }, r => { r.triggering_actor.id = 1; },
    r => { r.pull_requests = [{}]; }, r => { r.updated_at = "2026-11-02T00:00:00Z"; },
    r => { r.run_started_at = "2026-11-01T20:09:01Z"; }, r => { r.created_at = "2026-02-30T20:00:00Z"; },
  ])("refuses unapproved or nonterminal run %#", async change => { const f = fixture(); change(f.run); await failure(f.execute(), "run_mismatch"); expect(f.calls).toHaveLength(2); });
  it.each([
    j => { j.id++; }, j => { j.name = "other"; }, j => { j.run_id++; }, j => { j.run_attempt++; },
    j => { j.run_url = "https://evil.example"; }, j => { j.head_sha = "c".repeat(40); }, j => { j.head_branch = "feature"; },
    j => { j.status = "queued"; }, j => { j.conclusion = "failure"; }, j => { j.steps[1].conclusion = "skipped"; },
    j => { j.steps[0].conclusion = "failure"; }, j => { j.steps[1].status = "in_progress"; }, j => { j.steps.pop(); },
    j => { j.steps.push(structuredClone(j.steps[1])); }, j => { j.steps[1].number = 5; },
    j => { j.steps[1].started_at = "2026-11-01T20:04:00Z"; }, j => { j.steps[0].started_at = "2026-11-01T20:01:00Z"; },
    j => { j.started_at = "2026-11-01T20:00:00Z"; }, j => { j.completed_at = "2026-11-01T20:09:01Z"; },
  ])("refuses wrong, missing or unsuccessful job evidence %#", async change => { const f = fixture(); change(f.job); await failure(f.execute(), "job_mismatch"); expect(f.calls).toHaveLength(3); });
  it("accepts documented jobs without a separate run_attempt field only from exact attempt endpoint", async () => {
    const f = fixture(); delete f.job.run_attempt; const result = await f.execute(); expect(result.evidence.producer.runAttempt).toBe("2");
    expect(f.calls[2].url).toContain("/attempts/2/jobs");
  });
  it.each([2, 101, 0])("refuses incomplete or paginated job count %s", async count => {
    const f = fixture(); f.responses[2].total_count = count; await failure(f.execute(), "pagination_unsupported");
  });
  it("refuses next-page link instead of trusting partial evidence", async () => {
    const f = fixture(); await failure(f.execute({}, { fetch: async () => Response.json(f.repository, { headers: { Link: '<https://api.github.com/next>; rel="next"' } }) }), "pagination_unsupported");
  });
});

describe("exact artifact and bounded archive readback", () => {
  const changeBoth = (f, change) => { change(f.artifact); change(f.responses[3].artifacts[0]); };
  it.each([
    a => { a.id++; }, a => { a.name = "bob-recovery-handoff-r123456-a3"; }, a => { a.workflow_run.id++; },
    a => { a.workflow_run.repository_id++; }, a => { a.workflow_run.head_repository_id++; },
    a => { a.workflow_run.head_sha = "c".repeat(40); }, a => { a.workflow_run.head_branch = "feature"; },
    a => { a.size_in_bytes = 0; }, a => { a.size_in_bytes = 65537; }, a => { delete a.digest; },
    a => { a.digest = "sha256:" + "0".repeat(64); }, a => { a.digest = "sha512:" + "a".repeat(64); },
    a => { a.created_at = "2026-11-01T20:05:59Z"; }, a => { a.created_at = "2026-11-01T20:07:01Z"; },
    a => { a.updated_at = "2026-11-01T20:10:01Z"; }, a => { a.url = "https://evil.example"; },
    a => { a.archive_download_url = "https://evil.example"; },
  ])("refuses wrong artifact identity, association or bounds %#", async change => {
    const f = fixture(); changeBoth(f, change); await failure(f.execute(), "artifact_mismatch"); expect(f.calls.length).toBeLessThan(6);
  });
  it.each([a => { a.expired = true; }, a => { a.expires_at = timestamp; }, a => { a.expires_at = "not-a-date"; }])("refuses expired artifact %#", async change => {
    const f = fixture(); changeBoth(f, change); await failure(f.execute(), "artifact_expired");
  });
  it("refuses duplicate names instead of selecting the first/newest", async () => {
    const f = fixture(); f.responses[3].artifacts.push({ ...f.responses[3].artifacts[0], id: 988 }); f.responses[3].total_count++;
    await failure(f.execute(), "artifact_mismatch"); expect(f.calls).toHaveLength(4);
  });
  it("refuses repeated artifact IDs", async () => {
    const f = fixture(); f.responses[3].artifacts.push({ ...f.responses[3].artifacts[0], name: "other" }); f.responses[3].total_count++;
    await failure(f.execute(), "response_invalid");
  });
  it("refuses incomplete artifact pagination", async () => {
    const f = fixture(); f.responses[3].total_count = 2; await failure(f.execute(), "pagination_unsupported");
  });
  it("refuses changed artifact metadata between list and exact read", async () => {
    const f = fixture(); f.artifact.digest = "sha256:" + "c".repeat(64); await failure(f.execute(), "artifact_mismatch");
  });
  it.each([
    "http://fixture.blob.core.windows.net/a", "https://evil.example/a", "https://fixture.blob.core.windows.net.evil.example/a",
    "https://user:password@fixture.blob.core.windows.net/a", "https://fixture.blob.core.windows.net:444/a",
    "https://fixture.blob.core.windows.net/a#fragment", "/relative", "https://api.github.com/a", "https://127.0.0.1/a",
    "",
  ])("refuses unapproved redirect %s", async location => {
    const f = fixture(), delegate = f.fetch;
    await failure(f.execute({}, { fetch: async (...args) => f.calls.length === 5 ? new Response(null, { status: 302, headers: { location } }) : delegate(...args) }), "redirect_invalid");
    expect(f.calls).toHaveLength(5);
  });
  it("refuses a malformed redirect header even from an injected transport", async () => {
    const f = fixture(), delegate = f.fetch, response = new Response(null, { status: 302 });
    vi.spyOn(response.headers, "get").mockImplementation(key => key === "location" ? "https://fixture.blob.core.windows.net/a\nignored" : null);
    await failure(f.execute({}, { fetch: async (...args) => f.calls.length === 5 ? response : delegate(...args) }), "redirect_invalid");
  });
  it("refuses a second storage redirect", async () => {
    const f = fixture(), delegate = f.fetch;
    await failure(f.execute({}, { fetch: async (...args) => f.calls.length === 6 ? new Response(null, { status: 302, headers: { location: f.location } }) : delegate(...args) }), "response_invalid");
  });
  it("refuses changed archive digest", async () => {
    const f = fixture(), delegate = f.fetch;
    await failure(f.execute({}, { fetch: async (...args) => f.calls.length === 6 ? new Response(Buffer.alloc(archive.length, 1)) : delegate(...args) }), "digest_mismatch");
  });
  it.each([false, true])("bounds archive bytes before parsing (declared=%s)", async declared => {
    const f = fixture(), delegate = f.fetch;
    await failure(f.execute({}, { fetch: async (...args) => f.calls.length === 6 ? new Response(Buffer.alloc(65537), { headers: declared ? { "content-length": "65537" } : {} }) : delegate(...args) }), "response_too_large");
  });
  it("rechecks expiry after transfer", async () => {
    const f = fixture(); f.now.mockReturnValueOnce(new Date(timestamp)).mockReturnValue(new Date("2026-11-09T00:00:00Z"));
    await failure(f.execute(), "artifact_expired");
  });
  it("refuses clock reversal after transfer", async () => {
    const f = fixture(); f.now.mockReturnValueOnce(new Date(timestamp)).mockReturnValue(new Date("2026-11-01T20:09:00Z"));
    await failure(f.execute(), "invalid_input");
  });
});
