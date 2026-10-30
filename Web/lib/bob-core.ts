import type {
  ActivityItem,
  ContextPackage,
  ControlCenterAdminData,
  CoreStatus,
  DashboardData,
  InterfaceCredentialSummary,
  TaskPage,
  TaskDetail,
  TaskMutation,
  TaskReceipt,
  TaskView,
} from "@/lib/types";
import { TASK_ID } from "@/lib/task-contract";
import { getOwnerTaskBinding, taskBindingMatches, getOwnerProjectBinding, projectBindingMatches } from "@/lib/session";
import { publicProjectReadiness, publicProjectReceipt, type ProjectCreation, type ProjectReadiness, type ProjectReceipt } from "@/lib/project-contract";
import { signOwnerCheckpointReview } from "@/lib/session";
import { CORE_ORIGIN, type CheckpointBody } from "@/lib/checkpoint-import-contract";

const REQUEST_TIMEOUT_MS = 15_000;

function checkpointConnection() {
  const current = configuration();
  if (process.env.VERCEL_ENV !== "production" || current.baseURL !== CORE_ORIGIN)
    throw new Error("Checkpoint import requires the pinned Production Core connection.");
  return current;
}
export async function getCheckpointImportContext(project: string): Promise<unknown> {
  checkpointConnection(); return getProjectContext(project);
}
export async function writeCheckpointImport(project: string, body: CheckpointBody & { expectedProjectId: string }): Promise<unknown> {
  checkpointConnection(); return requestCore(`/v1/handoffs?${new URLSearchParams({ project })}`, { method: "POST", body });
}
export async function signCheckpointImportReview(payload: string): Promise<string> {
  const { baseURL, token } = checkpointConnection();
  return signOwnerCheckpointReview({ payload, coreBaseURL: baseURL, coreCredential: token });
}

type CoreErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    current?: unknown;
  };
};

type CoreRequestOptions = {
  timeoutMs?: number;
  method?: "GET" | "POST" | "PATCH";
  body?: Record<string, unknown>;
};

export class CoreRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly current?: unknown,
  ) { super(message); }
}

function configuration() {
  const baseURL = (
    process.env.BOB_CORE_BASE_URL?.trim() || "https://bob-core.vercel.app"
  ).replace(/\/$/, "");
  const token = process.env.BOB_CORE_DEVICE_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "BOB_CORE_DEVICE_TOKEN is not configured for the web server.",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    !baseURL.startsWith("https://")
  ) {
    throw new Error("BOB_CORE_BASE_URL must use HTTPS in production.");
  }

  return { baseURL, token };
}

