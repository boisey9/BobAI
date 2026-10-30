import { createElement } from "../../Web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../Web/node_modules/react-dom/server.node.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const seams = vi.hoisted(() => ({ enabled: true, csrf: true, session: null, pool: null, handler: null, failure: null }));
// Exercise our provider hooks with captured configuration; no token issuer or database runs here.
vi.mock("../../Web/node_modules/@better-auth/mcp/dist/index.mjs", () => ({ mcp: options => ({ id: "mcp", options }) }));
vi.mock("../../Web/lib/owner-auth", () => ({
  ownerAuthEnabled: () => seams.enabled, ownerEmail: () => "owner@example.test",
  withOwnerDatabase: async work => { if (seams.failure) throw seams.failure; return work(seams.pool); },
  createOwnerAuth: (_pool, _bootstrap, approval) => ({
    api: { getSession: async () => seams.session },
    handler: request => seams.handler(request, approval),
  }),
}));
vi.mock("../../Web/lib/session", () => ({ validateOwnerCsrfToken: async value => seams.csrf && value === "synthetic-csrf" }));
import { approveProjectGrant, liveGrant, revokeProjectGrant, OAUTH_SCOPES } from "../../Web/lib/oauth-grants";
import { projectOAuthPlugins } from "../../Web/lib/oauth-provider";
import { OwnerConnect } from "../../Web/components/owner-connect";
import { POST } from "../../Web/app/api/connections/consent/route";
import { DELETE } from "../../Web/app/api/connections/[id]/route";

const grantId = "11111111-1111-4111-8111-111111111111";
const baseScopes = ["mcp:context:read", "mcp:sync"];
const scopes = [...baseScopes, "handoffs:write"];
const grant = { id: grantId, owner_id: "synthetic-owner", user_id: "synthetic-user", client_id: "synthetic-client", project_key: "bobai", surface: "codex", scopes };
const input = { userId: grant.user_id, clientId: grant.client_id, projectKey: grant.project_key,
  surface: grant.surface, scopes, oauthQuery: "synthetic-signed-query", operationId: "22222222-2222-4222-8222-222222222222" };
const resource = "https://core.example/mcp/linked";
const body = () => ({ accept: true, projectKey: "bobai", surface: "codex", scopes,
  oauthQuery: new URLSearchParams({ client_id: grant.client_id, scope: scopes.join(" ") }).toString(),
  operationId: input.operationId });
