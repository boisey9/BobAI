import { workbenchLayoutReviewAPI } from "@/lib/workbench/review-layout-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => workbenchLayoutReviewAPI(request);
export const POST = GET;
