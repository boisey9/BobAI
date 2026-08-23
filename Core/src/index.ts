import { createAIProvider } from "./ai/provider-factory.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSharedContextService } from "./context/factory.js";
import { createMemoryService } from "./memory/factory.js";

const config = loadConfig();
const memoryService = createMemoryService(config);
const app = createApp({
  config,
  aiProvider: createAIProvider(config),
  memoryService,
  sharedContextService: createSharedContextService(config, memoryService),
});

export default app;
