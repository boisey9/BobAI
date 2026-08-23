import { describe, expect, it, vi } from "vitest";

import { mountBobActivity } from "../src/activity/mount.js";
import type { AIProvider } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectEventItem, ProjectItem } from "../src/context/types.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const project: ProjectItem = {
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

const seededEvent: ProjectEventItem = {
  id: "22222222-2222-4222-8222-222222222222",
  ownerId: "rick",
  projectId: project.id,
  eventType: "deployment.completed",
  summary: "Bob Core production deployment completed.",
  source: "vercel",
  details: { status: "success" },
  createdAt: "2026-08-23T08:20:00.000Z",
};

function authorizationHeaders() {
  return { authorization: `Bearer ${TEST_DEVICE_TOKEN}` };
}

function createActivityApp() {
  const generate = vi.fn<AIProvider["generate"]>().mockResolvedValue({
    text: "unused",
    model: "test-model",
  });
  const store = new InMemorySharedContextStore({
    projects: [project],
    events: [seededEvent],
  });
  const sharedContextService = new SharedContextService(store, "rick");
  const app = createApp({
    config: createTestConfig({ sharedContextEnabled: true }),
    aiProvider: { generate },
    sharedContextService,
  });
  mountBobActivity(app, sharedContextService);

  return { app, sharedContextService };
}

describe("Bob activity monitor API", () => {
  it("keeps activity behind Bob Core authentication", async () => {
    const { app } = createActivityApp();
    const response = await app.request("/v1/activity?project=bobai");

    expect(response.status).toBe(401);
  });

  it("returns project-labelled operational activity", async () => {
    const { app } = createActivityApp();
    const response = await app.request("/v1/activity?project=bobai&limit=20", {
      headers: authorizationHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activity).toEqual([
      expect.objectContaining({
        projectKey: "bobai",
        projectName: "BobAI",
        eventType: "deployment.completed",
        source: "vercel",
        details: { status: "success" },
      }),
    ]);
  });

  it("records context retrieval without storing the task text", async () => {
    const { app, sharedContextService } = createActivityApp();
    const privateTask = "Private customer detail that must not enter activity logs";

    await sharedContextService.build({
      projectKey: "bobai",
      surface: "codex",
      task: privateTask,
    });

    const response = await app.request("/v1/activity?project=bobai", {
      headers: authorizationHeaders(),
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.activity[0]).toMatchObject({
      eventType: "context.retrieved",
      summary: "Shared context retrieved by codex.",
      source: "codex",
      details: {
        surface: "codex",
        hasTask: true,
      },
    });
    expect(serialized).not.toContain(privateTask);
  });

  it("returns a safe not-found response for an unknown project", async () => {
    const { app } = createActivityApp();
    const response = await app.request("/v1/activity?project=unknown", {
      headers: authorizationHeaders(),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "shared_context_project_not_found" },
    });
  });
});
