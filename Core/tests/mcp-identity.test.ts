import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectItem } from "../src/context/types.js";
import { mountBobMcp } from "../src/mcp/mount.js";
import {
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
  createInterfaceCredentialGateway,
} from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const boundProjectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const interfaceToken =
  "bobif_codex_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop";

function project(id: string, projectKey: string): ProjectItem {
  return {
    id,
    ownerId: "rick",
    projectKey,
    name: projectKey,
    description: null,
    repository: null,
    status: "active",
    metadata: {},
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt: "2026-10-23T10:00:00.000Z",
  };
}

function fixture() {
  const config = createTestConfig({ sharedContextEnabled: true });
  const store = new InMemorySharedContextStore({
    projects: [
      project(boundProjectId, "bobai"),
      project(otherProjectId, "another-project"),
    ],
  });
  const service = new SharedContextService(store, "rick");
  const app = createApp({
    config,
    aiProvider: {
      generate: vi.fn().mockResolvedValue({ text: "unused", model: "test" }),
    },
    sharedContextService: service,
  });
  mountBobMcp(app, config, service);
  const gateway = createInterfaceCredentialGateway(
    app.fetch.bind(app),
    config,
    vi.fn().mockResolvedValue({
      id: "codex-bobai",
      surface: "codex",
      scopes: ["mcp:sync", "mcp:context:read", "handoffs:write"],
      projectKey: "bobai",
    }),
  );
  return { app, gateway, store };
}

function request(body: unknown, token = TEST_DEVICE_TOKEN) {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  } as const;
}

function call(name: string, args: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

async function rpc(response: Response) {
  expect(response.status).toBe(200);
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("application/json")) {
    return JSON.parse(text);
  }
  const message = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()))
    .find((value) => value.id !== undefined);
  expect(message).toBeDefined();
  return message;
}

function textContext(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((item) => item.type === "text")?.text;
  expect(text).toBeTypeOf("string");
  return JSON.parse(text!);
}

