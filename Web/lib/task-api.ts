import { NextRequest, NextResponse } from "next/server";
import { CoreRequestError, publicTask } from "@/lib/bob-core";
import { hasOwnerSession, validateOwnerCsrfToken } from "@/lib/session";
import type { TaskMutation, TaskView } from "@/lib/types";

import { taskPayload } from "@/lib/task-contract";
export { TASK_ID } from "@/lib/task-contract";
const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;

export function taskJSON(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "cache-control": "no-store" } });
}

export async function taskAccess(request: NextRequest, write = false) {
  try {
    if (!(await hasOwnerSession())) return taskJSON({ error: { code: "owner_session_required", message: "Sign in to Bob before continuing." } }, 401);
    if (write && !(await validateOwnerCsrfToken(request.headers.get("x-bob-csrf") ?? undefined))) {
      return taskJSON({ error: { code: "invalid_csrf", message: "Your session changed. Reload before trying again." } }, 403);
    }
    return null;
  } catch {
    return taskJSON({ error: { code: "owner_session_unavailable", message: "Owner access could not be checked. Retry after signing in." } }, 503);
  }
}

export function taskProject(request: NextRequest): string | null {
  const projects = request.nextUrl.searchParams.getAll("project");
  const project = projects.length === 1 ? projects[0] : undefined;
  return project && PROJECT_KEY.test(project) ? project : null;
}

export async function taskInput(request: NextRequest, update: boolean): Promise<TaskMutation | null> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") return null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16_384) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return taskPayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)), update);
  } catch { return null; }
}

export function taskFailure(error: unknown, write = true) {
  if (error instanceof CoreRequestError) {
    const status = [400, 401, 403, 404, 409, 429].includes(error.status) ? error.status : 503;
    let current: TaskView | undefined;
    if (error.code === "task_version_conflict" && error.current && typeof error.current === "object") {
      try { current = publicTask(error.current as TaskView); } catch { return taskFailure(new Error("invalid_conflict"), write); }
    }
    // Error text from a dependency can contain diagnostics; use fixed messages.
    const message = error.code === "task_binding_changed"
      ? "The task connection changed. This attempt was rejected. Reconcile any pending request before continuing."
      : error.code === "task_version_conflict"
      ? "This task changed on another interface. Review the current version before editing again."
      : error.code === "task_requires_approval"
        ? "This item must be resolved in Approvals."
        : status === 404 ? "This task is unavailable in this workspace."
          : status === 403 ? (write ? "This connection cannot change that task." : "This connection cannot read this task workspace.")
            : status === 401 ? "The Core connection is unavailable."
              : status === 400 ? "Core could not accept those task details."
                : write ? "Core has not confirmed this request. Retry the same request to recover its receipt." : "Tasks are unavailable. Refresh to try again.";
    const code = ["task_binding_changed", "task_version_conflict", "task_requires_approval", "operation_conflict", "invalid_request", "not_found", "synchronization_unavailable", "credential_rate_limited", "rate_limit_unavailable", "interface_scope_forbidden"].includes(error.code ?? "") ? error.code : "core_unavailable";
    const requestId = error.requestId && /^[A-Za-z0-9_-]{1,120}$/.test(error.requestId) ? error.requestId : undefined;
    return taskJSON({ error: { code, message,
      ...(current ? { current } : {}), ...(requestId ? { requestId } : {}) } }, status);
  }
  return taskJSON({ error: { code: "core_unavailable", message: write ? "Core has not confirmed this request. Retry the same request to recover its receipt." : "Tasks are unavailable. Refresh to try again." } }, 503);
}
