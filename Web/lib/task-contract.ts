import type { TaskMutation } from "@/lib/types";

export const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function taskPayload(candidate: unknown, update: boolean): TaskMutation | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const value = candidate as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = update
    ? ["operationId", "expectedVersion", "newTitle", "description", "status", "priority", "dueAt"]
    : ["operationId", "title", "description", "priority", "dueAt"];
  if (Object.keys(value).some(key => !allowed.includes(key))) return null;
  if (typeof value.operationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(value.operationId)) return null;
  if (update && (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1)) return null;
  const title = update ? value.newTitle : value.title;
  if ((!update || title !== undefined) && (typeof title !== "string" || !title.trim() || title.trim().length > 180)) return null;
  if (value.description !== undefined && value.description !== null
      && (typeof value.description !== "string" || value.description.length > 2_000)) return null;
  if (value.status !== undefined && (typeof value.status !== "string" || !["open", "in_progress", "blocked", "done"].includes(value.status))) return null;
  if (value.priority !== undefined && (typeof value.priority !== "string" || !["low", "normal", "high", "critical"].includes(value.priority))) return null;
  if (value.dueAt !== undefined && value.dueAt !== null && (typeof value.dueAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.dueAt)
      || !Number.isFinite(Date.parse(value.dueAt)))) return null;
  return value as TaskMutation;
}
