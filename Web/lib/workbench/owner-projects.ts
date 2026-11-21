import { TASK_ID } from "../task-contract";
import type { WorkbenchGrant } from "./read-adapters";

const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;

// UUIDs are pinned from separately verified owner registrations before the Core
// catalog, tasks, or context can be used to display a workspace.
export function parseOwnerWorkbenchProjects(value: string | undefined): WorkbenchGrant[] | null {
  if (!value || value.length > 65_536) return null;

  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) return null;

  const keys = new Set<string>();
  const ids = new Set<string>();
  const grants: WorkbenchGrant[] = [];
  for (const item of input as unknown[]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const { projectKey, id, repository } = item as Record<string, unknown>;
    if (Object.keys(item).length !== 3
      || typeof projectKey !== "string" || !PROJECT_KEY.test(projectKey) || keys.has(projectKey)
      || typeof id !== "string" || !TASK_ID.test(id) || ids.has(id.toLowerCase())
      || !(repository === null || typeof repository === "string"
        && repository.trim() === repository && repository.length > 0 && repository.length <= 1_024)) return null;
    keys.add(projectKey);
    ids.add(id.toLowerCase());
    grants.push({ projectKey, id: id.toLowerCase(), repository });
  }
  return grants;
}
