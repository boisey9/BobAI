import { createHash } from "node:crypto";
import type { TaskItem } from "./types.js";

export class SharedContextOperationConflictError extends Error {
  constructor(
    readonly operationId: string,
    readonly existingEventType: string,
  ) {
    super(
      `Operation '${operationId}' was already used for '${existingEventType}' with a different request, or predates durable receipts.`,
    );
    this.name = "SharedContextOperationConflictError";
  }
}

export class SharedContextTaskVersionError extends Error {
  constructor(readonly current: TaskItem) {
    super(
      "Task changed since it was read. Reconcile with the current task and retry with a new operationId.",
    );
    this.name = "SharedContextTaskVersionError";
  }
}

export class SharedContextTaskAmbiguousError extends Error {
  constructor(readonly title: string) {
    super(`Multiple tasks match '${title}'. Select a stable task ID.`);
    this.name = "SharedContextTaskAmbiguousError";
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export type OperationInput = {
  ownerId: string;
  projectId: string;
  operationId: string;
  fingerprint: string;
  kind: string;
};
