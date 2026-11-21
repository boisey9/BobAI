import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { mountBobControlCenter } from "../src/control-center/mount.js";
import { createInterfaceCredentialGateway, type InterfaceCredential } from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const { tag, query } = vi.hoisted(() => ({ tag: vi.fn(), query: vi.fn() }));
vi.mock("@neondatabase/serverless", async importOriginal => ({
  ...await importOriginal<typeof import("@neondatabase/serverless")>(),
  neon: () => Object.assign(tag, { query }),
}));

const path = "/v1/control-center";
const workbenchQuery = "?project=fixture&view=workbench";
const timestamp = "2026-10-01T12:00:00.000Z";
const projectId = "99999999-9999-4999-8999-000000000001";
const archivedId = "99999999-9999-4999-8999-000000000002";
const token = "synthetic-workbench-directory-owner-token";
const owner: InterfaceCredential = {
  id: "synthetic-owner-web",
  surface: "web",
  projectKey: null,
  scopes: ["control-center:read", "control-center:owner", "context:read"],
};
const expectedProject = {
  id: projectId,
  projectKey: "fixture",
  name: "Fixture Catalog",
  repository: "sample/fixture",
  status: "active",
  updatedAt: timestamp,
};

beforeEach(() => {
  tag.mockReset();
  query.mockReset();
  tag.mockImplementation(async (strings: TemplateStringsArray) => {
    const statement = strings.join("");
    if (statement.includes("FROM public.bob_projects")) {
      return [
        {
          id: projectId, project_key: "fixture", name: "Fixture Catalog",
          repository: "sample/fixture", status: "active", updated_at: timestamp,
          description: "Synthetic description omitted from Workbench",
          metadata: { auth: { interfaceCredentials: [{
            id: "synthetic-admin-connection", surface: "web", scopes: ["control-center:read"],
          }], readCredentialHashes: ["synthetic-legacy-hash"] } },
        },
        {
          id: archivedId, project_key: "archived-fixture", name: "Previously Archived",
          repository: null, status: "archived", updated_at: timestamp, description: null, metadata: {},
        },
      ];
    }
    if (statement.includes("FROM public.bob_tasks"))
      return [{
        id: "synthetic-approval", title: "Synthetic approval title", description: null,
        source: "web", status: "open", priority: "normal", created_at: timestamp, updated_at: timestamp,
        metadata: { kind: "decision_review", decisionTitle: "Synthetic decision title", proposal: "Synthetic approval proposal" },
      }];
    if (statement.includes("FROM public.bob_events"))
      return [{
        id: "synthetic-event", event_type: "fixture.event", summary: "Synthetic activity summary",
        source: "web", details: {}, created_at: timestamp,
      }];
    throw new Error("Unexpected SQL in synthetic Workbench catalog test");
  });
  query.mockResolvedValue([{
    id: "99999999-9999-4999-8999-000000000003",
    surface: "codex", scopes: ["context:read"], created_at: timestamp, revoked_at: null,
  }]);
});

function fixture({
  enabled = true,
  credential = owner,
}: {
  enabled?: boolean;
  credential?: InterfaceCredential;
} = {}) {
  const config = createTestConfig({
    ownerWorkbenchReadsEnabled: enabled, databaseURL: "postgresql://fixture:unused@example.invalid/test",
  });
  const generate = vi.fn(async () => { throw new Error("Workbench directory must not invoke inference"); });
  const app = createApp({ config, aiProvider: { generate } });
  mountBobControlCenter(app, config);
  const expectedHash = createHash("sha256").update(token).digest("hex");
  const verify = vi.fn(async (hash: string) => hash === expectedHash ? credential : null);
  const handle = createInterfaceCredentialGateway(app.fetch.bind(app), config, verify);
  function read(search = workbenchQuery, bearer: string | null = token) {
    return handle(new Request("https://core.example" + path + search, {
      headers: {
        ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
        "x-bob-core-interface-id": "forged-owner",
        "x-bob-core-interface-surface": "web",
        "x-bob-core-interface-scopes": "control-center:read,control-center:owner,context:read",
      },
    }));
  }
  return { read, generate };
}

function expectNoCatalogQuery() {
  expect(tag).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
}

