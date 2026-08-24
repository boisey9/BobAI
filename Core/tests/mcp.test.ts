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
  createInterfaceCredentialGateway,
  type InterfaceCredentialScope,
} from "../src/security/interface-credential.js";
import {
  createTestConfig,
  TEST_DEVICE_TOKEN,
} from "./test-config.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-23T08:00:00.000Z";
const INTERFACE_TOKEN =
  "bobif_copilot_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop";

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
  const store = new InMemorySharedContextStore({
    projects: [project],
    decisions: [decision],
    tasks: [task],
    events: [event],
  });
  const sharedContextService = new SharedContextService(
    store,
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

  return { app, config, memoryService, sharedContextService, store };
}

function mcpHeaders(token = TEST_DEVICE_TOKEN) {
  return {
    authorization: `Bearer ${token}`,
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

function mcpRequest(body: unknown, token = TEST_DEVICE_TOKEN) {
  return {
    method: "POST",
    headers: mcpHeaders(token),
    body: JSON.stringify(body),
  } as const;
}

function syncGateway(
  app: ReturnType<typeof createMcpTestApp>["app"],
  config: ReturnType<typeof createMcpTestApp>["config"],
  scopes: InterfaceCredentialScope[] = [
    "mcp:sync",
    "mcp:context:read",
    "mcp:event:write",
    "mcp:task:write",
    "mcp:decision:propose",
  ],
) {
  return createInterfaceCredentialGateway(
    app.fetch.bind(app),
    config,
    vi.fn().mockResolvedValue({
      id: "copilot-bobai",
      surface: "copilot",
      scopes,
      projectKey: "bobai",
    }),
  );
}

function syncRequest(body: unknown) {
  return new Request("https://bob-core.test/mcp/sync", {
    method: "POST",
    headers: mcpHeaders(INTERFACE_TOKEN),
    body: JSON.stringify(body),
  });
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

  it("advertises only the read-only Bob context tool on primary MCP", async () => {
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
    await memoryService.remember(
      "Codex must retrieve BobAI project context first.",
      {
        scope: "project",
        subject: "Codex continuity",
        metadata: { projectKey: "bobai" },
      },
    );

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

  it("binds interface MCP requests to the credential project and surface", async () => {
    const { app, config } = createMcpTestApp();
    const gateway = createInterfaceCredentialGateway(
      app.fetch.bind(app),
      config,
      vi.fn().mockResolvedValue({
        id: "copilot-bobai",
        surface: "copilot",
        scopes: ["mcp:context:read"],
        projectKey: "bobai",
      }),
    );

    const response = await gateway(
      new Request("https://bob-core.test/mcp/context", {
        method: "POST",
        headers: mcpHeaders(INTERFACE_TOKEN),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "bob_get_context",
            arguments: {
              projectKey: "unknown",
              task: "Use Copilot with Bob",
              surface: "chatgpt",
            },
          },
        }),
      }),
    );
    const rpc = await readJsonRpc(response);

    expect(response.status).toBe(200);
    expect(rpc.result.isError).not.toBe(true);
    expect(rpc.result.structuredContent.request).toMatchObject({
      projectKey: "bobai",
      task: "Use Copilot with Bob",
      surface: "copilot",
    });
  });

  it("exposes only the write tools allowed by the sync credential", async () => {
    const { app, config } = createMcpTestApp();
    const gateway = syncGateway(app, config, [
      "mcp:sync",
      "mcp:context:read",
      "mcp:event:write",
    ]);

    const response = await gateway(
      syncRequest({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/list",
      }),
    );
    const rpc = await readJsonRpc(response);
    const names = rpc.result.tools.map((tool: { name: string }) => tool.name);

    expect(names).toEqual(["bob_get_context", "bob_record_event"]);
  });

  it("creates and updates Bob Core tasks through scoped sync tools", async () => {
    const { app, config, store } = createMcpTestApp();
    const gateway = syncGateway(app, config);

    const createResponse = await gateway(
      syncRequest({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "bob_create_task",
          arguments: {
            operationId: "copilot-create-task-0001",
            title: "Validate Copilot two-way sync",
            description: "Confirm Copilot can update Bob Core.",
            priority: "high",
          },
        },
      }),
    );
    const created = await readJsonRpc(createResponse);

    expect(created.result.isError).not.toBe(true);
    expect(created.result.structuredContent).toMatchObject({
      task: {
        title: "Validate Copilot two-way sync",
        status: "open",
        priority: "high",
      },
      created: true,
    });

    const updateResponse = await gateway(
      syncRequest({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "bob_update_task",
          arguments: {
            operationId: "copilot-update-task-0001",
            title: "Validate Copilot two-way sync",
            status: "done",
          },
        },
      }),
    );
    const updated = await readJsonRpc(updateResponse);

    expect(updated.result.isError).not.toBe(true);
    expect(updated.result.structuredContent.task.status).toBe("done");

    const stored = await store.findTaskByTitle(
      "rick",
      projectId,
      "Validate Copilot two-way sync",
    );
    expect(stored?.status).toBe("done");
  });

  it("records decision proposals without changing active decisions", async () => {
    const { app, config, store } = createMcpTestApp();
    const gateway = syncGateway(app, config);

    const response = await gateway(
      syncRequest({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "bob_propose_decision",
          arguments: {
            operationId: "copilot-propose-decision-0001",
            title: "Use safe two-way sync",
            proposal:
              "Allow task and activity writes while keeping decisions owner-approved.",
            reason: "Preserve a trustworthy authority boundary.",
          },
        },
      }),
    );
    const rpc = await readJsonRpc(response);

    expect(rpc.result.isError).not.toBe(true);
    expect(rpc.result.structuredContent).toMatchObject({
      proposal: {
        title: "Use safe two-way sync",
        status: "pending_review",
      },
      reviewTask: {
        title: "Review decision: Use safe two-way sync",
        priority: "high",
      },
    });

    const decisions = await store.listActiveDecisions("rick", projectId, 20);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.title).toBe("Bob Core owns continuity");
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
