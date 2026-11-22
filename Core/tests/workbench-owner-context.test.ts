import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig, type BobCoreConfig } from "../src/config.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectItem } from "../src/context/types.js";
import { createInterfaceCredentialGateway, type InterfaceCredential } from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const path = "/v1/workbench/context";
const validQuery = "?project=fixture&surface=web";
const date = "2026-10-01T12:00:00.000Z";
const ownerId = "synthetic-private-owner-id";
const projectId = "99999999-9999-4999-8999-000000000001";
const otherProjectId = "99999999-9999-4999-8999-000000000005";
const binding = { projectKey: "fixture", id: projectId, repository: "sample/fixture" };
const configEnvironment = {
  NODE_ENV: "test", AI_API_KEY: "synthetic-unusable-test-key", BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
};
const interfaceToken = "synthetic-workbench-owner-interface-token";
const ownerCredential: InterfaceCredential = {
  id: "synthetic-owner-web",
  surface: "web",
  projectKey: null,
  scopes: ["control-center:owner", "context:read"],
};

function fixture({
  credential = ownerCredential,
  enabled = true,
  hasService = true,
  projectStatus = "active",
  pinnedProject = binding,
  projectIdentity = {},
  projectExists = true,
}: {
  credential?: InterfaceCredential;
  enabled?: boolean;
  hasService?: boolean;
  projectStatus?: ProjectItem["status"];
  pinnedProject?: BobCoreConfig["ownerWorkbenchProject"];
  projectIdentity?: Partial<Pick<ProjectItem, "id" | "repository">>;
  projectExists?: boolean;
} = {}) {
  const project: ProjectItem = {
    id: projectId,
    ownerId,
    projectKey: "fixture",
    name: "Synthetic private project name",
    repository: "sample/fixture",
    status: projectStatus,
    description: "Synthetic private project description",
    metadata: { privateMarker: "Synthetic private project metadata" },
    createdAt: date,
    updatedAt: date,
    ...projectIdentity,
  };
  const otherProject: ProjectItem = {
    ...project, id: otherProjectId, projectKey: "other-fixture",
    name: "Other synthetic project", repository: "sample/other-fixture", status: "active",
  };
  const store = new InMemorySharedContextStore({
    projects: projectExists ? [project, otherProject] : [otherProject],
    decisions: [{
      id: "99999999-9999-4999-8999-000000000002",
      ownerId,
      projectId,
      title: "Synthetic private decision title",
      decision: "Synthetic private decision body",
      reason: null,
      status: "active",
      supersedesDecisionId: null,
      source: "web",
      metadata: {},
      createdAt: date,
      updatedAt: date,
    }],
    tasks: [{
      id: "99999999-9999-4999-8999-000000000003",
      ownerId,
      projectId,
      title: "Synthetic private task title",
      description: "Synthetic private task description",
      version: 1,
      status: "open",
      priority: "normal",
      source: "web",
      metadata: {},
      dueAt: null,
      createdAt: date,
      updatedAt: date,
      completedAt: null,
    }],
    events: [{
      id: "99999999-9999-4999-8999-000000000004",
      ownerId,
      projectId,
      eventType: "synthetic.recorded",
      summary: "Synthetic private activity summary",
      source: "web",
      details: { privateMarker: "Synthetic private activity details" },
      createdAt: date,
    }],
  });
  const config = createTestConfig({
    ownerId, sharedContextEnabled: hasService, ownerWorkbenchReadsEnabled: enabled,
    ownerWorkbenchProject: pinnedProject,
  });
  const generate = vi.fn(async () => { throw new Error("Read-only Workbench must not invoke a model"); });
  const app = createApp({
    config,
    aiProvider: { generate },
    ...(hasService ? { sharedContextService: new SharedContextService(store, ownerId) } : {}),
  });
  const recordEvent = vi.spyOn(store, "recordEvent");
  const getProject = vi.spyOn(store, "getProject");
  const contextReads = [
    vi.spyOn(store, "listActiveDecisions"),
    vi.spyOn(store, "listActiveTasks"),
    vi.spyOn(store, "listRecentEvents"),
    vi.spyOn(store, "listHandoffs"),
  ];
  const expectedHash = createHash("sha256").update(interfaceToken).digest("hex");
  const verifyCredential = vi.fn(async (hash: string) => hash === expectedHash ? credential : null);
  const handle = createInterfaceCredentialGateway(app.fetch.bind(app), config, verifyCredential);

  function send(endpoint = path + validQuery, token: string | null = interfaceToken, method = "GET") {
    return handle(new Request("https://core.example" + endpoint, {
      method,
      headers: {
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        "x-bob-core-interface-id": "forged-owner-web",
        "x-bob-core-interface-surface": "web",
        "x-bob-core-interface-scopes": "control-center:owner,context:read",
      },
    }));
  }

  return { send, project, store, recordEvent, getProject, contextReads, verifyCredential, generate };
}

