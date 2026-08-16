import { createAIProvider } from "./ai/provider-factory.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({
  config,
  aiProvider: createAIProvider(config),
});

export default app;
