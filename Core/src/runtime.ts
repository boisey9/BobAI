import { mountBobActivity } from "./activity/mount.js";
import { createAIProvider } from "./ai/provider-factory.js";
import { createApp } from "./app.js";
import type { BobCoreConfig } from "./config.js";
import { mountBobControlCenter } from "./control-center/mount.js";
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

  mountBobActivity(app, sharedContextService);
  mountBobControlCenter(app, config);
  mountBobMcp(app, config, sharedContextService);

  return {
    app,
    memoryService,
    sharedContextService,
  };
}
