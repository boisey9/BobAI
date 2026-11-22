import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { BobCoreConfig } from "../src/config.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectItem, TaskItem } from "../src/context/types.js";
import { createInterfaceCredentialGateway, type InterfaceCredential } from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const path = "/v1/workbench/tasks";
const validQuery = "?project=fixture&limit=10";
const timestamp = "2026-10-01T12:00:00.000Z";
const ownerId = "synthetic-owner";
const uuid = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, "0")}`;
const binding = { projectKey: "fixture", id: uuid(1), repository: "sample/fixture" };
const otherBinding = { projectKey: "other-fixture", id: uuid(2), repository: "sample/other-fixture" };
const otherTaskId = uuid(21);
const token = "synthetic-workbench-task-interface-token";
const owner: InterfaceCredential = {
  id: "synthetic-owner-web", surface: "web", projectKey: null,
  scopes: ["control-center:owner", "context:read"],
};

function fixture({
  enabled = true,
  pinnedProject = binding,
  credential = owner,
  storedProject = {},
}: {
  enabled?: boolean;
  pinnedProject?: BobCoreConfig["ownerWorkbenchProject"];
  credential?: InterfaceCredential;
  storedProject?: Partial<Pick<ProjectItem, "id" | "repository" | "status">>;
} = {}) {
  const project: ProjectItem = {
    ...binding, ownerId, name: "Synthetic reference project", status: "active",
    description: null, metadata: {}, createdAt: timestamp, updatedAt: timestamp, ...storedProject,
  };
  const other: ProjectItem = { ...project, ...otherBinding, status: "active", name: "Other synthetic project" };
  function task(projectId: string, number: number): TaskItem {
    return {
      id: uuid(number), ownerId, projectId, version: 1, title: `Synthetic task ${number}`,
      status: "open", priority: "normal", description: "Synthetic private task description", source: "web", dueAt: null,
      metadata: { privateMarker: "Synthetic task private metadata", ...(number === 20 ? { kind: "decision_review" } : {}) },
      createdAt: timestamp, updatedAt: timestamp, completedAt: null,
    };
  }

  const foreignTask = task(other.id, 21);
  const pinnedTasks = Array.from({ length: 11 }, (_, index) => task(project.id, 10 + index));
  const store = new InMemorySharedContextStore({
    projects: [project, other],
    tasks: [...pinnedTasks, foreignTask],
  });
  const config = createTestConfig({
    ownerId, ownerWorkbenchReadsEnabled: enabled, ownerWorkbenchProject: pinnedProject, sharedContextEnabled: true,
  });
  const generate = vi.fn(async () => { throw new Error("Task reads must not invoke a model"); });
  const app = createApp({ config, aiProvider: { generate }, sharedContextService: new SharedContextService(store, ownerId) });
  const expectedHash = createHash("sha256").update(token).digest("hex");
  const verifier = vi.fn(async (hash: string) => hash === expectedHash ? credential : null);
  const handle = createInterfaceCredentialGateway(app.fetch.bind(app), config, verifier);
  const getProject = vi.spyOn(store, "getProject");
  const listTasks = vi.spyOn(store, "listTasks");
  const readTask = vi.spyOn(store, "readTaskById");
  const recordEvent = vi.spyOn(store, "recordEvent");

  function send(endpoint = path + validQuery, {
    method = "GET", bearer = token, body,
  }: { method?: string; bearer?: string | null; body?: unknown } = {}) {
    return handle(new Request("https://core.example" + endpoint, {
      method,
      headers: {
        ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
        "content-type": "application/json",
        "x-bob-core-interface-id": "forged-owner",
        "x-bob-core-interface-surface": "web",
        "x-bob-core-interface-scopes": "control-center:owner,context:read",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  }

  return { send, verifier, foreignTask, pinnedTasks, getProject, listTasks, readTask, recordEvent, generate };
}

function expectNoTaskAccess(f: ReturnType<typeof fixture>) {
  expect(f.readTask).not.toHaveBeenCalled();
  expect(f.listTasks).not.toHaveBeenCalled();
  expect(f.recordEvent).not.toHaveBeenCalled();
  expect(f.generate).not.toHaveBeenCalled();
}

describe("owner Workbench task listing", () => {
  it("returns only the pinned project's task pages without any project event or model use", async () => {
    const f = fixture();
    const response = await f.send();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const page = await response.json();
    expect(page).toMatchObject({
      authority: "bob-core",
      project: { id: binding.id, projectKey: binding.projectKey },
      nextCursor: uuid(11),
      checkedAt: expect.any(String),
    });
    expect(page.tasks).toHaveLength(10);
    expect(page.tasks.map(({ id, projectId }: { id: string; projectId: string }) => [id, projectId]))
      .toEqual(Array.from({ length: 10 }, (_, index) => [uuid(20 - index), binding.id]));
    expect(page.tasks[0]).toEqual({
      id: uuid(20), projectId: binding.id, title: "Synthetic task 20",
      status: "open", priority: "normal", version: 1, dueAt: null, updatedAt: timestamp, requiresApproval: true,
    });
    expect(JSON.stringify(page)).not.toContain("Synthetic task private metadata");
    expect(JSON.stringify(page)).not.toContain("Synthetic private task description");
    expect(f.listTasks).toHaveBeenCalledExactlyOnceWith(ownerId, binding.id, 11, undefined);

    const next = await f.send(path + validQuery + `&cursor=${page.nextCursor}`);
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({
      project: { id: binding.id },
      tasks: [{ id: uuid(10), projectId: binding.id }],
      nextCursor: null,
    });
    expect(f.readTask).toHaveBeenCalledExactlyOnceWith(ownerId, binding.id, uuid(11));
    expect(f.listTasks.mock.calls[1]).toEqual([ownerId, binding.id, 11, uuid(11)]);
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it.each([{ enabled: false }, { pinnedProject: null }])("remains unavailable before authentication: %j", async options => {
    const f = fixture(options);
    expect((await f.send()).status).toBe(404);
    expect(f.verifier).not.toHaveBeenCalled();
    expect(f.getProject).not.toHaveBeenCalled();
    expectNoTaskAccess(f);
  });

  it.each([
    ["anonymous", null, 401],
    ["unregistered token", "synthetic-unregistered-token", 401],
    ["master token", TEST_DEVICE_TOKEN, 403],
  ] as const)("denies %s despite forged owner headers", async (_name, bearer, status) => {
    const f = fixture();
    expect((await f.send(undefined, { bearer })).status).toBe(status);
    expect(f.getProject).not.toHaveBeenCalled();
    expectNoTaskAccess(f);
  });

  it.each<InterfaceCredential>([
    { ...owner, projectKey: binding.projectKey },
    { ...owner, surface: "codex" },
    { ...owner, scopes: ["context:read"] },
    { ...owner, scopes: ["control-center:owner"] },
  ])("denies an insufficiently authorized interface", async credential => {
    const f = fixture({ credential });
    expect((await f.send()).status).toBe(403);
    expect(f.getProject).not.toHaveBeenCalled();
    expectNoTaskAccess(f);
  });

  it.each([
    "?project=fixture",
    "?project=fixture&limit=9",
    "?project=fixture&limit=100",
    "?project=fixture&project=fixture&limit=10",
    "?project=fixture&limit=10&limit=10",
    "?project=fixture&limit=10&cursor=invalid",
    "?project=fixture&limit=10&extra=synthetic",
  ])("rejects malformed query before any project lookup: %s", async query => {
    const f = fixture();
    expect((await f.send(path + query)).status).toBe(400);
    expect(f.getProject).not.toHaveBeenCalled();
    expectNoTaskAccess(f);
  });

  it.each(["HEAD", "POST", "PATCH", "DELETE"])("rejects %s before any project lookup", async method => {
    const f = fixture();
    const response = await f.send(undefined, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(f.getProject).not.toHaveBeenCalled();
    expectNoTaskAccess(f);
  });

  it("rejects another active project before looking up either project or cursor", async () => {
    const f = fixture();
    expect((await f.send(path + `?project=${otherBinding.projectKey}&limit=10&cursor=${otherTaskId}`)).status).toBe(404);
    expect(f.getProject).not.toHaveBeenCalled();
    expectNoTaskAccess(f);
  });

  it.each([
    { id: uuid(3) },
    { repository: null },
    { repository: "sample/replaced" },
    { status: "archived" },
  ] as const)("checks identity before task or cursor access even when the key matches: %j", async storedProject => {
    const f = fixture({ storedProject });
    expect((await f.send(path + validQuery + `&cursor=${uuid(11)}`)).status).toBe(404);
    expect(f.getProject).toHaveBeenCalledExactlyOnceWith(ownerId, binding.projectKey);
    expectNoTaskAccess(f);
  });

  it("checks a foreign cursor only inside the pinned project and never lists tasks when the cursor is refused", async () => {
    const f = fixture();
    expect((await f.send(path + validQuery + `&cursor=${otherTaskId}`)).status).toBe(400);
    expect(f.readTask).toHaveBeenCalledExactlyOnceWith(ownerId, binding.id, otherTaskId);
    expect(f.listTasks).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it("withholds the whole page if the storage result does not belong to the pinned project", async () => {
    const f = fixture();
    f.listTasks.mockResolvedValueOnce([f.foreignTask]);
    const response = await f.send();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(f.foreignTask.title);
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it("validates the lookahead row before generating a continuation", async () => {
    const f = fixture();
    f.listTasks.mockResolvedValueOnce([
      ...f.pinnedTasks.slice(0, 10),
      { ...f.pinnedTasks[10]!, ownerId: "other-synthetic-owner" },
    ]);
    const response = await f.send();
    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("nextCursor");
    expect(f.recordEvent).not.toHaveBeenCalled();
  });

  it.each([
    { ownerId: "other-synthetic-owner" },
    { projectId: otherBinding.id },
    { id: uuid(12) },
  ])("refuses a mismatched store cursor before paginating: %j", async otherIdentity => {
    const f = fixture();
    f.readTask.mockResolvedValueOnce({ ...f.pinnedTasks[1]!, ...otherIdentity });
    expect((await f.send(path + validQuery + `&cursor=${uuid(11)}`)).status).toBe(400);
    expect(f.listTasks).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
  });

  it("preserves ordinary task detail, list and edit for the same owner in another project", async () => {
    const f = fixture();
    const detailPath = `/v1/tasks/${otherTaskId}?project=${otherBinding.projectKey}`;
    const detail = await f.send(detailPath);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      project: { id: otherBinding.id },
      task: { id: otherTaskId, status: "open", version: 1, description: "Synthetic private task description", source: "web" },
    });
    const edit = await f.send(detailPath, {
      method: "PATCH",
      body: { operationId: "synthetic-legacy-task-edit", expectedVersion: 1, status: "done" },
    });
    expect(edit.status).toBe(200);
    expect(await edit.json()).toMatchObject({
      changed: true, task: { id: otherTaskId, projectId: otherBinding.id, status: "done", version: 2 },
    });
    const list = await f.send(`/v1/tasks?project=${otherBinding.projectKey}&limit=1`);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      project: { id: otherBinding.id }, tasks: [{ id: otherTaskId, status: "done", version: 2 }],
    });
    expect(f.recordEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      projectId: otherBinding.id, eventType: "task.updated",
    }));
    expect(f.generate).not.toHaveBeenCalled();
  });
});
