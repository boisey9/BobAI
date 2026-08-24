import type { MemoryItem } from "../memory/types.js";

export const CONTEXT_SURFACES = [
  "bobai",
  "codex",
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
export const TASK_PRIORITIES = ["low", "normal", "high", "critical"] as const;

export type ContextSurface = (typeof CONTEXT_SURFACES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
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

export interface SharedContextStore {
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
  recordEvent(input: RecordProjectEventInput): Promise<ProjectEventItem>;
}

export type SharedContextMemory = Pick<
  MemoryItem,
  "id" | "scope" | "subject" | "content" | "source" | "updatedAt"
> & {
  projectKey: string | null;
};

export type SharedContextPackage = {
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
