import { BackupCoverageError } from "./backup-coverage.mjs";
import { validateBackupRecoveryProducer } from "./backup-recovery-handoff.mjs";
import { sha256 } from "./backup.mjs";

const API = "https://api.github.com", ROOT = "/repos/boisey9/BobAI";
const METADATA_BYTES = 262144, ARCHIVE_BYTES = 65536, DEADLINE_MS = 60000;
const codes = new Set(["disabled", "invalid_approval", "invalid_input", "transport_required", "transport_failed",
  "interrupted", "timeout", "response_invalid", "response_too_large", "identity_mismatch", "run_mismatch",
  "job_mismatch", "artifact_mismatch", "pagination_unsupported", "artifact_expired", "redirect_invalid", "digest_mismatch"]);
const fail = code => { throw new BackupCoverageError(`artifact_${code}`); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const digit = value => typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const apiId = (value, expected) => Number.isSafeInteger(value) && value > 0 && String(value) === expected;
const name = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value);
const actor = value => exact(value, ["login", "id"]) && typeof value.login === "string" &&
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value.login) && digit(value.id);
const host = value => typeof value === "string" && value.length <= 253 &&
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:blob\.core\.windows\.net|actions\.githubusercontent\.com)$/.test(value);
const canonicalTime = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const iso = new Date(milliseconds).toISOString();
  if (iso !== value && iso !== value.replace("Z", ".000Z")) return null;
  return iso;
};
const instant = value => { const result = canonicalTime(value); return result === null ? NaN : Date.parse(result); };
const sanitize = error => {
  let code;
  try {
    // Never execute a transport exception's getter or expose its own message.
    const property = error instanceof BackupCoverageError ? Object.getOwnPropertyDescriptor(error, "code") : undefined;
    if (property && Object.hasOwn(property, "value") && typeof property.value === "string" && property.value.startsWith("artifact_"))
      code = property.value.slice(9);
  } catch { /* an untrusted exception can itself be a hostile proxy */ }
  if (codes.has(code)) fail(code);
  fail("transport_failed");
};
const discardResponse = response => {
  try { if (response instanceof Response) Promise.resolve(response.body?.cancel()).catch(() => {}); }
  catch { /* cancellation never admits raw transport diagnostics */ }
};

// Approval is independently reviewed input, never discovered from an artifact or
// inferred from a run name. These assertions do not authenticate a GitHub user.
export function validateArtifactCustodyApproval(input) {
  try {
    if (!exact(input, ["version", "repository", "producer", "workflowId", "actor", "triggeringActor", "job",
      "artifactId", "recipient", "instance", "storageHosts"]) || input.version !== 1 ||
      !exact(input.repository, ["fullName", "id", "owner"]) || input.repository.fullName !== "boisey9/BobAI" ||
      input.repository.id !== "1310270513" || !actor(input.repository.owner) ||
      input.repository.owner.id !== "6569974" || input.repository.owner.login !== "boisey9" ||
      !digit(input.workflowId) || !actor(input.actor) || !actor(input.triggeringActor) ||
      !exact(input.job, ["id", "name", "captureStep", "uploadStep"]) || !digit(input.job.id) ||
      ![input.job.name, input.job.captureStep, input.job.uploadStep].every(name) ||
      input.job.captureStep === input.job.uploadStep || !digit(input.artifactId) ||
      typeof input.recipient !== "string" || !/^age1[a-z0-9]{20,100}$/.test(input.recipient) ||
      typeof input.instance !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(input.instance) ||
      !Array.isArray(input.storageHosts) || input.storageHosts.length < 1 || input.storageHosts.length > 4 ||
      !input.storageHosts.every(host) || new Set(input.storageHosts).size !== input.storageHosts.length) fail("invalid_approval");
    const producer = validateBackupRecoveryProducer(input.producer);
    if (![producer.runId, producer.runAttempt].every(digit)) fail("invalid_approval");
    return freeze({ version: 1, repository: { fullName: input.repository.fullName, id: input.repository.id,
      owner: { login: input.repository.owner.login, id: input.repository.owner.id } }, producer,
      workflowId: input.workflowId, actor: { login: input.actor.login, id: input.actor.id },
      triggeringActor: { login: input.triggeringActor.login, id: input.triggeringActor.id },
      job: { id: input.job.id, name: input.job.name, captureStep: input.job.captureStep, uploadStep: input.job.uploadStep },
      artifactId: input.artifactId, recipient: input.recipient, instance: input.instance, storageHosts: [...input.storageHosts] });
  } catch { fail("invalid_approval"); }
}

