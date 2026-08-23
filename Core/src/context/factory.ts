import type { BobCoreConfig } from "../config.js";
import type { MemoryService } from "../memory/service.js";
import { NeonSharedContextStore } from "./neon-store.js";
import { SharedContextService } from "./service.js";

export function createSharedContextService(
  config: BobCoreConfig,
  memoryService?: MemoryService,
): SharedContextService | undefined {
  if (!config.sharedContextEnabled) {
    return undefined;
  }

  if (!config.databaseURL) {
    throw new Error(
      "Shared context is enabled but DATABASE_URL is not configured.",
    );
  }

  return new SharedContextService(
    new NeonSharedContextStore(config.databaseURL),
    config.ownerId,
    memoryService,
    config.memoryRetrievalLimit,
  );
}
