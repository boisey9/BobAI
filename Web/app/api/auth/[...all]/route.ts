import {
  ownerAuthEnabled,
  withOwnerDatabase,
  createOwnerAuth,
} from "@/lib/owner-auth";
import { oauthEnabled } from "@/lib/oauth-grants";
import { retireExpiredOAuthSessions } from "@/lib/oauth-sessions";

export const runtime = "nodejs";

async function handle(request: Request) {
  if (!ownerAuthEnabled()) return new Response(null, { status: 404 });
  const path = new URL(request.url).pathname;
  if (
    [
      "/token",
      "/oauth2/consent",
      "/oauth2/create-client",
      "/oauth2/update-client",
      "/oauth2/delete-client",
      "/oauth2/client/rotate-secret",
      "/oauth2/update-consent",
      "/oauth2/delete-consent",
    ].some((suffix) => path === `/api/auth${suffix}`)
  )
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  try {
    const response = await withOwnerDatabase(async (pool) => {
      if (
        oauthEnabled() &&
        path === "/api/auth/oauth2/token" &&
        request.method === "POST"
      )
        await retireExpiredOAuthSessions(pool);
      return createOwnerAuth(pool).handler(request);
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    return Response.json(
      {
        error:
          "Owner authentication is temporarily unavailable. Retry after recovery.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
