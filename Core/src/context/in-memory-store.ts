import type {
  DecisionItem,
  ProjectEventItem,
  ProjectItem,
  SharedContextStore,
  TaskItem,
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
}
