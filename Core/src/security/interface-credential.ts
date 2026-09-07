import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

import type { BobCoreConfig } from "../config.js";
import { CONTEXT_SURFACES, type ContextSurface } from "../context/types.js";
import { tokenMatches } from "./token.js";
import { createCredentialRateLimiter, type CredentialRateLimiter } from "./rate-limit.js";

export const INTERFACE_CREDENTIAL_SCOPES = [
  "status:read",
  "context:read",
  "tasks:write",
  "handoffs:write",
  "chat:use",
  "activity:read",
  "mcp:context:read",
  "mcp:sync",
  "mcp:event:write",
  "mcp:task:write",
  "mcp:decision:propose",
  "control-center:read",
  "control-center:owner",
  "decision:review",
  "credentials:manage",
] as const;

export type InterfaceCredentialScope =
  (typeof INTERFACE_CREDENTIAL_SCOPES)[number];

export type InterfaceCredential = {
  id: string;
  surface: ContextSurface;
  scopes: InterfaceCredentialScope[];
  projectKey: string | null;
};

export type InterfaceCredentialVerifier = (
  tokenHash: string,
) => Promise<InterfaceCredential | null>;

type FetchHandler = (request: Request) => Response | Promise<Response>;

type RequiredAccess = {
  scope: InterfaceCredentialScope;
  projectKey: string | null;
};

export const BOB_INTERFACE_ID_HEADER = "x-bob-core-interface-id";
export const BOB_INTERFACE_SURFACE_HEADER = "x-bob-core-interface-surface";
export const BOB_INTERFACE_PROJECT_HEADER = "x-bob-core-interface-project";
export const BOB_INTERFACE_SCOPES_HEADER = "x-bob-core-interface-scopes";

const INTERNAL_HEADERS = [
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SCOPES_HEADER,
] as const;

const LEGACY_READ_SCOPES: InterfaceCredentialScope[] = [
  "status:read",
  "context:read",
  "activity:read",
];

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const [scheme, token, ...extra] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra.length > 0) {
    return null;
  }

  return token;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isContextSurface(value: unknown): value is ContextSurface {
  return (
    typeof value === "string" &&
    (CONTEXT_SURFACES as readonly string[]).includes(value)
  );
}

function isScope(value: unknown): value is InterfaceCredentialScope {
  return (
    typeof value === "string" &&
    (INTERFACE_CREDENTIAL_SCOPES as readonly string[]).includes(value)
  );
}

function isOwnerWideControlCenterCredential(
  record: Record<string, unknown>,
  surface: ContextSurface,
  scopes: InterfaceCredentialScope[],
): boolean {
  return (
    record.ownerWide === true &&
    surface === "web" &&
    scopes.includes("control-center:owner")
  );
}

export function parseInterfaceCredential(
  projectKey: string,
  value: unknown,
): InterfaceCredential | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const surface = record.surface;
  const scopes = Array.isArray(record.scopes)
    ? record.scopes.filter(isScope)
    : [];
  const enabled = record.enabled === undefined ? true : record.enabled === true;

  if (!enabled || !id || !isContextSurface(surface) || scopes.length === 0) {
    return null;
  }

  return {
    id,
    surface,
    scopes: [...new Set(scopes)],
    projectKey: isOwnerWideControlCenterCredential(record, surface, scopes)
      ? null
      : projectKey,
  };
}

export function createNeonInterfaceCredentialVerifier(
  config: BobCoreConfig,
): InterfaceCredentialVerifier {
  if (!config.databaseURL) {
    return async () => null;
  }

  const sql = neon(config.databaseURL);

  return async (hash) => {
    try {
      const rows = (await sql`
        SELECT p.project_key, credential
        FROM public.bob_projects p
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(p.metadata #> '{auth,interfaceCredentials}', '[]'::jsonb)
        ) AS credential
        WHERE p.owner_id = ${config.ownerId}
          AND p.deleted_at IS NULL
          AND credential ->> 'hash' = ${hash}
        LIMIT 1
      `) as Array<{ project_key: string; credential: unknown }>;

      if (rows[0]) {
        const parsed = parseInterfaceCredential(
          rows[0].project_key,
          rows[0].credential,
        );
        if (parsed) return parsed;
      }

      const legacyRows = (await sql`
        SELECT 1
        FROM public.bob_projects
        WHERE owner_id = ${config.ownerId}
          AND deleted_at IS NULL
          AND (metadata #> '{auth,readCredentialHashes}') ? ${hash}
        LIMIT 1
      `) as Array<{ "?column?": number }>;

      return legacyRows.length > 0
        ? {
            id: "legacy-read",
            surface: "web",
            scopes: LEGACY_READ_SCOPES,
            projectKey: null,
          }
        : null;
    } catch {
      return null;
    }
  };
}

