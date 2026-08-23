import { serve } from "@hono/node-server";

import { loadConfig } from "./config.js";
import { createBobCoreRuntime } from "./runtime.js";

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
const { app } = createBobCoreRuntime(config);

const server = serve({
  fetch: app.fetch,
  port: config.port,
});

console.info(
  JSON.stringify({
    event: "server.started",
    service: "bob-core",
    version: "0.2.0",
    port: config.port,
    environment: config.nodeEnvironment,
    provider: config.aiProvider,
    model: config.aiModel,
    memoryEnabled: config.memoryEnabled,
    sharedContextEnabled: config.sharedContextEnabled,
    mcpEnabled: config.sharedContextEnabled,
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
