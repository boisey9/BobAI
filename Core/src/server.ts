import { serve } from "@hono/node-server";

import { createAIProvider } from "./ai/provider-factory.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSharedContextService } from "./context/factory.js";
import { createMemoryService } from "./memory/factory.js";

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
const memoryService = createMemoryService(config);
const app = createApp({
  config,
  aiProvider: createAIProvider(config),
  memoryService,
  sharedContextService: createSharedContextService(config, memoryService),
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
    provider: config.aiProvider,
    model: config.aiModel,
    memoryEnabled: config.memoryEnabled,
    sharedContextEnabled: config.sharedContextEnabled,
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
