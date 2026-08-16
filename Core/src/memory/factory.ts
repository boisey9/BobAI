import type { BobCoreConfig } from "../config.js";
import { NeonMemoryStore } from "./neon-store.js";
import { MemoryService } from "./service.js";

export function createMemoryService(
  config: BobCoreConfig,
): MemoryService | undefined {
  if (!config.memoryEnabled) {
    return undefined;
  }

  if (!config.databaseURL) {
    throw new Error(
      "Memory is enabled but DATABASE_URL is not configured.",
    );
  }

  return new MemoryService(
    new NeonMemoryStore(config.databaseURL),
    config.ownerId,
    config.memoryRetrievalLimit,
  );
}
