import { ownerAuthEnabled, withOwnerAuth } from "@/lib/owner-auth";

export const runtime = "nodejs";

async function handle(request: Request) {
  if (!ownerAuthEnabled()) return new Response(null, { status: 404 });
  try {
    const response = await withOwnerAuth((auth) => auth.handler(request));
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
