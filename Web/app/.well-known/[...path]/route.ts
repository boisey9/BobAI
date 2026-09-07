import { ownerAuthEnabled, withOwnerAuth } from "@/lib/owner-auth";
import { oauthEnabled } from "@/lib/oauth-grants";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!ownerAuthEnabled() || !oauthEnabled())
    return new Response(null, { status: 404 });
  try {
    return await withOwnerAuth((auth) => auth.handler(request));
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
export const HEAD = GET;
