import { TASK_ID } from "@/lib/task-contract";

// This is the saved portable-file destination contract, not an access grant.
// Live Core identity and authorization must still match on every import.
export const CORE_ORIGIN = "https://bob-core.vercel.app";
export const MAX_FILE_BYTES = 56 * 1024;
export const MAX_IMPORT_BYTES = 65_536;
export const REVIEW_TTL_MS = 5 * 60_000;
const PROJECTS = [
  { id: "10000000-0000-4000-8000-000000000001", key: "bobai", name: "BobAI" },
  { id: "625cd72a-8f72-4e6f-a090-e791b8681259", key: "fomoflow", name: "FOMOflow" },
  { id: "99961b51-0293-4392-a09b-958e8865833b", key: "rfq", name: "MicroBird RFQ" },
  { id: "f21440d5-2331-4b03-8e22-9d24a4d514cd", key: "personal", name: "Personal" },
];
export type ImportProject = { id: string; key: string; name: string };
export type CheckpointBody = { operationId: string; outcome: string; unresolved: string[]; nextActions: string[] };
export type Checkpoint = { project: ImportProject; body: CheckpointBody };
export type ImportBundle = { version: 1; coreOrigin: typeof CORE_ORIGIN; environment: "production"; checkpoints: Checkpoint[] };
export const REVIEW_SOURCES = ["decisions", "tasks", "handoffs"] as const;
export type ImportSnapshot = {
  revision: string; partial: boolean; generatedAt: string;
  sources: Record<typeof REVIEW_SOURCES[number], { checkedAt: string; truncated: boolean }>;
  handoffs: { outcome: string; unresolved: string[]; nextActions: string[] }[];
  decisions: { title: string; decision: string }[];
  tasks: { title: string; status: string }[];
};
export type ImportReview = { reviewToken: string; expiresAt: number; projects: (Checkpoint & { snapshot: ImportSnapshot })[] };
export type ImportReceipt = { projectKey: string; operationId: string; handoffId: string; idempotent: boolean; verifiedBy: "context_readback" | "operation_receipt" | "receipt_only" };

export function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
export function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim(); }
export function lines(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 10 && value.every(v => text(v, 500)); }
export function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function body(value: unknown): value is CheckpointBody {
  return keys(value, ["operationId", "outcome", "unresolved", "nextActions"])
    && text(value.operationId, 120) && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(value.operationId)
    && text(value.outcome, 2_000) && lines(value.unresolved) && lines(value.nextActions);
}
export function parseImportBundle(value: unknown): ImportBundle | null {
  if (!keys(value, ["version", "coreOrigin", "environment", "checkpoints"]) || value.version !== 1
    || value.coreOrigin !== CORE_ORIGIN || value.environment !== "production" || !Array.isArray(value.checkpoints)
    || value.checkpoints.length < 1 || value.checkpoints.length > 4) return null;
  const seen = new Set<string>(); const operations = new Set<string>();
  for (const item of value.checkpoints) {
    if (!keys(item, ["project", "body"]) || !keys(item.project, ["id", "key", "name"]) || !body(item.body)) return null;
    const identity = item.project;
    const match = PROJECTS.find(p => p.id === identity.id && p.key === identity.key && p.name === identity.name);
    if (!match || seen.has(match.key) || operations.has(item.body.operationId)) return null;
    seen.add(match.key); operations.add(item.body.operationId);
  }
  // Deterministic reconstruction drops any unrecognized transport fields.
  return { version: 1, coreOrigin: CORE_ORIGIN, environment: "production", checkpoints: value.checkpoints.map(item => ({
    project: { id: item.project.id, key: item.project.key, name: item.project.name },
    body: { operationId: item.body.operationId, outcome: item.body.outcome, unresolved: [...item.body.unresolved], nextActions: [...item.body.nextActions] },
  })) };
}
function sameCheckpoint(value: Record<string, unknown>, expected: Checkpoint): boolean {
  if (!object(value.project) || !object(value.body)) return false;
  const { project, body } = value;
  return project.id === expected.project.id && project.key === expected.project.key && project.name === expected.project.name
    && body.operationId === expected.body.operationId && body.outcome === expected.body.outcome
    && JSON.stringify(body.unresolved) === JSON.stringify(expected.body.unresolved)
    && JSON.stringify(body.nextActions) === JSON.stringify(expected.body.nextActions);
}
function validSnapshot(value: unknown): value is ImportSnapshot {
  return object(value) && text(value.revision, 128) && typeof value.partial === "boolean" && timestamp(value.generatedAt)
    && object(value.sources) && REVIEW_SOURCES.every(name => {
      const source = (value.sources as Record<string, unknown>)[name];
      return object(source) && timestamp(source.checkedAt) && typeof source.truncated === "boolean";
    })
    && Array.isArray(value.handoffs) && value.handoffs.length <= 4
    && value.handoffs.every(item => object(item) && text(item.outcome, 2000) && lines(item.unresolved) && lines(item.nextActions))
    && Array.isArray(value.decisions) && value.decisions.length <= 20
    && value.decisions.every(item => object(item) && text(item.title, 180) && text(item.decision, 8000))
    && Array.isArray(value.tasks) && value.tasks.length <= 20
    && value.tasks.every(item => object(item) && text(item.title, 180) && ["open", "in_progress", "blocked"].includes(String(item.status)));
}
export function validReview(value: unknown, bundle: ImportBundle): value is ImportReview {
  return object(value) && text(value.reviewToken, 4096) && Number.isSafeInteger(value.expiresAt) && Number(value.expiresAt) > Date.now()
    && Array.isArray(value.projects) && value.projects.length === bundle.checkpoints.length
    && value.projects.every((entry, index) => object(entry) && sameCheckpoint(entry, bundle.checkpoints[index]!) && validSnapshot(entry.snapshot));
}
export function checkedReceipts(value: unknown, bundle: ImportBundle): ImportReceipt[] | null {
  if (!Array.isArray(value) || value.length > bundle.checkpoints.length) return null;
  const seen = new Set<string>(); const receipts: ImportReceipt[] = [];
  for (const item of value) {
    if (!object(item) || typeof item.projectKey !== "string" || seen.has(item.projectKey)
      || typeof item.handoffId !== "string" || !TASK_ID.test(item.handoffId) || typeof item.idempotent !== "boolean"
      || !["context_readback", "operation_receipt", "receipt_only"].includes(String(item.verifiedBy))
      || (item.verifiedBy === "operation_receipt" && item.idempotent !== true)) return null;
    const checkpoint = bundle.checkpoints.find(entry => entry.project.key === item.projectKey);
    if (!checkpoint || item.operationId !== checkpoint.body.operationId) return null;
    seen.add(item.projectKey);
    receipts.push({ projectKey: item.projectKey, operationId: checkpoint.body.operationId, handoffId: item.handoffId,
      idempotent: item.idempotent, verifiedBy: item.verifiedBy as ImportReceipt["verifiedBy"] });
  }
  return receipts;
}
