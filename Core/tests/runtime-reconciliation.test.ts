import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAIProvider } from "../src/ai/provider-factory.js";
import { createSharedContextService } from "../src/context/factory.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { NeonSharedContextStore } from "../src/context/neon-store.js";
import { SharedContextProjectExistsError } from "../src/context/operations.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectItem } from "../src/context/types.js";
import { createMemoryService } from "../src/memory/factory.js";
import { createBobCoreRuntime } from "../src/runtime.js";
import { createInterfaceCredentialGateway, type InterfaceCredential } from "../src/security/interface-credential.js";
import { hostedWorkflowRouter } from "../src/workflow/hosted-mount.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

vi.mock("../src/ai/provider-factory.js", () => ({ createAIProvider: vi.fn() }));
vi.mock("../src/context/factory.js", () => ({ createSharedContextService: vi.fn() }));
vi.mock("../src/memory/factory.js", () => ({ createMemoryService: vi.fn() }));
vi.mock("../src/workflow/hosted-mount.js", () => ({ hostedWorkflowRouter: vi.fn() }));

const anchorId = "11111111-1111-4111-8111-111111111111";
const existingId = "22222222-2222-4222-8222-222222222222";
const owner: InterfaceCredential = { id: "synthetic-owner-web", surface: "web", projectKey: null, scopes: ["control-center:owner"] };
const token = "bobif_web_synthetic_abcdefghijklmnopqrstuvwxyz0123456789";
const command = { operationId: "synthetic-create-project-0001", expectedAnchorId: anchorId,
  projectKey: "new-project", name: "Synthetic new project", description: "Local fixture only.", repository: "https://example.test/repo" };