describe("owner Workbench context metadata route", () => {
  it("defaults off before credential verification or project lookup", async () => {
    expect(loadConfig(configEnvironment)).toMatchObject({
      ownerWorkbenchReadsEnabled: false, ownerWorkbenchProject: null,
    });
    const f = fixture({ enabled: false });
    const response = await f.send();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(f.verifyCredential).not.toHaveBeenCalled();
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
  });

  it("requires a project binding in addition to the enabled flag", async () => {
    const f = fixture({ pinnedProject: null });
    expect((await f.send()).status).toBe(404);
    expect(f.verifyCredential).not.toHaveBeenCalled();
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "{",
    JSON.stringify([binding]),
    JSON.stringify({ ...binding, projectKey: "FIXTURE" }),
    JSON.stringify({ ...binding, id: "not-a-uuid" }),
    JSON.stringify({ ...binding, repository: " sample/fixture " }),
    JSON.stringify({ ...binding, repository: "" }),
    JSON.stringify({ ...binding, ownerId }),
  ])("fails closed on a missing or malformed deployment binding %s", value => {
    expect(loadConfig({
      ...configEnvironment,
      BOB_OWNER_WORKBENCH_READS_ENABLED: "true",
      BOB_OWNER_WORKBENCH_PROJECT: value,
    })).toMatchObject({ ownerWorkbenchReadsEnabled: true, ownerWorkbenchProject: null });
  });

  it("accepts one exact project binding and normalizes UUID casing without changing the repository", () => {
    const project = { projectKey: binding.projectKey, id: "AABBCCDD-EEFF-4999-8999-000000000001", repository: null };
    expect(loadConfig({
      ...configEnvironment,
      BOB_OWNER_WORKBENCH_READS_ENABLED: "true",
      BOB_OWNER_WORKBENCH_PROJECT: JSON.stringify(project),
    }).ownerWorkbenchProject).toEqual({ ...project, id: project.id.toLowerCase() });
  });

  it("denies another active owner project before lookup without changing the ordinary context route", async () => {
    const f = fixture();
    const otherQuery = "?project=other-fixture&surface=web";
    expect((await f.send(path + otherQuery)).status).toBe(404);
    expect(f.getProject).not.toHaveBeenCalled();
    for (const read of f.contextReads) expect(read).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();

    const ordinary = await f.send("/v1/context" + otherQuery);
    expect(ordinary.status).toBe(200);
    expect(await ordinary.json()).toMatchObject({
      context: { project: { id: otherProjectId, projectKey: "other-fixture" } },
    });
    expect(f.recordEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      projectId: otherProjectId, eventType: "context.retrieved",
    }));
    const ordinaryTasks = await f.send("/v1/tasks?project=other-fixture&limit=10");
    expect(ordinaryTasks.status).toBe(200);
    expect(await ordinaryTasks.json()).toMatchObject({
      project: { id: otherProjectId, projectKey: "other-fixture" }, tasks: [],
    });
    expect(f.recordEvent).toHaveBeenCalledTimes(1);
    expect(f.generate).not.toHaveBeenCalled();
  });

  it.each([
    ["reused key", { projectIdentity: { id: "99999999-9999-4999-8999-000000000006" } }],
    ["changed repository", { projectIdentity: { repository: "sample/replaced" } }],
    ["unset repository", { projectIdentity: { repository: null } }],
    ["archived project", { projectStatus: "archived" }],
    ["deleted project", { projectExists: false }],
  ] as const)("refuses a %s before reading any context sources", async (_name, options) => {
    const f = fixture(options);
    expect((await f.send()).status).toBe(404);
    expect(f.getProject).toHaveBeenCalledExactlyOnceWith(ownerId, binding.projectKey);
    for (const read of f.contextReads) expect(read).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it.each([
    { ownerId: "different-synthetic-owner" },
    { projectKey: "different-fixture" },
  ])("refuses unexpected store project identity %j before loading any context sources", async identity => {
    const f = fixture();
    f.getProject.mockResolvedValueOnce({ ...f.project, ...identity });
    expect((await f.send()).status).toBe(404);
    for (const read of f.contextReads) expect(read).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it("requires stored absence when the pinned repository is null", async () => {
    const pinnedProject = { ...binding, repository: null };
    const mismatched = fixture({ pinnedProject });
    expect((await mismatched.send()).status).toBe(404);
    for (const read of mismatched.contextReads) expect(read).not.toHaveBeenCalled();

    const f = fixture({ pinnedProject, projectIdentity: { repository: null } });
    const response = await f.send();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ context: { project: pinnedProject } });
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it("redacts project content and reads the same context revision without a retrieval event", async () => {
    const f = fixture();
    const response = await f.send();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const result = await response.json();
    expect(result).toEqual({
      context: {
        authority: { source: "bob-core", version: "0.2" },
        request: { projectKey: "fixture", surface: "web" },
        project: { id: projectId, projectKey: "fixture", repository: "sample/fixture", status: "active" },
        revision: expect.stringMatching(/^[a-f0-9]{64}$/),
        generatedAt: expect.any(String),
        partial: true,
        sources: {
          decisions: { status: "available", checkedAt: expect.any(String), latestChangeAt: date, truncated: false },
          tasks: { status: "available", checkedAt: expect.any(String), latestChangeAt: date, truncated: false },
          events: { status: "available", checkedAt: expect.any(String), latestChangeAt: date, truncated: false },
          memories: { status: "unavailable", checkedAt: expect.any(String), latestChangeAt: null, truncated: false },
          handoffs: { status: "available", checkedAt: expect.any(String), latestChangeAt: null, truncated: false },
        },
      },
      requestId: expect.any(String),
    });
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain("Synthetic private");
    expect(encoded).not.toContain(ownerId);
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(await f.store.listRecentActivity(ownerId, 10, projectId)).toHaveLength(1);

    const normal = await f.send("/v1/context" + validQuery);
    expect(normal.status).toBe(200);
    expect(await normal.json()).toMatchObject({
      context: { revision: result.context.revision, decisions: [{ title: "Synthetic private decision title" }] },
    });
    expect(f.recordEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      eventType: "context.retrieved", projectId, source: "web",
    }));

    const repeated = await f.send();
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).context.revision).toBe(result.context.revision);
    expect(f.recordEvent).toHaveBeenCalledTimes(1);
    expect(await f.store.listRecentActivity(ownerId, 10, projectId)).toHaveLength(2);
    expect(f.generate).not.toHaveBeenCalled();
  });

  it.each([
    ["an anonymous request", null, 401],
    ["an unregistered token", "synthetic-unregistered-token", 401],
    ["the master device token", TEST_DEVICE_TOKEN, 403],
  ] as const)("denies %s despite spoofed owner headers", async (_label, token, status) => {
    const f = fixture();
    expect((await f.send(undefined, token)).status).toBe(status);
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["project-scoped grant", { ...ownerCredential, projectKey: "fixture" }],
    ["different surface", { ...ownerCredential, surface: "codex" }],
    ["missing owner scope", { ...ownerCredential, scopes: ["context:read"] }],
    ["missing context scope", { ...ownerCredential, scopes: ["control-center:owner"] }],
  ] as const)("denies a credential with %s", async (_label, credential) => {
    const f = fixture({ credential: { ...credential, scopes: [...credential.scopes] } });
    expect((await f.send()).status).toBe(403);
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "?surface=web",
    "?project=fixture",
    "?project=FIXTURE&surface=web",
    "?project=fixture%2Fother&surface=web",
    "?project=fixture&project=fixture&surface=web",
    "?project=fixture&surface=web&surface=web",
    "?project=fixture&surface=codex",
    "?project=fixture&surface=web&task=synthetic",
  ])("rejects malformed query %s before looking up project data", async query => {
    const f = fixture();
    expect((await f.send(path + query)).status).toBe(400);
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
  });

  it.each(["HEAD", "POST", "PATCH", "DELETE"])("does not expose metadata to %s", async method => {
    const f = fixture();
    const response = await f.send(undefined, interfaceToken, method);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(f.verifyCredential).not.toHaveBeenCalled();
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
  });

  it("reports unavailable dependencies without exposing private failure details", async () => {
    const f = fixture();
    expect((await fixture({ hasService: false }).send()).status).toBe(503);
    f.getProject.mockRejectedValueOnce(new Error("sensitive synthetic database failure"));
    const failed = await f.send();
    expect(failed.status).toBe(503);
    expect(failed.headers.get("cache-control")).toContain("no-store");
    expect(await failed.text()).not.toContain("sensitive synthetic database failure");
    expect(f.recordEvent).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });
});
