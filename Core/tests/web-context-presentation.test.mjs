import { createElement } from "../../Web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../Web/node_modules/react-dom/server.node.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextSourceStatus } from "../../Web/components/context-source-status";
import { ProjectState } from "../../Web/components/project-state";
import { TodaySummary } from "../../Web/components/today-summary";
import { ActivityTimeline } from "../../Web/components/activity-timeline";
import { ControlCenterV2 } from "../../Web/components/control-center-v2";
import { taskPayload } from "../../Web/lib/task-contract";
import { projectPayload, publicProjectReceipt } from "../../Web/lib/project-contract";
import { localDueFields, parseLocalDue } from "../../Web/lib/task-due-date";

const stamp = "2026-10-26T12:00:00.000Z";
const uuid = n => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const available = { status: "available", checkedAt: stamp, latestChangeAt: null, truncated: false };
const project = { id: uuid(1), projectKey: "bobai", name: "Synthetic BobAI", description: null, status: "active", repository: null, updatedAt: stamp };
const context = () => ({ project, revision: "synthetic-revision", partial: false, generatedAt: stamp,
  sources: Object.fromEntries(["tasks", "decisions", "memories", "handoffs"].map(key => [key, { ...available }])),
  tasks: [], decisions: [], memories: [], handoffs: [], recentEvents: [] });
const task = (id, extra = {}) => ({ id: uuid(id), title: `Synthetic ${id}`, description: null, status: "open", priority: "normal",
  source: "web", dueAt: null, updatedAt: stamp, metadata: {}, ...extra });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(stamp)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("honest project/context presentation", () => {
  it("distinguishes missing, unavailable, unverified and bounded stale sources", () => {
    expect(render(ContextSourceStatus, { context: null, source: "tasks", label: "Tasks" })).toContain("Tasks: unavailable");
    expect(render(ContextSourceStatus, { context: {}, source: "tasks", label: "Tasks" })).toContain("Tasks: unverified");
    const data = context(); data.sources.tasks = { ...available, checkedAt: "2026-10-25T12:00:00Z", truncated: true };
    const html = render(ContextSourceStatus, { context: data, source: "tasks", label: "Tasks" });
    expect(html).toContain("Bounded snapshot"); expect(html).toContain("more than six hours");
  });
  it("hides records from unavailable sources and exposes provenance/revision for retrieved ones", () => {
    const data = context();
    data.decisions = [{ id: uuid(2), title: "Approved decision", decision: "Approved content", source: "owner", updatedAt: stamp }];
    data.memories = [{ id: uuid(3), content: "Synthetic approved memory", source: "owner", updatedAt: stamp }];
    data.handoffs = [{ id: uuid(4), outcome: "Synthetic checkpoint", unresolved: ["Pending review"], nextActions: ["Verify"], source: "codex", createdAt: stamp }];
    const html = render(ProjectState, { context: data });
    for (const text of ["synthetic-revision", "Approved content", "Synthetic approved memory", "Synthetic checkpoint", "Pending review", "Proposals awaiting owner review"]) expect(html).toContain(text);
    data.sources.decisions.status = "unavailable";
    const unavailable = render(ProjectState, { context: data });
    expect(unavailable).not.toContain("Approved content"); expect(unavailable).toContain("cannot be verified");
  });
  it("excludes approval and unclassified tasks from daily suggestions and marks counts as snapshots", () => {
    const data = context(); data.tasks = [task(2, { title: "Ordinary focus", priority: "high" }),
      task(3, { title: "Never suggest approval", metadata: { kind: "decision_review", secret: "synthetic-hidden-metadata" } }),
      task(4, { title: "Unclassified", metadata: undefined }), task(5, { status: "blocked" }), task(6, { status: "done" })];
    const html = render(TodaySummary, { context: data, administration: null });
    expect(html).toContain("Ordinary focus"); expect(html).toContain("1 blocked in this snapshot");
    expect(html).toContain("unverified approval classification"); expect(html).toContain("Approval inbox unavailable");
    expect(html).not.toMatch(/Never suggest approval|synthetic-hidden-metadata|>Unclassified</);
    data.sources.tasks.status = "unavailable";
    const unavailable = render(TodaySummary, { context: data, administration: null });
    expect(unavailable).toContain("counts are unknown"); expect(unavailable).not.toContain("Ordinary focus");
  });
  it("keeps activity details bounded and namespaces duplicate records", () => {
    const item = { id: uuid(1), projectKey: "bobai", summary: "Synthetic event", source: "codex", eventType: "test", createdAt: stamp,
      details: { status: "ok", prompt: "synthetic-hidden-content", databaseURL: "synthetic-hidden-url" } };
    const html = render(ActivityTimeline, { activity: [item], idPrefix: "implementation" });
    expect(html).toContain(`id="implementation-${item.id}"`); expect(html).not.toContain("synthetic-hidden");
    expect(render(ActivityTimeline, { activity: [], unavailable: true })).toContain("Activity unavailable");
    expect(render(ActivityTimeline, { activity: [] })).toContain("No activity returned");
  });
  it("does not infer release acceptance or complete approvals from healthy/empty feeds; retains every credential", () => {
    const data = { selectedProject: project, projects: [project], generatedAt: stamp, approvals: [], releaseEvents: [], legacyCredentialCount: 0,
      interfaces: [{ id: "synthetic-enabled", surface: "codex", enabled: true, scopes: ["context:read"] },
        { id: "synthetic-disabled", surface: "codex", enabled: false, scopes: ["tasks:write"] }] };
    const props = { data, activity: [], coreReady: true, activityUnavailable: false, selectedProject: "bobai", csrfToken: "synthetic-csrf" };
    const html = render(ControlCenterV2, props);
    for (const text of ["Release acceptance: unverified", "No proposals returned", "synthetic-enabled", "synthetic-disabled"]) expect(html).toContain(text);
    expect(html).not.toContain("No pending decision proposals");
    expect(render(ControlCenterV2, { ...props, data: null })).toContain("Approval inbox unavailable");
  });
});

