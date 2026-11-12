import type { TaskItem, TaskView } from "./types";
import { TASK_ID } from "./task-contract";

export const TASK_VIEWS = ["active", "today", "overdue", "upcoming", "blocked", "completed", "all"] as const;
export type TaskListView = typeof TASK_VIEWS[number];
export type TaskSort = "priority" | "due" | "updated";
export const TASK_VIEW_LABELS: Record<TaskListView, string> = {
  active: "Active", today: "Due today", overdue: "Overdue", upcoming: "Upcoming",
  blocked: "Blocked", completed: "Completed", all: "All records",
};
export const DAILY_TIME_ZONE = "America/Toronto";
const days = new Intl.DateTimeFormat("en-CA", { timeZone: DAILY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const priority = { critical: 0, high: 1, normal: 2, low: 3 };
export function taskListView(value: unknown): TaskListView {
  return TASK_VIEWS.includes(value as TaskListView) ? value as TaskListView : "active";
}
export function taskSelection(value: unknown): string | null {
  return typeof value === "string" && TASK_ID.test(value) ? value : null;
}
export function taskHref(project: string, options: { view?: TaskListView; taskId?: string; capture?: boolean } = {}) {
  const query = new URLSearchParams({ project });
  if (options.view) query.set("taskView", options.view);
  if (taskSelection(options.taskId)) query.set("task", options.taskId!);
  return `/?${query}#${options.capture ? "task-capture" : "task-manager"}`;
}
export function taskIsActive(task: Pick<TaskItem, "status">) {
  return task.status !== "done" && task.status !== "cancelled";
}
export function taskMatchesView(task: TaskView, view: TaskListView, now: Date) {
  if (view === "all") return true;
  // Decision reviews have their own owner workflow, even after completion.
  if (task.requiresApproval) return false;
  if (view === "completed") return task.status === "done";
  if (!taskIsActive(task)) return false;
  if (view === "active") return true;
  if (view === "blocked") return task.status === "blocked";
  const due = task.dueAt ? new Date(task.dueAt) : null;
  if (!due || !Number.isFinite(due.getTime())) return false;
  if (view === "overdue") return due.getTime() < now.getTime();
  if (view === "today") return days.format(due) === days.format(now);
  return days.format(due) > days.format(now);
}
export function visibleTasks(tasks: TaskView[], view: TaskListView, query: string, sort: TaskSort, now: Date) {
  const search = query.trim().toLocaleLowerCase();
  const due = (task: TaskView) => task.dueAt ? Date.parse(task.dueAt) : Number.MAX_SAFE_INTEGER;
  return tasks.filter(task => taskMatchesView(task, view, now)
    && (!search || `${task.title}\n${task.description ?? ""}`.toLocaleLowerCase().includes(search)))
    .sort((a, b) => (sort === "due" ? due(a) - due(b)
      : sort === "updated" ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      : priority[a.priority] - priority[b.priority] || due(a) - due(b)) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

/** Navigation hint only; every destination still enforces its own owner/project access. */
export function workspaceReturnHref(project: unknown) {
  return typeof project === "string" && /^[a-z0-9][a-z0-9_-]{0,99}$/.test(project)
    ? `/?${new URLSearchParams({ project })}` : "/";
}
export function workspacePageHref(path: "/account" | "/import" | "/projects/new", project: unknown) {
  const destination = workspaceReturnHref(project);
  return path + (destination === "/" ? "" : destination.slice(1));
}
