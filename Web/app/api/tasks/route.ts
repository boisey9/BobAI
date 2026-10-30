import { NextRequest } from "next/server";
import { getTasks, saveTask } from "@/lib/bob-core";
import { TASK_ID, taskAccess, taskFailure, taskInput, taskJSON, taskProject } from "@/lib/task-api";

export async function GET(request: NextRequest) {
  const denied = await taskAccess(request); if (denied) return denied;
  const project = taskProject(request);
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  if (!project || request.nextUrl.searchParams.getAll("cursor").length > 1 || (cursor !== undefined && !TASK_ID.test(cursor))) return taskJSON({ error: { message: "Invalid workspace or page." } }, 400);
  try { return taskJSON(await getTasks(project, cursor)); } catch (error) { return taskFailure(error, false); }
}

export async function POST(request: NextRequest) {
  const denied = await taskAccess(request, true); if (denied) return denied;
  const project = taskProject(request);
  const input = await taskInput(request, false);
  if (!project || !input) return taskJSON({ error: { message: "Invalid task details." } }, 400);
  try { return taskJSON(await saveTask(project, input, request.headers.get("x-bob-task-binding") ?? "")); } catch (error) { return taskFailure(error); }
}
