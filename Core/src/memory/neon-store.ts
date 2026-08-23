import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";

import type {
  MemoryCreateInput,
  MemoryCreateResult,
  MemoryItem,
  MemoryScope,
  MemorySensitivity,
  MemoryStore,
} from "./types.js";

type MemoryRow = {
  id: string;
  owner_id: string;
  scope: MemoryScope;
  subject: string | null;
  content: string;
  source: string;
  sensitivity: MemorySensitivity;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
  created?: boolean;
};

function toISOString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toMemoryItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    scope: row.scope,
    subject: row.subject,
    content: row.content,
    source: row.source,
    sensitivity: row.sensitivity,
    metadata: toMetadata(row.metadata),
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function projectKeyFromMetadata(metadata: Record<string, unknown>): string {
  const value = metadata.projectKey;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export class NeonMemoryStore implements MemoryStore {
  private readonly sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  async create(input: MemoryCreateInput): Promise<MemoryCreateResult> {
    const memoryId = randomUUID();
    const eventId = randomUUID();
    const metadata = JSON.stringify(input.metadata);
    const projectKey = projectKeyFromMetadata(input.metadata);
    const eventDetails = JSON.stringify({
      scope: input.scope,
      ...(projectKey ? { projectKey } : {}),
    });

    const rows = (await this.sql`
      WITH inserted AS (
        INSERT INTO public.bob_memory_items (
          id,
          owner_id,
          scope,
          subject,
          content,
          source,
          sensitivity,
          metadata
        ) VALUES (
          ${memoryId},
          ${input.ownerId},
          ${input.scope},
          ${input.subject},
          ${input.content},
          ${input.source},
          ${input.sensitivity},
          ${metadata}::jsonb
        )
        ON CONFLICT DO NOTHING
        RETURNING
          id,
          owner_id,
          scope,
          subject,
          content,
          source,
          sensitivity,
          metadata,
          created_at,
          updated_at
      ),
      selected AS (
        SELECT * FROM inserted
        UNION ALL
        SELECT
          id,
          owner_id,
          scope,
          subject,
          content,
          source,
          sensitivity,
          metadata,
          created_at,
          updated_at
        FROM public.bob_memory_items
        WHERE owner_id = ${input.ownerId}
          AND lower(content) = lower(${input.content})
          AND lower(coalesce(metadata->>'projectKey', '')) = ${projectKey}
          AND deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1
      ),
      audit AS (
        INSERT INTO public.bob_memory_events (
          id,
          memory_id,
          owner_id,
          action,
          request_id,
          details
        )
        SELECT
          ${eventId},
          id,
          owner_id,
          'created',
          ${input.requestId ?? null},
          ${eventDetails}::jsonb
        FROM inserted
      )
      SELECT
        selected.*,
        EXISTS (SELECT 1 FROM inserted) AS created
      FROM selected
      LIMIT 1
    `) as MemoryRow[];

    const row = rows[0];

    if (!row) {
      throw new Error("Memory could not be created or retrieved.");
    }

    return {
      item: toMemoryItem(row),
      created: row.created === true,
    };
  }

  async list(ownerId: string, limit: number): Promise<MemoryItem[]> {
    const rows = (await this.sql`
      SELECT
        id,
        owner_id,
        scope,
        subject,
        content,
        source,
        sensitivity,
        metadata,
        created_at,
        updated_at
      FROM public.bob_memory_items
      WHERE owner_id = ${ownerId}
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `) as MemoryRow[];

    return rows.map(toMemoryItem);
  }

  async search(
    ownerId: string,
    query: string,
    limit: number,
  ): Promise<MemoryItem[]> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return this.list(ownerId, limit);
    }

    const likeQuery = `%${normalizedQuery}%`;
    const rows = (await this.sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('simple', ${normalizedQuery}) AS terms
      )
      SELECT
        item.id,
        item.owner_id,
        item.scope,
        item.subject,
        item.content,
        item.source,
        item.sensitivity,
        item.metadata,
        item.created_at,
        item.updated_at,
        CASE
          WHEN lower(item.content) = lower(${normalizedQuery}) THEN 4
          WHEN lower(coalesce(item.subject, '')) = lower(${normalizedQuery}) THEN 3
          WHEN item.content ILIKE ${likeQuery} THEN 2
          WHEN coalesce(item.subject, '') ILIKE ${likeQuery} THEN 2
          ELSE 1
        END AS exact_rank,
        ts_rank_cd(item.search_document, search_query.terms) AS text_rank
      FROM public.bob_memory_items AS item
      CROSS JOIN search_query
      WHERE item.owner_id = ${ownerId}
        AND item.deleted_at IS NULL
        AND (
          item.search_document @@ search_query.terms
          OR item.content ILIKE ${likeQuery}
          OR coalesce(item.subject, '') ILIKE ${likeQuery}
        )
      ORDER BY exact_rank DESC, text_rank DESC, item.updated_at DESC
      LIMIT ${limit}
    `) as MemoryRow[];

    return rows.map(toMemoryItem);
  }

  async forget(
    ownerId: string,
    memoryId: string,
    requestId?: string,
  ): Promise<MemoryItem | null> {
    const eventId = randomUUID();

    const rows = (await this.sql`
      WITH forgotten AS (
        UPDATE public.bob_memory_items
        SET deleted_at = now(), updated_at = now()
        WHERE id = ${memoryId}
          AND owner_id = ${ownerId}
          AND deleted_at IS NULL
        RETURNING
          id,
          owner_id,
          scope,
          subject,
          content,
          source,
          sensitivity,
          metadata,
          created_at,
          updated_at
      ),
      audit AS (
        INSERT INTO public.bob_memory_events (
          id,
          memory_id,
          owner_id,
          action,
          request_id,
          details
        )
        SELECT
          ${eventId},
          id,
          owner_id,
          'forgotten',
          ${requestId ?? null},
          '{}'::jsonb
        FROM forgotten
      )
      SELECT * FROM forgotten
    `) as MemoryRow[];

    return rows[0] ? toMemoryItem(rows[0]) : null;
  }
}
