import { workbenchTaskReviewAPI } from "@/lib/workbench/review-task-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ taskId: string }> };
export const GET = async (request: Request, context: Context) =>
  workbenchTaskReviewAPI(request, (await context.params).taskId);
