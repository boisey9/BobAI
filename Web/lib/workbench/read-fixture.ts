import "server-only";
import { createWorkbenchReader, TASK_PAGE_SIZE } from "./read-adapters";
import { workbenchSampleProjects as projects } from "./sample-projects";

const checkedAt = "2026-11-19T14:00:00.000Z";
const updatedAt = "2026-11-18T19:30:00.000Z";
const dueAt = "2026-11-25T20:00:00.000Z";

function projectRow(project: typeof projects[number]) {
  return {
    projectKey: project.projectKey, name: project.name, status: "active",
    description: null, repository: project.repository, updatedAt,
  };
}

function tasksFor(project: typeof projects[number]) {
  if (project.projectKey === "demo-bobai") return [];
  const titles = [
    "Verify acceptance evidence", "Review change summary", "Check fixture version",
    "Reconcile sample notes", "Confirm review scope", "Group outstanding checks",
    "Review checklist wording", "Collect test results", "Inspect delivery reference",
    "Confirm follow-up owner", "Summarize findings", "Review final sample handoff",
  ];
  return titles.map((title, index) => ({
    id: "94c32948-97c2-4174-895d-" + String(index + 1).padStart(12, "0"),
    projectId: project.id, title, version: index === 0 ? 2 : 1,
    status: ["blocked", "open", "done"][index % 3], priority: index === 0 ? "high" : "normal",
    dueAt: index === 0 ? dueAt : null, updatedAt, createdAt: updatedAt,
    completedAt: index % 3 === 2 ? updatedAt : null, description: null, source: "sample",
    requiresApproval: index === 1, editable: index !== 1,
  }));
}

const available = { status: "available", checkedAt, latestChangeAt: updatedAt, truncated: false };

function contextFor(project: typeof projects[number]) {
  const partial = project.projectKey === "demo-bobai";
  return {
    authority: { source: "bob-core", version: "0.2", rule: "Sample contract" },
    request: { projectKey: project.projectKey, surface: "web", task: null },
    project: { ...projectRow(project), id: project.id, createdAt: updatedAt, ownerId: "fixture-owner" },
    revision: (partial ? "b" : "a").repeat(64),
    generatedAt: checkedAt, partial,
    sources: {
      decisions: available, tasks: partial ? { ...available, latestChangeAt: null } : available,
      events: { ...available, truncated: partial },
      memories: partial ? { ...available, status: "unavailable", latestChangeAt: null } : available,
      handoffs: { ...available, latestChangeAt: null },
    },
    decisions: [], tasks: [], recentEvents: [], memories: [], handoffs: [],
  };
}

// In-process response fixtures follow the existing Core GET contracts.
// No host, tokens, request forwarding, or fallback transport are configured.
async function fixtureGet(path: string): Promise<Response> {
  const url = new URL(path, "http://workbench-fixture.invalid");
  const project = projects.find(value => value.projectKey === url.searchParams.get("project"));
  if (!project) return new Response(null, { status: 404 });
  if (url.pathname === "/v1/control-center") {
    return Response.json({ projects: projects.map(projectRow), selectedProject: projectRow(project), generatedAt: checkedAt });
  }
  if (url.pathname === "/v1/context" && url.searchParams.get("surface") === "web") {
    return Response.json({ context: contextFor(project) });
  }
  if (url.pathname === "/v1/tasks" && url.searchParams.get("limit") === String(TASK_PAGE_SIZE)) {
    const all = tasksFor(project);
    const cursor = url.searchParams.get("cursor");
    const index = cursor ? all.findIndex(task => task.id === cursor) : -1;
    if (cursor && index === -1) return new Response(null, { status: 400 });
    const tasks = all.slice(index + 1, index + 1 + TASK_PAGE_SIZE);
    return Response.json({
      authority: "bob-core",
      project: { id: project.id, projectKey: project.projectKey, name: project.name },
      tasks, nextCursor: index + 1 + tasks.length < all.length ? tasks.at(-1)?.id : null, checkedAt,
    });
  }
  return new Response(null, { status: 404 });
}

export const readWorkbenchReview = createWorkbenchReader({ get: fixtureGet }, projects).read;
