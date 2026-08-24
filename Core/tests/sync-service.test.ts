import { describe, expect, it } from "vitest";

import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import {
  SharedContextOperationConflictError,
  SharedContextService,
} from "../src/context/service.js";
import type { ProjectItem } from "../src/context/types.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-24T18:00:00.000Z";

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

const actor = {
  interfaceId: "copilot-bobai",
  surface: "copilot" as const,
};

function createService() {
  const store = new InMemorySharedContextStore({ projects: [project] });
  const service = new SharedContextService(store, "rick");
  return { service, store };
}

describe("Bob Core two-way project sync", () => {
  it("creates tasks idempotently and records auditable activity", async () => {
    const { service, store } = createService();

    const first = await service.createSyncedTask({
      projectKey: "bobai",
      operationId: "copilot-task-create-0001",
      title: "Connect Copilot",
      description: "Use scoped Bob Core MCP.",
      priority: "high",
      actor,
    });
    const retry = await service.createSyncedTask({
      projectKey: "bobai",
      operationId: "copilot-task-create-0001",
      title: "Connect Copilot",
      description: "Use scoped Bob Core MCP.",
      priority: "high",
      actor,
    });

    expect(first.created).toBe(true);
    expect(first.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect(retry.task.title).toBe("Connect Copilot");
    expect(await store.listActiveTasks("rick", projectId, 20)).toHaveLength(1);

    const events = await store.listRecentEvents("rick", projectId, 20);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "task.created",
      source: "copilot",
      details: {
        operationId: "copilot-task-create-0001",
        interfaceId: "copilot-bobai",
      },
    });
  });

  it("updates task state without exposing cancellation or deletion", async () => {
    const { service, store } = createService();

    await service.createSyncedTask({
      projectKey: "bobai",
      operationId: "copilot-task-create-0002",
      title: "Validate Copilot sync",
      actor,
    });

    const updated = await service.updateSyncedTask({
      projectKey: "bobai",
      operationId: "copilot-task-update-0002",
      title: "Validate Copilot sync",
      status: "done",
      priority: "high",
      actor,
    });
    const retry = await service.updateSyncedTask({
      projectKey: "bobai",
      operationId: "copilot-task-update-0002",
      title: "Validate Copilot sync",
      status: "done",
      priority: "high",
      actor,
    });

    expect(updated.changed).toBe(true);
    expect(updated.task.status).toBe("done");
    expect(updated.task.completedAt).not.toBeNull();
    expect(retry.idempotent).toBe(true);
    expect(await store.listActiveTasks("rick", projectId, 20)).toHaveLength(0);
  });

  it("records progress events idempotently", async () => {
    const { service, store } = createService();

    const first = await service.recordSyncedEvent({
      projectKey: "bobai",
      operationId: "copilot-event-0001",
      eventType: "work.progress",
      summary: "Copilot retrieved Bob context.",
      actor,
    });
    const retry = await service.recordSyncedEvent({
      projectKey: "bobai",
      operationId: "copilot-event-0001",
      eventType: "work.progress",
      summary: "Copilot retrieved Bob context.",
      actor,
    });

    expect(first.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect(await store.listRecentEvents("rick", projectId, 20)).toHaveLength(1);
  });

  it("turns decision writes into owner-review proposals", async () => {
    const { service, store } = createService();

    const result = await service.proposeDecision({
      projectKey: "bobai",
      operationId: "copilot-decision-0001",
      title: "Use two-way MCP sync",
      proposal: "Use scoped write tools for tasks and activity.",
      reason: "All interfaces should share current state.",
      actor,
    });

    expect(result.status).toBe("pending_review");
    expect(result.reviewTask.title).toBe(
      "Review decision: Use two-way MCP sync",
    );
    expect(result.reviewTask.priority).toBe("high");
    expect(
      await store.listActiveDecisions("rick", projectId, 20),
    ).toHaveLength(0);

    const events = await store.listRecentEvents("rick", projectId, 20);
    expect(events[0]).toMatchObject({
      eventType: "decision.proposed",
      source: "copilot",
      details: {
        approvalRequired: true,
        decisionTitle: "Use two-way MCP sync",
      },
    });
  });

  it("rejects reuse of an operation id for a different write", async () => {
    const { service } = createService();

    await service.recordSyncedEvent({
      projectKey: "bobai",
      operationId: "copilot-conflict-0001",
      eventType: "work.started",
      summary: "Started.",
      actor,
    });

    await expect(
      service.createSyncedTask({
        projectKey: "bobai",
        operationId: "copilot-conflict-0001",
        title: "Different write",
        actor,
      }),
    ).rejects.toBeInstanceOf(SharedContextOperationConflictError);
  });
});