describe("owner Workbench catalog projection", () => {
  it("runs one owner-filtered catalog query and returns project UUIDs with only directory fields", async () => {
    const f = fixture();
    const response = await f.read();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      projects: [
        expectedProject,
        {
          id: archivedId, projectKey: "archived-fixture", name: "Previously Archived",
          repository: null, status: "archived", updatedAt: timestamp,
        },
      ],
      selectedProject: expectedProject,
      generatedAt: expect.any(String),
    });
    expect(f.generate).not.toHaveBeenCalled();
    expect(tag).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    const [strings, ...bindings] = tag.mock.calls[0]!;
    const sql = (strings as TemplateStringsArray).join("?").replace(/\s+/g, " ").trim();
    expect(sql).toMatch(/^SELECT id(?:::text)?(?: AS id)?, project_key, name, repository, status, updated_at FROM public\.bob_projects /i);
    expect(sql).toContain("WHERE owner_id = ?");
    expect(sql).toContain("deleted_at IS NULL");
    expect(bindings).toEqual(["rick"]);
  });

  it("leaves the Workbench view disabled without loading any catalog or admin rows", async () => {
    expect((await fixture({ enabled: false }).read()).status).toBe(404);
    expectNoCatalogQuery();
  });

  it.each([
    ["an anonymous request", null, 401],
    ["an unregistered interface token", "synthetic-unregistered-token", 401],
    ["the master device token", TEST_DEVICE_TOKEN, 403],
  ] as const)("denies %s before SQL despite forged owner headers", async (_name, bearer, status) => {
    expect((await fixture().read(undefined, bearer)).status).toBe(status);
    expectNoCatalogQuery();
  });

  it.each([
    ["project-bound access", { ...owner, projectKey: "fixture" }],
    ["a different surface", { ...owner, surface: "codex" }],
    ["missing catalog read scope", { ...owner, scopes: ["control-center:owner", "context:read"] }],
    ["missing owner scope", { ...owner, scopes: ["control-center:read", "context:read"] }],
    ["missing context read scope", { ...owner, scopes: ["control-center:read", "control-center:owner"] }],
  ] as const)("denies %s before SQL", async (_name, credential) => {
    const f = fixture({ credential: { ...credential, scopes: [...credential.scopes] } });
    expect((await f.read()).status).toBe(403);
    expectNoCatalogQuery();
  });

  it.each([
    "?view=workbench",
    "?project=FIXTURE&view=workbench",
    "?project=fixture&project=fixture&view=workbench",
    "?project=fixture&view=workbench&view=workbench",
    "?project=fixture&view=workbench&view=ordinary",
    "?project=fixture&view=ordinary&view=workbench",
    "?project=fixture&view=workbench&task=synthetic",
  ])("rejects malformed Workbench query before either SQL path: %s", async search => {
    expect((await fixture().read(search)).status).toBe(400);
    expectNoCatalogQuery();
  });

  it.each(["unknown-fixture", "archived-fixture"])("rejects unselectable project %s without loading admin data", async project => {
    expect((await fixture().read(`?project=${project}&view=workbench`)).status).toBe(404);
    expect(tag).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });

  it("contains private catalog failures without falling through to the admin query", async () => {
    tag.mockRejectedValue(new Error("sensitive synthetic database failure"));
    const response = await fixture().read();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("sensitive synthetic database failure");
    expect(tag).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves the ordinary administration response when Workbench is enabled=%s", async enabled => {
    const response = await fixture({ enabled }).read("?project=fixture");
    expect(response.status).toBe(200);
    const result = await response.json();
    const { id: _projectId, ...publicFields } = expectedProject;
    expect(result.selectedProject).toEqual({
      ...publicFields, description: "Synthetic description omitted from Workbench",
    });
    expect(result).toMatchObject({
      projects: [result.selectedProject, { projectKey: "archived-fixture", status: "archived" }],
      approvals: [{ title: "Synthetic approval title", proposal: "Synthetic approval proposal" }],
      releaseEvents: [{ summary: "Synthetic activity summary" }],
      interfaces: [{ id: "synthetic-admin-connection" }],
      legacyCredentialCount: 1,
      oauthConnections: { status: "available", grants: [{ surface: "codex" }] },
      generatedAt: expect.any(String),
      requestId: expect.any(String),
    });
    expect(result.projects[1]).not.toHaveProperty("id");
    expect(tag).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