function sameActor(value, approved) {
  return value && value.login === approved.login && apiId(value.id, approved.id);
}
function sameRepository(value, approved) {
  return value && value.full_name === approved.fullName && apiId(value.id, approved.id) && sameActor(value.owner, approved.owner);
}
function verifyRun(run, approval, now) {
  const p = approval.producer;
  if (!run || !sameRepository(run.repository, approval.repository) || !sameRepository(run.head_repository, approval.repository) ||
      !apiId(run.id, p.runId) || !apiId(run.run_attempt, p.runAttempt) || !apiId(run.workflow_id, approval.workflowId) ||
      run.path !== ".github/workflows/backups-testing.yml" || run.head_branch !== "main" || run.head_sha !== p.sourceCommit ||
      run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success" ||
      !sameActor(run.actor, approval.actor) || !sameActor(run.triggering_actor, approval.triggeringActor) ||
      !Array.isArray(run.pull_requests) || run.pull_requests.length !== 0) fail("run_mismatch");
  const created = instant(run.created_at), started = instant(run.run_started_at), completed = instant(run.updated_at);
  if (![created, started, completed].every(Number.isFinite) || created > started || started > completed || completed > now)
    fail("run_mismatch");
  return { started, completed };
}
function completeList(value, key) {
  const rows = value?.[key];
  if (!Number.isSafeInteger(value?.total_count) || value.total_count < 1 || value.total_count > 100 ||
      !Array.isArray(rows) || rows.length !== value.total_count) fail("pagination_unsupported");
  if (rows.some(row => !Number.isSafeInteger(row?.id) || row.id < 1 || !name(row.name)) ||
      new Set(rows.map(row => row.id)).size !== rows.length) fail("response_invalid");
  return rows;
}
function verifyJob(value, approval, times) {
  const rows = completeList(value, "jobs"), selected = rows.filter(row => apiId(row.id, approval.job.id));
  if (selected.length !== 1 || rows.filter(row => row.name === approval.job.name).length !== 1) fail("job_mismatch");
  const job = selected[0], p = approval.producer;
  if (job.name !== approval.job.name || !apiId(job.run_id, p.runId) ||
      (job.run_attempt !== undefined && !apiId(job.run_attempt, p.runAttempt)) ||
      job.run_url !== `${API}${ROOT}/actions/runs/${p.runId}` || job.head_sha !== p.sourceCommit || job.head_branch !== "main" ||
      job.status !== "completed" || job.conclusion !== "success" || !Array.isArray(job.steps) || job.steps.length > 100)
    fail("job_mismatch");
  const started = instant(job.started_at), completed = instant(job.completed_at);
  if (![started, completed].every(Number.isFinite) || started < times.started || started > completed || completed > times.completed)
    fail("job_mismatch");
  function step(expected) {
    const selected = job.steps.filter(item => item?.name === expected);
    if (selected.length !== 1) fail("job_mismatch");
    const item = selected[0], start = instant(item.started_at), end = instant(item.completed_at);
    if (item.status !== "completed" || item.conclusion !== "success" || !Number.isSafeInteger(item.number) || item.number < 1 ||
        ![start, end].every(Number.isFinite) || start < started || start > end || end > completed) fail("job_mismatch");
    return { start, end, number: item.number };
  }
  const capture = step(approval.job.captureStep), upload = step(approval.job.uploadStep);
  if (capture.number >= upload.number || capture.end > upload.start ||
      job.steps.filter(item => item?.number === capture.number).length !== 1 ||
      job.steps.filter(item => item?.number === upload.number).length !== 1) fail("job_mismatch");
  return { started, completed, upload };
}
function verifyArtifact(artifact, approval, job, run, now) {
  const p = approval.producer, association = artifact?.workflow_run;
  const artifactName = `bob-recovery-handoff-r${p.runId}-a${p.runAttempt}`;
  if (!artifact || !apiId(artifact.id, approval.artifactId) || artifact.name !== artifactName ||
      !association || !apiId(association.id, p.runId) || !apiId(association.repository_id, approval.repository.id) ||
      !apiId(association.head_repository_id, approval.repository.id) || association.head_branch !== "main" ||
      association.head_sha !== p.sourceCommit || !Number.isSafeInteger(artifact.size_in_bytes) ||
      artifact.size_in_bytes < 1 || artifact.size_in_bytes > ARCHIVE_BYTES || typeof artifact.digest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(artifact.digest) || artifact.digest === `sha256:${"0".repeat(64)}` ||
      artifact.url !== `${API}${ROOT}/actions/artifacts/${approval.artifactId}` ||
      artifact.archive_download_url !== `${API}${ROOT}/actions/artifacts/${approval.artifactId}/zip`) fail("artifact_mismatch");
  const created = instant(artifact.created_at), updated = instant(artifact.updated_at), expires = instant(artifact.expires_at);
  if (artifact.expired !== false || !Number.isFinite(expires) || expires <= now) fail("artifact_expired");
  if (![created, updated].every(Number.isFinite) || created < job.upload.start || created > job.upload.end ||
      updated < created || updated > run.completed || expires <= created) fail("artifact_mismatch");
  return { id: approval.artifactId, name: artifactName, createdAt: new Date(created).toISOString(),
    expiresAt: new Date(expires).toISOString(), archiveSha256: artifact.digest.slice(7), archiveBytes: artifact.size_in_bytes };
}

