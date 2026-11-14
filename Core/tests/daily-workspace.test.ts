import { describe, expect, it } from "vitest";
import { taskHref, taskListView, taskSelection, visibleTasks, workspaceReturnHref, workspacePageHref } from "../../Web/lib/daily-workspace.js";
import type { TaskView } from "../../Web/lib/types.js";
const now = new Date("2026-11-01T15:00:00Z");
const task = (n: number, extra: Partial<TaskView> = {}): TaskView => ({
  id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`, projectId: "11111111-1111-4111-8111-111111111111",
  title: `Task ${n}`, description: null, status: "open", priority: "normal", source: "web", version: 1,
  dueAt: null, updatedAt: "2026-10-30T12:00:00Z", createdAt: "2026-10-30T12:00:00Z", completedAt: null,
  editable: true, requiresApproval: false, ...extra,
});
const records = [task(1, { dueAt: "2026-11-01T04:30:00Z", priority: "high" }), // Nov 1, before DST fallback
  task(2, { dueAt: "2026-11-02T04:30:00Z" }), // Nov 1, after fallback
  task(3, { dueAt: "2026-11-02T05:00:00Z" }), // Nov 2 Toronto
  task(4, { status: "done", completedAt: "2026-10-31T12:00:00Z" }), task(5, { status: "cancelled", editable: false }),
  task(6, { requiresApproval: true, editable: false }), task(7, { status: "blocked" }), task(8)];
const ids = (view: Parameters<typeof visibleTasks>[1]) => visibleTasks(records, view, "", "priority", now).map(t => t.id);
describe("daily task views", () => {
  it("separates ordinary active/completed work from approval records and cancellation", () => {
    expect(ids("active")).toEqual([records[0]!.id, records[1]!.id, records[2]!.id, records[6]!.id, records[7]!.id]);
    expect(ids("completed")).toEqual([records[3]!.id]); expect(ids("blocked")).toEqual([records[6]!.id]);
    expect(ids("all")).toHaveLength(8);
  });
  it("uses Toronto calendar days across the 25-hour fallback day", () => {
    expect(ids("today")).toEqual([records[0]!.id, records[1]!.id]);
    expect(ids("overdue")).toEqual([records[0]!.id]); expect(ids("upcoming")).toEqual([records[2]!.id]);
  });
  it("does not count undated or completed work as overdue", () => {
    expect(visibleTasks([task(1), task(2, { status: "done", dueAt: "2026-10-01T00:00:00Z" })], "overdue", "", "due", now)).toEqual([]);
  });
  it("searches titles and details without mutating the loaded page", () => {
    const items = [task(1, { title: "Review release", description: "Prepare the acceptance notes" }), task(2)];
    expect(visibleTasks(items, "active", " ACCEPTANCE ", "priority", now).map(t => t.id)).toEqual([items[0]!.id]);
    expect(items[0]!.title).toBe("Review release"); expect(items).toHaveLength(2);
  });
  it("sorts priority, due dates and record updates independently", () => {
    const items = [task(1, { priority: "critical" }), task(2, { dueAt: "2026-11-01T16:00:00Z" }), task(3, { updatedAt: "2026-11-01T14:00:00Z" })];
    expect(visibleTasks(items, "active", "", "priority", now)[0]!.id).toBe(items[0]!.id);
    expect(visibleTasks(items, "active", "", "due", now)[0]!.id).toBe(items[1]!.id);
    expect(visibleTasks(items, "active", "", "updated", now)[0]!.id).toBe(items[2]!.id);
    expect(items.map(t => t.id)).toEqual([task(1).id, task(2).id, task(3).id]);
  });
  it("accepts only known views and task IDs without treating query input as authority", () => {
    for (const value of [undefined, "", "owner", ["active", "all"], "<script>"]) expect(taskListView(value)).toBe("active");
    expect(taskListView("blocked")).toBe("blocked"); expect(taskSelection("bad/path")).toBeNull(); expect(taskSelection(task(1).id)).toBe(task(1).id);
  });
  it("keeps return navigation local and rejects arbitrary URLs or ambiguous projects", () => {
    expect(workspaceReturnHref("bobai")).toBe("/?project=bobai");
    expect(workspacePageHref("/import", "bobai")).toBe("/import?project=bobai");
    for (const value of [undefined, "https://other.example", "//other", "bobai&project=other", ["bobai", "other"]]) expect(workspaceReturnHref(value)).toBe("/");
  });
  it("retains explicit project selection and direct task/filter targets in links", () => {
    const url = new URL(taskHref("bobai", { taskId: task(1).id, view: "overdue" }), "https://web.example");
    expect(url.searchParams.get("project")).toBe("bobai"); expect(url.searchParams.get("task")).toBe(task(1).id);
    expect(url.searchParams.get("taskView")).toBe("overdue"); expect(url.hash).toBe("#task-manager");
    expect(taskHref("bobai", { taskId: "bad" })).not.toContain("task="); expect(taskHref("bobai", { capture: true })).toContain("#task-capture");
  });
});
