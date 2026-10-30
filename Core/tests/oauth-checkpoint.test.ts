import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import type { ProjectItem } from "../src/context/types.js";
import { InMemoryMemoryStore } from "../src/memory/in-memory-store.js";
import { MemoryService } from "../src/memory/service.js";
import { mountBobMcp } from "../src/mcp/mount.js";
import {
  createOAuthGateway,
  OAUTH_MCP_SCOPES,
  type OAuthGrant,
} from "../src/security/oauth.js";
import { createTestConfig } from "./test-config.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const project: ProjectItem = {
  id: projectId, ownerId: "rick", projectKey: "bobai", name: "Synthetic engineering",
  description: null, repository: null, status: "active", metadata: {},
  createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z",
};
const oauth = {
  issuer: "https://owner.example/api/auth", resource: "https://core.example/mcp/linked",
  clientId: "synthetic-resource", clientSecret: "synthetic-introspection-secret-not-used-externally",
};
const minimalScopes = ["mcp:context:read", "mcp:sync"];
const checkpointScopes = [...minimalScopes, "handoffs:write"];
const checkpoint = {
  operationId: "synthetic-oauth-checkpoint-0001", expectedProjectId: projectId,
  outcome: "Synthetic offline qualification completed.", unresolved: [],
  nextActions: ["Keep live activation pending."],
};

function fixture(options: {
  tokenScopes?: string[]; grantScopes?: string[]; projectKey?: string;
  claims?: Record<string, unknown>;
} = {}) {
  const config = createTestConfig({ oauth, sharedContextEnabled: true });
  const store = new InMemorySharedContextStore({ projects: [project,
    { ...project, id: otherId, projectKey: "personal", name: "Synthetic Personal" },
  ] });
  const memory = new MemoryService(new InMemoryMemoryStore(), config.ownerId, 6);
  const service = new SharedContextService(store, config.ownerId, memory, 6);
  const generate = vi.fn(async () => { throw new Error("AI must not run in this offline test."); });
  const app = createApp({ config, aiProvider: { generate }, memoryService: memory, sharedContextService: service });
  mountBobMcp(app, config, service);
  let grant: OAuthGrant | null = {
    id: "33333333-3333-4333-8333-333333333333", ownerId: config.ownerId,
    userId: "synthetic-owner", clientId: "synthetic-codex", projectKey: options.projectKey ?? "bobai",
    surface: "codex", scopes: options.grantScopes ?? checkpointScopes,
  };
  const claims = {
    active: true, iss: oauth.issuer, aud: oauth.resource, exp: Date.now() / 1000 + 900,
    sub: grant.userId, client_id: grant.clientId, bob_grant_id: grant.id,
    bob_owner_id: grant.ownerId, bob_project_key: grant.projectKey, bob_surface: grant.surface,
    scope: (options.tokenScopes ?? checkpointScopes).join(" "), ...options.claims,
  };
  const forwarded = vi.fn((req: Request) => app.fetch(req));
  const compatible = vi.fn(() => new Response("unexpected compatibility route", { status: 500 }));
  const introspect = vi.fn<typeof fetch>(async () => Response.json(claims));
  const readGrant = vi.fn(async () => grant);
  const gateway = createOAuthGateway(forwarded, compatible, config, {
    fetch: introspect, readGrant,
    attemptLimiter: async () => ({ allowed: true, retryAfterSeconds: 1 }),
  });
  const request = (method: string, params?: unknown) => gateway(new Request(oauth.resource, {
    method: "POST", headers: {
      authorization: "Bearer synthetic-opaque-token", "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-bob-core-interface-id": "forged-admin", "x-bob-core-interface-project": "personal",
      "x-bob-core-interface-surface": "web", "x-bob-core-interface-scopes": "credentials:manage,handoffs:write",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) }),
  }));
  const call = (input: unknown = checkpoint) => request("tools/call", { name: "bob_record_handoff", arguments: input });
  return { gateway, request, call, store, generate, forwarded, introspect, readGrant,
    revoke: () => { grant = null; } };
}

