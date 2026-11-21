import { reviewEnabled, workbenchLayoutReviewEnabled, workbenchReadReviewEnabled, workbenchTaskReviewEnabled } from "./lib/ui-review-enabled";
import {workspaceEntryEnabled} from "./lib/workflow-entry";
import { NextResponse,type NextRequest } from "next/server";

// Local fixture review only. Block before rendering so streaming cannot turn
// the page-level notFound response into a 200. Existing app routes are untouched.
export function proxy(request:NextRequest) {
  if (request.nextUrl.pathname === "/review" || request.nextUrl.pathname.startsWith("/review/") || request.nextUrl.pathname.startsWith("/api/review/")) {
    const path = request.nextUrl.pathname;
    const host = request.headers.get("host");
    const taskPreview = path === "/api/review/workbench/tasks" || path.startsWith("/api/review/workbench/tasks/");
    const enabled = path === "/api/review/workbench/layout" ? workbenchLayoutReviewEnabled(host)
      : taskPreview ? workbenchTaskReviewEnabled(host)
      : path === "/review/workbench/read" ? workbenchReadReviewEnabled(host) : reviewEnabled(host);
    return enabled ? NextResponse.next() : new NextResponse("Not found", { status: 404 });
  }
  const prototype=request.nextUrl.pathname.startsWith("/prototype/");
  const enabled=prototype?process.env.BOB_WORKFLOW_PROTOTYPE_ENABLED:process.env.BOB_GOVERNED_WORKFLOW_ENABLED;
  if (prototype?(enabled !== "true" || !!process.env.VERCEL):!workspaceEntryEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/review/:path*", "/api/review/:path*", "/prototype/project-workflow/:path*","/work/:path*","/api/workflow/:path*"] };
