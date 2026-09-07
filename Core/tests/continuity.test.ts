import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import {
  SharedContextService,
  SharedContextOperationConflictError,
  SharedContextTaskVersionError,
  SharedContextTaskAmbiguousError,
} from "../src/context/service.js";
import { InMemoryMemoryStore } from "../src/memory/in-memory-store.js";
import { MemoryService } from "../src/memory/service.js";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";
import type { ProjectItem } from "../src/context/types.js";

const actor = { interfaceId: "codex-test", surface: "codex" as const };
function setup() {
  const projects: ProjectItem[] = ["bobai", "personal", "other"].map(
    (projectKey) => ({
      id: crypto.randomUUID(),
      ownerId: "rick",
      projectKey,
      name: projectKey,
      description: null,
      repository: null,
      status: "active",
      metadata: { auth: { interfaceCredentials: [{ hash: "must-not-leak" }] } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  const store = new InMemorySharedContextStore({ projects });
  const memoryStore = new InMemoryMemoryStore();
  const memory = new MemoryService(memoryStore, "rick", 6);
  const service = new SharedContextService(store, "rick", memory);
  const config = createTestConfig({ memoryEnabled: true });
  const generate = vi
    .fn()
    .mockResolvedValue({ text: "Context received", model: "test" });
  const app = createApp({
    config,
    aiProvider: { generate },
    memoryService: memory,
    sharedContextService: service,
  });
  return {
    projects,
    store,
    memoryStore,
    memory,
    service,
    app,
    config,
    generate,
  };
}
function request(
  path: string,
  body: unknown,
  method = "POST",
  token = TEST_DEVICE_TOKEN,
) {
  return new Request(`https://bob.test${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("dependable continuity", () => {
  it("keeps the baseline when unrelated, personal, sensitive or unapproved memories outrank it", async () => {
    const { memory, memoryStore, service } = setup();
    const baseline = await memory.remember(
      "The database preserves project identity.",
      { scope: "project", metadata: { projectKey: "bobai" } },
    );
    for (let i = 0; i < 40; i++)
      await memory.remember(`Voice task matching words ${i}`, {
        metadata: i % 2 ? { projectKey: "other" } : {},
        scope: i % 2 ? "project" : "personal",
      });
    await memory.remember("Voice task sensitive", {
      metadata: { projectKey: "bobai" },
      scope: "project",
      sensitivity: "sensitive",
    });
    await memory.remember("Voice task proposal", {
      metadata: { projectKey: "bobai", approvalStatus: "pending" },
      scope: "project",
    });
    await memoryStore.create({
      ownerId: "someone-else",
      scope: "project",
      content: "Voice task foreign owner",
      source: "test",
      subject: null,
      sensitivity: "normal",
      metadata: { projectKey: "bobai" },
    });
    const result = await service.build({
      projectKey: "bobai",
      task: "A long voice task objective with many words",
    });
    expect(result.memories.map((m) => m.id)).toEqual([baseline.item.id]);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    const personal = await service.build({ projectKey: "personal" });
    expect(personal.memories.every((m) => m.projectKey === null)).toBe(true);
  });

  it("makes concurrent retries atomic and replays the saved task after subsequent edits", async () => {
    const { service, store, projects } = setup();
    const input = {
      projectKey: "bobai",
      operationId: "concurrent-create",
      title: "Reliable capture",
      actor,
    };
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.createSyncedTask(input)),
    );
    expect(new Set(results.map((r) => r.task.id)).size).toBe(1);
    expect(results.filter((r) => !r.idempotent)).toHaveLength(1);
    expect(
      await store.listRecentEvents("rick", projects[0]!.id, 100),
    ).toHaveLength(1);
    const task = results[0]!.task;
    await service.updateSyncedTask({
      projectKey: "bobai",
      operationId: "update-create-task",
      taskId: task.id,
      expectedVersion: task.version,
      status: "done",
      actor,
    });
    expect((await service.createSyncedTask(input)).task).toEqual(task);
    expect(
      (
        await service.createSyncedTask({
          ...input,
          actor: { interfaceId: "replacement-device", surface: "bobai" },
        })
      ).task,
    ).toEqual(task);
    await expect(
      service.createSyncedTask({ ...input, title: "Different request" }),
    ).rejects.toBeInstanceOf(SharedContextOperationConflictError);
    await expect(
      service.updateSyncedTask({
        projectKey: "bobai",
        operationId: "stale-update-task",
        taskId: task.id,
        expectedVersion: task.version,
        status: "blocked",
        actor,
      }),
    ).rejects.toBeInstanceOf(SharedContextTaskVersionError);
  });

  it("rejects historical duplicate titles without deleting candidates", async () => {
    const { service, store, projects } = setup();
    const input = {
      ownerId: "rick",
      projectId: projects[0]!.id,
      title: "Historical duplicate",
      description: null,
      priority: "normal" as const,
      source: "test",
    };
    await store.createTask(input);
    await store.createTask(input);
    await expect(
      service.updateSyncedTask({
        projectKey: "bobai",
        operationId: "ambiguous-update",
        title: input.title,
        status: "done",
        actor,
      }),
    ).rejects.toBeInstanceOf(SharedContextTaskAmbiguousError);
    expect(
      await store.listActiveTasks("rick", projects[0]!.id, 20),
    ).toHaveLength(2);
  });

  it("returns unavailable sources honestly and keeps an unchanged revision stable", async () => {
    const { service, store } = setup();
    const initial = await service.build({ projectKey: "bobai" });
    expect((await service.build({ projectKey: "bobai" })).revision).toBe(
      initial.revision,
    );
    vi.spyOn(store, "listActiveTasks").mockRejectedValue(
      new Error("database read failed"),
    );
    const partial = await service.build({ projectKey: "bobai" });
    expect(partial.partial).toBe(true);
    expect(partial.sources.tasks.status).toBe("unavailable");
  });

  it("reports dependency failures without blocking deterministic task capture during an AI outage", async () => {
    const { app, generate } = setup();
    const headers = { authorization: `Bearer ${TEST_DEVICE_TOKEN}` };
    const initial = await (await app.request("/v1/status", { headers })).json();
    expect(initial.status).toBe("degraded");
    expect(initial.checks.context.status).toBe("available");
    expect(initial.checks.provider.status).toBe("not_checked");
    expect(initial.checks.scheduler.status).toBe("not_configured");
    generate.mockRejectedValue(new Error("Provider offline"));
    expect(
      (
        await app.fetch(
          request("/v1/chat", {
            projectKey: "personal",
            messages: [{ role: "user", content: "Hello" }],
          }),
        )
      ).status,
    ).toBe(502);
    expect(
      (
        await app.fetch(
          request("/v1/tasks", {
            operationId: "capture-during-outage",
            title: "Keep this commitment",
          }),
        )
      ).status,
    ).toBe(201);
    const degraded = await (
      await app.request("/v1/status", { headers })
    ).json();
    expect(degraded.checks.provider.status).toBe("unavailable");
    expect(degraded.checks.context.status).toBe("available");
  });

  it("uses the same workspace context in chat and rejects personal reads and memory writes by project credentials", async () => {
    const { service, memory, app, config, generate } = setup();
    await memory.remember("Personal only", { scope: "personal" });
    await memory.remember("Shared project fact", {
      scope: "project",
      metadata: { projectKey: "bobai" },
    });
    const gateway = createInterfaceCredentialGateway(
      (r) => app.fetch(r),
      config,
      async () => ({
        id: "project-client",
        surface: "codex",
        projectKey: "bobai",
        scopes: ["chat:use", "context:read", "tasks:write"],
      }),
    );
    const response = await gateway(
      request(
        "/v1/chat",
        {
          projectKey: "bobai",
          messages: [{ role: "user", content: "Resume work" }],
        },
        "POST",
        "project-test-token",
      ),
    );
    expect(response.status).toBe(200);
    const expected = await service.build({
      projectKey: "bobai",
      task: "Resume work",
      surface: "codex",
    });
    expect(generate.mock.calls[0]![1].sharedContext.revision).toBe(
      expected.revision,
    );
    expect(JSON.stringify(generate.mock.calls)).not.toContain("Personal only");
    expect(
      (
        await gateway(
          request(
            "/v1/chat",
            {
              projectKey: "personal",
              messages: [{ role: "user", content: "Hello" }],
            },
            "POST",
            "project-test-token",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await gateway(
          request(
            "/v1/chat",
            {
              messages: [
                { role: "user", content: "remember: Unapproved change" },
              ],
            },
            "POST",
            "project-test-token",
          ),
        )
      ).status,
    ).toBe(403);
  });

  it("exposes REST capture with IDs, versions, due dates and reconciliation conflicts", async () => {
    const { app } = setup();
    const created = await app.fetch(
      request("/v1/tasks?project=personal", {
        operationId: "rest-task-create",
        title: "Call tomorrow",
        dueAt: "2026-09-08T10:00:00-04:00",
      }),
    );
    expect(created.status).toBe(201);
    const { task } = await created.json();
    expect(task.dueAt).toBe("2026-09-08T14:00:00.000Z");
    const anotherCapture = await app.fetch(
      request("/v1/tasks?project=personal", {
        operationId: "rest-task-separate",
        title: "Call tomorrow",
      }),
    );
    expect(anotherCapture.status).toBe(201);
    expect((await anotherCapture.json()).task.id).not.toBe(task.id);
    const updated = await app.fetch(
      request(
        `/v1/tasks/${task.id}?project=personal`,
        {
          operationId: "rest-task-update",
          expectedVersion: task.version,
          status: "done",
        },
        "PATCH",
      ),
    );
    expect(updated.status).toBe(200);
    const stale = await app.fetch(
      request(
        `/v1/tasks/${task.id}?project=personal`,
        {
          operationId: "rest-stale-update",
          expectedVersion: task.version,
          status: "blocked",
        },
        "PATCH",
      ),
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.current.version).toBe(2);
    expect(
      (
        await app.fetch(
          request(
            `/v1/tasks/${task.id}?project=other`,
            {
              operationId: "rest-cross-project",
              expectedVersion: 2,
              status: "done",
            },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(404);
  });
});
