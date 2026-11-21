import "server-only";
import { readWorkbenchCore } from "@/lib/bob-core";
import { parseOwnerWorkbenchProjects } from "./owner-projects";
import { createWorkbenchReader } from "./read-adapters";

export async function readOwnerWorkbench(project?: string, cursor?: string) {
  const grants = parseOwnerWorkbenchProjects(process.env.BOB_OWNER_WORKBENCH_PROJECTS);
  if (!grants) return { status: "unavailable" } as const;

  const reader = createWorkbenchReader({ get: readWorkbenchCore }, grants, "owner");
  return reader.read(project ?? grants[0].projectKey, cursor);
}