function project(id: string, projectKey: string): ProjectItem {
  return { id, ownerId: "rick", projectKey, name: projectKey, status: "active", description: null,
    repository: null, metadata: { privateFixture: "must-not-leak" },
    createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z" };
}

function fixture(options: { credential?: InterfaceCredential | null; projects?: ProjectItem[]; unavailable?: boolean } = {}) {
  const config = createTestConfig({ sharedContextEnabled: true });
  const store = new InMemorySharedContextStore({ projects: options.projects ?? [project(anchorId, "personal"), project(existingId, "bobai")] });
  const service = new SharedContextService(store, "rick");
  const generate = vi.fn(async () => { throw Error("Project creation must not call AI."); });
  vi.mocked(createAIProvider).mockReturnValue({ generate });
  vi.mocked(createSharedContextService).mockReturnValue(options.unavailable ? undefined : service);
  vi.mocked(createMemoryService).mockReturnValue(undefined);
  const runtime = createBobCoreRuntime(config);
  let credential: InterfaceCredential | null = options.credential === undefined ? owner : options.credential;
  const gateway = createInterfaceCredentialGateway(runtime.app.fetch.bind(runtime.app), config, vi.fn(async () => credential));
  const send = (path: string, body?: unknown, overrides: RequestInit = {}) => gateway(new Request(`https://core.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json",
      "x-bob-core-interface-id": "forged", "x-bob-core-interface-surface": "web",
      "x-bob-core-interface-scopes": "control-center:owner" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...overrides,
  }));
  const create = (body: unknown = command) => send("/v1/control-center/projects", body);
  return { ...runtime, store, service, generate, send, create, revoke: () => { credential = null; } };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("reconciled Core runtime and owner project creation", () => {
  it("mounts project creation with the existing context authority and keeps the workflow surface absent by default", async () => {
    const f = fixture();
    expect((await f.app.request("/health")).status).toBe(200);
    expect((await f.send("/v1/governed/bobai", undefined, { headers: { authorization: `Bearer ${TEST_DEVICE_TOKEN}` } })).status).toBe(404);
    const anchor = await f.send("/v1/control-center/projects/new");
    expect(anchor.status).toBe(200);
    const anchorBody = await anchor.json();
    expect(anchorBody).toMatchObject({ authority: "bob-core", anchor: { id: anchorId, projectKey: "personal" } });
    expect(JSON.stringify(anchorBody)).not.toContain("must-not-leak");
    const response = await f.create();
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved).toMatchObject({ authority: "bob-core", project: { projectKey: "new-project", name: command.name }, idempotent: false });
    const context = await f.service.build({ projectKey: "new-project", surface: "web" });
    expect(context.project.id).toBe(saved.project.id);
    expect(context.recentEvents).toHaveLength(1);
    expect(context.recentEvents[0]).toMatchObject({ eventType: "project.created", source: "web", details: { interfaceId: owner.id } });
    expect(f.generate).not.toHaveBeenCalled();
    expect(createAIProvider).toHaveBeenCalledWith(expect.objectContaining({ aiProvider: "openai", aiModel: "test-model" }));
  });

  it("preserves a configured governed router and its independent authorization", async () => {
    const router = new Hono().get("/probe", c => c.req.header("authorization") === "Bearer synthetic-workflow-proof"
      ? c.json({ governed: true }) : c.json({ error: "workflow_authority_required" }, 403));
    vi.mocked(hostedWorkflowRouter).mockReturnValue(router);
    const f = fixture();
    expect((await f.send("/v1/governed/probe", undefined, { headers: { authorization: `Bearer ${TEST_DEVICE_TOKEN}` } })).status).toBe(403);
    expect((await f.send("/v1/governed/probe", undefined, { headers: { authorization: "Bearer synthetic-workflow-proof" } })).status).toBe(200);
    expect((await f.create()).status).toBe(201);
  });

  it.each<InterfaceCredential>([
    { ...owner, projectKey: "bobai" },
    { ...owner, surface: "codex" },
    { ...owner, scopes: ["control-center:read"] },
    { id: "legacy-read", surface: "web", projectKey: "bobai", scopes: ["context:read"] },
  ])("denies non-owner-wide credentials despite forged owner headers: %j", async credential => {
    const f = fixture({ credential });
    expect((await f.send("/v1/control-center/projects/new")).status).toBe(403);
    expect((await f.create()).status).toBe(403);
    expect(await f.store.getProject("rick", command.projectKey)).toBeNull();
  });

  it("denies primary-device and revoked credentials on the owner creation boundary", async () => {
    const f = fixture();
    for (const path of ["/v1/control-center/projects/new", "/v1/control-center/projects"]) {
      const body = path.endsWith("/new") ? undefined : command;
      expect((await f.send(path, body, { headers: { authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
        "x-bob-core-interface-id": "forged", "x-bob-core-interface-surface": "web",
        "x-bob-core-interface-scopes": "control-center:owner" } })).status).toBe(403);
    }
    expect((await f.create()).status).toBe(201);
    f.revoke();
    expect((await f.create()).status).toBe(401);
    expect(await f.store.listRecentEvents("rick", (await f.store.getProject("rick", command.projectKey))!.id, 10)).toHaveLength(1);
  });

  it("replays identical concurrent operations once and rejects changed content or duplicate keys", async () => {
    const f = fixture();
    const responses = await Promise.all(Array.from({ length: 6 }, () => f.create()));
    expect(responses.map(r => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    const bodies = await Promise.all(responses.map(r => r.json()));
    expect(new Set(bodies.map(b => b.project.id)).size).toBe(1);
    expect(bodies.filter(b => !b.idempotent)).toHaveLength(1);
    expect(await f.store.listRecentEvents("rick", bodies[0].project.id, 10)).toHaveLength(1);
    const changed = await f.create({ ...command, name: "Changed content" });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ error: { code: "operation_conflict" } });
    const duplicate = await f.create({ ...command, operationId: "new-operation-same-key" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: { code: "project_exists" } });
  });

  it("rolls back project creation on audit failure so an identical retry can succeed", async () => {
    const f = fixture();
    vi.spyOn(f.store, "recordEvent").mockRejectedValueOnce(new Error("Synthetic audit failure"));
    expect((await f.create()).status).toBe(503);
    expect(await f.store.getProject("rick", command.projectKey)).toBeNull();
    expect((await f.create()).status).toBe(201);
  });

  it("rejects stale, absent, and inactive Personal anchors without creating a project", async () => {
    const variants = [
      [project(existingId, "personal")],
      [project(existingId, "bobai")],
      [{ ...project(anchorId, "personal"), status: "archived" as const }],
    ];
    for (const projects of variants) {
      const f = fixture({ projects });
      expect((await f.create()).status).toBe(409);
      expect(await f.store.getProject("rick", command.projectKey)).toBeNull();
    }
  });

  it.each([
    { projectKey: "personal" }, { expectedAnchorId: "not-a-uuid" }, { ownerId: "foreign-owner" },
    { metadata: { auth: { ownerWide: true } } }, { repository: "http://example.test/repo" },
    { repository: "https://user:secret@example.test/repo" }, { repository: "https://example.test/repo?token=synthetic" },
  ])("rejects invalid input and caller-controlled authority: %j", async extra => {
    const f = fixture();
    expect((await f.create({ ...command, ...extra })).status).toBe(400);
    expect(await f.store.getProject("rick", command.projectKey)).toBeNull();
  });

  it("bounds content type and body size and fails closed without Shared Context", async () => {
    const f = fixture();
    expect((await f.send("/v1/control-center/projects", command, { headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" } })).status).toBe(415);
    expect((await f.create({ ...command, description: "x".repeat(25_000) })).status).toBe(413);
    const unavailable = fixture({ unavailable: true });
    expect((await unavailable.create()).status).toBe(503);
  });

  it("normalizes project input and does not turn a project into an approved decision or memory", async () => {
    const f = fixture();
    const response = await f.create({ ...command, projectKey: " NEW-PROJECT ", name: " Synthetic project ",
      expectedAnchorId: anchorId.toUpperCase(), description: " ", repository: "https://example.test" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ project: { projectKey: "new-project", name: "Synthetic project",
      description: null, repository: "https://example.test/" } });
    const context = await f.service.build({ projectKey: "new-project", surface: "web" });
    expect(context.decisions).toEqual([]);
    expect(context.tasks).toEqual([]);
    expect(context.memories).toEqual([]);
    expect(context.handoffs).toEqual([]);
    expect(await f.store.listRecentEvents("rick", anchorId, 10)).toEqual([]);
  });

  it("does not reuse an archived project key or return a partial result after concurrent conflicts", async () => {
    const f = fixture({ projects: [project(anchorId, "personal"), { ...project(existingId, command.projectKey), status: "archived" }] });
    expect((await f.create()).status).toBe(409);
    const fresh = fixture();
    const results = await Promise.all([fresh.create(), fresh.create({ ...command, projectKey: "competing-project" })]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    const projects = await Promise.all([command.projectKey, "competing-project"].map(key => fresh.store.getProject("rick", key)));
    expect(projects.filter(Boolean)).toHaveLength(1);
  });
});

describe("project creation SQL adapter without a database", () => {
  it("parameterizes owner content and uses existing schema defaults without privileged metadata", async () => {
    const input = { ownerId: "synthetic-owner", projectKey: "new-project", name: "Synthetic ' quoted name",
      description: "Untrusted description", repository: null };
    const query = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => [{
      id: existingId, owner_id: input.ownerId, project_key: input.projectKey, name: input.name,
      description: input.description, repository: null, status: "active", metadata: {},
      created_at: "2026-10-26T00:00:00.000Z", updated_at: "2026-10-26T00:00:00.000Z",
    }]);
    const store = new NeonSharedContextStore("postgresql://unused.invalid/synthetic", query);
    expect(await store.createProject(input)).toMatchObject({ id: existingId, ...input, status: "active", metadata: {} });
    const [sql, ...values] = query.mock.calls[0]!;
    expect(sql.join("?")).not.toContain(input.name);
    expect(values).toContain(input.name);
    expect(values).toContain(input.ownerId);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("recognizes only the known project-key uniqueness violation and preserves other failures", async () => {
    const input = { ownerId: "rick", projectKey: "new-project", name: "Synthetic", description: null, repository: null };
    const duplicate = { code: "23505", constraint: "bob_projects_owner_key_unique" };
    const unrelated = { code: "23505", constraint: "other_constraint" };
    const query = vi.fn().mockRejectedValueOnce(duplicate).mockRejectedValueOnce(unrelated).mockResolvedValueOnce([]);
    const store = new NeonSharedContextStore("postgresql://unused.invalid/synthetic", query);
    await expect(store.createProject(input)).rejects.toBeInstanceOf(SharedContextProjectExistsError);
    await expect(store.createProject(input)).rejects.toBe(unrelated);
    await expect(store.createProject(input)).rejects.toThrow("did not return a record");
  });
});