describe("browser input contracts", () => {
  it("rejects authority fields, cancellation, invalid versions and ambiguous task payloads", () => {
    const create = { operationId: "synthetic-contract-task", title: "Task" };
    expect(taskPayload(create, false)).toEqual(create);
    for (const extra of [{ ownerId: "other" }, { expectedProjectId: uuid(2) }, { status: "cancelled" }, { metadata: {} }])
      expect(taskPayload({ ...create, ...extra }, false)).toBeNull();
    for (const expectedVersion of [0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1])
      expect(taskPayload({ operationId: create.operationId, expectedVersion, status: "done" }, true)).toBeNull();
    expect(taskPayload({ operationId: create.operationId, expectedVersion: 1, status: "cancelled" }, true)).toBeNull();
  });
  it("keeps project fields bounded and matches exact receipts without exposing private metadata", () => {
    const input = projectPayload({ operationId: "synthetic-contract-project", expectedAnchorId: uuid(1), projectKey: "New-Project", name: " New project " });
    expect(input).toMatchObject({ projectKey: "new-project", name: "New project", repository: null });
    for (const repository of ["http://example.test", "https://user:secret@example.test", "https://example.test/?token=secret", "https://example.test/#fragment"])
      expect(projectPayload({ ...input, repository })).toBeNull();
    expect(projectPayload({ ...input, projectKey: "personal" })).toBeNull();
    const receipt = { authority: "bob-core", operationId: input.operationId, eventId: uuid(3), idempotent: true,
      project: { ...input, id: uuid(2), status: "active", createdAt: stamp, updatedAt: stamp, ownerId: "synthetic-private-owner" } };
    expect(JSON.stringify(publicProjectReceipt(receipt, input))).not.toContain("synthetic-private-owner");
    expect(publicProjectReceipt({ ...receipt, operationId: "different-operation" }, input)).toBeNull();
  });
  it("validates calendar dates, partial input and daylight-saving gaps/overlaps", () => {
    vi.stubEnv("TZ", "America/Toronto");
    for (const fields of [{ dueDate: "2026-02-29", dueTime: "09:00" }, { dueDate: "2026-03-08", dueTime: "02:30" },
      { dueDate: "2026-11-01", dueTime: "01:30" }, { dueDate: "2026-10-26", dueTime: "" }, { dueDate: "2026-10-26", dueTime: "24:00" }])
      expect(parseLocalDue(fields).ok).toBe(false);
    expect(parseLocalDue({ dueDate: "2028-02-29", dueTime: "09:15" })).toEqual({ ok: true, dueAt: "2028-02-29T14:15:00.000Z" });
    expect(parseLocalDue({ dueDate: "", dueTime: "" })).toEqual({ ok: true, dueAt: null });
    expect(localDueFields("2026-10-26T13:15:12.345Z")).toEqual({ dueDate: "2026-10-26", dueTime: "09:15" });
  });
});
