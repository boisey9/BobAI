import { neon } from "@neondatabase/serverless";

import type {
  ActivityItem,
  CreateProjectTaskInput,
  DecisionItem,
  DecisionStatus,
  ProjectEventItem,
  ProjectItem,
  ProjectStatus,
  RecordProjectEventInput,
  SharedContextStore,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UpdateProjectTaskInput,
} from "./types.js";

type ProjectRow = {
  id: string;
  owner_id: string;
  project_key: string;
  name: string;
  description: string | null;
  repository: string | null;
  status: ProjectStatus;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type DecisionRow = {
  id: string;
  owner_id: string;
  project_id: string;
  title: string;
  decision: string;
  reason: string | null;
  status: DecisionStatus;
  supersedes_decision_id: string | null;
  source: string;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type TaskRow = {
  id: string;
  owner_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: string;
  due_at: string | Date | null;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
  completed_at: string | Date | null;
};

type EventRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  event_type: string;
  summary: string;
  source: string;
  details: unknown;
  created_at: string | Date;
};

type ActivityRow = EventRow & {
  project_key: string | null;
  project_name: string | null;
};

function toISOString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalISOString(value: string | Date | null): string | null {
  return value === null ? null : toISOString(value);
}

function toObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toProject(row: ProjectRow): ProjectItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectKey: row.project_key,
    name: row.name,
    description: row.description,
    repository: row.repository,
    status: row.status,
    metadata: toObject(row.metadata),
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function toDecision(row: DecisionRow): DecisionItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id,
    title: row.title,
    decision: row.decision,
    reason: row.reason,
    status: row.status,
    supersedesDecisionId: row.supersedes_decision_id,
    source: row.source,
    metadata: toObject(row.metadata),
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function toTask(row: TaskRow): TaskItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    source: row.source,
    dueAt: toOptionalISOString(row.due_at),
    metadata: toObject(row.metadata),
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
    completedAt: toOptionalISOString(row.completed_at),
  };
}

function toEvent(row: EventRow): ProjectEventItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id,
    eventType: row.event_type,
    summary: row.summary,
    source: row.source,
    details: toObject(row.details),
    createdAt: toISOString(row.created_at),
  };
}

function toActivity(row: ActivityRow): ActivityItem {
  return {
    id: row.id,
    projectKey: row.project_key,
    projectName: row.project_name,
    eventType: row.event_type,
    summary: row.summary,
    source: row.source,
    details: toObject(row.details),
    createdAt: toISOString(row.created_at),
  };
}

export class NeonSharedContextStore implements SharedContextStore {
  private readonly sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  async getProject(ownerId: string, projectKey: string): Promise<ProjectItem | null> {
    const rows = (await this.sql`
      SELECT
        id,
        owner_id,
        project_key,
        name,
        description,
        repository,
        status,
        metadata,
        created_at,
        updated_at
      FROM public.bob_projects
      WHERE owner_id = ${ownerId}
        AND lower(project_key) = lower(${projectKey})
        AND deleted_at IS NULL
      LIMIT 1
    `) as ProjectRow[];

    return rows[0] ? toProject(rows[0]) : null;
  }

