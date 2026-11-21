import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
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
}: {
  credential?: InterfaceCredential;
  enabled?: boolean;
  hasService?: boolean;
  projectStatus?: ProjectItem["status"];
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
  };
  const store = new InMemorySharedContextStore({
    projects: [project],
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
  });
  const generate = vi.fn(async () => { throw new Error("Read-only Workbench must not invoke a model"); });
  const app = createApp({
    config,
    aiProvider: { generate },
    ...(hasService ? { sharedContextService: new SharedContextService(store, ownerId) } : {}),
  });
  const recordEvent = vi.spyOn(store, "recordEvent");
  const getProject = vi.spyOn(store, "getProject");
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

  return { send, store, recordEvent, getProject, verifyCredential, generate };
}

describe("owner Workbench context metadata route", () => {
  it("defaults off before credential verification or project lookup", async () => {
    expect(loadConfig({
      NODE_ENV: "test", AI_API_KEY: "synthetic-unusable-test-key", BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    }).ownerWorkbenchReadsEnabled).toBe(false);
    const f = fixture({ enabled: false });
    const response = await f.send();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(f.verifyCredential).not.toHaveBeenCalled();
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.recordEvent).not.toHaveBeenCalled();
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

  it("refuses an unknown or archived project and contains private dependency failures", async () => {
    const f = fixture();
    expect((await f.send(path + "?project=foreign&surface=web")).status).toBe(404);
    expect((await fixture({ projectStatus: "archived" }).send()).status).toBe(404);
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
