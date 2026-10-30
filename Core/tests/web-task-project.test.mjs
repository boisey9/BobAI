import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "../../Web/node_modules/next/server.js";
import { createApp } from "../src/app.js";
import { mountBobProjectCreation } from "../src/control-center/projects.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.js";
import { createTestConfig } from "./test-config.js";
const auth = vi.hoisted(() => ({ signedIn: true, failure: false, sessionToken: "synthetic-session" }));
vi.mock("../../Web/lib/owner-auth", () => ({ ownerAuthEnabled: () => true, ownerEmail: () => "owner@example.test",
  withOwnerAuth: async work => {
    if (auth.failure) throw Error("synthetic-private-auth-error");
    return work({ api: { getSession: async () => auth.signedIn ? { user: { email: "owner@example.test" }, session: { token: auth.sessionToken } } : null } });
  } }));
vi.mock("../../Web/node_modules/next/headers.js", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
import * as core from "../../Web/lib/bob-core";
import { taskFailure } from "../../Web/lib/task-api";
import * as tasksRoute from "../../Web/app/api/tasks/route";
import * as taskRoute from "../../Web/app/api/tasks/[taskId]/route";
import * as projectsRoute from "../../Web/app/api/projects/route";

const uuid = n => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const secret = "synthetic-session-secret-000000000000000";
const stamp = "2026-10-26T12:00:00.000Z";
const mutation = { operationId: "synthetic-web-task-0001", title: "Synthetic local task", description: "Private fixture content", priority: "high", dueAt: null };
const creation = { operationId: "synthetic-web-project-0001", expectedAnchorId: uuid(3), projectKey: "synthetic-project", name: "Synthetic project", description: null, repository: null };
let f;
function fixture() {
  const projects = ["bobai", "other", "personal"].map((projectKey, i) => ({ id: uuid(i + 1), ownerId: "rick", projectKey, name: projectKey,
    status: "active", description: null, repository: null, metadata: {}, createdAt: stamp, updatedAt: stamp }));
  const store = new InMemorySharedContextStore({ projects });
  const service = new SharedContextService(store, "rick");
  const generate = vi.fn(async () => { throw Error("No inference allowed in this fixture"); });
  const config = createTestConfig({ sharedContextEnabled: true });
  const app = createApp({ config, aiProvider: { generate }, sharedContextService: service });
  mountBobProjectCreation(app, service);
  let credential = { id: "synthetic-owner", projectKey: null, surface: "web", scopes: ["control-center:owner", "context:read"] };
  const gateway = createInterfaceCredentialGateway(app.fetch.bind(app), config, async () => credential);
  const state = { calls: [], override: null, projects, store, service, generate, revoke: () => { credential = null; } };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    expect(String(url).startsWith("https://core.example/")).toBe(true);
    const request = new Request(url, init);
    state.calls.push({ path: new URL(request.url).pathname, method: request.method, headers: request.headers,
      body: request.method === "GET" ? null : await request.clone().json() });
    const override = await state.override?.(request.clone());
    return override ?? gateway(request);
  }));
  return state;
}
function request(path, body, headers = {}, method = body ? "POST" : "GET") {
  const csrf = createHmac("sha256", secret).update(`bob-control-owner-action:${auth.sessionToken}`).digest("base64url");
  return new NextRequest(`https://web.example${path}`, { method, headers: { "content-type": "application/json", "x-bob-csrf": csrf, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
const writes = () => f.calls.filter(call => call.method !== "GET");
beforeEach(() => {
  auth.signedIn = true; auth.failure = false; auth.sessionToken = "synthetic-session";
  vi.stubEnv("BOB_AUTH_SECRET", secret);
  vi.stubEnv("BOB_CORE_BASE_URL", "https://core.example");
  vi.stubEnv("BOB_CORE_DEVICE_TOKEN", "synthetic-owner-credential");
  vi.stubEnv("VERCEL_ENV", "");
  f = fixture();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Web routes through real Core services with in-memory state", () => {
  it("reads, creates, edits, and reads back tasks through the owner proxy without exposing credentials or metadata", async () => {
    const pageResponse = await tasksRoute.GET(request("/api/tasks?project=bobai"));
    expect(pageResponse.headers.get("cache-control")).toBe("no-store");
    const page = await pageResponse.json();
    expect(page.project.id).toBe(uuid(1)); expect(page.taskBinding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const saved = await tasksRoute.POST(request("/api/tasks?project=bobai", mutation, { "x-bob-task-binding": page.taskBinding }));
    expect(saved.status).toBe(200);
    const receipt = await saved.json();
    expect(receipt.task).toMatchObject({ title: mutation.title, version: 1, editable: true });
    expect(writes()[0].body.expectedProjectId).toBe(uuid(1));
    expect(JSON.stringify(receipt)).not.toMatch(/ownerId|metadata|synthetic-owner-credential/);
    const updated = await taskRoute.PATCH(request(`/api/tasks/${receipt.task.id}?project=bobai`, {
      operationId: "synthetic-web-task-update", expectedVersion: 1, status: "done",
    }, { "x-bob-task-binding": page.taskBinding }, "PATCH"), { params: Promise.resolve({ taskId: receipt.task.id }) });
    expect((await updated.json()).task).toMatchObject({ version: 2, status: "done" });
    const current = await taskRoute.GET(request(`/api/tasks/${receipt.task.id}?project=bobai`), { params: Promise.resolve({ taskId: receipt.task.id }) });
    expect((await current.json()).task.version).toBe(2);
    expect(f.calls.every(call => call.headers.get("authorization") === "Bearer synthetic-owner-credential")).toBe(true);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it("replays the original task receipt after later edits, with no duplicate task/event", async () => {
    const page = await core.getTasks("bobai");
    const first = await core.saveTask("bobai", mutation, page.taskBinding);
    await core.saveTask("bobai", { operationId: "synthetic-later-edit", expectedVersion: 1, status: "done" }, page.taskBinding, first.task.id);
    const replay = await core.saveTask("bobai", mutation, page.taskBinding);
    expect(replay).toMatchObject({ idempotent: true, task: { id: first.task.id, version: 1, status: "open" } });
    expect((await core.getTask("bobai", first.task.id)).task).toMatchObject({ version: 2, status: "done" });
    expect(await f.store.listRecentEvents("rick", uuid(1), 100)).toHaveLength(2);
  });
  it("returns a safe current task on version conflict and protects approval items", async () => {
    const page = await core.getTasks("bobai"), saved = await core.saveTask("bobai", mutation, page.taskBinding);
    await core.saveTask("bobai", { operationId: "synthetic-current-edit", expectedVersion: 1, status: "done" }, page.taskBinding, saved.task.id);
    const stale = await taskRoute.PATCH(request(`/api/tasks/${saved.task.id}?project=bobai`, { operationId: "synthetic-stale-edit", expectedVersion: 1, status: "blocked" },
      { "x-bob-task-binding": page.taskBinding }, "PATCH"), { params: Promise.resolve({ taskId: saved.task.id }) });
    expect(stale.status).toBe(409);
    const conflict = await stale.json(); expect(conflict.error.current.version).toBe(2); expect(JSON.stringify(conflict)).not.toMatch(/ownerId|metadata/);
    const proposal = await f.service.proposeDecision({ projectKey: "bobai", operationId: "synthetic-proposal", title: "Proposed only", proposal: "Needs owner review", actor: { interfaceId: "synthetic", surface: "codex" } });
    await expect(core.saveTask("bobai", { operationId: "synthetic-approval-edit", expectedVersion: 1, status: "done" }, page.taskBinding, proposal.reviewTask.id))
      .rejects.toMatchObject({ code: "task_requires_approval" });
  });
  it("rejects a binding from another project or credential before sending a mutation", async () => {
    const page = await core.getTasks("bobai");
    await expect(core.saveTask("other", mutation, page.taskBinding)).rejects.toMatchObject({ code: "task_binding_changed" });
    vi.stubEnv("BOB_CORE_DEVICE_TOKEN", "synthetic-replacement-credential");
    await expect(core.saveTask("bobai", mutation, page.taskBinding)).rejects.toMatchObject({ code: "task_binding_changed" });
    expect(writes()).toHaveLength(0);
  });
  it("fails closed if the project mapping changes between read and Core write", async () => {
    const page = await core.getTasks("bobai");
    f.override = async request => { if (request.method === "POST") f.projects[0].id = uuid(99); };
    await expect(core.saveTask("bobai", mutation, page.taskBinding)).rejects.toMatchObject({ code: "task_binding_changed" });
    expect(await f.store.listTasks("rick", uuid(99), 100)).toHaveLength(0);
  });
  it.each([false, true])("requires a current owner session for reads/writes (write=%s)", async write => {
    auth.signedIn = false;
    const response = write ? await tasksRoute.POST(request("/api/tasks?project=bobai", mutation)) : await tasksRoute.GET(request("/api/tasks?project=bobai"));
    expect(response.status).toBe(401); expect(f.calls).toHaveLength(0);
  });
  it("contains session lookup failure and rejects stale CSRF without touching Core", async () => {
    expect((await tasksRoute.POST(request("/api/tasks?project=bobai", mutation, { "x-bob-csrf": "old-session" }))).status).toBe(403);
    auth.failure = true;
    const response = await tasksRoute.GET(request("/api/tasks?project=bobai"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-private-auth-error"); expect(f.calls).toHaveLength(0);
  });
  it.each([{ metadata: {} }, { expectedProjectId: uuid(2) }, { status: "done" }, { ownerId: "other" }])("rejects caller-supplied creation authority %j", async extra => {
    expect((await tasksRoute.POST(request("/api/tasks?project=bobai", { ...mutation, ...extra }))).status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });
  it.each(["", "project=BOBAI", "project=bobai&project=other", "project=bad%2Fkey", "project=bobai&cursor=bad"])("rejects ambiguous/invalid workspace reads %s", async query => {
    expect((await tasksRoute.GET(request(`/api/tasks?${query}`))).status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });
  it("bounds task bodies while reading and rejects JSON lookalike content types", async () => {
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17000)); }, cancel() { cancelled = true; } });
    const csrf = createHmac("sha256", secret).update(`bob-control-owner-action:${auth.sessionToken}`).digest("base64url");
    const response = await tasksRoute.POST(new NextRequest("https://web.example/api/tasks?project=bobai", { method: "POST", duplex: "half", body: stream,
      headers: { "content-type": "application/json", "x-bob-csrf": csrf } }));
    expect(response.status).toBe(400); expect(cancelled).toBe(true); expect(f.calls).toHaveLength(0);
    expect((await tasksRoute.POST(request("/api/tasks?project=bobai", mutation, { "content-type": "application/json-evil" }))).status).toBe(400);
  });
  it("validates task read/receipt identity instead of forwarding another project's content", async () => {
    const page = await core.getTasks("bobai");
    f.override = async request => request.method === "GET" ? Response.json({ ...page, project: { ...page.project, projectKey: "other" } }) : undefined;
    await expect(core.getTasks("bobai")).rejects.toThrow("unexpected task workspace");
    f.override = null;
    const saved = await core.saveTask("bobai", mutation, page.taskBinding);
    f.override = async request => request.method === "PATCH" ? Response.json({ ...saved, created: false, task: { ...saved.task, projectId: uuid(2), version: 2 } }) : undefined;
    await expect(core.saveTask("bobai", { operationId: "synthetic-wrong-receipt", expectedVersion: 1, status: "done" }, page.taskBinding, saved.task.id)).rejects.toThrow("unexpected task receipt");
  });
  it("keeps dependency diagnostics out of task error codes and request IDs", async () => {
    const response = taskFailure(new core.CoreRequestError("synthetic-private-message", 500, "synthetic private code", "https://private.example/query?token=secret"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/synthetic.private|private.example|token=secret/);
  });
  it.each(["authority", "request", "project", "timestamp"])("rejects context with invalid %s identity/evidence", async field => {
    const context = await core.getProjectContext("bobai");
    if (field === "authority") context.authority.source = "another-source";
    if (field === "request") context.request.surface = "chatgpt";
    if (field === "project") context.project.projectKey = "other";
    if (field === "timestamp") context.generatedAt = "invalid";
    f.override = async () => Response.json({ context });
    await expect(core.getProjectContext("bobai")).rejects.toThrow("unexpected project context");
  });
  it("contains dashboard errors and rejects foreign project activity/administration", async () => {
    f.override = async () => Response.json({ error: { message: "synthetic-private-failure" } }, { status: 500 });
    const data = await core.getDashboardData("bobai");
    expect(data.errors).toHaveLength(4); expect(JSON.stringify(data)).not.toContain("synthetic-private-failure");
    f.override = async () => Response.json({ activity: [{ projectKey: "other" }] });
    await expect(core.getActivity("bobai")).rejects.toThrow("unexpected project activity");
    f.override = async () => Response.json({ selectedProject: { projectKey: "other" } });
    await expect(core.getControlCenterAdmin("bobai")).rejects.toThrow("unexpected control workspace");
  });
  it("contains project session errors and cancels oversized streamed project input", async () => {
    auth.failure = true;
    for (const response of [await projectsRoute.GET(), await projectsRoute.POST(request("/api/projects", creation))]) {
      expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-private-auth-error");
    }
    auth.failure = false; let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(25000)); }, cancel() { cancelled = true; } });
    const csrf = request("/api/projects", creation).headers.get("x-bob-csrf");
    const response = await projectsRoute.POST(new NextRequest("https://web.example/api/projects", { method: "POST", duplex: "half", body: stream,
      headers: { "content-type": "application/json", "x-bob-csrf": csrf } }));
    expect(response.status).toBe(400); expect(cancelled).toBe(true); expect(f.calls).toHaveLength(0);
  });
  it("creates a project and recovers its identical receipt through Web/Core", async () => {
    const ready = await (await projectsRoute.GET()).json();
    const send = () => projectsRoute.POST(request("/api/projects", creation, { "x-bob-project-binding": ready.projectBinding }));
    const first = await (await send()).json(), replay = await (await send()).json();
    expect(first).toMatchObject({ authority: "bob-core", project: { projectKey: creation.projectKey }, idempotent: false });
    expect(replay).toMatchObject({ project: { id: first.project.id }, idempotent: true });
    expect((await core.getProjectContext(creation.projectKey)).project.id).toBe(first.project.id);
    expect(JSON.stringify(first)).not.toMatch(/ownerId|metadata|synthetic-owner-credential/);
  });
  it("protects project creation with session, CSRF, owner anchor and connection binding", async () => {
    const ready = await core.getProjectCreationReadiness();
    expect((await projectsRoute.POST(request("/api/projects", creation, { "x-bob-csrf": "invalid" }))).status).toBe(403);
    await expect(core.createProject({ ...creation, expectedAnchorId: uuid(2) }, ready.projectBinding)).rejects.toMatchObject({ code: "project_binding_changed" });
    vi.stubEnv("BOB_CORE_DEVICE_TOKEN", "synthetic-changed-credential");
    await expect(core.createProject(creation, ready.projectBinding)).rejects.toMatchObject({ code: "project_binding_changed" });
    expect(writes()).toHaveLength(0);
    auth.signedIn = false; expect((await projectsRoute.GET()).status).toBe(401);
  });
  it("rejects revoked Core access and malformed project receipts without claiming completion", async () => {
    const ready = await core.getProjectCreationReadiness();
    f.override = async request => request.method === "POST" ? Response.json({ authority: "bob-core", idempotent: false, operationId: "wrong" }) : undefined;
    await expect(core.createProject(creation, ready.projectBinding)).rejects.toThrow("unexpected project receipt");
    f.override = null; f.revoke();
    expect((await projectsRoute.POST(request("/api/projects", creation, { "x-bob-project-binding": ready.projectBinding }))).status).toBe(401);
  });
});
