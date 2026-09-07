import type { MemoryItem } from "../memory/types.js";
import type { OperationInput } from "./operations.js";

export const CONTEXT_SURFACES = [
  "bobai",
  "codex",
  "copilot",
  "microsoft-copilot",
  "chatgpt",
  "web",
  "other",
] as const;
export const PROJECT_STATUSES = ["active", "archived"] as const;
export const DECISION_STATUSES = ["active", "superseded", "revoked"] as const;
export const TASK_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export const SYNC_TASK_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "done",
] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "critical"] as const;

export type ContextSurface = (typeof CONTEXT_SURFACES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type SyncTaskStatus = (typeof SYNC_TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type ProjectItem = {
  id: string;
  ownerId: string;
  projectKey: string;
  name: string;
  description: string | null;
  repository: string | null;
  status: ProjectStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type DecisionItem = {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  decision: string;
  reason: string | null;
  status: DecisionStatus;
  supersedesDecisionId: string | null;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TaskItem = {
  version: number;
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: string;
  dueAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ProjectEventItem = {
  id: string;
  ownerId: string;
  projectId: string | null;
  eventType: string;
  summary: string;
  source: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type ActivityItem = {
  id: string;
  projectKey: string | null;
  projectName: string | null;
  eventType: string;
  summary: string;
  source: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type RecordProjectEventInput = {
  ownerId: string;
  projectId: string | null;
  eventType: string;
  summary: string;
  source: string;
  details?: Record<string, unknown>;
};

export type CreateProjectTaskInput = {
  dueAt?: string | null;
  ownerId: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  source: string;
  metadata?: Record<string, unknown>;
};

export type UpdateProjectTaskInput = {
  expectedVersion?: number;
  title?: string;
  dueAt?: string | null;
  ownerId: string;
  projectId: string;
  taskId: string;
  description?: string | null;
  status?: SyncTaskStatus;
  priority?: TaskPriority;
  metadata?: Record<string, unknown>;
};

export interface SharedContextStore {
  listHandoffs(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<HandoffItem[]>;
  createHandoff(
    input: Omit<HandoffItem, "id" | "createdAt">,
  ): Promise<HandoffItem>;
  runOperation<T extends { idempotent: boolean }>(
    input: OperationInput,
    action: (store: SharedContextStore) => Promise<T>,
  ): Promise<T>;
  findTaskById(
    ownerId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskItem | null>;
  getProject(ownerId: string, projectKey: string): Promise<ProjectItem | null>;
  listActiveDecisions(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<DecisionItem[]>;
  listActiveTasks(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<TaskItem[]>;
  listRecentEvents(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<ProjectEventItem[]>;
  listRecentActivity(
    ownerId: string,
    limit: number,
    projectId?: string,
  ): Promise<ActivityItem[]>;
  findTaskByTitle(
    ownerId: string,
    projectId: string,
    title: string,
  ): Promise<TaskItem | null>;
  findEventByOperationId(
    ownerId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectEventItem | null>;
  createTask(input: CreateProjectTaskInput): Promise<TaskItem>;
  updateTask(input: UpdateProjectTaskInput): Promise<TaskItem | null>;
  recordEvent(input: RecordProjectEventInput): Promise<ProjectEventItem>;
}

export type SharedContextMemory = Pick<
  MemoryItem,
  "id" | "scope" | "subject" | "content" | "source" | "updatedAt"
> & {
  projectKey: string | null;
};

export type HandoffItem = {
  id: string;
  ownerId: string;
  projectId: string;
  outcome: string;
  unresolved: string[];
  nextActions: string[];
  source: string;
  createdAt: string;
};

export type ContextSource = {
  status: "available" | "unavailable";
  checkedAt: string;
  latestChangeAt: string | null;
  truncated: boolean;
};

export type SharedContextPackage = {
  revision: string;
  partial: boolean;
  sources: Record<
    "decisions" | "tasks" | "events" | "memories" | "handoffs",
    ContextSource
  >;
  handoffs: HandoffItem[];
  authority: {
    source: "bob-core";
    version: "0.2";
    rule: string;
  };
  request: {
    projectKey: string;
    task: string | null;
    surface: ContextSurface;
  };
  project: ProjectItem;
  decisions: DecisionItem[];
  tasks: TaskItem[];
  recentEvents: ProjectEventItem[];
  memories: SharedContextMemory[];
  generatedAt: string;
};
