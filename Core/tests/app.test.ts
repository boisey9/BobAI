import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AIProvider } from "../src/ai/provider.js";
import type { BobCoreConfig } from "../src/config.js";

const DEVICE_TOKEN =
  "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789";

const config: BobCoreConfig = {
  nodeEnvironment: "test",
  port: 8_787,
  aiProvider: "openai",
  aiAPIKey: "test-openai-api-key-not-used-in-unit-tests",
  aiModel: "test-model",
  aiBaseURL: undefined,
  databaseURL: undefined,
  ownerId: "rick",
  memoryEnabled: false,
  memoryRetrievalLimit: 6,
  deviceToken: DEVICE_TOKEN,
  maxOutputTokens: 700,
};

function createTestApp() {
  const generate = vi.fn<AIProvider["generate"]>().mockResolvedValue({
    text: "Bob Core is online.",
    model: "test-model",
  });

  const app = createApp({
    config,
    aiProvider: { generate },
  });

  return { app, generate };
}

function chatRequest(body: unknown) {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${DEVICE_TOKEN}`,
      "content-type": "application/json",
    },
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
      version: "0.1.0",
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

  it("reports the configured provider and model", async () => {
    const { app } = createTestApp();
    const response = await app.request("/v1/status", {
      headers: {
        authorization: `Bearer ${DEVICE_TOKEN}`,
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ready",
      provider: "openai",
      model: "test-model",
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
      config,
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
