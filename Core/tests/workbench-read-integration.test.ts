import { describe, expect, it, vi } from "vitest";

import { createWorkbenchReader } from "../../Web/lib/workbench/read-adapters.js";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { DecisionItem, ProjectItem, TaskItem } from "../src/context/types.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const date = "2026-11-19T12:00:00.000Z";
const ownerId = "synthetic-workbench-owner";
const decisionMarker = "Synthetic private approved context body";
const uuid = (index: number) => `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`;

function project(index: number, projectKey: string, name: string): ProjectItem {
  return {
    id: uuid(index), ownerId, projectKey, name, repository: `sample/${projectKey}`,
    description: null, status: "active", metadata: {}, createdAt: date, updatedAt: date,
  };
}

function task(index: number, projectId: string, overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: uuid(index), ownerId, projectId, version: 1, title: `Synthetic task ${index}`,
    description: null, status: "open", priority: "normal", source: "web", dueAt: null,
    metadata: { testMarker: "synthetic task private metadata" },
    createdAt: date, updatedAt: date, completedAt: null,
    ...overrides,
  };
}

function fixture() {
  const first = project(1, "workbench-sample-a", "Synthetic primary workspace");
  const second = project(2, "workbench-sample-b", "Synthetic secondary workspace");
  const tasks = [
    ...Array.from({ length: 11 }, (_, index) => task(11 + index, first.id)),
    task(22, first.id, { metadata: { kind: "decision_review" } }),
    task(23, second.id),
    task(24, first.id, { ownerId: "synthetic-other-owner" }),
  ];
  const decision: DecisionItem = {
    id: uuid(41), ownerId, projectId: first.id, title: "Synthetic private decision title",
    decision: decisionMarker, reason: null, status: "active",
    supersedesDecisionId: null, source: "web", metadata: {}, createdAt: date, updatedAt: date,
  };
  const store = new InMemorySharedContextStore({ projects: [first, second], tasks, decisions: [decision] });
  const generate = vi.fn(async () => { throw new Error("Read adapters cannot invoke inference"); });
  const app = createApp({
    config: createTestConfig({ ownerId, sharedContextEnabled: true }),
    aiProvider: { generate },
    sharedContextService: new SharedContextService(store, ownerId),
  });

  const projects = [first, second, project(3, "workbench-ungranted", "Synthetic private catalog project")]
    .map(({ projectKey, name, description, repository, status, updatedAt }) =>
      ({ projectKey, name, description, repository, status, updatedAt }));
  // Core's Control Center route requires SQL. Mirror its directory response while
  // retaining the real task and context routes and in-memory stores.
  app.get("/v1/control-center", (context) => {
    const selectedProject = projects.find(({ projectKey }) => projectKey === context.req.query("project"));
    if (!selectedProject) return context.json({ error: { code: "control_center_project_not_found" } }, 404);
    return context.json({
      projects,
      selectedProject,
      generatedAt: date,
      approvals: [{ title: "Synthetic private catalog approval" }],
      interfaces: [{ interfaceId: "synthetic-private-interface" }],
      oauthConnections: [],
      releaseEvents: [],
      legacyCredentialCount: 0,
    });
  });

  const get = vi.fn((path: string) => Promise.resolve(app.request(path, {
    method: "GET", headers: { authorization: `Bearer ${TEST_DEVICE_TOKEN}` },
  })));
  const grants = [first, second].map(({ projectKey, id, repository }) => ({ projectKey, id, repository }));
  return { reader: createWorkbenchReader({ get }, grants), first, second, get, generate };
}

describe("Workbench adapter against Core read contracts", () => {
  it("reads an in-memory Core task page and context freshness, then follows the task cursor", async () => {
    const { reader, first, second, get, generate } = fixture();
    const result = await reader.read(first.projectKey);
    expect(result).toMatchObject({ status: "ready", tasks: { status: "available" }, context: { status: "available" } });
    if (result.status !== "ready" || result.tasks.status !== "available" || result.context.status !== "available")
      throw new Error("Expected the Core task and context handlers to return available results");

    expect(result.project).toMatchObject({ id: first.id, projectKey: first.projectKey, name: first.name });
    expect(result.projects.map(({ projectKey }) => projectKey)).toEqual([first.projectKey, second.projectKey]);
    expect(get.mock.calls.map(([path]) => path).sort()).toEqual([
      `/v1/context?project=${first.projectKey}&surface=web`,
      `/v1/control-center?project=${first.projectKey}`,
      `/v1/tasks?project=${first.projectKey}&limit=10`,
    ]);

    const page = result.tasks.value;
    expect(page.tasks.map(({ id }) => id)).toEqual(Array.from({ length: 10 }, (_, index) => uuid(22 - index)));
    expect(page.tasks[0]).toMatchObject({ id: uuid(22), title: "Synthetic task 22", requiresApproval: true });
    expect(page.tasks[0]).not.toHaveProperty("editable");
    expect(page.tasks[0]).not.toHaveProperty("taskBinding");
    expect(page.nextCursor).toBe(uuid(13));
    expect(page.checkedAt).toEqual(expect.any(String));

    const context = result.context.value;
    expect(context).toMatchObject({
      revision: expect.stringMatching(/^[0-9a-f]{64}$/), partial: true, generatedAt: expect.any(String),
      sources: expect.arrayContaining([
        { name: "decisions", status: "available", checkedAt: expect.any(String), latestChangeAt: date, truncated: false },
        { name: "memories", status: "unavailable", checkedAt: expect.any(String), latestChangeAt: null, truncated: false },
      ]),
    });
    expect(context).not.toHaveProperty("decisions");
    expect(context).not.toHaveProperty("request");
    const view = JSON.stringify(result);
    for (const privateValue of [ownerId, "synthetic task private metadata", decisionMarker,
      "Synthetic private catalog approval", "Synthetic private catalog project", "synthetic-private-interface"])
      expect(view).not.toContain(privateValue);

    const next = await reader.read(first.projectKey, uuid(13));
    expect(next).toMatchObject({ status: "ready", tasks: { status: "available", value: {
      tasks: [{ id: uuid(12) }, { id: uuid(11) }], nextCursor: null,
    } } });
    expect(get).toHaveBeenCalledWith(`/v1/tasks?project=${first.projectKey}&limit=10&cursor=${uuid(13)}`);
    expect(generate).not.toHaveBeenCalled();
  });

  it("shows only the selected project's tasks and source dates after switching projects", async () => {
    const { reader, first, second, generate } = fixture();
    const initial = await reader.read(first.projectKey);
    const switched = await reader.read(second.projectKey);
    expect(initial).toMatchObject({ status: "ready", project: { projectKey: first.projectKey } });
    expect(switched).toMatchObject({
      status: "ready",
      project: { id: second.id, projectKey: second.projectKey, name: second.name },
      tasks: { status: "available", value: { tasks: [{ id: uuid(23) }], nextCursor: null } },
      context: { status: "available", value: { sources: expect.arrayContaining([
        expect.objectContaining({ name: "decisions", latestChangeAt: null }),
      ]) } },
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
