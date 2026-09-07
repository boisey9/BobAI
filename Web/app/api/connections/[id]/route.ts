import {
  ownerAuthEnabled,
  ownerEmail,
  withOwnerDatabase,
  createOwnerAuth,
} from "@/lib/owner-auth";
import { validateOwnerCsrfToken } from "@/lib/session";
import { oauthEnabled, revokeProjectGrant } from "@/lib/oauth-grants";
export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 400 });
  try {
    return await withOwnerDatabase(async (pool) => {
      const session = await createOwnerAuth(pool).api.getSession({
        headers: request.headers,
      });
      if (!session || session.user.email.toLowerCase() !== ownerEmail())
        return new Response(null, { status: 401 });
      await revokeProjectGrant(pool, id, session.user.id);
      return Response.json(
        { revoked: true },
        { headers: { "cache-control": "no-store" } },
      );
    });
  } catch {
    return Response.json(
      { error: "Revocation could not be confirmed. Retry shortly." },
      { status: 503 },
    );
  }
}
