import { describe, expect, it } from "vitest";

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

const createdAt = "2026-08-23T07:00:00.000Z";
const updatedAt = "2026-08-23T07:10:00.000Z";

function project(): ProjectItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "rick",
    projectKey: "bobai",
    name: "BobAI",
    description: "Private personal-AI platform.",
    repository: "boisey9/BobAI",
    status: "active",
    metadata: {},
    createdAt,
    updatedAt,
  };
}

function decision(status: DecisionItem["status"]): DecisionItem {
  return {
    id:
      status === "active"
        ? "22222222-2222-4222-8222-222222222222"
        : "33333333-3333-4333-8333-333333333333",
    ownerId: "rick",
    projectId: project().id,
    title: status === "active" ? "Branch policy" : "Old provider choice",
    decision:
      status === "active"
        ? "Use a feature branch and PR before main."
        : "Use a superseded provider.",
    reason: "Protect production state.",
    status,
    supersedesDecisionId: null,
    source: "chatgpt",
    metadata: {},
    createdAt,
    updatedAt,
  };
}

function task(status: TaskItem["status"]): TaskItem {
  return {
    id:
      status === "in_progress"
        ? "44444444-4444-4444-8444-444444444444"
        : "55555555-5555-4555-8555-555555555555",
    ownerId: "rick",
    projectId: project().id,
    title:
      status === "in_progress" ? "Build Shared Context" : "Old completed task",
    description: null,
    status,
    priority: "high",
    source: "codex",
    dueAt: null,
    version: 1,
    metadata: {},
    createdAt,
    updatedAt,
    completedAt: status === "done" ? updatedAt : null,
  };
}

function event(): ProjectEventItem {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    ownerId: "rick",
    projectId: project().id,
    eventType: "implementation",
    summary: "Shared Context data layer added.",
    source: "codex",
    details: {},
    createdAt: updatedAt,
  };
}

describe("SharedContextService", () => {
  it("assembles active project state and only relevant project memory", async () => {
    const memoryService = new MemoryService(
      new InMemoryMemoryStore(),
      "rick",
      6,
    );
    await memoryService.remember(
      "BobAI voice screen uses the animated Bob Core.",
      {
        scope: "project",
        subject: "BobAI voice screen",
        metadata: { projectKey: "bobai" },
      },
    );
    await memoryService.remember(
      "BobAI voice screen uses a different layout.",
      {
        scope: "project",
        subject: "BobAI voice screen",
        metadata: { projectKey: "other-project" },
      },
    );

    const store = new InMemorySharedContextStore({
      projects: [project()],
      decisions: [decision("active"), decision("superseded")],
      tasks: [task("in_progress"), task("done")],
      events: [event()],
    });
    const service = new SharedContextService(store, "rick", memoryService, 6);

    const result = await service.build({
      projectKey: "BobAI",
      task: "voice screen",
      surface: "codex",
    });

    expect(result.authority.source).toBe("bob-core");
    expect(result.request).toMatchObject({
      projectKey: "bobai",
      task: "voice screen",
      surface: "codex",
    });
    expect(result.project.repository).toBe("boisey9/BobAI");
    expect(result.decisions.map((item) => item.status)).toEqual(["active"]);
    expect(result.tasks.map((item) => item.status)).toEqual(["in_progress"]);
    expect(result.recentEvents).toHaveLength(1);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]).toMatchObject({
      projectKey: "bobai",
      content: "BobAI voice screen uses the animated Bob Core.",
    });
  });
});
