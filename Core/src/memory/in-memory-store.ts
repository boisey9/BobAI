import { randomUUID } from "node:crypto";

import type {
  MemoryCreateInput,
  MemoryCreateResult,
  MemoryItem,
  MemoryStore,
} from "./types.js";

function active(item: MemoryItem & { deletedAt?: string }): boolean {
  return item.deletedAt === undefined;
}

function projectKey(metadata: Record<string, unknown>): string {
  const value = metadata.projectKey;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function scoreMemory(item: MemoryItem, query: string): number {
  const normalizedQuery = query.toLowerCase();
  const subject = item.subject?.toLowerCase() ?? "";
  const content = item.content.toLowerCase();

  if (content === normalizedQuery || subject === normalizedQuery) {
    return 100;
  }

  let score = 0;

  if (content.includes(normalizedQuery)) {
    score += 50;
  }

  if (subject.includes(normalizedQuery)) {
    score += 40;
  }

  const tokens = normalizedQuery
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

  for (const token of tokens) {
    if (content.includes(token)) {
      score += 5;
    }

    if (subject.includes(token)) {
      score += 3;
    }
  }

  return score;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly items = new Map<
    string,
    MemoryItem & { deletedAt?: string }
  >();

  async context(
    ownerId: string,
    workspace: string,
    query: string | null,
    limit: number,
  ): Promise<MemoryItem[]> {
    return [...this.items.values()]
      .filter(
        (item) =>
          active(item) &&
          item.ownerId === ownerId &&
          item.sensitivity === "normal" &&
          (item.metadata.approvalStatus == null ||
            item.metadata.approvalStatus === "approved") &&
          (workspace === "personal"
            ? ["", "personal"].includes(projectKey(item.metadata))
            : projectKey(item.metadata) === workspace &&
              item.scope !== "personal"),
      )
      .map((item) => ({ item, score: query ? scoreMemory(item, query) : 0 }))
      .filter(({ score }) => !query || score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.item.updatedAt.localeCompare(a.item.updatedAt) ||
          a.item.id.localeCompare(b.item.id),
      )
      .slice(0, limit)
      .map(({ item }) => item);
  }

  async create(input: MemoryCreateInput): Promise<MemoryCreateResult> {
    const inputProjectKey = projectKey(input.metadata);
    const duplicate = [...this.items.values()].find(
      (item) =>
        active(item) &&
        item.ownerId === input.ownerId &&
        item.content.toLowerCase() === input.content.toLowerCase() &&
        projectKey(item.metadata) === inputProjectKey,
    );

    if (duplicate) {
      return { item: duplicate, created: false };
    }

    const timestamp = new Date().toISOString();
    const item: MemoryItem = {
      id: randomUUID(),
      ownerId: input.ownerId,
      scope: input.scope,
      subject: input.subject,
      content: input.content,
      source: input.source,
      sensitivity: input.sensitivity,
      metadata: input.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.items.set(item.id, item);
    return { item, created: true };
  }

  async list(ownerId: string, limit: number): Promise<MemoryItem[]> {
    return [...this.items.values()]
      .filter((item) => active(item) && item.ownerId === ownerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
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

    return [...this.items.values()]
      .filter((item) => active(item) && item.ownerId === ownerId)
      .map((item) => ({ item, score: scoreMemory(item, normalizedQuery) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.item.updatedAt.localeCompare(left.item.updatedAt),
      )
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  async forget(ownerId: string, memoryId: string): Promise<MemoryItem | null> {
    const item = this.items.get(memoryId);

    if (!item || !active(item) || item.ownerId !== ownerId) {
      return null;
    }

    const forgotten = {
      ...item,
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
    };

    this.items.set(memoryId, forgotten);
    return forgotten;
  }
}
