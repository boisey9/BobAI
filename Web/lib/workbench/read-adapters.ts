import { TASK_ID } from "../task-contract";
import type { ProjectItem, TaskView } from "../types";

const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;
export const TASK_PAGE_SIZE = 10;
const sourceNames = ["decisions", "tasks", "events", "memories", "handoffs"] as const;

type Row = Record<string, unknown>;
export type WorkbenchGrant = { projectKey: string; id: string; repository: string | null };
type Transport = { get(path: string): Promise<Response> };
type Project = Pick<ProjectItem, "projectKey" | "name" | "repository" | "updatedAt">;
type Task = Pick<TaskView, "id" | "title" | "status" | "priority" | "version" | "dueAt" | "updatedAt" | "requiresApproval">;
type TaskPage = { tasks: Task[]; nextCursor: string | null; checkedAt: string };
type ContextSource = {
  name: typeof sourceNames[number];
  status: "available" | "unavailable" | "unknown";
  checkedAt: string | null;
  latestChangeAt: string | null;
  truncated: boolean | null;
};
type ContextSummary = {
  revision: string;
  partial: boolean;
  generatedAt: string;
  sources: ContextSource[];
};
type Section<T> = { status: "available"; value: T } | { status: "unavailable" };
type Failure = "invalid-request" | "denied" | "unavailable";

export type WorkbenchReadResult = { status: Failure } | {
  status: "ready";
  projects: Project[];
  project: Project & { id: string };
  directoryCheckedAt: string;
  tasks: Section<TaskPage>;
  context: Section<ContextSummary>;
};

class ReadFailure extends Error {
  constructor(readonly status: Failure) {
    super(status);
  }
}

function requireShape(condition: unknown): asserts condition {
  if (!condition) throw new ReadFailure("unavailable");
}

function requireScope(condition: unknown): asserts condition {
  if (!condition) throw new ReadFailure("denied");
}

function row(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && TASK_ID.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function label(value: unknown, limit: number): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= limit;
}

function projectSummary(value: Row, grant: WorkbenchGrant, requireDirectoryId: boolean): Project {
  requireScope(value.projectKey === grant.projectKey && value.repository === grant.repository);
  if (requireDirectoryId) requireScope(value.id === grant.id);
  requireScope(value.status === "active");
  requireShape(label(value.name, 200) && timestamp(value.updatedAt));
  return { projectKey: grant.projectKey, name: value.name, repository: grant.repository, updatedAt: value.updatedAt };
}

function assertWorkspace(value: unknown, grant: WorkbenchGrant) {
  requireShape(row(value));
  requireScope(value.projectKey === grant.projectKey && value.id === grant.id);
}

function taskPage(value: unknown, grant: WorkbenchGrant, cursor: string | undefined): TaskPage {
  requireShape(row(value) && value.authority === "bob-core");
  assertWorkspace(value.project, grant);
  const { tasks, nextCursor, checkedAt } = value;
  requireShape(Array.isArray(tasks) && tasks.length <= TASK_PAGE_SIZE && timestamp(checkedAt));
  const seen = new Set<string>();
  const projected = tasks.map((task: unknown): Task => {
    requireShape(row(task));
    requireScope(task.projectId === grant.id);
    requireShape(uuid(task.id) && task.id !== cursor && !seen.has(task.id) &&
      label(task.title, 180) && typeof task.version === "number" && Number.isSafeInteger(task.version) && task.version > 0 &&
      (task.dueAt === null || timestamp(task.dueAt)) && timestamp(task.updatedAt) && typeof task.requiresApproval === "boolean");
    const { status, priority } = task;
    requireShape(status === "open" || status === "in_progress" || status === "blocked" || status === "done" || status === "cancelled");
    requireShape(priority === "low" || priority === "normal" || priority === "high" || priority === "critical");
    seen.add(task.id);
    return {
      id: task.id, title: task.title, status, priority, version: task.version,
      dueAt: task.dueAt, updatedAt: task.updatedAt, requiresApproval: task.requiresApproval,
    };
  });
  requireShape(nextCursor === null ||
    (uuid(nextCursor) && projected.length === TASK_PAGE_SIZE && nextCursor === projected.at(-1)?.id));
  return { tasks: projected, nextCursor, checkedAt };
}

