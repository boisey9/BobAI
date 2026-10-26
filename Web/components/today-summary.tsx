import type { ContextPackage, ControlCenterAdminData, TaskItem } from "@/lib/types";
import { ContextSourceStatus, contextTime } from "./context-source-status";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };

// Context carries raw task metadata today; explicit task reads may instead
// provide requiresApproval. Inspect only these flags in this Server Component.
// Never serialize internal metadata into a client component or rendered output.
function approvalClassification(task: TaskItem): "approval" | "ordinary" | "unverified" {
  const record = task as TaskItem & { metadata?: unknown; requiresApproval?: unknown };
  const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown> : null;
  if (record.requiresApproval === true || metadata?.kind === "decision_review") return "approval";
  if (record.requiresApproval === false || metadata !== null) return "ordinary";
  return "unverified";
}


export function TodaySummary({ context, administration }: {
  context: ContextPackage | null;
  administration: ControlCenterAdminData | null;
}) {
  const now = new Date();
  const today = dayFormat.format(now);
  const taskSource = context?.sources?.tasks;
  const tasksAvailable = taskSource?.status === "available";
  const checkedAt = taskSource?.checkedAt ? Date.parse(taskSource.checkedAt) : NaN;
  const old = Number.isFinite(checkedAt) && now.getTime() - checkedAt > 6 * 60 * 60 * 1000;
  const approvalIds = new Set(administration?.approvals.map(item => item.id) ?? []);
  const activeTasks = tasksAvailable ? (context?.tasks ?? []).filter(task => task.status !== "done" && task.status !== "cancelled" && !approvalIds.has(task.id)) : [];
  const tasks = activeTasks.filter(task => approvalClassification(task) === "ordinary");
  const unclassifiedTasks = activeTasks.some(task => approvalClassification(task) === "unverified");
  const dueDay = (task: TaskItem) => task.dueAt && Number.isFinite(Date.parse(task.dueAt)) ? dayFormat.format(new Date(task.dueAt)) : null;
  const overdue = tasks.filter(task => task.dueAt && Number.isFinite(Date.parse(task.dueAt)) && Date.parse(task.dueAt) < now.getTime());
  const dueToday = tasks.filter(task => dueDay(task) === today);
  const blocked = tasks.filter(task => task.status === "blocked");
  const rank = (task: TaskItem) => overdue.includes(task) ? 0 : dueToday.includes(task) ? 1 : task.status === "in_progress" ? 2 : 3;
  const focus = tasks.filter(task => task.status !== "blocked").sort((a, b) => rank(a) - rank(b) || priorityOrder[a.priority] - priorityOrder[b.priority] || a.id.localeCompare(b.id)).slice(0, 3);

  return (
    <section className="panel today-panel" id="today" aria-labelledby="today-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Today · {today} · Toronto</p>
          <h2 id="today-heading">A starting point for your day</h2>
          <p>{context?.project.name ?? "Selected workspace"} · Due work first</p>
        </div>
        <a className="secondary-button" href="#task-manager">Capture a task</a>
      </div>
      <div className="today-content">
        <p className="today-source-summary" role="status">
          {!context || taskSource?.status === "unavailable" ? "Task source unavailable."
            : !taskSource ? "Task source unverified."
            : Number.isFinite(checkedAt) ? `Tasks checked ${contextTime(taskSource.checkedAt)}.`
            : "Task source retrieved; check time unverified."}
          {(context?.partial || taskSource?.truncated) && " Partial snapshot."}
          {old && " More than six hours old; refresh before relying on it."}
        </p>
        {unclassifiedTasks && <p className="muted-copy">Some returned tasks have unverified approval classification and are omitted from suggestions and counts. Open Tasks for a current, classified read.</p>}
        <div className="today-grid">
          <div>
            <h3>Suggested focus</h3>
            {!tasksAvailable ? <p className="muted-copy">Task suggestions are {context ? "unverified or unavailable" : "unavailable"}. Open Tasks for a fresh direct read.</p>
              : focus.length === 0 ? <p className="muted-copy">No actionable focus items in this snapshot. Open Tasks to check current work.</p>
              : <ol className="focus-list">{focus.map(task => <li key={task.id}>
                <a href="#task-manager">{task.title}</a>
                <small>{task.status.replaceAll("_", " ")} · {task.priority}{task.dueAt ? ` · Due ${contextTime(task.dueAt)}` : " · No due date"}</small>
                <small>Source: {task.source} · Updated {contextTime(task.updatedAt)}</small>
              </li>)}</ol>}
          </div>
          <div>
            <h3>Due and waiting</h3>
            {tasksAvailable ? <ul className="daily-facts">
              <li><a href="#task-manager">{overdue.length} overdue in this snapshot</a></li>
              <li><a href="#task-manager">{dueToday.length} due today in this snapshot (including any already overdue)</a></li>
              <li><a href="#task-manager">{blocked.length} blocked in this snapshot</a></li>
            </ul> : <p className="muted-copy">Due and waiting counts are unknown until the task source is available.</p>}
            <p><a href="#approvals">{administration ? `${administration.approvals.length} proposals returned for owner review` : "Approval inbox unavailable"}</a></p>
            <small>Approval snapshot: {contextTime(administration?.generatedAt)}. Proposals remain separate from active decisions.</small>
          </div>
        </div>
        <details className="today-source-details">
          <summary>Source details</summary>
          <p className="muted-copy">Snapshot generated {contextTime(context?.generatedAt)}. Refresh workspace after changes to update these suggestions. These are returned records, not totals for your day or project.</p>
          <ContextSourceStatus context={context} source="tasks" label="Today tasks" />
          <p className="muted-copy">Calendar commitments and Apple reminders are not included in this view. An empty task snapshot does not mean a free day.</p>
        </details>
      </div>
    </section>
  );
}
