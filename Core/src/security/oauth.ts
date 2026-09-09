import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { BobCoreConfig } from "../config.js";
import {
  createCredentialRateLimiter,
  type CredentialRateLimiter,
} from "./rate-limit.js";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SCOPES_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
} from "./interface-credential.js";

export const OAUTH_MCP_SCOPES = [
  "mcp:context:read",
  "mcp:sync",
  "mcp:event:write",
  "mcp:task:write",
  "mcp:decision:propose",
] as const;
const surfaces = new Set(["chatgpt", "codex", "copilot", "other"]);
export type OAuthConfiguration = {
  issuer: string;
  resource: string;
  clientId: string;
  clientSecret: string;
};
export type OAuthGrant = {
  id: string;
  ownerId: string;
  userId: string;
  clientId: string;
  projectKey: string;
  surface: string;
  scopes: string[];
};
type FetchHandler = (request: Request) => Response | Promise<Response>;
type Claims = Record<string, unknown>;
type GrantReader = (id: string) => Promise<OAuthGrant | null>;

export function loadOAuthConfiguration(
  environment: NodeJS.ProcessEnv,
  production: boolean,
): OAuthConfiguration | undefined {
  if (
    ![undefined, "false", "true"].includes(environment.BOB_CORE_OAUTH_ENABLED)
  )
    throw new Error("BOB_CORE_OAUTH_ENABLED must be true or false.");
  if (environment.BOB_CORE_OAUTH_ENABLED !== "true") return;
  const issuer = environment.BOB_CORE_OAUTH_ISSUER?.trim();
  const resource = environment.BOB_CORE_OAUTH_RESOURCE?.trim();
  const clientId = environment.BOB_CORE_OAUTH_INTROSPECTION_CLIENT_ID?.trim();
  const clientSecret =
    environment.BOB_CORE_OAUTH_INTROSPECTION_CLIENT_SECRET?.trim();
  try {
    if (
      !issuer ||
      !resource ||
      !clientId ||
      !clientSecret ||
      clientSecret.length < 32
    )
      throw new Error();
    for (const value of [issuer, resource]) {
      const url = new URL(value);
      const local =
        !production && ["localhost", "127.0.0.1"].includes(url.hostname);
      if (
        (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
    }
    if (new URL(resource).pathname !== "/mcp/linked" || issuer.endsWith("/"))
      throw new Error();
    return {
      issuer: new URL(issuer).toString(),
      resource: new URL(resource).toString(),
      clientId,
      clientSecret,
    };
  } catch {
    throw new Error(
      "OAuth requires canonical issuer/resource URLs and private introspection client configuration. Secret values were not logged.",
    );
  }
}

export function validOAuthClaims(
  claims: Claims,
  grant: OAuthGrant,
  oauth: OAuthConfiguration,
  ownerId: string,
  now = Date.now(),
) {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const scopes =
    typeof claims.scope === "string"
      ? claims.scope.split(" ").filter(Boolean)
      : [];
  return (
    claims.active === true &&
    claims.iss === oauth.issuer &&
    audience.includes(oauth.resource) &&
    typeof claims.exp === "number" &&
    claims.exp * 1000 > now &&
    (claims.nbf === undefined ||
      (typeof claims.nbf === "number" && claims.nbf * 1000 <= now)) &&
    claims.sub === grant.userId &&
    claims.client_id === grant.clientId &&
    claims.bob_grant_id === grant.id &&
    claims.bob_owner_id === ownerId &&
    grant.ownerId === ownerId &&
    claims.bob_project_key === grant.projectKey &&
    grant.projectKey !== "personal" &&
    /^[a-z0-9][a-z0-9_-]{0,99}$/.test(grant.projectKey) &&
    surfaces.has(grant.surface) &&
    claims.bob_surface === grant.surface &&
    scopes.every(
      (scope) =>
        scope === "offline_access" ||
        (OAUTH_MCP_SCOPES as readonly string[]).includes(scope),
    ) &&
    scopes.every((scope) => grant.scopes.includes(scope))
  );
}

function grantReader(config: BobCoreConfig): GrantReader {
  return async (id) => {
    const sql = neon(config.databaseURL!, {
      fetchOptions: { signal: AbortSignal.timeout(5_000) },
    });
    const rows =
      await sql`SELECT g.id, g.owner_id AS "ownerId", g.user_id AS "userId", g.client_id AS "clientId",
      p.project_key AS "projectKey", g.surface, g.scopes
      FROM bob_oauth_project_grants g JOIN bob_projects p ON p.id=g.project_id AND p.owner_id=g.owner_id
      WHERE g.id=${id} AND g.owner_id=${config.ownerId} AND g.revoked_at IS NULL
        AND p.deleted_at IS NULL AND p.status='active' AND p.project_key<>'personal'`;
    return (rows[0] as OAuthGrant) ?? null;
  };
}

export function createOAuthGateway(
  appHandler: FetchHandler,
  compatibleHandler: FetchHandler,
  config: BobCoreConfig,
  dependencies: {
    fetch?: typeof fetch;
    readGrant?: GrantReader;
    limiter?: CredentialRateLimiter;
    attemptLimiter?: CredentialRateLimiter;
  } = {},
): FetchHandler {
  const oauth = config.oauth;
  if (!oauth) return compatibleHandler;
  const readGrant = dependencies.readGrant ?? grantReader(config);
  const limiter = dependencies.limiter ?? createCredentialRateLimiter(config);
  // Always cap network verification, including invalid tokens and when optional
  // per-grant limits are disabled. One owner-wide PostgreSQL bucket is shared by
  // all instances; caller-controlled tokens and proxy headers cannot evade it.
  const attemptLimiter =
    dependencies.attemptLimiter ??
    createCredentialRateLimiter({
      ...config,
      rateLimitsEnabled: true,
      coreRequestsPerMinute: 200,
    })!;
  const attemptBucket = createHash("sha256")
    .update(`${config.ownerId}\0oauth:introspection-attempts`)
    .digest("hex");
  const network = dependencies.fetch ?? fetch;
  const metadataPath = "/.well-known/oauth-protected-resource/mcp/linked";
  const challenge = (status = 401, code = "invalid_token") =>
    Response.json(
      {
        error: {
          code,
          message: "Link or reauthorize this project connection in Bob.",
        },
      },
      {
        status,
        headers: {
          "cache-control": "no-store",
          "www-authenticate": `Bearer error="${code}", resource_metadata="${new URL(metadataPath, oauth.resource)}", scope="mcp:context:read mcp:sync"`,
        },
      },
    );
  return async (request) => {
    const url = new URL(request.url);
    if (
      [metadataPath, "/.well-known/oauth-protected-resource"].includes(
        url.pathname,
      )
    ) {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response(null, {
          status: 405,
          headers: { allow: "GET, HEAD" },
        });
      return new Response(
        request.method === "HEAD"
          ? null
          : JSON.stringify({
              resource: oauth.resource,
              authorization_servers: [oauth.issuer],
              scopes_supported: OAUTH_MCP_SCOPES,
              bearer_methods_supported: ["header"],
            }),
        {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        },
      );
    }
    if (url.pathname !== "/mcp/linked") return compatibleHandler(request);
    if (!["POST", "GET", "DELETE"].includes(request.method))
      return new Response(null, {
        status: 405,
        headers: { allow: "POST, GET, DELETE" },
      });
    const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(
      request.headers.get("authorization") ?? "",
    );
    const token = match?.[1];
    if (!token || token.length > 4096) return challenge();
    try {
      const capacity = await attemptLimiter(attemptBucket, "core");
      if (!capacity.allowed)
        return Response.json(
          {
            error: {
              code: "oauth_rate_limited",
              message: "Retry project verification shortly.",
            },
          },
          {
            status: 429,
            headers: {
              "cache-control": "no-store",
              "retry-after": String(capacity.retryAfterSeconds),
            },
          },
        );
      const response = await network(`${oauth.issuer}/oauth2/introspect`, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${encodeURIComponent(oauth.clientId)}:${encodeURIComponent(oauth.clientSecret)}`).toString("base64")}`,
        },
        body: new URLSearchParams({ token, token_type_hint: "access_token" }),
      });
      if (!response.ok) throw new Error("Authorization service unavailable.");
      const claims = (await response.json()) as Claims;
      if (
        claims.active !== true ||
        typeof claims.bob_grant_id !== "string" ||
        !/^[a-f0-9-]{36}$/.test(claims.bob_grant_id)
      )
        return challenge();
      const grant = await readGrant(claims.bob_grant_id);
      if (!grant || !validOAuthClaims(claims, grant, oauth, config.ownerId))
        return challenge();
      const scopes = String(claims.scope).split(" ");
      if (
        !["mcp:context:read", "mcp:sync"].every((scope) =>
          scopes.includes(scope),
        )
      )
        return challenge(403, "insufficient_scope");
      if (limiter) {
        const capacity = await limiter(
          createHash("sha256")
            .update(`${config.ownerId}\0oauth:${grant.id}`)
            .digest("hex"),
          "core",
        );
        if (!capacity.allowed)
          return Response.json(
            {
              error: {
                code: "credential_rate_limited",
                message: "Retry this project operation shortly.",
              },
            },
            {
              status: 429,
              headers: {
                "cache-control": "no-store",
                "retry-after": String(capacity.retryAfterSeconds),
              },
            },
          );
      }
      const headers = new Headers(request.headers);
      for (const name of [
        BOB_INTERFACE_ID_HEADER,
        BOB_INTERFACE_PROJECT_HEADER,
        BOB_INTERFACE_SCOPES_HEADER,
        BOB_INTERFACE_SURFACE_HEADER,
      ])
        headers.delete(name);
      headers.set("authorization", `Bearer ${config.deviceToken}`);
      headers.set(BOB_INTERFACE_ID_HEADER, `oauth:${grant.id}`);
      headers.set(BOB_INTERFACE_PROJECT_HEADER, grant.projectKey);
      headers.set(BOB_INTERFACE_SURFACE_HEADER, grant.surface);
      headers.set(
        BOB_INTERFACE_SCOPES_HEADER,
        String(claims.scope)
          .split(" ")
          .filter((scope) =>
            (OAUTH_MCP_SCOPES as readonly string[]).includes(scope),
          )
          .join(","),
      );
      url.pathname = "/mcp/sync";
      return appHandler(new Request(url, new Request(request, { headers })));
    } catch {
      return Response.json(
        {
          error: {
            code: "oauth_unavailable",
            message:
              "Project access could not be verified. Retry after recovery.",
          },
        },
        {
          status: 503,
          headers: { "cache-control": "no-store", "retry-after": "5" },
        },
      );
    }
  };
}