function contextSummary(response: unknown, grant: WorkbenchGrant): ContextSummary {
  requireShape(row(response) && row(response.context));
  const value = response.context;
  assertWorkspace(value.project, grant);
  requireScope(row(value.project) && value.project.status === "active" && value.project.repository === grant.repository);
  requireScope(row(value.request) && value.request.projectKey === grant.projectKey && value.request.surface === "web");
  requireShape(row(value.authority) && value.authority.source === "bob-core" && value.authority.version === "0.2");
  const { revision, partial, generatedAt, sources } = value;
  requireShape(typeof revision === "string" && /^[0-9a-f]{64}$/.test(revision) &&
    typeof partial === "boolean" && timestamp(generatedAt) && row(sources));
  const projected = sourceNames.map((name): ContextSource => {
    const source = sources[name];
    if (!(row(source) && (source.status === "available" || source.status === "unavailable") &&
      timestamp(source.checkedAt) && (source.latestChangeAt === null || timestamp(source.latestChangeAt)) &&
      typeof source.truncated === "boolean")) {
      return { name, status: "unknown", checkedAt: null, latestChangeAt: null, truncated: null };
    }
    return {
      name, status: source.status, checkedAt: source.checkedAt,
      latestChangeAt: source.latestChangeAt, truncated: source.truncated,
    };
  });
  return { revision, generatedAt, sources: projected,
    partial: partial || projected.some(source => source.status !== "available" || source.truncated === true) };
}

function failure(error: unknown): Failure {
  return error instanceof ReadFailure ? error.status : "unavailable";
}

function section<T>(result: PromiseSettledResult<T>): Section<T> {
  if (result.status === "fulfilled") return { status: "available", value: result.value };
  const status = failure(result.reason);
  if (status !== "unavailable") throw new ReadFailure(status);
  return { status: "unavailable" };
}

/** Reads the existing Core envelopes using an explicitly supplied GET-only port and trusted grants. */
export function createWorkbenchReader(
  transport: Transport,
  grants: readonly WorkbenchGrant[],
  mode: "fixture" | "owner" = "fixture",
) {
  const owner = mode === "owner";
  const contextPath = owner ? "/v1/workbench/context" : "/v1/context";
  const taskPath = owner ? "/v1/workbench/tasks" : "/v1/tasks";
  const allowed = new Map<string, WorkbenchGrant>();
  const ids = new Set<string>();
  for (const grant of grants) {
    if (!PROJECT_KEY.test(grant.projectKey) || !uuid(grant.id) ||
        allowed.has(grant.projectKey) || ids.has(grant.id.toLowerCase())) {
      throw new Error("Invalid Workbench grants.");
    }
    allowed.set(grant.projectKey, { ...grant });
    ids.add(grant.id.toLowerCase());
  }

  async function get(path: string): Promise<unknown> {
    const response = await transport.get(path);
    if (response.status === 400) throw new ReadFailure("invalid-request");
    if ([401, 403, 404].includes(response.status)) throw new ReadFailure("denied");
    if (response.status !== 200 || response.redirected) throw new ReadFailure("unavailable");
    return response.json();
  }

  return {
    async read(projectKey: string, cursor?: string): Promise<WorkbenchReadResult> {
      if (!PROJECT_KEY.test(projectKey) || (cursor !== undefined && !uuid(cursor)))
        return { status: "invalid-request" };
      const grant = allowed.get(projectKey);
      if (!grant) return { status: "denied" };

      try {
        const query = new URLSearchParams({ project: projectKey, ...(owner ? { view: "workbench" } : {}) });
        const directory = await get("/v1/control-center?" + query);
        requireShape(row(directory) && row(directory.selectedProject) &&
          Array.isArray(directory.projects) && timestamp(directory.generatedAt));
        const selected = projectSummary(directory.selectedProject, grant, owner);
        const projects: Project[] = [];
        const seen = new Set<string>();
        for (const candidate of directory.projects) {
          if (!row(candidate) || typeof candidate.projectKey !== "string") continue;
          const binding = allowed.get(candidate.projectKey);
          if (!binding) continue;
          requireScope(!seen.has(binding.projectKey));
          seen.add(binding.projectKey);
          if (candidate.status === "archived") continue;
          projects.push(projectSummary(candidate, binding, owner));
        }
        const listed = projects.find(project => project.projectKey === projectKey);
        requireScope(listed?.name === selected.name && listed?.updatedAt === selected.updatedAt);

        const taskQuery = new URLSearchParams({ project: projectKey, limit: String(TASK_PAGE_SIZE), ...(cursor ? { cursor } : {}) });
        const contextQuery = new URLSearchParams({ project: projectKey, surface: "web" });
        const [tasks, context] = await Promise.allSettled([
          get(taskPath + "?" + taskQuery).then(value => taskPage(value, grant, cursor)),
          get(contextPath + "?" + contextQuery).then(value => contextSummary(value, grant)),
        ]);
        // A refusal or identity mismatch invalidates the whole view, even if the sibling read succeeded.
        return {
          status: "ready", projects, project: { ...selected, id: grant.id }, directoryCheckedAt: directory.generatedAt,
          tasks: section(tasks), context: section(context),
        };
      } catch (error) {
        return { status: failure(error) };
      }
    },
  };
}
