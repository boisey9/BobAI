import { OpenAIResponsesProvider } from "./ai/openai-provider.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({
  config,
  aiProvider: new OpenAIResponsesProvider(config),
});

export default app;
