import { parseMemoryCommand, type MemoryCommand } from "./commands.js";
import {
  assertMemoryContentAllowed,
  inferMemoryScope,
  inferMemorySensitivity,
  MemoryPolicyError,
  normalizeMemoryContent,
} from "./policy.js";
import type {
  MemoryCreateResult,
  MemoryItem,
  MemoryScope,
  MemorySensitivity,
  MemoryStore,
} from "./types.js";

export type MemoryCommandResult = {
  reply: string;
  operation: "remembered" | "recalled" | "forgotten" | "clarification";
};

type RememberOptions = {
  scope?: MemoryScope;
  subject?: string | null;
  sensitivity?: MemorySensitivity;
  source?: string;
  requestId?: string;
};

function displayMemory(item: MemoryItem): string {
  return item.subject ? `${item.subject}: ${item.content}` : item.content;
}

function normalizeComparison(value: string): string {
  return normalizeMemoryContent(value).toLowerCase();
}

export class MemoryService {
  constructor(
    private readonly store: MemoryStore,
    private readonly ownerId: string,
    private readonly retrievalLimit: number,
  ) {}

  parseCommand(input: string): MemoryCommand | null {
    return parseMemoryCommand(input);
  }

  async remember(
    content: string,
    options: RememberOptions = {},
  ): Promise<MemoryCreateResult> {
    assertMemoryContentAllowed(content);
    const normalizedContent = normalizeMemoryContent(content);
    const subject = options.subject?.trim() || null;

    if (subject) {
      assertMemoryContentAllowed(subject);

      if (subject.length > 200) {
        throw new MemoryPolicyError(
          "Memory subjects must be 200 characters or fewer.",
        );
      }
    }

    return this.store.create({
      ownerId: this.ownerId,
      scope: options.scope ?? inferMemoryScope(normalizedContent),
      subject,
      content: normalizedContent,
      source: options.source ?? "user_explicit",
      sensitivity:
        options.sensitivity ?? inferMemorySensitivity(normalizedContent),
      metadata: {},
      ...(options.requestId ? { requestId: options.requestId } : {}),
    });
  }

  async list(limit = 20): Promise<MemoryItem[]> {
    return this.store.list(this.ownerId, limit);
  }

  async search(query: string, limit = 10): Promise<MemoryItem[]> {
    return this.store.search(this.ownerId, query, limit);
  }

  async forgetById(
    memoryId: string,
    requestId?: string,
  ): Promise<MemoryItem | null> {
    return this.store.forget(this.ownerId, memoryId, requestId);
  }

  async handleCommand(
    command: MemoryCommand,
    requestId: string,
  ): Promise<MemoryCommandResult> {
    switch (command.type) {
      case "remember": {
        try {
          const result = await this.remember(command.content, {
            requestId,
            source: "chat_explicit",
          });

          return {
            operation: "remembered",
            reply: result.created
              ? `Got it — I'll remember: “${result.item.content}”`
              : `I already had that saved: “${result.item.content}”`,
          };
        } catch (error) {
          if (error instanceof MemoryPolicyError) {
            return {
              operation: "clarification",
              reply: error.message,
            };
          }

          throw error;
        }
      }

      case "recall": {
        const memories = command.query
          ? await this.search(command.query, 10)
          : await this.list(10);

        if (memories.length === 0) {
          return {
            operation: "recalled",
            reply: command.query
              ? `I don't have an approved memory about “${command.query}” yet.`
              : "I don't have any approved memories saved yet.",
          };
        }

        const formatted = memories
          .slice(0, 10)
          .map((item, index) => `${index + 1}. ${displayMemory(item)}`)
          .join("\n");

        return {
          operation: "recalled",
          reply: command.query
            ? `Here's what I remember about “${command.query}”:\n${formatted}`
            : `Here's what I currently remember:\n${formatted}`,
        };
      }

      case "forget": {
        const candidates = await this.search(command.query, 5);

        if (candidates.length === 0) {
          return {
            operation: "forgotten",
            reply: `I couldn't find an approved memory matching “${command.query}”.`,
          };
        }

        const normalizedQuery = normalizeComparison(command.query);
        const exact = candidates.find(
          (item) =>
            normalizeComparison(item.content) === normalizedQuery ||
            (item.subject !== null &&
              normalizeComparison(item.subject) === normalizedQuery),
        );
        const selected = exact ?? (candidates.length === 1 ? candidates[0] : null);

        if (!selected) {
          const choices = candidates
            .slice(0, 3)
            .map((item, index) => `${index + 1}. ${displayMemory(item)}`)
            .join("\n");

          return {
            operation: "clarification",
            reply:
              `I found several possible matches:\n${choices}\n` +
              "Please say “forget: <the exact memory text>”.",
          };
        }

        const forgotten = await this.forgetById(selected.id, requestId);

        return {
          operation: "forgotten",
          reply: forgotten
            ? `Done — I forgot: “${forgotten.content}”`
            : "That memory was already removed.",
        };
      }
    }
  }

  async buildContext(query: string): Promise<string | undefined> {
    const candidates = await this.search(
      query,
      Math.min(this.retrievalLimit * 2, 20),
    );
    const selected = candidates
      .filter((item) => item.sensitivity === "normal")
      .slice(0, this.retrievalLimit);

    if (selected.length === 0) {
      return undefined;
    }

    return JSON.stringify(
      selected.map((item) => ({
        scope: item.scope,
        subject: item.subject,
        content: item.content,
        updatedAt: item.updatedAt,
      })),
      null,
      2,
    );
  }
}
