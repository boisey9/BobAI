import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AIProvider } from "../src/ai/provider.js";
import { InMemoryMemoryStore } from "../src/memory/in-memory-store.js";
import { MemoryService } from "../src/memory/service.js";
import {
  createTestConfig,
  TEST_DEVICE_TOKEN,
} from "./test-config.js";

function createTestApp(memoryEnabled = false) {
  const generate = vi.fn<AIProvider["generate"]>().mockResolvedValue({
    text: "Bob Core is online.",
    model: "test-model",
  });
  const memoryService = memoryEnabled
    ? new MemoryService(new InMemoryMemoryStore(), "rick", 6)
    : undefined;
  const app = createApp({
    config: createTestConfig({ memoryEnabled }),
    aiProvider: { generate },
    memoryService,
  });

  return { app, generate, memoryService };
}

function authorizationHeaders() {
  return {
    authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
  };
}

function jsonHeaders() {
  return {
    ...authorizationHeaders(),
    "content-type": "application/json",
  };
}

function chatRequest(body: unknown) {
  return {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  } as const;
}

describe("Bob Core API", () => {
  it("exposes a public health endpoint", async () => {
    const { app } = createTestApp();
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "bob-core",
      version: "0.2.0",
    });
  });

  it("protects private endpoints with a bearer token", async () => {
    const { app } = createTestApp();
    const response = await app.request("/v1/status");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        code: "authentication_required",
      },
    });
  });

  it("reports provider, model, and disabled memory status", async () => {
    const { app } = createTestApp();
    const response = await app.request("/v1/status", {
      headers: authorizationHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ready",
      provider: "openai",
      model: "test-model",
      memory: {
        enabled: false,
        storage: "disabled",
        capture: "explicit-only",
        retrieval: "disabled",
      },
    });
  });

  it("reports enabled memory status", async () => {
    const { app } = createTestApp(true);
    const response = await app.request("/v1/status", {
      headers: authorizationHeaders(),
    });

    expect(await response.json()).toMatchObject({
      memory: {
        enabled: true,
        storage: "neon",
        capture: "explicit-only",
        retrieval: "automatic",
      },
    });
  });

  it("rejects an invalid bearer token", async () => {
    const { app } = createTestApp();
    const response = await app.request("/v1/status", {
      headers: {
        authorization: "Bearer definitely-not-the-right-token",
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        code: "invalid_device_token",
      },
    });
  });

  it("validates malformed chat requests", async () => {
    const { app, generate } = createTestApp();
    const response = await app.request(
      "/v1/chat",
      chatRequest({
        messages: [{ role: "assistant", content: "Not a user turn" }],
      }),
    );

    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns a provider response for a valid authenticated request", async () => {
    const { app, generate } = createTestApp();
    const response = await app.request(
      "/v1/chat",
      chatRequest({
        conversationId: "4b8805d6-a687-4bcf-b2a8-9d30eeb675c7",
        messages: [{ role: "user", content: "Hello Bob" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      conversationId: "4b8805d6-a687-4bcf-b2a8-9d30eeb675c7",
      message: {
        role: "assistant",
        content: "Bob Core is online.",
      },
      model: "test-model",
    });
    expect(generate).toHaveBeenCalledWith([
      { role: "user", content: "Hello Bob" },
    ]);
  });

  it("returns a clear error when a memory command is used before setup", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/v1/chat",
      chatRequest({
        messages: [
          {
            role: "user",
            content: "Bob, remember that I prefer to be called Rick.",
          },
        ],
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: {
        code: "memory_not_configured",
      },
    });
  });

  it("stores an explicit chat memory without calling the model", async () => {
    const { app, generate, memoryService } = createTestApp(true);
    const response = await app.request(
      "/v1/chat",
      chatRequest({
        messages: [
          {
            role: "user",
            content: "Bob, remember that I prefer to be called Rick.",
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      message: {
        role: "assistant",
      },
      model: "bob-memory-v0.1",
    });
    expect(body.message.content).toContain("I'll remember");
    expect(generate).not.toHaveBeenCalled();
    expect(await memoryService?.list()).toHaveLength(1);
  });

  it("retrieves relevant approved memory for an ordinary AI request", async () => {
    const { app, generate, memoryService } = createTestApp(true);
    await memoryService?.remember("I prefer to be called Rick.");

    const response = await app.request(
      "/v1/chat",
      chatRequest({
        messages: [
          {
            role: "user",
            content: "What do I prefer to be called?",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      [
        {
          role: "user",
          content: "What do I prefer to be called?",
        },
      ],
      {
        memoryContext: expect.stringContaining(
          "I prefer to be called Rick.",
        ),
      },
    );
  });

  it("creates, lists, searches, and deletes memory through the authenticated API", async () => {
    const { app } = createTestApp(true);
    const createdResponse = await app.request("/v1/memories", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        content: "I prefer concise spoken answers.",
        subject: "Response style",
      }),
    });
    const created = await createdResponse.json();

    expect(createdResponse.status).toBe(201);
    expect(created).toMatchObject({
      created: true,
      memory: {
        scope: "preference",
        subject: "Response style",
        content: "I prefer concise spoken answers.",
      },
    });

    const listedResponse = await app.request(
      "/v1/memories?q=concise&limit=5",
      { headers: authorizationHeaders() },
    );
    const listed = await listedResponse.json();

    expect(listedResponse.status).toBe(200);
    expect(listed.memories).toHaveLength(1);

    const deletedResponse = await app.request(
      `/v1/memories/${created.memory.id}`,
      {
        method: "DELETE",
        headers: authorizationHeaders(),
      },
    );

    expect(deletedResponse.status).toBe(200);

    const afterDelete = await app.request("/v1/memories", {
      headers: authorizationHeaders(),
    });
    expect((await afterDelete.json()).memories).toEqual([]);
  });

  it("rejects secrets submitted to the memory API", async () => {
    const { app } = createTestApp(true);
    const response = await app.request("/v1/memories", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        content:
          "My API key is sk-abcdefghijklmnopqrstuvwxyz1234567890",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "memory_policy_rejected",
      },
    });
  });

  it("returns a safe actionable message for exhausted API quota", async () => {
    const generate = vi
      .fn<AIProvider["generate"]>()
      .mockRejectedValue(
        Object.assign(new Error("upstream detail must stay private"), {
          name: "RateLimitError",
          status: 429,
          code: "insufficient_quota",
          request_id: "req_quota_test",
        }),
      );
    const app = createApp({
      config: createTestConfig(),
      aiProvider: { generate },
    });

    const response = await app.request(
      "/v1/chat",
      chatRequest({
        messages: [{ role: "user", content: "Hello Bob" }],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: "openai_quota_exhausted",
      },
    });
    expect(body.error.message).toContain("billing or credits");
    expect(JSON.stringify(body)).not.toContain("upstream detail");
    expect(JSON.stringify(body)).not.toContain("req_quota_test");
  });
});
