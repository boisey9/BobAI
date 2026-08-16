import { serve } from "@hono/node-server";

import { OpenAIResponsesProvider } from "./ai/openai-provider.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  process.loadEnvFile(".env");
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";

  if (code !== "ENOENT") {
    throw error;
  }
}

const config = loadConfig();
const app = createApp({
  config,
  aiProvider: new OpenAIResponsesProvider(config),
});

const server = serve({
  fetch: app.fetch,
  port: config.port,
});

console.info(
  JSON.stringify({
    event: "server.started",
    service: "bob-core",
    port: config.port,
    environment: config.nodeEnvironment,
  }),
);

function shutdown(signal: string) {
  console.info(
    JSON.stringify({
      event: "server.stopping",
      signal,
    }),
  );

  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
