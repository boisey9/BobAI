import { randomBytes, randomUUID } from "node:crypto";

import { TASK_ID, taskPayload } from "../task-contract";
import type { TaskDetail, TaskPage, TaskReceipt, TaskView } from "../types";
import { workbenchTaskReviewEnabled } from "../ui-review-enabled";
import { workbenchSampleProjects } from "./sample-projects";

const runLimit = 32;
const taskLimit = 30;
const runLifetimeMs = 30 * 60 * 1_000;
const bodyLimit = 16_384;

type ProjectScope = {
  binding: string;
  tasks: Map<string, TaskView>;
  receipts: Map<string, { fingerprint: string; task: TaskView }>;
};
type ReviewRun = { host: string; expiresAt: number; projects: Map<string, ProjectScope> };

// The two Next handlers share disposable state within this dev-server process.
// A restart deliberately drops it, and capacity pressure never evicts a live receipt.
const processState = globalThis as typeof globalThis & {
  bobWorkbenchTaskReviewRuns?: Map<string, ReviewRun>;
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function error(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

function bindingChanged() {
  return error(403, "task_binding_changed", "The sample task connection changed or expired. This request was refused.");
}

async function readCreateInput(request: Request) {
  if (Number(request.headers.get("content-length")) > bodyLimit) return "too-large";
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > bodyLimit) {
        await reader.cancel().catch(() => undefined);
        return "too-large";
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return taskPayload(JSON.parse(body + decoder.decode()), false);
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** Guarded loopback sample task contract. There is no owner, hosted Core, or database client here. */
export async function workbenchTaskReviewAPI(request: Request, taskId?: string) {
  const host = request.headers.get("host");
  if (!host || !/^(?:127\.0\.0\.1|localhost)(?::[1-9][0-9]{0,4})?$/.test(host) ||
      !workbenchTaskReviewEnabled(host)) return error(404, "not_found", "Not found.");

  const creating = request.method === "POST" && taskId === undefined;
  if (!creating && request.method !== "GET") return error(405, "method_not_allowed", "Method not allowed.");
  if (creating && request.headers.get("origin") !== `http://${host}`) {
    return error(403, "invalid_origin", "The sample task request must come from this preview.");
  }

  const params = new URL(request.url).searchParams;
  if (params.getAll("project").length !== 1 || [...params.keys()].some(name => name !== "project")) {
    return error(400, "invalid_request", "Choose one sample project.");
  }
  const sample = workbenchSampleProjects.find(project => project.projectKey === params.get("project"));
  if (!sample) return error(404, "not_found", "Sample project not found.");
  const project = { id: sample.id, projectKey: sample.projectKey, name: sample.name };
  if (taskId !== undefined && !TASK_ID.test(taskId)) {
    return error(400, "invalid_request", "Invalid sample task identifier.");
  }
  const requestedRun = request.headers.get("x-bob-workbench-run");
  if (!requestedRun || !TASK_ID.test(requestedRun)) {
    return error(400, "invalid_request", "Invalid sample task run.");
  }
  const runId = requestedRun.toLowerCase();
  const requestedBinding = request.headers.get("x-bob-task-binding");
  const runs = processState.bobWorkbenchTaskReviewRuns ??= new Map<string, ReviewRun>();
  const now = Date.now();
  for (const [id, existing] of runs) {
    if (existing.expiresAt <= now) runs.delete(id);
  }

  let run = runs.get(runId);
  if (run && run.host !== host) return bindingChanged();
  let scope = run?.projects.get(project.id);
  const opening = !creating && taskId === undefined;
  const requiresBinding = !opening || requestedBinding !== null || (scope?.receipts.size ?? 0) > 0;
  if (requiresBinding && (!scope || requestedBinding !== scope.binding)) {
    return bindingChanged();
  }

  if (opening) {
    if (!run) {
      if (runs.size >= runLimit) return error(429, "preview_capacity", "The sample task preview is at capacity.");
      run = { host, expiresAt: now + runLifetimeMs, projects: new Map() };
      runs.set(runId, run);
    }
    if (!scope) {
      scope = { binding: randomBytes(32).toString("base64url"), tasks: new Map(), receipts: new Map() };
      run.projects.set(project.id, scope);
    }
    const page: TaskPage = {
      authority: "bob-core", project, taskBinding: scope.binding, checkedAt: new Date(now).toISOString(),
      tasks: [...scope.tasks.values()].reverse(), nextCursor: null,
    };
    return json(page);
  }

  if (!scope || !run) return bindingChanged();
  if (taskId !== undefined) {
    const task = scope.tasks.get(taskId);
    if (!task) return error(404, "not_found", "Sample task not found.");
    const detail: TaskDetail = {
      authority: "bob-core", project, taskBinding: scope.binding, checkedAt: new Date(now).toISOString(), task,
    };
    return json(detail);
  }

  const input = await readCreateInput(request);
  // The streamed body yields control. Recheck the run before inspecting or changing state.
  if (runs.get(runId) !== run || run.expiresAt <= Date.now()) return bindingChanged();
  if (input === "too-large") return error(413, "invalid_request", "The sample task request is too large.");
  if (!input?.title) return error(400, "invalid_request", "Invalid sample task details.");

  // Compare the same fields regardless of JSON key order, including omissions vs. explicit nulls.
  const fingerprint = JSON.stringify(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
  const previous = scope.receipts.get(input.operationId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      return error(409, "operation_conflict", "This sample operation identifier is already bound to different details.");
    }
    const replay: TaskReceipt = { task: previous.task, created: true, changed: true, idempotent: true };
    return json(replay);
  }
  if (scope.receipts.size >= taskLimit) {
    return error(429, "preview_capacity", "This sample project has reached its preview task limit.");
  }

  const checkedAt = new Date().toISOString();
  const task: TaskView = {
    id: randomUUID(), projectId: project.id, title: input.title.trim(), description: input.description?.trim() || null,
    priority: input.priority ?? "normal", dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
    status: "open", version: 1, source: "sample", editable: false, requiresApproval: false,
    createdAt: checkedAt, updatedAt: checkedAt, completedAt: null,
  };
  scope.tasks.set(task.id, task);
  scope.receipts.set(input.operationId, { task, fingerprint });
  const receipt: TaskReceipt = { task, created: true, changed: true, idempotent: false };
  return json(receipt);
}
