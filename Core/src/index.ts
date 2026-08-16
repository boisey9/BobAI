import { createAIProvider } from "./ai/provider-factory.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createMemoryService } from "./memory/factory.js";

const config = loadConfig();
const app = createApp({
  config,
  aiProvider: createAIProvider(config),
  memoryService: createMemoryService(config),
});

export default app;
