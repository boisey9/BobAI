import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { NeonSharedContextStore } from "../src/context/neon-store.js";
import { SharedContextService } from "../src/context/service.js";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.js";
import { mountBobMcp } from "../src/mcp/mount.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const uuid = n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const date = "2026-10-26T12:00:00.000Z";
const actor = { interfaceId: "synthetic-web", surface: "web" };
const readCredential = { id: "synthetic-reader", surface: "codex", projectKey: "bobai", scopes: ["context:read", "tasks:write", "mcp:sync", "mcp:task:write"] };
function fixture(credential = readCredential) {
  const projects = ["bobai", "other", "personal"].map((projectKey, i) => ({ id: uuid(i + 1), ownerId: "rick", projectKey,
    name: projectKey, description: null, repository: null, status: "active", metadata: {}, createdAt: date, updatedAt: date }));
  const task = (n, extra = {}) => ({ id: uuid(n), ownerId: "rick", projectId: projects[0].id, version: 1,
    title: `Synthetic task ${n}`, description: null, status: "open", priority: "normal", source: "web", dueAt: null,
    metadata: { secretFixture: "synthetic-private-metadata" }, createdAt: date, updatedAt: date, completedAt: null, ...extra });
  const tasks = [task(10), task(11, { status: "done", completedAt: date }), task(12, { status: "cancelled" }),
    task(13, { metadata: { kind: "decision_review", secretFixture: "synthetic-private-metadata" } }),
    task(14, { createdAt: "2026-10-27T00:00:00.000Z" }), task(15, { projectId: projects[1].id }), task(16, { ownerId: "other-owner" })];
  const store = new InMemorySharedContextStore({ projects, tasks });
  const service = new SharedContextService(store, "rick");
  const config = createTestConfig({ sharedContextEnabled: true });
  const generate = vi.fn(async () => { throw Error("Task operations must not run inference"); });
  const app = createApp({ config, aiProvider: { generate }, sharedContextService: service });
  mountBobMcp(app, config, service);
  const gateway = createInterfaceCredentialGateway(app.fetch.bind(app), config, async () => credential);
  const send = (path, body, method = body ? "POST" : "GET", token = "synthetic-interface-token") => gateway(new Request(`https://core.example${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream",
      "x-bob-core-interface-project": "other", "x-bob-core-interface-scopes": "control-center:owner" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  return { app, store, service, projects, tasks, send, generate };
}
async function rpc(response) {
  expect(response.status).toBe(200);
  const text = await response.text();
  return text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find(line => line.startsWith("data:")).slice(5));
}
describe("reconciled explicit task reads and guarded writes", () => {
  it("paginates all task states with stable tie ordering, private projection and no inference", async () => {
    const f = fixture(); let cursor = "", collected = [];
    do {
      const response = await f.send(`/v1/tasks?project=bobai&limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
      const page = await response.json();
      expect(page).toMatchObject({ authority: "bob-core", project: { id: uuid(1), projectKey: "bobai" } });
      expect(JSON.stringify(page)).not.toContain("synthetic-private-metadata");
      expect(page.tasks.every(task => !("ownerId" in task) && !("metadata" in task))).toBe(true);
      collected.push(...page.tasks); cursor = page.nextCursor;
    } while (cursor);
    expect(collected.map(task => task.id)).toEqual([uuid(14), uuid(13), uuid(12), uuid(11), uuid(10)]);
    expect(collected.find(task => task.id === uuid(13))).toMatchObject({ editable: false, requiresApproval: true });
    expect(collected.find(task => task.status === "cancelled").editable).toBe(false);
    expect(collected.find(task => task.status === "done").editable).toBe(true);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it("binds direct task reads to the credential project and returns detached records", async () => {
    const f = fixture();
    expect((await f.send(`/v1/tasks/${uuid(10)}`)).status).toBe(200);
    expect((await f.send(`/v1/tasks/${uuid(15)}?project=bobai`)).status).toBe(404);
    expect((await f.send(`/v1/tasks/${uuid(16)}?project=bobai`)).status).toBe(404);
    expect((await f.send("/v1/tasks?project=other")).status).toBe(403);
    expect((await f.send("/v1/tasks?project=bobai", undefined, "HEAD")).status).toBe(200);
    const detached = await f.store.readTaskById("rick", uuid(1), uuid(10)); detached.title = "modified read";
    expect((await f.service.readTask({ projectKey: "bobai", taskId: uuid(10) })).task.title).toBe("Synthetic task 10");
  });
  it.each([
    { ...readCredential, scopes: [] }, { ...readCredential, id: "legacy-read" },
    { ...readCredential, projectKey: "personal" }, null,
  ])("denies unavailable or insufficient read authority %j", async credential => {
    const response = await fixture(credential).send("/v1/tasks");
    expect([401, 403]).toContain(response.status);
  });
  it("permits explicit owner-wide reads without changing ordinary project-bound authority", async () => {
    const f = fixture({ ...readCredential, surface: "web", projectKey: null, scopes: ["context:read", "control-center:owner"] });
    const response = await f.send("/v1/tasks?project=other");
    expect(response.status).toBe(200);
    expect((await response.json()).tasks.map(task => task.id)).toEqual([uuid(15)]);
    expect((await f.send("/v1/tasks?project=personal", undefined, "GET", TEST_DEVICE_TOKEN)).status).toBe(200);
  });
  it.each(["limit=0", "limit=101", "limit=-1", "limit=1.5", "limit=001", "cursor=invalid"])("rejects invalid page parameters %s", async query => {
    expect((await fixture().send(`/v1/tasks?project=bobai&${query}`)).status).toBe(400);
  });
  it("rejects foreign/missing cursors and inactive workspaces without presenting an empty success", async () => {
    const f = fixture();
    for (const cursor of [uuid(15), uuid(16), uuid(99)]) {
      const response = await f.send(`/v1/tasks?project=bobai&cursor=${cursor}`);
      expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("invalid_cursor");
    }
    f.projects[0].status = "archived";
    expect((await f.send("/v1/tasks?project=bobai")).status).toBe(404);
  });
  it("fails privately when task reads are unavailable", async () => {
    const f = fixture(); vi.spyOn(f.store, "listTasks").mockRejectedValue(Error("synthetic-private-driver-error"));
    const response = await f.send("/v1/tasks?project=bobai");
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-private-driver-error");
  });
  it("rejects approval-task mutation through REST and MCP before version checks", async () => {
    const f = fixture();
    const response = await f.send(`/v1/tasks/${uuid(13)}?project=bobai`, { operationId: "synthetic-approval-update", expectedVersion: 99, status: "done" }, "PATCH");
    expect(response.status).toBe(403); expect((await response.json()).error.code).toBe("task_requires_approval");
    const result = await rpc(await f.send("/mcp/sync", { jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "bob_update_task", arguments: { operationId: "synthetic-approval-mcp", taskId: uuid(13), expectedVersion: 1, status: "done" } } }));
    expect(result.result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("task_requires_approval");
    expect((await f.store.findTaskById("rick", uuid(1), uuid(13))).status).toBe("open");
    expect(await f.store.listRecentEvents("rick", uuid(1), 100)).toHaveLength(0);
  });
  it("guards task writes against replaced project identity and keeps older callers compatible", async () => {
    const f = fixture();
    for (const update of [false, true]) {
      const body = { operationId: `synthetic-uuid-${update}`, expectedProjectId: uuid(2), ...(update ? { expectedVersion: 1, status: "done" } : { title: "New task" }) };
      const response = await f.send(`/v1/tasks${update ? `/${uuid(10)}` : ""}?project=bobai`, body, update ? "PATCH" : "POST");
      expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("project_binding_changed");
    }
    const input = { operationId: "synthetic-uuid-match", expectedProjectId: uuid(1), title: "New task" };
    const results = await Promise.all(Array.from({ length: 4 }, () => f.send("/v1/tasks?project=bobai", input).then(response => response.json())));
    expect(new Set(results.map(result => result.task.id)).size).toBe(1);
    expect(results.filter(result => !result.idempotent)).toHaveLength(1);
    expect((await f.send("/v1/tasks?project=bobai", { operationId: "synthetic-legacy-input", title: "Legacy input" })).status).toBe(201);
  });
  it("retains version conflicts and historical retry receipts alongside fresh task reads", async () => {
    const f = fixture(), input = { operationId: "synthetic-task-update", expectedProjectId: uuid(1), expectedVersion: 1, status: "done" };
    const first = await (await f.send(`/v1/tasks/${uuid(10)}?project=bobai`, input, "PATCH")).json();
    expect(first.task.version).toBe(2);
    await f.send(`/v1/tasks/${uuid(10)}?project=bobai`, { ...input, operationId: "synthetic-task-reopen", expectedVersion: 2, status: "open" }, "PATCH");
    const replay = await (await f.send(`/v1/tasks/${uuid(10)}?project=bobai`, input, "PATCH")).json();
    expect(replay).toMatchObject({ idempotent: true, task: { version: 2, status: "done" } });
    const latest = await (await f.send(`/v1/tasks/${uuid(10)}?project=bobai`)).json();
    expect(latest.task).toMatchObject({ version: 3, status: "open" });
    const conflict = await f.send(`/v1/tasks/${uuid(10)}?project=bobai`, { ...input, operationId: "synthetic-task-stale" }, "PATCH");
    expect(conflict.status).toBe(409); expect((await conflict.json()).error.code).toBe("task_version_conflict");
  });
  it.each([false, true])("preserves existing operation receipts across the optional UUID guard (update=%s)", async update => {
    const f = fixture();
    const input = { operationId: `synthetic-compatible-${update}`, ...(update ? { expectedVersion: 1, status: "done" } : { title: "Before UUID guard" }) };
    const path = `/v1/tasks${update ? `/${uuid(10)}` : ""}?project=bobai`, method = update ? "PATCH" : "POST";
    const first = await (await f.send(path, input, method)).json();
    const replay = await (await f.send(path, { ...input, expectedProjectId: uuid(1) }, method)).json();
    expect(replay).toMatchObject({ idempotent: true, task: { id: first.task.id, version: first.task.version } });
    expect((await f.send(path, { ...input, expectedProjectId: uuid(2) }, method)).status).toBe(409);
    expect(await f.store.listRecentEvents("rick", uuid(1), 100)).toHaveLength(1);
  });
  it("uses non-locking parameterized reads and compares stored cursor timestamps in PostgreSQL", async () => {
    const calls = [];
    const store = new NeonSharedContextStore("unused", async (parts, ...values) => { calls.push({ text: parts.join("?"), values }); return []; });
    expect(await store.readTaskById("rick", uuid(1), uuid(10))).toBeNull();
    await store.listTasks("rick", uuid(1), 31, uuid(10));
    expect(calls[0].text).not.toContain("FOR UPDATE");
    expect(calls[0].values).toEqual(["rick", uuid(1), uuid(10)]);
    expect(calls[1].text).toContain("(t.created_at, t.id) < (");
    expect(calls[1].text).toContain("SELECT c.created_at, c.id");
    expect(calls[1].text).toContain("ORDER BY t.created_at DESC, t.id DESC");
    expect(calls[1].values).toEqual(["rick", uuid(1), uuid(10), "rick", uuid(1), uuid(10), 31]);
  });
});
