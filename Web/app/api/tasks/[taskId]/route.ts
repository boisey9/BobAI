import { NextRequest } from "next/server";
import { getTask, saveTask } from "@/lib/bob-core";
import { TASK_ID, taskAccess, taskFailure, taskInput, taskJSON, taskProject } from "@/lib/task-api";

type RouteContext = { params: Promise<{ taskId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const denied = await taskAccess(request); if (denied) return denied;
  const project = taskProject(request); const { taskId } = await context.params;
  if (!project || !TASK_ID.test(taskId)) return taskJSON({ error: { message: "Invalid workspace or task." } }, 400);
  try { return taskJSON(await getTask(project, taskId)); } catch (error) { return taskFailure(error, false); }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const denied = await taskAccess(request, true); if (denied) return denied;
  const project = taskProject(request); const { taskId } = await context.params;
  const input = await taskInput(request, true);
  if (!project || !TASK_ID.test(taskId) || !input) return taskJSON({ error: { message: "Invalid task details." } }, 400);
  try { return taskJSON(await saveTask(project, input, request.headers.get("x-bob-task-binding") ?? "", taskId)); } catch (error) { return taskFailure(error); }
}
