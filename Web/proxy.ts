import { NextResponse,type NextRequest } from "next/server";

// Local fixture review only. Block before rendering so streaming cannot turn
// the page-level notFound response into a 200. Existing app routes are untouched.
export function proxy(request:NextRequest) {
  const prototype=request.nextUrl.pathname.startsWith("/prototype/");
  const enabled=prototype?process.env.BOB_WORKFLOW_PROTOTYPE_ENABLED:process.env.BOB_GOVERNED_WORKFLOW_ENABLED;
  if (enabled !== "true" || process.env.VERCEL) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/prototype/project-workflow/:path*","/work/:path*","/api/workflow/:path*"] };
