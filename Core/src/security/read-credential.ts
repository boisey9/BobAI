import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

import type { BobCoreConfig } from "../config.js";
import { tokenMatches } from "./token.js";

const READ_ONLY_PATHS = new Set([
  "/v1/status",
  "/v1/context",
  "/v1/activity",
]);

export type ReadCredentialVerifier = (tokenHash: string) => Promise<boolean>;

type FetchHandler = (request: Request) => Response | Promise<Response>;

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

export function createNeonReadCredentialVerifier(
  config: BobCoreConfig,
): ReadCredentialVerifier {
  if (!config.databaseURL) {
    return async () => false;
  }

  const sql = neon(config.databaseURL);

  return async (hash) => {
    try {
      const rows = (await sql`
        SELECT 1
        FROM public.bob_projects
        WHERE owner_id = ${config.ownerId}
          AND deleted_at IS NULL
          AND (metadata #> '{auth,readCredentialHashes}') ? ${hash}
        LIMIT 1
      `) as Array<{ "?column?": number }>;

      return rows.length > 0;
    } catch {
      return false;
    }
  };
}

export function createReadCredentialGateway(
  fetchHandler: FetchHandler,
  config: BobCoreConfig,
  verifier: ReadCredentialVerifier = createNeonReadCredentialVerifier(config),
): FetchHandler {
  return async (request) => {
    const url = new URL(request.url);

    if (request.method !== "GET" || !READ_ONLY_PATHS.has(url.pathname)) {
      return fetchHandler(request);
    }

    const providedToken = bearerToken(request);
    if (!providedToken || (await tokenMatches(providedToken, config.deviceToken))) {
      return fetchHandler(request);
    }

    if (!(await verifier(tokenHash(providedToken)))) {
      return fetchHandler(request);
    }

    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${config.deviceToken}`);

    return fetchHandler(
      new Request(request, {
        headers,
      }),
    );
  };
}
