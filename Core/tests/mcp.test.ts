import { describe, expect, it, vi } from "vitest";

import type { AIProvider } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type {
  DecisionItem,
  ProjectEventItem,
  ProjectItem,
  TaskItem,
} from "../src/context/types.js";
import { InMemoryMemoryStore } from "../src/memory/in-memory-store.js";
import { MemoryService } from "../src/memory/service.js";
import { mountBobMcp } from "../src/mcp/mount.js";
import {
  createTestConfig,
  TEST_DEVICE_TOKEN,
} from "./test-config.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-23T08:00:00.000Z";

const project: ProjectItem = {
  id: projectId,
  ownerId: "rick",
  projectKey: "bobai",
  name: "BobAI",
  description: "Private personal-AI platform.",
  repository: "boisey9/BobAI",
  status: "active",
  metadata: {},
  createdAt: timestamp,
  updatedAt: timestamp,
};

const decision: DecisionItem = {
  id: "22222222-2222-4222-8222-222222222222",
  ownerId: "rick",
  projectId,
  title: "Bob Core owns continuity",
  decision: "Bob Core is authoritative shared project state.",
  reason: "All clients must see the same Bob.",
  status: "active",
  supersedesDecisionId: null,
  source: "test",
  metadata: {},
  createdAt: timestamp,
  updatedAt: timestamp,
};

const task: TaskItem = {
  id: "33333333-3333-4333-8333-333333333333",
  ownerId: "rick",
  projectId,
  title: "Connect Codex",
  description: "Use Bob Core MCP before substantial work.",
  status: "in_progress",
  priority: "high",
  source: "test",
  dueAt: null,
  metadata: {},
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: null,
};

const event: ProjectEventItem = {
  id: "44444444-4444-4444-8444-444444444444",
  ownerId: "rick",
  projectId,
  eventType: "implementation_started",
  summary: "Started MCP integration.",
  source: "test",
  details: {},
  createdAt: timestamp,
};

function createMcpTestApp() {
  const config = createTestConfig({
    memoryEnabled: true,
    sharedContextEnabled: true,
  });
  const generate = vi.fn<AIProvider["generate"]>().mockResolvedValue({
    text: "unused",
    model: "test-model",
  });
  const memoryService = new MemoryService(
    new InMemoryMemoryStore(),
    "rick",
    6,
  );
  const sharedContextService = new SharedContextService(
    new InMemorySharedContextStore({
      projects: [project],
      decisions: [decision],
      tasks: [task],
      events: [event],
    }),
    "rick",
    memoryService,
    6,
  );
  const app = createApp({
    config,
    aiProvider: { generate },
    memoryService,
    sharedContextService,
  });

  mountBobMcp(app, config, sharedContextService);

  return { app, memoryService };
}

function mcpHeaders() {
  return {
    authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
}

async function readJsonRpc(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }

  const messages = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));

  const matching = messages.find((message) => message.id !== undefined);
  if (!matching) {
    throw new Error(`No JSON-RPC message found in MCP response: ${text}`);
  }

  return matching;
}

function mcpRequest(body: unknown) {
  return {
    method: "POST",
    headers: mcpHeaders(),
    body: JSON.stringify(body),
  } as const;
}

describe("Bob Core MCP", () => {
  it("keeps MCP behind the Bob Core bearer token", async () => {
    const { app } = createMcpTestApp();
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "authentication_required" },
    });
  });

  it("advertises only the read-only Bob context tool", async () => {
    const { app } = createMcpTestApp();
    const response = await app.request(
      "/mcp",
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    );
    const rpc = await readJsonRpc(response);

    expect(response.status).toBe(200);
    expect(rpc.result.tools).toHaveLength(1);
    expect(rpc.result.tools[0]).toMatchObject({
      name: "bob_get_context",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    });
  });

  it("returns Bob Core shared project context through tools/call", async () => {
    const { app, memoryService } = createMcpTestApp();
    await memoryService.remember("Codex must retrieve BobAI project context first.", {
      scope: "project",
      subject: "Codex continuity",
      metadata: { projectKey: "bobai" },
    });

    const response = await app.request(
      "/mcp",
      mcpRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "bob_get_context",
          arguments: {
            projectKey: "bobai",
            task: "Connect Codex",
            surface: "codex",
          },
        },
      }),
    );
    const rpc = await readJsonRpc(response);

    expect(response.status).toBe(200);
    expect(rpc.result.isError).not.toBe(true);
    expect(rpc.result.structuredContent).toMatchObject({
      authority: { source: "bob-core", version: "0.2" },
      request: {
        projectKey: "bobai",
        task: "Connect Codex",
        surface: "codex",
      },
      project: {
        projectKey: "bobai",
        name: "BobAI",
        repository: "boisey9/BobAI",
      },
      decisions: [
        {
          title: "Bob Core owns continuity",
          decision: "Bob Core is authoritative shared project state.",
        },
      ],
      tasks: [{ title: "Connect Codex", status: "in_progress" }],
      recentEvents: [{ summary: "Started MCP integration." }],
      memories: [
        {
          subject: "Codex continuity",
          content: "Codex must retrieve BobAI project context first.",
          projectKey: "bobai",
        },
      ],
    });
  });

  it("returns a safe tool error for an unknown project", async () => {
    const { app } = createMcpTestApp();
    const response = await app.request(
      "/mcp",
      mcpRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "bob_get_context",
          arguments: { projectKey: "unknown", surface: "codex" },
        },
      }),
    );
    const rpc = await readJsonRpc(response);

    expect(response.status).toBe(200);
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0].text).toContain("no active project");
  });
});
