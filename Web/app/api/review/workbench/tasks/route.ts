import { workbenchTaskReviewAPI } from "@/lib/workbench/review-task-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => workbenchTaskReviewAPI(request);
export const POST = GET;
