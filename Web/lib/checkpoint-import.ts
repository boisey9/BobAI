import { createHash, timingSafeEqual } from "node:crypto";
import { TASK_ID } from "@/lib/task-contract";
import { MAX_IMPORT_BYTES, REVIEW_TTL_MS as TTL, REVIEW_SOURCES, keys, object, text, lines, timestamp, parseImportBundle,
  type CheckpointBody, type ImportProject, type ImportReceipt, type ImportSnapshot } from "@/lib/checkpoint-import-contract";
export { parseImportBundle } from "@/lib/checkpoint-import-contract";

export type ImportDependencies = {
  hasOwnerSession(): Promise<boolean>;
  csrf(value: string | undefined): Promise<boolean>;
  read(project: string): Promise<unknown>;
  write(project: string, body: CheckpointBody & { expectedProjectId: string }): Promise<unknown>;
  sign(payload: string): Promise<string>;
  now?: () => number;
};
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function fail(code: string): never { throw new Error(code); }
function freshTimestamp(value: unknown, now: number): value is string {
  return timestamp(value) && now - Date.parse(value) <= TTL && Date.parse(value) <= now + 30_000;
}
function context(value: unknown, project: ImportProject, now: number) {
  if (!object(value) || !object(value.project) || !object(value.authority) || value.authority.source !== "bob-core"
    || !object(value.request) || value.request.projectKey !== project.key || value.request.surface !== "web"
    || value.project.id !== project.id || value.project.projectKey !== project.key || value.project.name !== project.name
    || value.project.status !== "active" || !text(value.revision, 128) || typeof value.partial !== "boolean"
    || !object(value.sources)) return fail("context_changed");
  if (!freshTimestamp(value.generatedAt, now)) return fail("context_unavailable");
  const sources = {} as ImportSnapshot["sources"];
  for (const name of REVIEW_SOURCES) {
    const source = value.sources[name];
    if (!object(source) || source.status !== "available" || typeof source.truncated !== "boolean"
      || !freshTimestamp(source.checkedAt, now)) return fail("context_unavailable");
    sources[name] = { checkedAt: source.checkedAt, truncated: source.truncated };
  }
  if (!Array.isArray(value.decisions) || value.decisions.length > 20 || !Array.isArray(value.tasks) || value.tasks.length > 20
    || !Array.isArray(value.handoffs) || value.handoffs.length > 4) return fail("context_unavailable");
  const handoffs = value.handoffs.map(h => {
    if (!object(h) || typeof h.id !== "string" || !TASK_ID.test(h.id) || !text(h.outcome, 2_000) || !lines(h.unresolved) || !lines(h.nextActions)) return fail("context_unavailable");
    return { id: h.id, outcome: h.outcome, unresolved: h.unresolved, nextActions: h.nextActions };
  });
  const decisions = value.decisions.map(d => {
    if (!object(d) || !text(d.title, 180) || !text(d.decision, 8_000) || d.status !== "active") return fail("context_unavailable");
    return { title: d.title, decision: d.decision };
  });
  const tasks = value.tasks.map(t => {
    if (!object(t) || !text(t.title, 180) || !text(t.status, 32) || !["open", "in_progress", "blocked"].includes(t.status)) return fail("context_unavailable");
    return { title: t.title, status: t.status };
  });
  // Context revision includes audit retrieval events; bind state sections instead so our own read cannot invalidate review.
  const stateDigest = digest({ project: value.project, decisions: value.decisions, tasks: value.tasks, handoffs: value.handoffs,
    completeness: REVIEW_SOURCES.map(name => [name, sources[name].truncated]) });
  return { stateDigest, handoffs, snapshot: { revision: value.revision, partial: value.partial, generatedAt: value.generatedAt, sources,
    handoffs: handoffs.map(({ outcome, unresolved, nextActions }) => ({ outcome, unresolved, nextActions })), decisions, tasks } };
}
function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store" } }); }
async function input(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json" || !request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
    if (size > MAX_IMPORT_BYTES) { await reader.cancel(); return null; } chunks.push(next.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function createImportHandler(deps: ImportDependencies) {
  return async (request: Request): Promise<Response> => {
    const receipts: ImportReceipt[] = []; let pendingOperationId: string | undefined;
    try {
      if (!(await deps.hasOwnerSession())) return json({ error: { code: "owner_required", message: "Sign in to Bob first." }, partialReceipts: [] }, 401);
      if (request.method !== "POST" || request.headers.get("origin") !== new URL(request.url).origin
        || !(await deps.csrf(request.headers.get("x-bob-csrf") ?? undefined))) return json({ error: { code: "csrf", message: "Reload this page before continuing." }, partialReceipts: [] }, 403);
      const raw = await input(request).catch(() => null);
      if (!object(raw) || (raw.action !== "review" && raw.action !== "commit")
        || !keys(raw, raw.action === "review" ? ["action", "bundle"] : ["action", "bundle", "reviewToken"])) return fail("invalid_import");
      const bundle = parseImportBundle(raw.bundle); if (!bundle) return fail("invalid_import");
      const now = deps.now ?? Date.now;
      if (raw.action === "review") {
        const projects = []; const states = [];
        for (const item of bundle.checkpoints) { const read = context(await deps.read(item.project.key), item.project, now());
          projects.push({ ...item, snapshot: read.snapshot }); states.push(read.stateDigest); }
        const expiresAt = now() + TTL;
        const payload = Buffer.from(JSON.stringify({ version: 1, bundleDigest: digest(bundle), expiresAt, states })).toString("base64url");
        return json({ projects, expiresAt, reviewToken: `${payload}.${await deps.sign(payload)}` });
      }
      if (!text(raw.reviewToken, 4_096)) return fail("review_required");
      const [payload, signature, extra] = raw.reviewToken.split(".");
      if (!payload || !signature || extra !== undefined || !equal(signature, await deps.sign(payload))) return fail("review_required");
      const proof = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (!keys(proof, ["version", "bundleDigest", "expiresAt", "states"]) || proof.version !== 1 || proof.bundleDigest !== digest(bundle)
        || typeof proof.expiresAt !== "number" || proof.expiresAt <= now() || proof.expiresAt > now() + TTL
        || !Array.isArray(proof.states) || proof.states.length !== bundle.checkpoints.length) return fail("review_required");
      // Validate every project before any write, then again immediately before each write.
      for (const [index, item] of bundle.checkpoints.entries()) {
        const latest = await deps.read(item.project.key);
        if (proof.expiresAt <= now()) return fail("review_required");
        if (context(latest, item.project, now()).stateDigest !== proof.states[index]) return fail("context_changed");
      }
      for (const [index, item] of bundle.checkpoints.entries()) {
        if (proof.expiresAt <= now()) return fail("review_required");
        const latest = await deps.read(item.project.key);
        if (proof.expiresAt <= now()) return fail("review_required");
        if (context(latest, item.project, now()).stateDigest !== proof.states[index]) return fail("context_changed");
        pendingOperationId = item.body.operationId;
        const result = await deps.write(item.project.key, { ...item.body, expectedProjectId: item.project.id });
        if (!object(result) || typeof result.idempotent !== "boolean" || !object(result.handoff)
          || typeof result.handoff.id !== "string" || !TASK_ID.test(result.handoff.id)
          || result.handoff.projectId !== item.project.id || result.handoff.outcome !== item.body.outcome
          || digest(result.handoff.unresolved) !== digest(item.body.unresolved) || digest(result.handoff.nextActions) !== digest(item.body.nextActions)) return fail("receipt_unconfirmed");
        receipts.push({ projectKey: item.project.key, operationId: item.body.operationId, handoffId: result.handoff.id, idempotent: result.idempotent, verifiedBy: "receipt_only" });
        const handoffId = result.handoff.id;
        const readback = context(await deps.read(item.project.key), item.project, now());
        const visible = readback.handoffs.some(h => h.id === handoffId && h.outcome === item.body.outcome
          && digest(h.unresolved) === digest(item.body.unresolved) && digest(h.nextActions) === digest(item.body.nextActions));
        if (!visible && !result.idempotent) return fail("readback_unconfirmed");
        receipts[receipts.length - 1].verifiedBy = visible ? "context_readback" : "operation_receipt";
        pendingOperationId = undefined;
      }
      return json({ complete: true, receipts });
    } catch (error) {
      const allowed = ["invalid_import", "review_required", "context_changed", "context_unavailable", "receipt_unconfirmed", "readback_unconfirmed"];
      const upstream = error instanceof Error && "code" in error ? error.code : undefined;
      const code = upstream === "project_binding_changed" ? "project_binding_changed" : upstream === "operation_conflict" ? "operation_conflict"
        : error instanceof Error && allowed.includes(error.message) ? error.message : "core_unconfirmed";
      const message = code === "project_binding_changed" ? "The project connection changed. Stop this import and verify the Production project identity before continuing."
        : code === "operation_conflict" ? "An operation ID already belongs to different checkpoint content. Keep the original file and reconcile its receipt before continuing."
        : code === "invalid_import" ? "Choose a valid portable checkpoint file for the four recorded projects."
        : code === "review_required" || code === "context_changed" ? "The review expired or project state changed. Review again before importing."
          : "Core has not confirmed the complete import. Keep this exact file and operation IDs; review again to recover receipts.";
      return json({ error: { code, message }, partialReceipts: receipts, ...(pendingOperationId ? { pendingOperationId } : {}) }, code === "invalid_import" ? 400 : code === "review_required" || code === "context_changed" || code === "operation_conflict" || code === "project_binding_changed" ? 409 : 503);
    }
  };
}