  async listActiveDecisions(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<DecisionItem[]> {
    const rows = (await this.sql`
      SELECT
        id,
        owner_id,
        project_id,
        title,
        decision,
        reason,
        status,
        supersedes_decision_id,
        source,
        metadata,
        created_at,
        updated_at
      FROM public.bob_decisions
      WHERE owner_id = ${ownerId}
        AND project_id = ${projectId}
        AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `) as DecisionRow[];

    return rows.map(toDecision);
  }

  async listActiveTasks(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<TaskItem[]> {
    const rows = (await this.sql`
      SELECT
        id,
        owner_id,
        project_id,
        title,
        description,
        status,
        priority,
        source,
        due_at,
        metadata,
        created_at,
        updated_at,
        completed_at
      FROM public.bob_tasks
      WHERE owner_id = ${ownerId}
        AND project_id = ${projectId}
        AND status IN ('open', 'in_progress', 'blocked')
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          ELSE 4
        END,
        updated_at DESC
      LIMIT ${limit}
    `) as TaskRow[];

    return rows.map(toTask);
  }

  async listRecentEvents(
    ownerId: string,
    projectId: string,
    limit: number,
  ): Promise<ProjectEventItem[]> {
    const rows = (await this.sql`
      SELECT
        id,
        owner_id,
        project_id,
        event_type,
        summary,
        source,
        details,
        created_at
      FROM public.bob_events
      WHERE owner_id = ${ownerId}
        AND project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as EventRow[];

    return rows.map(toEvent);
  }

  async listRecentActivity(
    ownerId: string,
    limit: number,
    projectId?: string,
  ): Promise<ActivityItem[]> {
    const rows = projectId
      ? ((await this.sql`
          SELECT
            e.id,
            e.owner_id,
            e.project_id,
            e.event_type,
            e.summary,
            e.source,
            e.details,
            e.created_at,
            p.project_key,
            p.name AS project_name
          FROM public.bob_events e
          LEFT JOIN public.bob_projects p ON p.id = e.project_id
          WHERE e.owner_id = ${ownerId}
            AND e.project_id = ${projectId}
          ORDER BY e.created_at DESC
          LIMIT ${limit}
        `) as ActivityRow[])
      : ((await this.sql`
          SELECT
            e.id,
            e.owner_id,
            e.project_id,
            e.event_type,
            e.summary,
            e.source,
            e.details,
            e.created_at,
            p.project_key,
            p.name AS project_name
          FROM public.bob_events e
          LEFT JOIN public.bob_projects p ON p.id = e.project_id
          WHERE e.owner_id = ${ownerId}
          ORDER BY e.created_at DESC
          LIMIT ${limit}
        `) as ActivityRow[]);

    return rows.map(toActivity);
  }

  async findTaskByTitle(
    ownerId: string,
    projectId: string,
    title: string,
  ): Promise<TaskItem | null> {
    const rows = (await this.sql`
      SELECT
        id,
        owner_id,
        project_id,
        title,
        description,
        status,
        priority,
        source,
        due_at,
        metadata,
        created_at,
        updated_at,
        completed_at
      FROM public.bob_tasks
      WHERE owner_id = ${ownerId}
        AND project_id = ${projectId}
        AND lower(title) = lower(${title})
      ORDER BY updated_at DESC
      LIMIT 1
    `) as TaskRow[];

    return rows[0] ? toTask(rows[0]) : null;
  }

  async findEventByOperationId(
    ownerId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectEventItem | null> {
    const rows = (await this.sql`
      SELECT
        id,
        owner_id,
        project_id,
        event_type,
        summary,
        source,
        details,
        created_at
      FROM public.bob_events
      WHERE owner_id = ${ownerId}
        AND project_id = ${projectId}
        AND details ->> 'operationId' = ${operationId}
      ORDER BY created_at DESC
      LIMIT 1
    `) as EventRow[];

    return rows[0] ? toEvent(rows[0]) : null;
  }

  async createTask(input: CreateProjectTaskInput): Promise<TaskItem> {
    const taskId = crypto.randomUUID();
    const metadata = input.metadata ?? {};
    const rows = (await this.sql`
      INSERT INTO public.bob_tasks (
        id,
        owner_id,
        project_id,
        title,
        description,
        status,
        priority,
        source,
        due_at,
        metadata
      ) VALUES (
        ${taskId},
        ${input.ownerId},
        ${input.projectId},
        ${input.title},
        ${input.description},
        'open',
        ${input.priority},
        ${input.source},
        NULL,
        ${JSON.stringify(metadata)}::jsonb
      )
      RETURNING
        id,
        owner_id,
        project_id,
        title,
        description,
        status,
        priority,
        source,
        due_at,
        metadata,
        created_at,
        updated_at,
        completed_at
    `) as TaskRow[];

    const row = rows[0];
    if (!row) {
      throw new Error("Bob Core did not return the created task.");
    }

    return toTask(row);
  }

  async updateTask(input: UpdateProjectTaskInput): Promise<TaskItem | null> {
    const hasDescription = input.description !== undefined;
    const hasStatus = input.status !== undefined;
    const hasPriority = input.priority !== undefined;
    const metadata = input.metadata ?? {};
    const rows = (await this.sql`
      UPDATE public.bob_tasks
      SET
        description = CASE
          WHEN ${hasDescription} THEN ${input.description ?? null}
          ELSE description
        END,
        status = CASE
          WHEN ${hasStatus} THEN ${input.status ?? "open"}
          ELSE status
        END,
        priority = CASE
          WHEN ${hasPriority} THEN ${input.priority ?? "normal"}
          ELSE priority
        END,
        metadata = metadata || ${JSON.stringify(metadata)}::jsonb,
        completed_at = CASE
          WHEN ${input.status === "done"} THEN COALESCE(completed_at, now())
          WHEN ${hasStatus && input.status !== "done"} THEN NULL
          ELSE completed_at
        END,
        updated_at = now()
      WHERE id = ${input.taskId}
        AND owner_id = ${input.ownerId}
        AND project_id = ${input.projectId}
      RETURNING
        id,
        owner_id,
        project_id,
        title,
        description,
        status,
        priority,
        source,
        due_at,
        metadata,
        created_at,
        updated_at,
        completed_at
    `) as TaskRow[];

    return rows[0] ? toTask(rows[0]) : null;
  }

  async recordEvent(input: RecordProjectEventInput): Promise<ProjectEventItem> {
    const eventId = crypto.randomUUID();
    const details = input.details ?? {};
    const rows = (await this.sql`
      INSERT INTO public.bob_events (
        id,
        owner_id,
        project_id,
        event_type,
        summary,
        source,
        details
      ) VALUES (
        ${eventId},
        ${input.ownerId},
        ${input.projectId},
        ${input.eventType},
        ${input.summary},
        ${input.source},
        ${JSON.stringify(details)}::jsonb
      )
      RETURNING
        id,
        owner_id,
        project_id,
        event_type,
        summary,
        source,
        details,
        created_at
    `) as EventRow[];

    const row = rows[0];
    if (!row) {
      throw new Error("Bob Core did not return the recorded activity event.");
    }

    return toEvent(row);
  }
}
