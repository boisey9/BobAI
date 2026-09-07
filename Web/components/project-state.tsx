import type { ContextPackage, TaskItem } from "@/lib/types";

function taskTone(status: TaskItem["status"]): string {
  switch (status) {
    case "blocked":
      return "task-blocked";
    case "in_progress":
      return "task-progress";
    case "open":
      return "task-open";
    default:
      return "task-done";
  }
}

function readableStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function ProjectState({ context }: { context: ContextPackage | null }) {
  if (!context) {
    return (
      <section className="panel project-panel" id="project-state">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Project state</p>
            <h2>Unavailable</h2>
          </div>
        </div>
        <div className="empty-panel compact">
          <strong>Bob Core could not load this project.</strong>
          <p>Verified repository state remains separate and unchanged.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel project-panel" id="project-state">
      <div className="panel-heading project-heading">
        <div>
          <p className="eyebrow">Active project</p>
          <h2>{context.project.name}</h2>
          <p>{context.project.description ?? "Bob-connected project"}</p>
        </div>
        <div className="project-badge">
          <span className="status-dot" />
          {context.project.status}
        </div>
      </div>

      <p role="status" className="muted-copy" style={{ padding: "0 24px" }}>
        {context.partial
          ? "Partial context: some sources are unavailable or bounded. "
          : context.sources
            ? "Context retrieved. "
            : "Context freshness is not reported by this Core version. "}
        {context.sources?.tasks?.checkedAt &&
          `Checked ${new Date(context.sources.tasks.checkedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })} (Toronto).`}
      </p>
      <div className="project-metrics">
        <div>
          <span>Decisions</span>
          <strong>{context.decisions.length}</strong>
        </div>
        <div>
          <span>Active tasks</span>
          <strong>{context.tasks.length}</strong>
        </div>
        <div>
          <span>Approved memory</span>
          <strong>{context.memories.length}</strong>
        </div>
      </div>

      <div className="state-grid">
        <div className="state-column" id="tasks">
          <div className="subheading">
            <h3>Current work</h3>
            <span>{context.tasks.length} tasks</span>
          </div>
          {context.tasks.length === 0 ? (
            <p className="muted-copy">
              {context.sources?.tasks?.status === "unavailable"
                ? "Tasks are unavailable. Refresh to retry."
                : "No active tasks in the retrieved context."}
            </p>
          ) : (
            <div className="task-list">
              {context.tasks.slice(0, 8).map((task) => (
                <article className="task-row" key={task.id}>
                  <span className={`task-indicator ${taskTone(task.status)}`} />
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.description ?? "No description provided."}</p>
                    <div className="task-meta">
                      <span>{readableStatus(task.status)}</span>
                      <span>{task.priority}</span>
                      <span>{task.source}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="state-column" id="decisions">
          <div className="subheading">
            <h3>Active decisions</h3>
            <span>{context.decisions.length} records</span>
          </div>
          {context.decisions.length === 0 ? (
            <p className="muted-copy">
              {context.sources?.decisions?.status === "unavailable"
                ? "Decisions are unavailable. Refresh to retry."
                : "No active decisions in the retrieved context."}
            </p>
          ) : (
            <div className="decision-list">
              {context.decisions.slice(0, 7).map((decision) => (
                <article className="decision-row" key={decision.id}>
                  <span aria-hidden="true">◇</span>
                  <div>
                    <strong>{decision.title}</strong>
                    <p>{decision.decision}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {(context.handoffs?.length ?? 0) > 0 && (
        <div className="state-column" style={{ padding: 24 }}>
          <h3>Recent handoffs</h3>
          {context.handoffs?.map((handoff) => (
            <article key={handoff.id}>
              <strong>{handoff.outcome}</strong>
              <p>{handoff.nextActions.join(" · ")}</p>
              <small>
                {handoff.source} · {handoff.createdAt}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
