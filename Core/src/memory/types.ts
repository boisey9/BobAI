export const MEMORY_SCOPES = [
  "personal",
  "project",
  "preference",
  "fact",
] as const;

export const MEMORY_SENSITIVITIES = ["normal", "sensitive"] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];
export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];

export type MemoryItem = {
  id: string;
  ownerId: string;
  scope: MemoryScope;
  subject: string | null;
  content: string;
  source: string;
  sensitivity: MemorySensitivity;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MemoryCreateInput = {
  ownerId: string;
  scope: MemoryScope;
  subject: string | null;
  content: string;
  source: string;
  sensitivity: MemorySensitivity;
  metadata: Record<string, unknown>;
  requestId?: string;
};

export type MemoryCreateResult = {
  item: MemoryItem;
  created: boolean;
};

export interface MemoryStore {
  /** Apply ownership, workspace, approval and privacy constraints before ranking/limiting. */
  context(
    ownerId: string,
    projectKey: string,
    query: string | null,
    limit: number,
  ): Promise<MemoryItem[]>;
  create(input: MemoryCreateInput): Promise<MemoryCreateResult>;
  list(ownerId: string, limit: number): Promise<MemoryItem[]>;
  search(ownerId: string, query: string, limit: number): Promise<MemoryItem[]>;
  forget(
    ownerId: string,
    memoryId: string,
    requestId?: string,
  ): Promise<MemoryItem | null>;
}
