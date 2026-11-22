import { ownerWorkbenchReadsPath } from "@/lib/workbench/owner-preview";
import type { WorkbenchReadResult } from "@/lib/workbench/read-adapters";
import styles from "./project-reads.module.css";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto",
});
const taskStates = {
  open: "Open", in_progress: "In progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled",
};

function Time({ value }: { value: string | null }) {
  return value === null ? <>Unreported</> : <time dateTime={value}>{dateFormat.format(new Date(value))}</time>;
}

function pageLink(path: string, project: string, cursor?: string) {
  return path + "?" + new URLSearchParams({ project, ...(cursor ? { cursor } : {}) });
}

function Snapshot({ result, cursor, path, sample }: {
  result: Extract<WorkbenchReadResult, { status: "ready" }>;
  cursor?: string;
  path: string;
  sample: boolean;
}) {
  const { project, projects, directoryCheckedAt, tasks, context } = result;
  return <>
    <section className={styles.project} aria-labelledby="project-heading">
      <div>
        <h2 id="project-heading">{project.name}</h2>
        <p>Project <code>{project.projectKey}</code></p>
        <p>Directory checked <Time value={directoryCheckedAt} /> Toronto</p>
      </div>
      <form method="get" action={path}>
        <label>{sample ? "Sample project" : "Project"}
          <select name="project" defaultValue={project.projectKey}>
            {projects.map(item => <option key={item.projectKey} value={item.projectKey}>{item.name}</option>)}
          </select>
        </label>
        <button type="submit">Open project</button>
      </form>
      <details>
        <summary>Project details</summary>
        <dl>
          <dt>{sample ? "Expected fixture UUID" : "Registered project UUID"}</dt><dd><code>{project.id}</code></dd>
          <dt>Repository</dt><dd>{project.repository ?? "Unreported"}</dd>
          <dt>Project updated</dt><dd><Time value={project.updatedAt} /> Toronto</dd>
        </dl>
      </details>
    </section>
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="tasks-heading">
        <h2 id="tasks-heading">Tasks</h2>
        {tasks.status === "unavailable" ? <p role="status">Task list unavailable.</p> : <>
          <p>Page checked <Time value={tasks.value.checkedAt} /> Toronto</p>
          {tasks.value.tasks.length === 0
            ? <p role="status">No tasks returned for this page.</p>
            : <ul className={styles.tasks}>{tasks.value.tasks.map(task =>
              <li key={task.id}>
                <strong>{task.title}</strong>
                <p>{taskStates[task.status]} · {task.priority} priority · Version {task.version}</p>
                {task.requiresApproval && <span className={styles.attention}>Owner approval required</span>}
                {task.dueAt && <p>Due <Time value={task.dueAt} /> Toronto</p>}
              </li>
            )}</ul>}
          <nav className={styles.pager} aria-label="Task pages">
            {cursor && <a href={pageLink(path, project.projectKey)}>First task page</a>}
            {tasks.value.nextCursor && <a href={pageLink(path, project.projectKey, tasks.value.nextCursor)}>Next task page</a>}
          </nav>
        </>}
      </section>
      <section className={styles.panel} aria-labelledby="context-heading">
        <h2 id="context-heading">Context sources</h2>
        {context.status === "unavailable" ? <p role="status">Context sources unavailable.</p> : <>
          <p><strong className={context.value.partial ? styles.attention : undefined}>
            {context.value.partial ? "Partial snapshot" : "Complete source report"}
          </strong></p>
          <p>Generated <Time value={context.value.generatedAt} /> Toronto</p>
          <details><summary>Context revision</summary><p><code>{context.value.revision}</code></p></details>
          <ul className={styles.sources}>
            {context.value.sources.map(source => <li key={source.name}>
              <strong>{source.name[0].toUpperCase() + source.name.slice(1)}</strong>
              <span className={source.status !== "available" || source.truncated ? styles.attention : undefined}>
                {source.status === "available" ? "Available" : source.status === "unavailable" ? "Unavailable" : "Unknown"}
                {source.truncated && " · Truncated"}
              </span>
              <p>Last checked <Time value={source.checkedAt} /></p>
              <p>Content updated <Time value={source.latestChangeAt} /></p>
            </li>)}
          </ul>
        </>}
      </section>
    </div>
  </>;
}

export function WorkbenchProjectReads({ result, cursor, mode, backHref }: {
  result: WorkbenchReadResult;
  cursor?: string;
  mode: "sample" | "owner";
  backHref?: "/" | "/workbench";
}) {
  const sample = mode === "sample";
  const path = sample ? "/review/workbench/read" : ownerWorkbenchReadsPath;
  const sampleBack = result.status === "ready"
    ? "/review/workbench?" + new URLSearchParams({ project: result.project.projectKey })
    : "/review/workbench";
  const failureMessages = {
    "invalid-request": "This project or task page reference is invalid.",
    denied: sample ? "This project could not be verified in the sample connection."
      : "This project's Workbench access could not be verified.",
    unavailable: "The project directory is unavailable.",
  };

  return <main className={styles.shell}>
    <a href={sample ? sampleBack : backHref ?? "/"}>
      ← {sample || backHref === "/workbench" ? "Back to Workbench" : "Back to Control Center"}
    </a>
    <header>
      <span className={styles.kicker}>{sample ? "BobCore Workbench · Local fixtures" : "BobCore Workbench · Owner read-only"}</span>
      <h1>Project reads</h1>
      <p>{sample ? "Review sample project details, task pages, and context availability using the BobCore read contracts."
        : "Browse registered BobCore projects, task summaries, and Shared Context availability."}</p>
    </header>
    {result.status === "ready"
      ? <Snapshot result={result} cursor={cursor} path={path} sample={sample} />
      : <section className={styles.panel} aria-label="Project read status">
        <p role="status">{failureMessages[result.status]}</p>
        <a href={path}>{sample ? "Return to sample projects" : "Return to project reads"}</a>
      </section>}
  </main>;
}