describe("MCP project UUID identity", () => {
  it.each(["/mcp", "/mcp/context"])(
    "keeps %s read-only when checkpoint support is available elsewhere",
    async (route) => {
      const { app, gateway, store } = fixture();
      const send = (body: unknown) => route === "/mcp"
        ? app.request(route, request(body))
        : gateway(new Request(`https://bob-core.test${route}`, request(body, interfaceToken)));
      const listed = await rpc(await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
      expect(listed.result.tools.map((tool: { name: string }) => tool.name))
        .toEqual(["bob_get_context"]);
      const rejected = await rpc(await send(call("bob_record_handoff", {
        operationId: "read-only-checkpoint-0001", expectedProjectId: boundProjectId,
        outcome: "Must not be written.", unresolved: [], nextActions: [],
      })));
      expect(Boolean(rejected.error || rejected.result?.isError)).toBe(true);
      expect(await store.listHandoffs("rick", boundProjectId, 10)).toEqual([]);
    },
  );

  it("advertises the exact project UUID as required context output", async () => {
    const { app } = fixture();
    const response = await rpc(
      await app.request(
        "/mcp",
        request({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      ),
    );
    const schema = response.result.tools.find(
      (tool: { name: string }) => tool.name === "bob_get_context",
    ).outputSchema.properties.project;
    expect(schema.required).toContain("id");
    expect(schema.properties.id).toMatchObject({ type: "string", format: "uuid" });
  });

  it.each([
    ["bobai", boundProjectId],
    ["another-project", otherProjectId],
  ])("returns the stored UUID for an unbound request to %s", async (projectKey, id) => {
    const { app } = fixture();
    const response = await rpc(
      await app.request(
        "/mcp",
        request(call("bob_get_context", { projectKey, surface: "chatgpt" })),
      ),
    );
    expect(response.result.isError).not.toBe(true);
    expect(response.result.structuredContent.project).toMatchObject({ id, projectKey });
    expect(textContext(response.result).project).toMatchObject({ id, projectKey });
  });

  it.each(["/mcp/context", "/mcp/sync"])(
    "keeps the credential-bound UUID despite conflicting arguments and headers on %s",
    async (route) => {
      const { gateway } = fixture();
      const input = request(
        call("bob_get_context", {
          projectKey: "another-project",
          surface: "chatgpt",
        }),
        interfaceToken,
      );
      const response = await rpc(
        await gateway(
          new Request(`https://bob-core.test${route}`, {
            ...input,
            headers: {
              ...input.headers,
              [BOB_INTERFACE_PROJECT_HEADER]: "another-project",
              [BOB_INTERFACE_SURFACE_HEADER]: "chatgpt",
            },
          }),
        ),
      );
      expect(response.result.isError).not.toBe(true);
      for (const context of [response.result.structuredContent, textContext(response.result)]) {
        expect(context.project).toMatchObject({ id: boundProjectId, projectKey: "bobai" });
        expect(context.request).toMatchObject({ projectKey: "bobai", surface: "codex" });
      }
    },
  );

  it("uses the returned UUID for a checkpoint while preserving binding and retry semantics", async () => {
    const { gateway, store } = fixture();
    const send = async (body: unknown) =>
      rpc(
        await gateway(
          new Request("https://bob-core.test/mcp/sync", request(body, interfaceToken)),
        ),
      );
    const context = await send(call("bob_get_context", { projectKey: "another-project" }));
    expect(context.result.structuredContent.project.id).toBe(boundProjectId);

    const checkpoint = {
      operationId: "mcp-identity-checkpoint-0001",
      expectedProjectId: context.result.structuredContent.project.id,
      outcome: "Verified the bound project identity.",
      unresolved: [],
      nextActions: ["Continue the bound project."],
    };
    const rejected = await send(call("bob_record_handoff", {
      ...checkpoint,
      expectedProjectId: otherProjectId,
    }));
    expect(rejected.result.isError).toBe(true);
    expect(await store.listHandoffs("rick", boundProjectId, 10)).toEqual([]);
    expect(await store.listHandoffs("rick", otherProjectId, 10)).toEqual([]);

    const saved = await send(call("bob_record_handoff", checkpoint));
    expect(saved.result.isError).not.toBe(true);
    expect(saved.result.structuredContent).toMatchObject({
      handoff: { outcome: checkpoint.outcome, source: "codex" },
      idempotent: false,
    });
    expect(textContext(saved.result)).toEqual(saved.result.structuredContent);

    const retry = await send(call("bob_record_handoff", checkpoint));
    expect(retry.result.isError).not.toBe(true);
    expect(retry.result.structuredContent).toEqual({
      ...saved.result.structuredContent,
      idempotent: true,
    });
    const stored = await store.listHandoffs("rick", boundProjectId, 10);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ projectId: boundProjectId, source: "codex" });
    expect(await store.listHandoffs("rick", otherProjectId, 10)).toEqual([]);
  });

  it("rejects a stale UUID through REST before writing, then accepts the correct binding", async () => {
    const { app, store } = fixture();
    const checkpoint = {
      operationId: "rest-identity-checkpoint-0001", expectedProjectId: otherProjectId,
      outcome: "Verified REST project binding.", unresolved: [], nextActions: [],
    };
    const rejected = await app.request("/v1/handoffs?project=bobai", request(checkpoint));
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({ error: { code: "project_binding_changed" } });
    expect(await store.listHandoffs("rick", boundProjectId, 10)).toEqual([]);
    expect(await store.listRecentEvents("rick", boundProjectId, 10)).toEqual([]);
    const accepted = await app.request("/v1/handoffs?project=bobai", request({
      ...checkpoint, expectedProjectId: boundProjectId,
    }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ idempotent: false });
    expect(await store.listHandoffs("rick", otherProjectId, 10)).toEqual([]);
  });

  it("preserves legacy REST payloads and original provenance on an authorized MCP retry", async () => {
    const { app, gateway, store } = fixture();
    const checkpoint = {
      operationId: "legacy-rest-checkpoint-0001",
      outcome: "An older client omitted expectedProjectId.", unresolved: [], nextActions: [],
    };
    const first = await app.request("/v1/handoffs?project=bobai", request(checkpoint));
    expect(first.status).toBe(200);
    const saved = await first.json();
    expect(saved).toMatchObject({ idempotent: false, handoff: { source: "bobai" } });
    const retry = await rpc(await gateway(new Request("https://bob-core.test/mcp/sync",
      request(call("bob_record_handoff", checkpoint), interfaceToken))));
    expect(retry.result.structuredContent).toMatchObject({
      idempotent: true, handoff: { id: saved.handoff.id, source: "bobai" },
    });
    expect(await store.listHandoffs("rick", boundProjectId, 10)).toHaveLength(1);
    const events = await store.listRecentEvents("rick", boundProjectId, 10);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: "bobai", details: { interfaceId: "owner-primary" } });
  });
});