async function requestCore<T>(
  path: string,
  options: CoreRequestOptions = {},
): Promise<T> {
  const { baseURL, token } = configuration();
  const method = options.method ?? "GET";
  const response = await fetch(`${baseURL}${path}`, {
    method,
    redirect: "error",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": "Bob-Control-Center-Web/0.2",
      ...(process.env.VERCEL_ENV === "preview" &&
      process.env.BOB_CORE_PREVIEW_BYPASS_SECRET &&
      new URL(baseURL).hostname.endsWith(".vercel.app")
        ? { "x-vercel-protection-bypass": process.env.BOB_CORE_PREVIEW_BYPASS_SECRET }
        : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as CoreErrorBody;
    const message =
      body.error?.message || `Bob Core returned HTTP ${response.status}.`;
    const requestId = body.error?.requestId;
    throw new CoreRequestError(requestId ? `${message} Request: ${requestId}` : message,
      response.status, body.error?.code, requestId, body.error?.current);
  }

  return (await response.json()) as T;
}

// Do not forward the mutation API's internal owner ID or metadata to a browser.
export function publicTask(task: TaskView & { metadata?: Record<string, unknown> }): TaskView {
  if (!task || !TASK_ID.test(task.id) || !TASK_ID.test(task.projectId)
      || !Number.isSafeInteger(task.version) || task.version < 1
      || typeof task.title !== "string" || !task.title.trim() || task.title.length > 180
      || (task.description !== null && (typeof task.description !== "string" || task.description.length > 2_000))
      || !["open", "in_progress", "blocked", "done", "cancelled"].includes(task.status)
      || !["low", "normal", "high", "critical"].includes(task.priority) || typeof task.source !== "string"
      || !validTimestamp(task.createdAt) || !validTimestamp(task.updatedAt)
      || (task.dueAt !== null && !validTimestamp(task.dueAt))
      || (task.completedAt !== null && !validTimestamp(task.completedAt))) {
    throw new Error("Core returned invalid task details.");
  }
  const requiresApproval = task.requiresApproval === true || task.metadata?.kind === "decision_review";
  return {
    id: task.id, projectId: task.projectId, version: task.version, title: task.title,
    description: task.description, status: task.status, priority: task.priority,
    source: task.source, dueAt: task.dueAt, createdAt: task.createdAt,
    updatedAt: task.updatedAt, completedAt: task.completedAt,
    editable: !requiresApproval && task.status !== "cancelled" && task.editable !== false,
    requiresApproval,
  };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function publicTaskProject(project: TaskPage["project"], key: string) {
  if (!project || project.projectKey !== key || !TASK_ID.test(project.id) || typeof project.name !== "string") {
    throw new Error("Core returned an unexpected task workspace.");
  }
  return { id: project.id, projectKey: project.projectKey, name: project.name };
}

async function bindTaskProject(project: TaskPage["project"]) {
  const { baseURL, token } = configuration();
  return getOwnerTaskBinding({ projectKey: project.projectKey, projectId: project.id, coreBaseURL: baseURL, coreCredential: token });
}

export async function getTasks(project: string, cursor?: string): Promise<TaskPage> {
  const query = new URLSearchParams({ project, limit: "30", ...(cursor ? { cursor } : {}) });
  const result = await requestCore<TaskPage>(`/v1/tasks?${query}`);
  const identity = publicTaskProject(result.project, project);
  if (result.authority !== "bob-core" || !Array.isArray(result.tasks) || !validTimestamp(result.checkedAt)
      || (result.nextCursor !== null && !TASK_ID.test(result.nextCursor))
      || result.tasks.some(task => task.projectId !== result.project.id)) {
    throw new Error("Core returned an unexpected task workspace.");
  }
  return { authority: result.authority, project: identity, tasks: result.tasks.map(publicTask),
    nextCursor: result.nextCursor, checkedAt: result.checkedAt, taskBinding: await bindTaskProject(identity) };
}

export async function getTask(project: string, id: string): Promise<TaskDetail> {
  const result = await requestCore<TaskDetail>(`/v1/tasks/${encodeURIComponent(id)}?${new URLSearchParams({ project })}`);
  const identity = publicTaskProject(result.project, project);
  if (result.authority !== "bob-core" || !validTimestamp(result.checkedAt)
      || result.task.id !== id || result.task.projectId !== result.project.id) {
    throw new Error("Core returned an unexpected task workspace.");
  }
  return { authority: result.authority, project: identity, task: publicTask(result.task), checkedAt: result.checkedAt, taskBinding: await bindTaskProject(identity) };
}

export async function saveTask(project: string, input: TaskMutation, binding: string, id?: string): Promise<TaskReceipt> {
  // Bind the response to Core's canonical project ID before issuing a write.
  const page = await getTasks(project);
  const identity = page.project;
  if (!taskBindingMatches(binding, page.taskBinding)) {
    throw new CoreRequestError("Task connection changed. No mutation was sent.", 403, "task_binding_changed");
  }
  let result: TaskReceipt;
  try {
    result = await requestCore<TaskReceipt>(`/v1/tasks${id ? `/${encodeURIComponent(id)}` : ""}?${new URLSearchParams({ project })}`,
      { method: id ? "PATCH" : "POST", body: { ...input, expectedProjectId: identity.id } });
  } catch (error) {
    if (error instanceof CoreRequestError && error.code === "project_binding_changed") {
      throw new CoreRequestError("Task connection changed. Core rejected the mutation.", 403, "task_binding_changed");
    }
    if (error instanceof CoreRequestError && error.code === "task_version_conflict") {
      const current = publicTask(error.current as TaskView);
      if (!id || current.id !== id || current.projectId !== identity.id) throw new Error("Core returned an unexpected conflict.");
    }
    throw error;
  }
  const task = publicTask(result.task);
  if (typeof result.created !== "boolean" || typeof result.changed !== "boolean" || typeof result.idempotent !== "boolean"
      || task.projectId !== identity.id || (id && task.id !== id)
      || (id ? result.created || task.version !== input.expectedVersion! + (result.changed ? 1 : 0)
        : !result.created || !result.changed || task.version !== 1 || task.status !== "open")
      || (input.title !== undefined && task.title !== input.title.trim())
      || (input.newTitle !== undefined && task.title !== input.newTitle.trim())
      || (input.description !== undefined && task.description !== (input.description?.trim() || null))
      || (input.status !== undefined && task.status !== input.status)
      || (input.priority !== undefined && task.priority !== input.priority)
      || (input.dueAt !== undefined && task.dueAt !== (input.dueAt === null ? null : new Date(input.dueAt).toISOString()))) {
    throw new Error("Core returned an unexpected task receipt.");
  }
  return { task, created: result.created, changed: result.changed, idempotent: result.idempotent };
}

export async function getCoreStatus(): Promise<CoreStatus> {
  return requestCore<CoreStatus>("/v1/status");
}

export async function getProjectCreationReadiness(): Promise<ProjectReadiness> {
  const result = publicProjectReadiness(await requestCore<unknown>("/v1/control-center/projects/new"));
  if (!result) throw new Error("Core returned an unexpected project anchor.");
  const { baseURL, token } = configuration();
  return { ...result, projectBinding: await getOwnerProjectBinding({ anchorId: result.anchor.id, coreBaseURL: baseURL, coreCredential: token }) };
}

export async function createProject(input: ProjectCreation, binding: string): Promise<ProjectReceipt> {
  // Re-read the trusted anchor immediately before the write. Core also checks
  // its identity inside the transaction, so replacing it cannot redirect a retry.
  const ready = await getProjectCreationReadiness();
  if (input.expectedAnchorId !== ready.anchor.id || !projectBindingMatches(binding, ready.projectBinding)) {
    throw new CoreRequestError("Project connection changed. No mutation was sent.", 403, "project_binding_changed");
  }
  const result = publicProjectReceipt(await requestCore<unknown>("/v1/control-center/projects", {
    method: "POST", body: { ...input, expectedAnchorId: ready.anchor.id },
  }), input);
  if (!result) throw new Error("Core returned an unexpected project receipt.");
  return result;
}

export async function chatWithBob(input: {
  projectKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const context = await getProjectContext(input.projectKey);
  if (!context.revision || context.project.projectKey !== input.projectKey) {
    throw new Error(
      "This Core deployment needs the shared-context update before workspace chat can be used.",
    );
  }
  return requestCore<{
    message: { role: "assistant"; content: string };
    context?: {
      revision: string;
      partial: boolean;
      sources: Record<string, { checkedAt: string }>;
    };
  }>("/v1/chat", { method: "POST", body: input, timeoutMs: 50_000 });
}

export async function getProjectContext(
  projectKey: string,
): Promise<ContextPackage> {
  const query = new URLSearchParams({
    project: projectKey,
    surface: "web",
  });
  const response = await requestCore<{ context: ContextPackage }>(
    `/v1/context?${query.toString()}`,
  );
  const context = response.context;
  if (!context || context.authority?.source !== "bob-core"
      || context.request?.projectKey !== projectKey || context.request?.surface !== "web"
      || context.project?.projectKey !== projectKey || !TASK_ID.test(context.project.id)
      || context.project.status !== "active" || !validTimestamp(context.generatedAt)
      || !Array.isArray(context.decisions) || !Array.isArray(context.tasks)
      || !Array.isArray(context.memories) || !Array.isArray(context.recentEvents)) {
    throw new Error("Core returned an unexpected project context.");
  }
  return context;
}

export async function getActivity(
  projectKey: string,
  limit = 50,
): Promise<ActivityItem[]> {
  const query = new URLSearchParams({
    project: projectKey,
    limit: String(Math.max(1, Math.min(limit, 100))),
  });
  const response = await requestCore<{ activity: ActivityItem[] }>(
    `/v1/activity?${query.toString()}`,
  );
  if (!Array.isArray(response.activity) || response.activity.some(event => event.projectKey !== projectKey)) {
    throw new Error("Core returned unexpected project activity.");
  }
  return response.activity;
}

export async function getControlCenterAdmin(
  projectKey: string,
): Promise<ControlCenterAdminData> {
  const query = new URLSearchParams({ project: projectKey });
  const result = await requestCore<ControlCenterAdminData>(
    `/v1/control-center?${query.toString()}`,
  );
  if (result.selectedProject?.projectKey !== projectKey) throw new Error("Core returned an unexpected control workspace.");
  return result;
}

export async function resolveDecisionApproval(input: {
  taskId: string;
  project: string;
  action: "approve" | "reject";
  note?: string;
}): Promise<{ resolution: string; decisionTitle: string }> {
  return requestCore<{ resolution: string; decisionTitle: string }>(
    `/v1/control-center/approvals/${encodeURIComponent(input.taskId)}`,
    {
      method: "POST",
      body: {
        project: input.project,
        action: input.action,
        ...(input.note ? { note: input.note } : {}),
      },
    },
  );
}

export async function setInterfaceCredentialEnabled(input: {
  credentialId: string;
  project: string;
  enabled: boolean;
}): Promise<{ credential: InterfaceCredentialSummary }> {
  return requestCore<{ credential: InterfaceCredentialSummary }>(
    `/v1/control-center/credentials/${encodeURIComponent(input.credentialId)}`,
    {
      method: "POST",
      body: {
        project: input.project,
        enabled: input.enabled,
      },
    },
  );
}

function settledValue<T>(
  result: PromiseSettledResult<T>,
  label: string,
  errors: string[],
): T | null {
  if (result.status === "fulfilled") return result.value;
  errors.push(`${label}: unavailable. Refresh to retry.`);
  return null;
}

export async function getDashboardData(
  projectKey: string,
): Promise<DashboardData> {
  const [statusResult, contextResult, activityResult, controlCenterResult] =
    await Promise.allSettled([
      getCoreStatus(),
      getProjectContext(projectKey),
      getActivity(projectKey, 80),
      getControlCenterAdmin(projectKey),
    ]);
  const errors: string[] = [];

  return {
    status: settledValue(statusResult, "Core status", errors),
    context: settledValue(contextResult, "Project context", errors),
    activity: settledValue(activityResult, "Activity", errors) ?? [],
    controlCenter: settledValue(
      controlCenterResult,
      "Control Center administration",
      errors,
    ),
    errors,
  };
}