function currentTime(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail("invalid_input");
  return value.getTime();
}

// Read-only transport seam. No global fetch, credential lookup, environment
// switch, workflow, CLI or retry is installed. Synthetic callers supply fetch;
// hosted use requires a separately approved transport and reader authority.
export async function fetchBackupArtifact({ enabled = false, approval: input, token, signal } = {}, {
  fetch, now = () => new Date(),
} = {}) {
  if (enabled !== true) fail("disabled");
  let timer, onAbort, reader, pendingResponse;
  const controller = new AbortController();
  let terminalCode;
  let stop;
  const stopped = new Promise((_, reject) => { stop = code => {
    if (!terminalCode) { terminalCode = code; controller.abort(); reject(new BackupCoverageError(`artifact_${code}`)); }
  }; });
  // Observe the rejection even when a synchronous validation fails before race.
  stopped.catch(() => {});
  const guard = () => { if (terminalCode) fail(terminalCode); };
  const bounded = async action => { guard(); const result = await Promise.race([Promise.resolve().then(action), stopped]); guard(); return result; };
  try {
    const approval = validateArtifactCustodyApproval(input);
    if (typeof fetch !== "function") fail("transport_required");
    if (typeof now !== "function" || signal !== undefined && !(signal instanceof AbortSignal) ||
        token !== undefined && (typeof token !== "string" || token.length < 1 || token.length > 4096 || /[^\x21-\x7e]/.test(token)))
      fail("invalid_input");
    if (signal?.aborted) fail("interrupted");
    const startedAt = currentTime(now);
    onAbort = () => stop("interrupted"); signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => stop("timeout"), DEADLINE_MS);
    const apiHeaders = { Accept: "application/vnd.github+json", "Accept-Encoding": "identity", "X-GitHub-Api-Version": "2026-03-10" };
    if (token !== undefined) apiHeaders.Authorization = `Bearer ${token}`;
    async function request(url, headers, status) {
      const response = await bounded(async () => {
        const value = await fetch(url, { method: "GET", headers: { ...headers }, redirect: "manual",
          credentials: "omit", cache: "no-store", signal: controller.signal });
        // A transport may ignore abort and settle after our deadline. Discard
        // that late body without awaiting an uncooperative cancel hook.
        if (terminalCode) { discardResponse(value); fail(terminalCode); }
        return value;
      });
      pendingResponse = response instanceof Response ? response : undefined;
      if (!(response instanceof Response) || response.redirected || response.status !== status ||
          response.url && response.url !== url || response.headers.has("set-cookie")) fail("response_invalid");
      return response;
    }
    async function bytes(response, maximum) {
      const declared = response.headers.get("content-length"), encoding = response.headers.get("content-encoding");
      if (encoding !== null && encoding !== "identity") fail("response_invalid");
      if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)))) fail("response_invalid");
      if (declared !== null && Number(declared) > maximum) fail("response_too_large");
      if (!response.body) fail("response_invalid");
      reader = response.body.getReader();
      const chunks = []; let length = 0;
      try {
        while (true) {
          const result = await bounded(() => reader.read());
          if (result.done) break;
          if (!(result.value instanceof Uint8Array) || result.value.byteLength === 0) fail("response_invalid");
          length += result.value.byteLength;
          if (length > maximum) fail("response_too_large");
          chunks.push(Buffer.from(result.value));
        }
        if (declared !== null && length !== Number(declared)) fail("response_invalid");
        if (length === 0) fail("response_invalid");
        reader.releaseLock(); reader = undefined; pendingResponse = undefined;
        return Buffer.concat(chunks, length);
      } catch (error) {
        // Cancellation must not await an uncooperative stream's cancel hook.
        try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch { /* sanitized below */ }
        reader = undefined; throw error;
      }
    }
    async function json(path) {
      const response = await request(`${API}${path}`, apiHeaders, 200);
      if (/\brel\s*=\s*["']?next\b/i.test(response.headers.get("link") ?? "")) fail("pagination_unsupported");
      const data = await bytes(response, METADATA_BYTES);
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)); }
      catch { fail("response_invalid"); }
    }
    const repository = await json(ROOT);
    if (!sameRepository(repository, approval.repository)) fail("identity_mismatch");
    const runPath = `${ROOT}/actions/runs/${approval.producer.runId}`;
    const run = verifyRun(await json(`${runPath}/attempts/${approval.producer.runAttempt}`), approval, startedAt);
    const job = verifyJob(await json(`${runPath}/attempts/${approval.producer.runAttempt}/jobs?per_page=100`), approval, run);
    const listed = completeList(await json(`${runPath}/artifacts?per_page=100`), "artifacts");
    const expectedName = `bob-recovery-handoff-r${approval.producer.runId}-a${approval.producer.runAttempt}`;
    const candidates = listed.filter(item => item.name === expectedName);
    if (candidates.length !== 1 || !apiId(candidates[0].id, approval.artifactId)) fail("artifact_mismatch");
    const listedArtifact = verifyArtifact(candidates[0], approval, job, run, startedAt);
    const path = `${ROOT}/actions/artifacts/${approval.artifactId}`;
    const artifact = verifyArtifact(await json(path), approval, job, run, startedAt);
    if (JSON.stringify(listedArtifact) !== JSON.stringify(artifact)) fail("artifact_mismatch");
    const redirect = await request(`${API}${path}/zip`, apiHeaders, 302);
    // Redirect bodies are never interpreted and must not keep a transfer alive.
    discardResponse(redirect);
    pendingResponse = undefined;
    let location;
    try {
      const raw = redirect.headers.get("location");
      if (typeof raw !== "string" || raw.length < 1 || raw.length > 8192 || /[\x00-\x20\x7f]/.test(raw)) fail("redirect_invalid");
      location = new URL(raw);
      if (location.protocol !== "https:" || location.username || location.password || location.hash ||
          location.port !== "" || !approval.storageHosts.includes(location.hostname) || location.origin === API) fail("redirect_invalid");
    } catch { fail("redirect_invalid"); }
    // Never forward API authorization, cookies or headers to signed storage.
    const response = await request(location.href, { Accept: "application/octet-stream", "Accept-Encoding": "identity" }, 200);
    const archive = await bytes(response, ARCHIVE_BYTES);
    if (archive.length !== artifact.archiveBytes || sha256(archive) !== artifact.archiveSha256) fail("digest_mismatch");
    const completedAt = currentTime(now); guard();
    if (completedAt < startedAt) fail("invalid_input");
    if (Date.parse(artifact.expiresAt) <= completedAt) fail("artifact_expired");
    return { approval, evidence: freeze({ repository: approval.repository, producer: approval.producer,
      workflowId: approval.workflowId, actor: approval.actor, triggeringActor: approval.triggeringActor,
      job: { id: approval.job.id, name: approval.job.name, startedAt: new Date(job.started).toISOString(), completedAt: new Date(job.completed).toISOString() },
      artifact, verifiedAt: new Date(completedAt).toISOString() }), archive };
  } catch (error) { if (terminalCode) fail(terminalCode); sanitize(error); }
  finally {
    clearTimeout(timer); if (onAbort) signal?.removeEventListener("abort", onAbort);
    controller.abort(); token = undefined;
    if (reader) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* no raw error */ } }
    else if (pendingResponse) discardResponse(pendingResponse);
  }
}
