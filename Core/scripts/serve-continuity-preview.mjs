import { observeDatabaseErrors } from "./lib/database-errors.mjs";
// Local acceptance fixture. Requires an explicitly isolated test database branch.
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
import { serve } from "@hono/node-server";
import { createApp } from "../src/app.ts";
import { createTestConfig } from "../tests/test-config.ts";
import { NeonSharedContextStore } from "../src/context/neon-store.ts";
import { SharedContextService } from "../src/context/service.ts";
import { NeonMemoryStore } from "../src/memory/neon-store.ts";
import { MemoryService } from "../src/memory/service.ts";
import { mountBobActivity } from "../src/activity/mount.ts";
import { mountBobControlCenter } from "../src/control-center/mount.ts";
import { mountBobControlCenterApprovalTransaction } from "../src/control-center/approval-transaction.ts";

const databaseURL = process.env.BOB_TEST_DATABASE_URL;
assert(
  databaseURL &&
    process.env.BOB_TEST_BRANCH_ID &&
    process.env.BOB_TEST_BRANCH_ID !== "br-rapid-hall-aykwycjn",
  "An isolated test branch is required.",
);
const ownerId = `browser-test-${crypto.randomUUID()}`;
const config = createTestConfig({ databaseURL, ownerId, memoryEnabled: true });
const pool = observeDatabaseErrors(new Pool({ connectionString: databaseURL }));
for (const key of ["personal", "bobai"])
  await pool.query(
    "INSERT INTO public.bob_projects(id, owner_id, project_key, name, status) VALUES (gen_random_uuid(), $1, $2, $3, 'active')",
    [ownerId, key, key === "personal" ? "Personal" : "BobAI"],
  );
await pool.end();
const memoryService = new MemoryService(
  new NeonMemoryStore(databaseURL),
  ownerId,
  6,
);
await memoryService.remember("Personal fixture only", { scope: "personal" });
await memoryService.remember("Project fixture only", {
  scope: "project",
  metadata: { projectKey: "bobai" },
});
const sharedContextService = new SharedContextService(
  new NeonSharedContextStore(databaseURL),
  ownerId,
  memoryService,
);
await sharedContextService.proposeDecision({
  projectKey: "bobai",
  operationId: "browser-review-fixture",
  title: "Acceptance fixture",
  proposal: "Use explicit workspace context.",
  actor: { interfaceId: "fixture", surface: "codex" },
});
const app = createApp({
  config,
  memoryService,
  sharedContextService,
  aiProvider: {
    generate: async (_messages, context) => ({
      text: `Workspace: ${context.sharedContext.project.name}. Memory: ${context.sharedContext.memories.map((m) => m.content).join("; ")}.`,
      model: "deterministic-acceptance-fixture",
    }),
  },
});
mountBobActivity(app, sharedContextService);
mountBobControlCenterApprovalTransaction(app, config);
mountBobControlCenter(app, config);
serve({ fetch: app.fetch, port: 3417, hostname: "127.0.0.1" }, () =>
  console.log("Isolated acceptance Core listening on 127.0.0.1:3417."),
);