function request(data = body(), headers = {}) {
  return new Request("https://owner.example/api/connections/consent", { method: "POST",
    headers: { origin: "https://owner.example", "content-type": "application/json", "x-bob-csrf-token": "synthetic-csrf", ...headers },
    body: JSON.stringify(data) });
}
function transactionFixture(existing = null, active = true) {
  const client = { query: vi.fn(async (sql) => {
    if (sql.includes("SELECT id, request_fingerprint")) return { rows: existing ? [existing] : [] };
    if (sql.includes("SELECT id FROM bob_projects")) return { rows: active ? [{ id: "synthetic-project" }] : [], rowCount: active ? 1 : 0 };
    if (sql.includes("UPDATE bob_oauth_project_grants")) return { rows: [{ project_id: "synthetic-project" }] };
    return { rows: [], rowCount: 0 };
  }), release: vi.fn() };
  return { client, pool: { connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [grant] })) } };
}
beforeEach(() => {
  vi.stubEnv("BOB_AUTH_BASE_URL", "https://owner.example");
  vi.stubEnv("BOB_AUTH_OAUTH_ENABLED", "true");
  vi.stubEnv("BOB_AUTH_CORE_OWNER_ID", "synthetic-owner");
  vi.stubEnv("BOB_AUTH_OWNER_EMAIL", "owner@example.test");
  vi.stubEnv("BOB_AUTH_MCP_RESOURCE", resource);
  seams.enabled = true; seams.csrf = true; seams.failure = null;
  seams.session = { user: { id: grant.user_id, email: "owner@example.test" } };
  seams.pool = transactionFixture().pool;
  seams.handler = vi.fn(async (_request, approval) => {
    if (approval) await approval();
    return Response.json({ url: "https://client.example/callback?synthetic=1" });
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Unexpected network access"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("checkpoint consent without widening existing grants", () => {
  it("advertises and explains the optional checkpoint permission", () => {
    expect(OAUTH_SCOPES).toContain("handoffs:write");
    const options = projectOAuthPlugins(seams.pool)[0].options;
    expect(options.scopes).toContain("handoffs:write");
    expect(options.resources[0].allowedScopes).toContain("handoffs:write");
    const html = renderToStaticMarkup(createElement(OwnerConnect, { oauthQuery: "synthetic", clientId: grant.client_id,
      clientName: "Synthetic client", requestedScopes: scopes, projects: [{ key: "bobai", name: "Synthetic project" }], csrf: "synthetic-csrf" }));
    expect(html).toContain("Save project progress checkpoints");
    expect(html).toMatch(/<input type="checkbox" checked=""\/>.*?Save project progress checkpoints/);
    expect(html).toContain("Decision proposals require your review");
  });

  it("approves only explicitly requested and selected checkpoint scope", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const client = await seams.pool.connect();
    const insert = client.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO bob_oauth_project_grants"));
    expect(insert[1].slice(1, 7)).toEqual([grant.owner_id, grant.user_id, grant.client_id, "synthetic-project", "codex", scopes]);
    const selected = { ...body(), scopes: baseScopes };
    seams.pool = transactionFixture().pool;
    expect((await POST(request(selected))).status).toBe(200);
    const reduced = (await seams.pool.connect()).query.mock.calls.find(([sql]) => sql.includes("INSERT INTO bob_oauth_project_grants"));
    expect(reduced[1][6]).toEqual(baseScopes);
  });

  it.each([
    { scopes: [...scopes, "credentials:manage"] },
    { oauthQuery: new URLSearchParams({ client_id: grant.client_id, scope: baseScopes.join(" ") }).toString() },
    { scopes: ["handoffs:write"] }, { surface: "web" }, { scopes: [42] },
  ])("rejects unsupported or unrequested permission selection %j", async change => {
    expect((await POST(request({ ...body(), ...change }))).status).toBe(400);
    expect(seams.pool.connect).not.toHaveBeenCalled();
    expect(seams.handler).not.toHaveBeenCalled();
  });

  it("requires origin, CSRF and current owner, and keeps disabled endpoints absent", async () => {
    expect((await POST(request(body(), { origin: "https://foreign.invalid" }))).status).toBe(403);
    expect((await POST(request(body(), { "x-bob-csrf-token": "forged" }))).status).toBe(403);
    seams.session = null;
    expect((await POST(request())).status).toBe(401);
    seams.session = { user: { id: "other", email: "other@example.test" } };
    expect((await POST(request())).status).toBe(401);
    seams.enabled = false;
    expect((await POST(request())).status).toBe(404);
    expect(seams.pool.connect).not.toHaveBeenCalled();
  });

  it("declines without creating a grant and contains database failure", async () => {
    expect((await POST(request({ ...body(), accept: false }))).status).toBe(200);
    expect(seams.pool.connect).not.toHaveBeenCalled();
    seams.failure = Error("synthetic-private-driver-error");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-private-driver-error");
  });

  it("does not grant checkpoint scope through an older consent or stale approval", async () => {
    const options = projectOAuthPlugins(seams.pool, grant)[0].options;
    expect(await options.postLogin.consentReferenceId({ user: { id: grant.user_id }, scopes })).toBe(grantId);
    const old = projectOAuthPlugins(seams.pool, { ...grant, scopes: baseScopes })[0].options;
    await expect(old.postLogin.consentReferenceId({ user: { id: grant.user_id }, scopes })).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(options.postLogin.consentReferenceId({ user: { id: "other" }, scopes })).rejects.toMatchObject({ status: "FORBIDDEN" });
    seams.pool.query.mockResolvedValue({ rows: [] });
    await expect(options.postLogin.consentReferenceId({ user: { id: grant.user_id }, scopes })).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("binds token claims to the live project, resource and grant scope on every issuance", async () => {
    const claims = projectOAuthPlugins(seams.pool)[0].options.customAccessTokenClaims;
    const args = { user: { id: grant.user_id }, referenceId: grantId, scopes, resources: [resource] };
    expect(await claims(args)).toEqual({ bob_grant_id: grantId, bob_owner_id: grant.owner_id, bob_project_key: "bobai", bob_surface: "codex" });
    await expect(claims({ ...args, resources: ["https://foreign.invalid/mcp/linked"] })).rejects.toMatchObject({ status: "FORBIDDEN" });
    seams.pool.query.mockResolvedValue({ rows: [{ ...grant, scopes: baseScopes }] });
    await expect(claims(args)).rejects.toMatchObject({ status: "FORBIDDEN" });
    seams.pool.query.mockResolvedValue({ rows: [] });
    await expect(claims(args)).rejects.toMatchObject({ status: "FORBIDDEN" });
    const [sql, values] = seams.pool.query.mock.calls.at(-1);
    expect(values).toEqual([grantId, grant.user_id, grant.owner_id]);
    for (const guard of ["g.revoked_at IS NULL", "p.status='active'", "p.deleted_at IS NULL", "p.project_key<>'personal'"])
      expect(sql).toContain(guard);
    expect(await liveGrant(seams.pool, "invalid", grant.user_id)).toBeNull();
  });

  it("reuses an identical operation but conflicts on changed scope or a revoked receipt", async () => {
    const first = transactionFixture();
    const created = await approveProjectGrant(first.pool, input);
    const inserted = first.client.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO bob_oauth_project_grants"))[1];
    const existing = { id: created.id, request_fingerprint: inserted[8], revoked_at: null };
    const retry = transactionFixture(existing);
    expect(await approveProjectGrant(retry.pool, input)).toEqual(created);
    expect(retry.client.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    await expect(approveProjectGrant(transactionFixture(existing).pool, { ...input, scopes: baseScopes })).rejects.toMatchObject({ status: "CONFLICT" });
    await expect(approveProjectGrant(transactionFixture({ ...existing, revoked_at: "synthetic-revocation" }).pool, input)).rejects.toMatchObject({ status: "CONFLICT" });
    await expect(approveProjectGrant(transactionFixture(null, false).pool, input)).rejects.toThrow("available engineering project");
  });

  it("revokes project grant, access/refresh tokens and consent in one owner transaction", async () => {
    const f = transactionFixture();
    await revokeProjectGrant(f.pool, grantId, grant.user_id);
    const calls = f.client.query.mock.calls;
    expect(calls[0][0]).toBe("BEGIN"); expect(calls.at(-1)[0]).toBe("COMMIT");
    expect(calls.find(([sql]) => sql.startsWith("UPDATE"))[1]).toEqual([grantId, grant.user_id, grant.owner_id]);
    for (const table of ["bob_auth_oauth_access_token", "bob_auth_oauth_refresh_token", "bob_auth_oauth_consent"])
      expect(calls.find(([sql]) => sql.startsWith(`DELETE FROM ${table}`))[1]).toEqual([grantId, grant.user_id]);
    expect(f.client.release).toHaveBeenCalledTimes(1);
    f.client.query.mockImplementation(async sql => { if (sql.startsWith("DELETE")) throw Error("synthetic failure"); return { rows: [] }; });
    await expect(revokeProjectGrant(f.pool, grantId, grant.user_id)).rejects.toThrow("synthetic failure");
    expect(f.client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
  });

  it("protects revocation with the same owner session, CSRF and origin requirements", async () => {
    const revoke = (headers = {}) => DELETE(new Request(`https://owner.example/api/connections/${grantId}`, {
      method: "DELETE", headers: { origin: "https://owner.example", "x-bob-csrf-token": "synthetic-csrf", ...headers },
    }), { params: Promise.resolve({ id: grantId }) });
    expect((await revoke({ origin: "https://foreign.invalid" })).status).toBe(403);
    seams.session = null; expect((await revoke()).status).toBe(401);
    seams.session = { user: { id: grant.user_id, email: "owner@example.test" } };
    expect((await revoke()).status).toBe(200);
  });
});
