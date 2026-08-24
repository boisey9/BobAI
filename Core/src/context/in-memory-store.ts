import type {
  ActivityItem,
  CreateProjectTaskInput,
  DecisionItem,
  ProjectEventItem,
  ProjectItem,
  RecordProjectEventInput,
  SharedContextStore,
  TaskItem,
  UpdateProjectTaskInput,
} from "./types.js";

type SeedData = {
  projects?: ProjectItem[];
  decisions?: DecisionItem[];
  tasks?: TaskItem[];
  events?: ProjectEventItem[];
};

export class InMemorySharedContextStore implements SharedContextStore {
  private readonly projects: ProjectItem[];
  private readonly decisions: DecisionItem[];
  private readonly tasks: TaskItem[];
  private readonly events: ProjectEventItem[];

  constructor(seed: SeedData = {}) {
    this.projects = [...(seed.projects ?? [])];
    this.decisions = [...(seed.decisions ?? [])];
    this.tasks = [...(seed.tasks ?? [])];
    this.events = [...(seed.events ?? [])];
  }

  async getProject(ownerId: string, projectKey: string): Promise<ProjectItem | null> {
    const normalizedKey = projectKey.trim().toLowerCase();

    return (
      this.projects.find(
        (project) =>
          project.ownerId === ownerId &&
          project.projectKey.toLowerCase() === normalizedKey,
      ) ?? null
    );
  }

  async listActiveDecisions(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<DecisionItem[]> {
    return this.decisions
      .filter(
        (decision) =>
          decision.ownerId === ownerId &&
          decision.projectId === projectId &&
          decision.status === "active",
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async listActiveTasks(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<TaskItem[]> {
    const priorityRank = { critical: 0, high: 1, normal: 2, low: 3 } as const;

    return this.tasks
      .filter(
        (task) =>
          task.ownerId === ownerId &&
          task.projectId === projectId &&
          ["open", "in_progress", "blocked"].includes(task.status),
      )
      .sort(
        (left, right) =>
          priorityRank[left.priority] - priorityRank[right.priority] ||
          right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, limit);
  }

  async listRecentEvents(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<ProjectEventItem[]> {
    return this.events
      .filter(
        (event) =>
          event.ownerId === ownerId && event.projectId === projectId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async listRecentActivity(
    ownerId: string,
    limit: number,
    projectId?: string,
  ): Promise<ActivityItem[]> {
    return this.events
      .filter(
        (event) =>
          event.ownerId === ownerId &&
          (projectId === undefined || event.projectId === projectId),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((event) => {
        const project = event.projectId
          ? this.projects.find((candidate) => candidate.id === event.projectId)
          : undefined;

        return {
          id: event.id,
          projectKey: project?.projectKey ?? null,
          projectName: project?.name ?? null,
          eventType: event.eventType,
          summary: event.summary,
          source: event.source,
          details: event.details,
          createdAt: event.createdAt,
        };
      });
  }

  async findTaskByTitle(
    ownerId: string,
    projectId: string,
    title: string,
  ): Promise<TaskItem | null> {
    const normalizedTitle = title.trim().toLowerCase();

    return (
      this.tasks
        .filter(
          (task) =>
            task.ownerId === ownerId &&
            task.projectId === projectId &&
            task.title.trim().toLowerCase() === normalizedTitle,
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
      null
    );
  }

  async findEventByOperationId(
    ownerId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectEventItem | null> {
    return (
      this.events
        .filter(
          (event) =>
            event.ownerId === ownerId &&
            event.projectId === projectId &&
            event.details.operationId === operationId,
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
      null
    );
  }

  async createTask(input: CreateProjectTaskInput): Promise<TaskItem> {
    const now = new Date().toISOString();
    const task: TaskItem = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: "open",
      priority: input.priority,
      source: input.source,
      dueAt: null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    this.tasks.push(task);
    return task;
  }

  async updateTask(input: UpdateProjectTaskInput): Promise<TaskItem | null> {
    const index = this.tasks.findIndex(
      (task) =>
        task.id === input.taskId &&
        task.ownerId === input.ownerId &&
        task.projectId === input.projectId,
    );

    if (index < 0) return null;

    const current = this.tasks[index];
    if (!current) return null;

    const status = input.status ?? current.status;
    const now = new Date().toISOString();
    const updated: TaskItem = {
      ...current,
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      metadata: {
        ...current.metadata,
        ...(input.metadata ?? {}),
      },
      updatedAt: now,
      completedAt:
        status === "done"
          ? current.completedAt ?? now
          : input.status !== undefined
            ? null
            : current.completedAt,
    };

    this.tasks[index] = updated;
    return updated;
  }

  async recordEvent(input: RecordProjectEventInput): Promise<ProjectEventItem> {
    const event: ProjectEventItem = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      projectId: input.projectId,
      eventType: input.eventType,
      summary: input.summary,
      source: input.source,
      details: input.details ?? {},
      createdAt: new Date().toISOString(),
    };

    this.events.push(event);
    return event;
  }
}
