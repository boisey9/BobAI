import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectItem } from "../src/context/types.js";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const ownerId = "synthetic-workbench-owner";
const fixtureDate = "2026-11-19T12:00:00.000Z";
const projectToken = "synthetic-workbench-project-token";
const projectTokenHash = createHash("sha256").update(projectToken).digest("hex");

function project(id: string, projectKey: string): ProjectItem {
  return {
    id, ownerId, projectKey, name: projectKey, repository: null, description: null,
    status: "active", metadata: {}, createdAt: fixtureDate, updatedAt: fixtureDate,
  };
}

function fixture() {
  const first = project("99999999-9999-4999-8999-000000000001", "workbench-sample-a");
  const second = project("99999999-9999-4999-8999-000000000002", "workbench-sample-b");
  const store = new InMemorySharedContextStore({ projects: [first, second] });
  const config = createTestConfig({ ownerId, sharedContextEnabled: true });
  const generate = vi.fn(async () => { throw new Error("Task capture does not invoke inference"); });
  const app = createApp({
    config,
    aiProvider: { generate },
    sharedContextService: new SharedContextService(store, ownerId),
  });
  const gateway = createInterfaceCredentialGateway(
    request => app.fetch(request),
    config,
    async hash => hash === projectTokenHash ? {
      id: "synthetic-workbench-interface",
      surface: "web",
      projectKey: first.projectKey,
      scopes: ["context:read", "tasks:write"],
    } : null,
  );

  function request(
    method: "GET" | "POST" | "PATCH",
    projectKey: string,
    options: { body?: object; taskId?: string; token?: string } = {},
  ) {
    const url = new URL(options.taskId ? `/v1/tasks/${options.taskId}` : "/v1/tasks", "https://bob-workbench.test");
    url.searchParams.set("project", projectKey);
    const headers = new Headers({ authorization: `Bearer ${options.token ?? projectToken}` });
    if (options.body) headers.set("content-type", "application/json");
    const request = new Request(url, {
      method, headers, ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    return gateway(request);
  }

  const draft = {
    operationId: "workbench-synthetic-create",
    expectedProjectId: first.id,
    title: "Verify sample review evidence",
    description: "Check the synthetic delivery record.",
    dueAt: "2026-11-20T09:00:00-05:00",
    priority: "high",
  };
  return { first, second, store, generate, request, draft };
}

describe("Workbench task capture against Core REST", () => {
  it("returns an original receipt on an exact retry and current task detail on readback", async () => {
    const { first, store, generate, request, draft } = fixture();
    const created = await request("POST", first.projectKey, { body: draft });
    expect(created.status).toBe(201);
    const receipt = await created.json();
    expect(receipt).toMatchObject({
      created: true, changed: true, idempotent: false,
      task: {
        id: expect.any(String), projectId: first.id, version: 1, status: "open",
        title: draft.title, description: draft.description, priority: draft.priority,
        dueAt: "2026-11-20T14:00:00.000Z", source: "web",
      },
    });
    const taskId = receipt.task.id;

    const update = await request("PATCH", first.projectKey, {
      taskId,
      body: {
        operationId: "workbench-synthetic-update", expectedProjectId: first.id,
        expectedVersion: 1, status: "done",
      },
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      changed: true, task: { id: taskId, status: "done", version: 2 },
    });

    const replay = await request("POST", first.projectKey, { body: draft });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ...receipt, idempotent: true });

    const conflict = await request("POST", first.projectKey, {
      body: { ...draft, description: "Changed request under the original operation ID." },
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "operation_conflict" } });

    const detail = await request("GET", first.projectKey, { taskId });
    expect(detail.status).toBe(200);
    expect(detail.headers.get("cache-control")).toBe("no-store");
    expect(await detail.json()).toMatchObject({
      authority: "bob-core", project: { id: first.id, projectKey: first.projectKey },
      task: { id: taskId, version: 2, status: "done", description: draft.description },
    });
    expect(await store.listTasks(ownerId, first.id, 10)).toMatchObject([{ id: taskId, version: 2 }]);
    const events = await store.listRecentEvents(ownerId, first.id, 10);
    expect(events.filter(event => event.eventType === "task.created")).toHaveLength(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it("denies a mismatched binding and rejects cross-project creation and readback", async () => {
    const { first, second, store, generate, request, draft } = fixture();
    const wrongId = await request("POST", first.projectKey, {
      body: { ...draft, expectedProjectId: second.id },
    });
    expect(wrongId.status).toBe(409);
    expect(await wrongId.json()).toMatchObject({ error: { code: "project_binding_changed" } });
    expect(await store.listTasks(ownerId, first.id, 10)).toEqual([]);

    const crossCreate = await request("POST", second.projectKey, {
      body: { ...draft, expectedProjectId: second.id },
    });
    expect(crossCreate.status).toBe(403);
    expect(await crossCreate.json()).toMatchObject({ error: { code: "interface_scope_forbidden" } });
    expect(await store.listTasks(ownerId, second.id, 10)).toEqual([]);

    const created = await request("POST", first.projectKey, { body: draft });
    expect(created.status).toBe(201);
    const { task: { id: taskId } } = await created.json();
    const scopedDetail = await request("GET", second.projectKey, { taskId });
    expect(scopedDetail.status).toBe(403);
    expect(await scopedDetail.json()).toMatchObject({ error: { code: "interface_scope_forbidden" } });
    const primaryDetail = await request("GET", second.projectKey, { taskId, token: TEST_DEVICE_TOKEN });
    expect(primaryDetail.status).toBe(404);
    expect(await primaryDetail.json()).toMatchObject({ error: { code: "not_found" } });
    expect(generate).not.toHaveBeenCalled();
  });
});
