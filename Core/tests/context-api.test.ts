import { describe, expect, it, vi } from "vitest";

import type { AIProvider } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectItem } from "../src/context/types.js";
import { InMemoryMemoryStore } from "../src/memory/in-memory-store.js";
import { MemoryService } from "../src/memory/service.js";
import {
  createTestConfig,
  TEST_DEVICE_TOKEN,
} from "./test-config.js";

const bobAIProject: ProjectItem = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "rick",
  projectKey: "bobai",
  name: "BobAI",
  description: "Private personal-AI platform.",
  repository: "boisey9/BobAI",
  status: "active",
  metadata: {},
  createdAt: "2026-08-23T07:00:00.000Z",
  updatedAt: "2026-08-23T07:10:00.000Z",
};

function authorizationHeaders() {
  return {
    authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
  };
}

function createContextApp() {
  const generate = vi.fn<AIProvider["generate"]>().mockResolvedValue({
    text: "unused",
    model: "test-model",
  });
  const memoryService = new MemoryService(new InMemoryMemoryStore(), "rick", 6);
  const sharedContextService = new SharedContextService(
    new InMemorySharedContextStore({ projects: [bobAIProject] }),
    "rick",
    memoryService,
    6,
  );
  const app = createApp({
    config: createTestConfig({ sharedContextEnabled: true }),
    aiProvider: { generate },
    memoryService,
    sharedContextService,
  });

  return { app, memoryService };
}

describe("Shared Context API", () => {
  it("keeps shared context behind Bob Core authentication", async () => {
    const { app } = createContextApp();
    const response = await app.request("/v1/context?project=bobai");

    expect(response.status).toBe(401);
  });

  it("validates the project, task, and surface request", async () => {
    const { app } = createContextApp();
    const response = await app.request(
      "/v1/context?project=bad%20project&surface=codex",
      { headers: authorizationHeaders() },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_context_request" },
    });
  });

  it("returns an explicit not-found response for an unknown project", async () => {
    const { app } = createContextApp();
    const response = await app.request("/v1/context?project=unknown", {
      headers: authorizationHeaders(),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "shared_context_project_not_found" },
    });
  });

  it("returns one structured Bob Core context package", async () => {
    const { app, memoryService } = createContextApp();
    await memoryService.remember("BobAI Shared Context is the next Core milestone.", {
      scope: "project",
      subject: "BobAI Shared Context",
      metadata: { projectKey: "bobai" },
    });

    const response = await app.request(
      "/v1/context?project=bobai&task=Shared%20Context&surface=codex",
      { headers: authorizationHeaders() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      context: {
        authority: {
          source: "bob-core",
          version: "0.2",
        },
        request: {
          projectKey: "bobai",
          task: "Shared Context",
          surface: "codex",
        },
        project: {
          name: "BobAI",
          repository: "boisey9/BobAI",
        },
      },
    });
    expect(body.context.memories).toHaveLength(1);
  });
});
