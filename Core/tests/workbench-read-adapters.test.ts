import { describe, expect, it, vi } from "vitest";
import { createWorkbenchReader } from "../../Web/lib/workbench/read-adapters.js";

const grant = { projectKey: "fixture-a", id: "11111111-1111-4111-8111-111111111111", repository: "fixture/a" };
const other = { projectKey: "fixture-b", id: "22222222-2222-4222-8222-222222222222", repository: "fixture/b" };
const taskId = "33333333-3333-4333-8333-333333333333";
const checkedAt = "2026-11-19T14:00:00.000Z";
const updatedAt = "2026-11-18T18:00:00.000Z";
const item = (binding: typeof grant) => ({
  projectKey: binding.projectKey, name: binding.projectKey, repository: binding.repository, status: "active", updatedAt,
});
const directory = { selectedProject: item(grant), projects: [item(grant), item(other)], generatedAt: checkedAt };
const task = {
  id: taskId, projectId: grant.id, title: "Review fixture record", status: "open", priority: "high",
  requiresApproval: false, version: 1, updatedAt, dueAt: null, editable: true, ownerId: "synthetic-owner-marker",
};
const taskPage = {
  authority: "bob-core", project: { ...item(grant), id: grant.id }, checkedAt,
  nextCursor: null, tasks: [task], taskBinding: "synthetic-binding-marker",
};
const source = { status: "available", checkedAt, latestChangeAt: updatedAt, truncated: false };
const context = { context: {
  authority: { source: "bob-core", version: "0.2" },
  project: { ...item(grant), id: grant.id }, request: { projectKey: grant.projectKey, surface: "web" },
  generatedAt: checkedAt, revision: "a".repeat(64), partial: false,
  sources: { decisions: source, tasks: source, memories: source, events: source, handoffs: source },
  memories: ["synthetic-context-marker"],
} };

function fixture(overrides: Partial<Record<"directory" | "tasks" | "context", unknown>> = {}) {
  function response(value: unknown) {
    return value instanceof Response ? value : Response.json(value);
  }
  const get = vi.fn(async (path: string) => {
    if (path.startsWith("/v1/control-center?")) return response(overrides.directory ?? directory);
    if (path.startsWith("/v1/tasks?")) return response(overrides.tasks ?? taskPage);
    if (path.startsWith("/v1/context?")) return response(overrides.context ?? context);
    throw new Error("Unexpected route");
  });
  return { get, reader: createWorkbenchReader({ get }, [grant, other]) };
}

