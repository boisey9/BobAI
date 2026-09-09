import {
  ownerAuthEnabled,
  ownerEmail,
  withOwnerDatabase,
  createOwnerAuth,
} from "@/lib/owner-auth";
import { validateOwnerCsrfToken } from "@/lib/session";
import {
  approveProjectGrant,
  oauthEnabled,
  LINK_SURFACES,
  OAUTH_SCOPES,
  type LinkSurface,
} from "@/lib/oauth-grants";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!ownerAuthEnabled() || !oauthEnabled())
    return new Response(null, { status: 404 });
  if (
    request.headers.get("origin") !==
      new URL(process.env.BOB_AUTH_BASE_URL!).origin ||
    !(await validateOwnerCsrfToken(
      request.headers.get("x-bob-csrf-token") ?? undefined,
    ))
  )
    return new Response(null, { status: 403 });
  try {
    const body = await request.json();
    if (
      typeof body.accept !== "boolean" ||
      typeof body.oauthQuery !== "string" ||
      body.oauthQuery.length > 16000 ||
      typeof body.operationId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(body.operationId)
    )
      return Response.json(
        { error: "Invalid connection request." },
        { status: 400 },
      );
    const query = new URLSearchParams(body.oauthQuery);
    const clientId = query.get("client_id");
    const requested = query.get("scope")?.split(" ").filter(Boolean) ?? [];
    const scopes = Array.isArray(body.scopes)
      ? ([...new Set(body.scopes)] as string[])
      : [];
    if (
      !clientId ||
      clientId.length > 2048 ||
      !scopes.every(
        (scope) => OAUTH_SCOPES.includes(scope) && requested.includes(scope),
      ) ||
      (body.accept &&
        (!scopes.includes("mcp:context:read") ||
          !scopes.includes("mcp:sync") ||
          !LINK_SURFACES.includes(body.surface) ||
          typeof body.projectKey !== "string" ||
          body.projectKey.length > 100))
    )
      return Response.json(
        { error: "Invalid project or permission selection." },
        { status: 400 },
      );
    return await withOwnerDatabase(async (pool) => {
      const session = await createOwnerAuth(pool).api.getSession({
        headers: request.headers,
      });
      if (!session || session.user.email.toLowerCase() !== ownerEmail())
        return new Response(null, { status: 401 });
      const grant = body.accept
        ? () =>
            approveProjectGrant(pool, {
              userId: session.user.id,
              clientId,
              projectKey: body.projectKey,
              surface: body.surface as LinkSurface,
              scopes,
              oauthQuery: body.oauthQuery,
              operationId: body.operationId,
            })
        : undefined;
      const headers = new Headers(request.headers);
      headers.set("content-type", "application/json");
      headers.delete("content-length");
      const response = await createOwnerAuth(pool, false, grant).handler(
        new Request(
          new URL("/api/auth/oauth2/consent", process.env.BOB_AUTH_BASE_URL),
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              accept: body.accept,
              scope: scopes.join(" "),
              oauth_query: body.oauthQuery,
            }),
          },
        ),
      );
      if (!response.ok)
        return Response.json(
          {
            error:
              response.status === 409
                ? "This approval was already used for a different connection. Start linking again."
                : "The authorization request expired or could not be verified. Start linking again.",
          },
          {
            status: response.status === 409 ? 409 : 400,
            headers: { "cache-control": "no-store" },
          },
        );
      response.headers.set("cache-control", "no-store");
      return response;
    });
  } catch {
    return Response.json(
      { error: "Connection could not be confirmed. Retry after recovery." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
