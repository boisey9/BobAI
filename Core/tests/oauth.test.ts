import { describe, it, expect, vi } from "vitest";
import {
  createOAuthGateway,
  loadOAuthConfiguration,
  validOAuthClaims,
  type OAuthGrant,
} from "../src/security/oauth.js";
import { createTestConfig } from "./test-config.js";

const oauth = {
  issuer: "https://owner.example/api/auth",
  resource: "https://core.example/mcp/linked",
  clientId: "resource-client",
  clientSecret: "x".repeat(40),
};
const grant: OAuthGrant = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "rick",
  userId: "owner",
  clientId: "chatgpt",
  projectKey: "bobai",
  surface: "chatgpt",
  scopes: ["mcp:context:read", "mcp:sync", "mcp:task:write"],
};
const claims = {
  active: true,
  iss: oauth.issuer,
  aud: oauth.resource,
  exp: Date.now() / 1000 + 900,
  sub: grant.userId,
  client_id: grant.clientId,
  bob_grant_id: grant.id,
  bob_owner_id: grant.ownerId,
  bob_project_key: grant.projectKey,
  bob_surface: grant.surface,
  scope: grant.scopes.join(" "),
};
const request = () =>
  new Request(oauth.resource, {
    method: "POST",
    headers: {
      authorization: "Bearer opaque-token",
      "x-bob-core-interface-project": "personal",
    },
    body: "{}",
  });

describe("project OAuth authorization", () => {
  it("rejects inactive, expired, premature, wrong-owner, wrong-audience and wrong-client tokens", () => {
    expect(validOAuthClaims(claims, grant, oauth, "rick")).toBe(true);
    for (const changed of [
      { active: false },
      { exp: 0 },
      { nbf: Date.now() / 1000 + 60 },
      { iss: "https://other.example" },
      { aud: "https://other.example" },
      { client_id: "other" },
      { sub: "other" },
      { bob_owner_id: "company" },
      { scope: `${claims.scope} credentials:manage` },
      { bob_project_key: "personal" },
    ])
      expect(
        validOAuthClaims({ ...claims, ...changed }, grant, oauth, "rick"),
      ).toBe(false);
    expect(
      validOAuthClaims(
        { ...claims, bob_project_key: "personal" },
        { ...grant, projectKey: "personal" },
        oauth,
        "rick",
      ),
    ).toBe(false);
    expect(
      validOAuthClaims(claims, { ...grant, ownerId: "company" }, oauth, "rick"),
    ).toBe(false);
  });
  it("binds only the verified grant and scopes, strips spoofed headers and preserves compatibility routes", async () => {
    const app = vi.fn(async (req: Request) =>
      Response.json({
        project: req.headers.get("x-bob-core-interface-project"),
        surface: req.headers.get("x-bob-core-interface-surface"),
        path: new URL(req.url).pathname,
      }),
    );
    const compatible = vi.fn(() => new Response("compatible"));
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(claims));
    const gateway = createOAuthGateway(
      app,
      compatible,
      createTestConfig({ oauth }),
      { fetch: network, readGrant: async () => grant },
    );
    expect(await (await gateway(request())).json()).toEqual({
      project: "bobai",
      surface: "chatgpt",
      path: "/mcp/sync",
    });
    const options = network.mock.calls[0]![1]!;
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(
      await (
        await gateway(new Request("https://core.example/mcp/sync"))
      ).text(),
    ).toBe("compatible");
    expect(compatible).toHaveBeenCalledTimes(1);
  });
  it("refuses a revoked grant and fails closed when authorization is unavailable", async () => {
    const app = vi.fn(() => new Response("must not execute"));
    const inactive = createOAuthGateway(app, app, createTestConfig({ oauth }), {
      fetch: async () => Response.json(claims),
      readGrant: async () => null,
    });
    expect((await inactive(request())).status).toBe(401);
    const down = createOAuthGateway(app, app, createTestConfig({ oauth }), {
      fetch: async () => {
        throw new Error("unavailable");
      },
      readGrant: async () => grant,
    });
    expect((await down(request())).status).toBe(503);
    expect(app).not.toHaveBeenCalled();
  });
  it("publishes discoverable metadata without authorization and throttles per grant", async () => {
    const app = vi.fn(() => new Response());
    const gateway = createOAuthGateway(app, app, createTestConfig({ oauth }), {
      fetch: async () => Response.json(claims),
      readGrant: async () => grant,
      limiter: async () => ({ allowed: false, retryAfterSeconds: 15 }),
    });
    const denied = await gateway(new Request(oauth.resource));
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain(
      "oauth-protected-resource/mcp/linked",
    );
    const metadata = await gateway(
      new Request(
        "https://core.example/.well-known/oauth-protected-resource/mcp/linked",
      ),
    );
    expect(await metadata.json()).toMatchObject({
      resource: oauth.resource,
      authorization_servers: [oauth.issuer],
    });
    expect((await gateway(request())).status).toBe(429);
    expect(app).not.toHaveBeenCalled();
  });
  it("returns a scope challenge without executing under-scoped tokens", async () => {
    const app = vi.fn(() => new Response());
    const gateway = createOAuthGateway(app, app, createTestConfig({ oauth }), {
      fetch: async () =>
        Response.json({ ...claims, scope: "mcp:context:read" }),
      readGrant: async () => grant,
    });
    const response = await gateway(request());
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope"',
    );
    expect(app).not.toHaveBeenCalled();
  });
  it("requires explicit canonical configuration before enabling account linking", () => {
    expect(loadOAuthConfiguration({}, true)).toBeUndefined();
    expect(() =>
      loadOAuthConfiguration({ BOB_CORE_OAUTH_ENABLED: "true" }, true),
    ).toThrow("OAuth requires");
    const env = {
      BOB_CORE_OAUTH_ENABLED: "true",
      BOB_CORE_OAUTH_ISSUER: oauth.issuer,
      BOB_CORE_OAUTH_RESOURCE: oauth.resource,
      BOB_CORE_OAUTH_INTROSPECTION_CLIENT_ID: oauth.clientId,
      BOB_CORE_OAUTH_INTROSPECTION_CLIENT_SECRET: oauth.clientSecret,
    };
    expect(loadOAuthConfiguration(env, true)).toEqual(oauth);
    expect(() =>
      loadOAuthConfiguration(
        { ...env, BOB_CORE_OAUTH_RESOURCE: "https://core.example/mcp" },
        true,
      ),
    ).toThrow();
  });
});