describe("Workbench read scope and failure boundaries", () => {
  it("refuses duplicate keys or UUIDs in the trusted registration", () => {
    const transport = { get: vi.fn(async () => Response.json({})) };
    expect(() => createWorkbenchReader(transport, [grant, { ...other, projectKey: grant.projectKey }])).toThrow();
    expect(() => createWorkbenchReader(transport, [grant, { ...other, id: grant.id }])).toThrow();
    expect(transport.get).not.toHaveBeenCalled();
  });

  it("rejects an unknown project or malformed query before calling Core", async () => {
    const { reader, get } = fixture();
    expect(await reader.read("bobai")).toEqual({ status: "denied" });
    expect(await reader.read("fixture-a&project=fixture-b")).toEqual({ status: "invalid-request" });
    expect(await reader.read(grant.projectKey, "bad-cursor")).toEqual({ status: "invalid-request" });
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ["mismatched selection", { selectedProject: item(other) }],
    ["archived project", { selectedProject: { ...item(grant), status: "archived" } }],
    ["repository change", { selectedProject: { ...item(grant), repository: "fixture/other" } }],
    ["missing directory membership", { projects: [item(other)] }],
    ["duplicate directory membership", { projects: [item(grant), item(grant)] }],
  ])("rejects %s before task or context reads", async (_name, overrides) => {
    const { reader, get } = fixture({ directory: { ...directory, ...overrides } });
    expect(await reader.read(grant.projectKey)).toEqual({ status: "denied" });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["task envelope UUID", { tasks: { ...taskPage, project: { ...item(grant), id: other.id } } }],
    ["task row UUID", { tasks: { ...taskPage, tasks: [task, { ...task, projectId: other.id }] } }],
    ["context envelope UUID", { context: { context: { ...context.context, project: { ...item(grant), id: other.id } } } }],
    ["context request binding", { context: { context: { ...context.context, request: { projectKey: grant.projectKey, surface: "codex" } } } }],
    ["context denies access", { context: new Response(null, { status: 403 }) }],
    ["task project not found", { tasks: new Response(null, { status: 404 }) }],
  ])("suppresses the whole view on %s", async (_name, overrides) => {
    expect(await fixture(overrides).reader.read(grant.projectKey)).toEqual({ status: "denied" });
  });

  it("distinguishes an empty task page from a failed context read", async () => {
    const { reader } = fixture({ tasks: { ...taskPage, tasks: [] }, context: new Response(null, { status: 503 }) });
    expect(await reader.read(grant.projectKey)).toMatchObject({ status: "ready", context: { status: "unavailable" },
      tasks: { status: "available", value: { tasks: [], nextCursor: null } } });
  });

  it("treats duplicate task rows and a bad next cursor as unavailable", async () => {
    for (const tasks of [{ ...taskPage, tasks: [task, task] }, { ...taskPage, nextCursor: taskId }]) {
      expect(await fixture({ tasks }).reader.read(grant.projectKey)).toMatchObject({
        status: "ready", tasks: { status: "unavailable" }, context: { status: "available" },
      });
    }
  });

  it("passes a syntactically valid cursor to the bound project and handles its rejection", async () => {
    const { reader, get } = fixture({ tasks: new Response(null, { status: 400 }) });
    expect(await reader.read(grant.projectKey, taskId)).toEqual({ status: "invalid-request" });
    expect(get).toHaveBeenCalledWith("/v1/tasks?project=fixture-a&limit=10&cursor=" + taskId);
  });

  it("projects known source status, preserves time meaning, and excludes private fields", async () => {
    const { reader } = fixture({ context: { context: { ...context.context, sources: {
      events: { ...source, truncated: true }, tasks: { ...source, latestChangeAt: null },
      memories: { ...source, status: "unavailable", latestChangeAt: null }, unknown: "unknown-source-marker",
    } } } });
    const result = await reader.read(grant.projectKey);
    expect(result).toMatchObject({ status: "ready", context: { status: "available", value: {
      partial: true, sources: [
        { name: "decisions", status: "unknown", checkedAt: null, latestChangeAt: null, truncated: null },
        { name: "tasks", status: "available", checkedAt, latestChangeAt: null, truncated: false },
        { name: "events", status: "available", checkedAt, latestChangeAt: updatedAt, truncated: true },
        { name: "memories", status: "unavailable", checkedAt, latestChangeAt: null, truncated: false },
        { name: "handoffs", status: "unknown" },
      ],
    } } });
    const serialized = JSON.stringify(result);
    for (const value of ["unknown-source-marker", "synthetic-owner-marker", "synthetic-binding-marker", "synthetic-context-marker", "editable"])
      expect(serialized).not.toContain(value);
  });

  it("keeps two overlapping project reads independently bound", async () => {
    let firstResponse!: (value: Response) => void;
    const waiting = new Promise<Response>(resolve => { firstResponse = resolve; });
    const get = vi.fn(async (path: string) => {
      const url = new URL(path, "http://fixture.invalid");
      const first = url.searchParams.get("project") === grant.projectKey;
      const binding = first ? grant : other;
      if (url.pathname === "/v1/control-center")
        return Response.json({ ...directory, selectedProject: item(binding) });
      if (url.pathname === "/v1/tasks")
        return first ? waiting : Response.json({ ...taskPage, project: { ...item(other), id: other.id }, tasks: [] });
      return Response.json({ context: { ...context.context, project: { ...item(binding), id: binding.id },
        request: { projectKey: binding.projectKey, surface: "web" } } });
    });
    const reader = createWorkbenchReader({ get }, [grant, other]);
    const first = reader.read(grant.projectKey);
    expect(await reader.read(other.projectKey)).toMatchObject({ status: "ready", project: { id: other.id },
      tasks: { status: "available", value: { tasks: [] } } });
    firstResponse(Response.json(taskPage));
    expect(await first).toMatchObject({ status: "ready", project: { id: grant.id },
      tasks: { status: "available", value: { tasks: [{ id: taskId }] } } });
  });
});