function requiredAccess(request: Request): RequiredAccess | null {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/v1/chat")
    return { scope: "chat:use", projectKey: null };
  if (
    ["POST", "PATCH"].includes(request.method) &&
    /^\/v1\/tasks(?:\/[^/]+)?$/.test(url.pathname)
  )
    return {
      scope: "tasks:write",
      projectKey: url.searchParams.get("project")?.trim().toLowerCase() || null,
    };
  if (request.method === "POST" && url.pathname === "/v1/handoffs")
    return {
      scope: "handoffs:write",
      projectKey: url.searchParams.get("project")?.trim().toLowerCase() || null,
    };

  if (request.method === "GET" && url.pathname === "/v1/status") {
    return { scope: "status:read", projectKey: null };
  }

  if (request.method === "GET" && url.pathname === "/v1/context") {
    return {
      scope: "context:read",
      projectKey: url.searchParams.get("project")?.trim().toLowerCase() || null,
    };
  }

  if (request.method === "GET" && url.pathname === "/v1/activity") {
    return {
      scope: "activity:read",
      projectKey: url.searchParams.get("project")?.trim().toLowerCase() || null,
    };
  }

  if (
    url.pathname === "/mcp/context" &&
    ["GET", "POST", "DELETE"].includes(request.method)
  ) {
    return { scope: "mcp:context:read", projectKey: null };
  }

  if (
    url.pathname === "/mcp/sync" &&
    ["GET", "POST", "DELETE"].includes(request.method)
  ) {
    return { scope: "mcp:sync", projectKey: null };
  }

  if (request.method === "GET" && url.pathname === "/v1/control-center") {
    return {
      scope: "control-center:read",
      projectKey: url.searchParams.get("project")?.trim().toLowerCase() || null,
    };
  }

  if (
    request.method === "POST" &&
    /^\/v1\/control-center\/approvals\/[^/]+$/.test(url.pathname)
  ) {
    return { scope: "decision:review", projectKey: null };
  }

  if (
    request.method === "POST" &&
    /^\/v1\/control-center\/credentials\/[^/]+$/.test(url.pathname)
  ) {
    return { scope: "credentials:manage", projectKey: null };
  }

  return null;
}

function sanitizedHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const header of INTERNAL_HEADERS) headers.delete(header);
  return headers;
}

function bindRequest(
  request: Request,
  credential: InterfaceCredential,
): Request {
  const url = new URL(request.url);

  if (
    credential.projectKey &&
    (url.pathname === "/v1/context" ||
      url.pathname === "/v1/activity" ||
      url.pathname === "/v1/control-center")
  ) {
    url.searchParams.set("project", credential.projectKey);
  }

  if (url.pathname === "/v1/context") {
    url.searchParams.set("surface", credential.surface);
  }

  return new Request(url, request);
}

function forbiddenResponse(): Response {
  return Response.json(
    {
      error: {
        code: "interface_scope_forbidden",
        message:
          "This Bob interface credential is not permitted to access that resource.",
      },
    },
    {
      status: 403,
      headers: { "cache-control": "no-store" },
    },
  );
}

export function createInterfaceCredentialGateway(
  fetchHandler: FetchHandler,
  config: BobCoreConfig,
  verifier: InterfaceCredentialVerifier = createNeonInterfaceCredentialVerifier(
    config,
  ),
  rateLimiter: CredentialRateLimiter | undefined = createCredentialRateLimiter(config),
): FetchHandler {
  async function dispatch(request: Request, token: string): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (rateLimiter && (path.startsWith("/v1/") || path === "/mcp" || path.startsWith("/mcp/"))) {
      try {
        const operation = path === "/v1/chat" && request.method === "POST" ? "ai" : "core";
        const result = await rateLimiter(tokenHash(`${config.ownerId}\0${token}`), operation);
        if (!result.allowed) return Response.json({ error: { code: "credential_rate_limited",
          message: "This credential has reached its request limit. Retry after the indicated delay." } },
        { status: 429, headers: { "cache-control": "no-store", "retry-after": String(result.retryAfterSeconds) } });
      } catch {
        return Response.json({ error: { code: "rate_limit_unavailable",
          message: "Request capacity could not be checked. Your operation has not been submitted; retry shortly." } },
        { status: 503, headers: { "cache-control": "no-store", "retry-after": "5" } });
      }
    }
    return fetchHandler(request);
  }
  return async (request) => {
    const headers = sanitizedHeaders(request);
    const cleanRequest = new Request(request, { headers });
    const providedToken = bearerToken(cleanRequest);

    if (!providedToken) return fetchHandler(cleanRequest);
    if (await tokenMatches(providedToken, config.deviceToken)) return dispatch(cleanRequest, providedToken);

    const access = requiredAccess(cleanRequest);
    if (!access) return fetchHandler(cleanRequest);

    const credential = await verifier(tokenHash(providedToken));
    if (!credential) return fetchHandler(cleanRequest);

    if (
      credential.projectKey === "personal" &&
      !["bobai", "web"].includes(credential.surface)
    )
      return forbiddenResponse();

    const ownerWide =
      credential.projectKey === null &&
      credential.surface === "web" &&
      credential.scopes.includes("control-center:owner");
    if (
      !credential.scopes.includes(access.scope) &&
      !(
        ownerWide &&
        ["tasks:write", "handoffs:write", "chat:use"].includes(access.scope)
      )
    ) {
      return forbiddenResponse();
    }

    if (
      credential.projectKey &&
      access.projectKey &&
      credential.projectKey !== access.projectKey
    ) {
      return forbiddenResponse();
    }

    if (
      credential.id === "legacy-read" &&
      (access.projectKey === "personal" ||
        (new URL(cleanRequest.url).pathname === "/v1/activity" &&
          !access.projectKey))
    )
      return forbiddenResponse();

    const boundRequest = bindRequest(cleanRequest, credential);
    const boundHeaders = sanitizedHeaders(boundRequest);
    boundHeaders.set("authorization", `Bearer ${config.deviceToken}`);
    boundHeaders.set(BOB_INTERFACE_ID_HEADER, credential.id);
    boundHeaders.set(BOB_INTERFACE_SURFACE_HEADER, credential.surface);
    boundHeaders.set(BOB_INTERFACE_SCOPES_HEADER, credential.scopes.join(","));
    if (credential.projectKey) {
      boundHeaders.set(BOB_INTERFACE_PROJECT_HEADER, credential.projectKey);
    }

    return dispatch(new Request(boundRequest, { headers: boundHeaders }), providedToken);
  };
}