async function rpc(response: Response) {
  expect(response.status).toBe(200);
  const body = await response.text();
  if (response.headers.get("content-type")?.includes("application/json")) return JSON.parse(body);
  const messages = body.split("\n").filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
  const reply = messages.find((message) => message.id === 1);
  expect(reply).toBeDefined();
  return reply;
}

describe("engineering OAuth checkpoint scope", () => {
  it("advertises checkpoint consent and exposes only the minimal scoped tools", async () => {
    const f = fixture();
    const metadata = await f.gateway(new Request("https://core.example/.well-known/oauth-protected-resource/mcp/linked"));
    expect((await metadata.json()).scopes_supported).toEqual(OAUTH_MCP_SCOPES);
    expect(OAUTH_MCP_SCOPES).toContain("handoffs:write");
    const listed = await rpc(await f.request("tools/list"));
    expect(listed.result.tools.map((tool: { name: string }) => tool.name).sort())
      .toEqual(["bob_get_context", "bob_record_handoff"]);
  });

  it("writes and identically replays through OAuth, binding provenance and stripping forged headers", async () => {
    const f = fixture();
    const first = await rpc(await f.call());
    expect(first.result.isError).not.toBe(true);
    expect(first.result.structuredContent).toMatchObject({ idempotent: false,
      handoff: { outcome: checkpoint.outcome, source: "codex" } });
    const replay = await rpc(await f.call());
    expect(replay.result.structuredContent).toMatchObject({ idempotent: true,
      handoff: { id: first.result.structuredContent.handoff.id } });
    const saved = await f.store.listHandoffs("rick", projectId, 10);
    expect(saved).toHaveLength(1);
    expect(await f.store.listHandoffs("rick", otherId, 10)).toHaveLength(0);
    const req = f.forwarded.mock.calls[0]![0];
    expect(req.headers.get("x-bob-core-interface-id")).toBe("oauth:33333333-3333-4333-8333-333333333333");
    expect(req.headers.get("x-bob-core-interface-project")).toBe("bobai");
    expect(req.headers.get("x-bob-core-interface-surface")).toBe("codex");
    expect(req.headers.get("x-bob-core-interface-scopes")).toBe(checkpointScopes.join(","));
    expect(f.generate).not.toHaveBeenCalled();
  });

  it("does not expose or execute handoffs when the token omits scope even if the grant permits it", async () => {
    const f = fixture({ tokenScopes: minimalScopes });
    const listed = await rpc(await f.request("tools/list"));
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["bob_get_context"]);
    const denied = await rpc(await f.call());
    expect(Boolean(denied.error || denied.result?.isError)).toBe(true);
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(0);
  });

  it.each([
    { name: "grant omits checkpoint scope", grantScopes: minimalScopes },
    { name: "token claims an unsupported permission", tokenScopes: [...checkpointScopes, "credentials:manage"] },
    { name: "Personal grant remains denied", projectKey: "personal" },
    { name: "project binding differs", claims: { bob_project_key: "rfq" } },
    { name: "surface differs", claims: { bob_surface: "web" } },
    { name: "owner differs", claims: { bob_owner_id: "other-owner" } },
    { name: "client differs", claims: { client_id: "other-client" } },
    { name: "resource differs", claims: { aud: "https://other.example/mcp/linked" } },
  ])("rejects $name before application dispatch", async (options) => {
    const f = fixture(options);
    expect((await f.call()).status).toBe(401);
    expect(f.forwarded).not.toHaveBeenCalled();
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(0);
    expect(await f.store.listHandoffs("rick", otherId, 10)).toHaveLength(0);
  });

  it("denies missing sync scope before dispatch", async () => {
    const f = fixture({ tokenScopes: ["mcp:context:read", "handoffs:write"] });
    expect((await f.call()).status).toBe(403);
    expect(f.forwarded).not.toHaveBeenCalled();
  });

  it("rechecks live revocation on the next request with the same token", async () => {
    const f = fixture();
    expect((await f.request("tools/list")).status).toBe(200);
    f.revoke();
    expect((await f.call()).status).toBe(401);
    expect(f.readGrant).toHaveBeenCalledTimes(2);
    expect(f.forwarded).toHaveBeenCalledTimes(1);
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(0);
  });

  it("denies receipt replay after revocation without changing the original checkpoint", async () => {
    const f = fixture();
    const saved = await rpc(await f.call());
    expect(saved.result.isError).not.toBe(true);
    f.revoke();
    expect((await f.call()).status).toBe(401);
    expect(f.forwarded).toHaveBeenCalledTimes(1);
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(1);
    expect(await f.store.listRecentEvents("rick", projectId, 10)).toHaveLength(1);
  });

  it.each([
    { projectKey: "personal" },
    { actor: { surface: "web", interfaceId: "forged-owner" } },
    { expectedProjectId: "not-a-uuid" },
  ])("rejects invalid or caller-supplied authority fields: %j", async (extra) => {
    const f = fixture();
    const rejected = await rpc(await f.call({ ...checkpoint, ...extra }));
    expect(Boolean(rejected.error || rejected.result?.isError)).toBe(true);
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(0);
    expect(await f.store.listHandoffs("rick", otherId, 10)).toHaveLength(0);
    expect(await f.store.listRecentEvents("rick", projectId, 10)).toHaveLength(0);
  });

  it("commits one checkpoint and audit event under concurrent retries, with context readback", async () => {
    const f = fixture();
    const context = async () => (await rpc(await f.request("tools/call", {
      name: "bob_get_context", arguments: { projectKey: "bobai", surface: "codex" },
    }))).result.structuredContent;
    const before = await context();
    const replies = await Promise.all(Array.from({ length: 8 }, async () => rpc(await f.call())));
    for (const reply of replies) expect(reply.result.isError).not.toBe(true);
    const outcomes = replies.map((reply) => reply.result.structuredContent);
    expect(outcomes.filter((outcome) => !outcome.idempotent)).toHaveLength(1);
    expect(new Set(outcomes.map((outcome) => outcome.handoff.id)).size).toBe(1);
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(1);
    expect(await f.store.listRecentEvents("rick", projectId, 10)).toHaveLength(1);
    const after = await context();
    expect(after.project).toMatchObject({ id: projectId, projectKey: "bobai" });
    expect(after.request.surface).toBe("codex");
    expect(after.handoffs).toHaveLength(1);
    expect(after.handoffs[0]).toMatchObject(outcomes[0].handoff);
    expect(after.revision).not.toBe(before.revision);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.decisions).toEqual(before.decisions);
    expect(after.memories).toEqual(before.memories);
    expect(f.generate).not.toHaveBeenCalled();
  });

  it("rejects one of two concurrent conflicting payloads sharing an operation ID", async () => {
    const f = fixture();
    const replies = await Promise.all([
      f.call(),
      f.call({ ...checkpoint, outcome: "Competing checkpoint content." }),
    ].map(async (response) => rpc(await response)));
    expect(replies.filter((reply) => reply.result.isError)).toHaveLength(1);
    const accepted = replies.find((reply) => !reply.result.isError)!.result.structuredContent;
    const saved = await f.store.listHandoffs("rick", projectId, 10);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject(accepted.handoff);
    expect(await f.store.listRecentEvents("rick", projectId, 10)).toHaveLength(1);
  });

  it("rejects changed-content reuse and wrong expected UUID without another write", async () => {
    const f = fixture();
    const wrong = await rpc(await f.call({ ...checkpoint, expectedProjectId: otherId }));
    expect(wrong.result.isError).toBe(true);
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(0);
    expect((await rpc(await f.call())).result.structuredContent.idempotent).toBe(false);
    const changed = await rpc(await f.call({ ...checkpoint, outcome: "Different content." }));
    expect(changed.result.isError).toBe(true);
    expect(await f.store.listHandoffs("rick", projectId, 10)).toHaveLength(1);
  });
});
