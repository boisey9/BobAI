import { TASK_ID, taskPayload } from "../task-contract";
import type { TaskMutation, TaskView } from "../types";
import type { WorkbenchSampleProject } from "./sample-projects";

type Transport = (path: string, options: RequestInit) => Promise<Response>;
type Priority = TaskView["priority"];
type TaskStatus = TaskView["status"];
type TaskInput = Readonly<{ title: string; description: string | null; priority: Priority; dueAt: string | null }>;

export type WorkbenchTaskIntent = Readonly<{
  run: string;
  binding: string;
  project: WorkbenchSampleProject;
  operationId: string;
  input: TaskInput;
  body: string;
}>;

type TaskSnapshot = TaskInput & { id: string; version: number; status: TaskStatus };
export type WorkbenchTaskReceipt = { task: TaskSnapshot; idempotent: boolean };
type Refusal = "binding" | "conflict" | "invalid" | "denied";

function row(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function time(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function authority(value: unknown, project: WorkbenchSampleProject): value is Record<string, unknown> & { taskBinding: string; checkedAt: string } {
  return row(value) && value.authority === "bob-core" && row(value.project)
    && value.project.id === project.id && value.project.projectKey === project.projectKey
    && typeof value.taskBinding === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.taskBinding) && time(value.checkedAt);
}

function taskSnapshot(value: unknown, project: WorkbenchSampleProject): TaskSnapshot | null {
  if (!row(value) || typeof value.id !== "string" || !TASK_ID.test(value.id) || value.projectId !== project.id
      || typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1) return null;
  const { title, description, priority, dueAt, status } = value;
  if (typeof title !== "string" || !title.trim() || title.length > 180
      || (description !== null && (typeof description !== "string" || description.length > 2000))
      || (priority !== "low" && priority !== "normal" && priority !== "high" && priority !== "critical")
      || (dueAt !== null && !time(dueAt))
      || (status !== "open" && status !== "in_progress" && status !== "blocked" && status !== "done" && status !== "cancelled")) return null;
  return { id: value.id, version: value.version, title, description, priority, dueAt, status };
}

function matchesCreate(task: TaskSnapshot, input: TaskInput) {
  return task.status === "open" && task.title === input.title && task.description === input.description
    && task.priority === input.priority && task.dueAt === input.dueAt;
}

function endpoint(project: WorkbenchSampleProject, taskId?: string) {
  return "/api/review/workbench/tasks" + (taskId ? "/" + encodeURIComponent(taskId) : "") +
    "?" + new URLSearchParams({ project: project.projectKey });
}

export function createWorkbenchTaskClient(transport: Transport) {
  function request(path: string, run: string, binding?: string, body?: string) {
    return transport(path, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-bob-workbench-run": run,
        ...(binding ? { "x-bob-task-binding": binding } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
    });
  }

  return {
    async prepare(project: WorkbenchSampleProject, run: string, operationId: string, input: TaskInput): Promise<WorkbenchTaskIntent> {
      const canonical: TaskMutation = { operationId, ...input };
      if (!taskPayload(canonical, false)) throw new Error("Invalid task");
      const response = await request(endpoint(project), run);
      const value: unknown = await response.json();
      if (response.status !== 200 || !authority(value, project)) throw new Error("Could not verify the local preview connection");
      return Object.freeze({ project, run, operationId, input: Object.freeze({ ...input }),
        binding: value.taskBinding, body: JSON.stringify(canonical) });
    },
    async create(intent: WorkbenchTaskIntent): Promise<
      { kind: "receipt"; receipt: WorkbenchTaskReceipt } | { kind: "refused"; reason: Refusal } | { kind: "uncertain" }
    > {
      try {
        const response = await request(endpoint(intent.project), intent.run, intent.binding, intent.body);
        const value: unknown = await response.json();
        if (response.status !== 200) {
          const code = row(value) && row(value.error) ? value.error.code : null;
          if (response.status === 403 && code === "task_binding_changed") return { kind: "refused", reason: "binding" };
          if (response.status === 409 && code === "operation_conflict") return { kind: "refused", reason: "conflict" };
          if ([400, 413, 415].includes(response.status)) return { kind: "refused", reason: "invalid" };
          if ([401, 403, 404].includes(response.status)) return { kind: "refused", reason: "denied" };
          return { kind: "uncertain" };
        }
        const task = row(value) ? taskSnapshot(value.task, intent.project) : null;
        if (!row(value) || !task || task.version !== 1 || !matchesCreate(task, intent.input)
            || value.created !== true || value.changed !== true || typeof value.idempotent !== "boolean") return { kind: "uncertain" };
        return { kind: "receipt", receipt: { task, idempotent: value.idempotent } };
      } catch {
        return { kind: "uncertain" };
      }
    },
    async read(intent: WorkbenchTaskIntent, receipt: WorkbenchTaskReceipt) {
      try {
        const response = await request(endpoint(intent.project, receipt.task.id), intent.run, intent.binding);
        const value: unknown = await response.json();
        if (response.status === 403 && row(value) && row(value.error) && value.error.code === "task_binding_changed") {
          return { kind: "binding-ended" } as const;
        }
        if (response.status !== 200 || !authority(value, intent.project) || value.taskBinding !== intent.binding) return null;
        const task = taskSnapshot(value.task, intent.project);
        if (!task || task.id !== receipt.task.id || task.version < receipt.task.version
            || (task.version === receipt.task.version && !matchesCreate(task, intent.input))) return null;
        return { kind: "current", task, checkedAt: value.checkedAt } as const;
      } catch {
        return null;
      }
    },
  };
}
