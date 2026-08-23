import { createAIProvider } from "./ai/provider-factory.js";
import { createApp } from "./app.js";
import type { BobCoreConfig } from "./config.js";
import { createSharedContextService } from "./context/factory.js";
import { createMemoryService } from "./memory/factory.js";
import { mountBobMcp } from "./mcp/mount.js";

export function createBobCoreRuntime(config: BobCoreConfig) {
  const memoryService = createMemoryService(config);
  const sharedContextService = createSharedContextService(config, memoryService);
  const app = createApp({
    config,
    aiProvider: createAIProvider(config),
    memoryService,
    sharedContextService,
  });

  mountBobMcp(app, config, sharedContextService);

  return {
    app,
    memoryService,
    sharedContextService,
  };
}
