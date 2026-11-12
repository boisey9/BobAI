"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TaskDetail, TaskMutation, TaskPage, TaskReceipt, TaskView } from "@/lib/types";
import { TASK_ID, taskPayload } from "@/lib/task-contract";
import { DAILY_TIME_ZONE, TASK_VIEWS, TASK_VIEW_LABELS, taskListView, taskSelection, visibleTasks, type TaskListView, type TaskSort } from "@/lib/daily-workspace";
import styles from "./daily-workspace.module.css";
import { localDueFields, parseLocalDue, type LocalDueFields } from "@/lib/task-due-date";

type Draft = LocalDueFields & { title: string; description: string; priority: TaskView["priority"]; status: NonNullable<TaskMutation["status"]> };
type Pending = { taskId?: string; body: TaskMutation; attempted?: boolean };
type Failure = { error?: { code?: string; message?: string; current?: TaskView; requestId?: string } };
const emptyDraft = (): Draft => ({ title: "", description: "", priority: "normal", status: "open", dueDate: "", dueTime: "" });

function readable(value: string) { return value.replaceAll("_", " "); }
function timestamp(value: string | null) { return value ? new Date(value).toLocaleString() : "No due date"; }

export function TaskManager({ project, projectName = project, csrfToken, initialView = "active", initialTaskId = null, apiBase = "/api/tasks" }: {
  apiBase?: "/api/tasks" | "/api/review/tasks";
  project: string; projectName?: string; csrfToken: string; initialView?: TaskListView; initialTaskId?: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<TaskListView>(initialView);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TaskSort>("priority");
  const [clock, setClock] = useState(() => new Date());
  const [targetId, setTargetId] = useState<string | null>(initialTaskId);
  const [targetTask, setTargetTask] = useState<TaskView | null>(null);
  const [targetError, setTargetError] = useState("");
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetRetry, setTargetRetry] = useState(0);
  const targetRef = useRef<HTMLDivElement>(null);
  const focusEditor = useRef(false);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<TaskView | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [dueError, setDueError] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const editingDue = useRef<LocalDueFields | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [taskBinding, setTaskBinding] = useState<string | null>(null);
  const [connectionChanged, setConnectionChanged] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  const sendingRef = useRef(false);
  const readRevision = useRef(0);
  const mounted = useRef(true);
  const storageKey = useRef<string | null>(null);
  const bindingRef = useRef<string | null>(null);
  const connectionChangedRef = useRef(false);
  const endpoint = `${apiBase}?${new URLSearchParams({ project })}`;

  function changedConnection() {
    connectionChangedRef.current = true; ++readRevision.current;
    setConnectionChanged(true); setRecoveryReady(false); setTaskBinding(null);
    setTasks([]); setTargetTask(null); setCursor(null); setCheckedAt(null); setEditing(null); setDraft(emptyDraft());
    setLoading(false); setNotice(""); setDueError("");
    setReadError("The Core connection changed. Reload and review this workspace before editing. Existing pending requests remain bound to their original connection.");
  }

  const load = useCallback(async (next?: string) => {
    if (pendingRef.current || connectionChangedRef.current) return;
    const revision = ++readRevision.current;
    setLoading(true); setReadError("");
    try {
      const response = await fetch(`${endpoint}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const result = await response.json() as TaskPage & Failure;
      if (!response.ok) throw new Error(result.error?.message || "Tasks could not be refreshed.");
      if (!/^[A-Za-z0-9_-]{43}$/.test(result.taskBinding)) throw new Error("Task connection could not be verified.");
      if (!mounted.current || revision !== readRevision.current) return;
      if (bindingRef.current && result.taskBinding !== bindingRef.current) { changedConnection(); return; }
      bindingRef.current = result.taskBinding;
      setTasks(current => {
        const incoming = result.tasks.map(task => {
          const known = current.find(item => item.id === task.id);
          return known && known.version > task.version ? known : task;
        });
        return next ? [...current.filter(task => !incoming.some(item => item.id === task.id)), ...incoming] : incoming;
      });
      setCursor(result.nextCursor); setCheckedAt(result.checkedAt);
      setTaskBinding(result.taskBinding);
    } catch (cause) {
      if (mounted.current && revision === readRevision.current) setReadError(cause instanceof Error ? cause.message : "Tasks could not be refreshed.");
    } finally { if (mounted.current && revision === readRevision.current) setLoading(false); }
  }, [endpoint]);

  useEffect(() => {
    mounted.current = true; setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); void load();
    return () => { mounted.current = false; ++readRevision.current; };
  }, [load]);
  useEffect(() => {
    setRecoveryReady(false);
    if (!taskBinding) return;
      try {
        const key = `bob-task-intent:v1:${project}:${taskBinding}`;
        storageKey.current = key;
        const raw = sessionStorage.getItem(key);
        if (!raw && Object.keys(sessionStorage).some(other => other.startsWith("bob-task-intent:") && other !== key)) {
          setError("Another workspace or connection has an unconfirmed request in this tab. Return to that workspace to reconcile it before saving new work. Its contents have not been loaded or sent here.");
          return;
        }
        if (raw) {
          if (raw.length > 24_576) throw new Error("Invalid pending request length");
          const value = JSON.parse(raw) as Pending & { project: string; schemaVersion: number; taskBinding: string };
          if (value.schemaVersion !== 1 || value.project !== project || value.taskBinding !== taskBinding || typeof value.attempted !== "boolean"
              || Object.keys(value).some(field => !["schemaVersion", "project", "taskId", "body", "attempted", "taskBinding"].includes(field))
              || (value.taskId !== undefined && (typeof value.taskId !== "string" || !TASK_ID.test(value.taskId)))
              || !taskPayload(value.body, value.taskId !== undefined)) {
            setError("The saved request could not be verified. No request was sent. Keep this tab open for recovery.");
            return;
          }
          const restored = { ...(value.taskId ? { taskId: value.taskId } : {}), body: value.body, attempted: value.attempted };
          pendingRef.current = restored; setPending(restored);
          setError("A request from this tab is awaiting confirmation. Retry the same request to recover its Core receipt.");
        }
        setRecoveryReady(true);
      } catch { setError("This browser cannot retain the pending request for this tab. Enable session storage before saving tasks."); }
  }, [taskBinding, project]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  useEffect(() => {
    setView(taskListView(initialView)); setTargetId(taskSelection(initialTaskId));
  }, [initialView, initialTaskId]);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 60_000);
    function fromHistory() {
      const params = new URLSearchParams(window.location.search);
      // Navigation never changes the verified project or connection binding.
      if (params.get("project") === project) {
        setView(taskListView(params.get("taskView"))); setTargetId(taskSelection(params.get("task")));
      }
    }
    window.addEventListener("popstate", fromHistory);
    return () => { window.clearInterval(interval); window.removeEventListener("popstate", fromHistory); };
  }, [project]);
  useEffect(() => {
    setTargetTask(null); setTargetError(""); setTargetLoading(false);
    if (!targetId || !taskBinding || !recoveryReady || pending || connectionChanged) return;
    const controller = new AbortController();
    setTargetLoading(true);
    async function readSelected() {
      try {
        const response = await fetch(`${apiBase}/${encodeURIComponent(targetId!)}?${new URLSearchParams({ project })}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        const result = await response.json() as TaskDetail & Failure;
        if (!response.ok) throw new Error(result.error?.message || "This task could not be opened. Retry or choose another task.");
        if (controller.signal.aborted) return;
        if (result.taskBinding !== bindingRef.current) { changedConnection(); return; }
        if (result.task.id !== targetId) throw new Error("The selected task could not be verified.");
        setTargetTask(result.task);
      } catch (cause) {
        if (!controller.signal.aborted) setTargetError(cause instanceof Error ? cause.message : "This task could not be opened.");
      } finally { if (!controller.signal.aborted) setTargetLoading(false); }
    }
    void readSelected();
    return () => controller.abort();
  }, [targetId, taskBinding, project, recoveryReady, pending, connectionChanged, targetRetry]);
  useEffect(() => { if (!editing && (targetTask || targetError)) targetRef.current?.focus(); }, [targetTask, targetError, editing]);

  useEffect(() => {
    if (focusEditor.current && editing && !loading) {
      focusEditor.current = false; document.getElementById("task-title")?.focus();
    }
  }, [editing, loading]);

  function rememberView(nextView: TaskListView, nextTarget: string | null) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", project); url.searchParams.set("taskView", nextView);
    if (nextTarget) url.searchParams.set("task", nextTarget); else url.searchParams.delete("task");
    url.hash = "task-manager";
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
  function selectView(next: TaskListView) { setView(next); setTargetId(null); rememberView(next, null); }
  function selectTask(id: string) { setTargetId(id); rememberView(view, id); }

  function replaceTask(task: TaskView) {
    setTargetTask(current => current?.id === task.id && current.version <= task.version ? task : current);
    setTasks(current => current.some(item => item.id === task.id)
      ? current.map(item => item.id === task.id && item.version <= task.version ? task : item) : [task, ...current]);
  }
  function clearPending() {
    if (storageKey.current) sessionStorage.removeItem(storageKey.current);
    pendingRef.current = null; setPending(null);
  }

  async function send(operation: Pending) {
    if (sendingRef.current) return;
    if (!recoveryReady || !storageKey.current || !taskBinding) { setError("Pending-request recovery is not ready. Nothing was sent."); return; }
    const previouslyAttempted = operation.attempted === true;
    const retained = { ...operation, attempted: true };
    try { sessionStorage.setItem(storageKey.current, JSON.stringify({ schemaVersion: 1, ...retained, project, taskBinding })); }
    catch { setError("This browser could not retain this request. Nothing was sent; enable session storage before saving."); return; }
    sendingRef.current = true; pendingRef.current = retained; ++readRevision.current;
    setPending(retained); setSending(true); setLoading(false); setNotice(""); setError("");
    try {
      const response = await fetch(operation.taskId
        ? `${apiBase}/${encodeURIComponent(operation.taskId)}?${new URLSearchParams({ project })}` : endpoint, {
        method: operation.taskId ? "PATCH" : "POST", redirect: "error",
        headers: { "content-type": "application/json", "x-bob-csrf": csrfToken, "x-bob-task-binding": taskBinding },
        body: JSON.stringify(operation.body), signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json() as TaskReceipt & Failure;
      if (!mounted.current) return;
      if (!response.ok) {
        if (result.error?.code === "task_binding_changed") {
          if (!previouslyAttempted) clearPending();
          changedConnection(); return;
        }
        if (previouslyAttempted) {
          setError(`${result.error?.message || "The retry was rejected."} An earlier attempt may already have saved. The original request is retained; do not create a replacement.`);
          return;
        }
        if (response.status === 409 && result.error?.code === "task_version_conflict" && result.error.current) {
          replaceTask(result.error.current); setEditing(null); setDraft(emptyDraft()); clearPending();
          setError(`${result.error.message} Current version: ${result.error.current.version}. Choose Edit to start from it.`);
        } else {
          // A definitive rejection may be corrected. An uncertain request keeps
          // its exact payload/operation ID so a retry replays Core's receipt.
          if ([400, 401, 403, 404, 409].includes(response.status)) clearPending();
          setError(result.error?.message || "Core has not confirmed this request. Retry the same request.");
        }
        return;
      }
      clearPending(); setEditing(null); setDraft(emptyDraft());
      setNotice(`Saved ${apiBase === "/api/review/tasks" ? "in local preview only" : "in Bob Core"} · ${result.task.title} · version ${result.task.version}${result.idempotent ? " · original receipt recovered" : ""}.`);
      // A replayed creation/update receipt is historical. Read current state
      // independently before presenting it in the editable list.
      try {
        const read = await fetch(`${apiBase}/${encodeURIComponent(result.task.id)}?${new URLSearchParams({ project })}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
        const latest = await read.json() as TaskDetail;
        if (!read.ok) throw new Error("read_failed");
        if (latest.taskBinding !== bindingRef.current) { changedConnection(); return; }
        if (mounted.current) { replaceTask(latest.task); setReadError(""); }
      } catch {
        if (mounted.current) {
          setTasks(current => current.filter(task => task.id !== result.task.id));
          setReadError("The save receipt is confirmed, but this task’s current state could not be read. Refresh tasks before editing it again.");
        }
      }
      router.refresh();
    } catch {
      if (mounted.current) setError("Core has not confirmed this request. Retry the same request; it will not create a duplicate. This tab retains the pending request through reloads and owner sign-in to this same connection.");
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  async function edit(task: TaskView) {
    if (pendingRef.current || loading) return;
    const revision = ++readRevision.current; setLoading(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${apiBase}/${encodeURIComponent(task.id)}?${new URLSearchParams({ project })}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const result = await response.json() as TaskDetail & Failure;
      if (!response.ok) throw new Error(result.error?.message || "Current task details are unavailable.");
      if (!mounted.current || revision !== readRevision.current) return;
      if (result.taskBinding !== bindingRef.current) { changedConnection(); return; }
      replaceTask(result.task);
      if (!result.task.editable) throw new Error("This task is read-only. Review approval items in Approvals.");
      focusEditor.current = true;
      setEditing(result.task); setDueError("");
      editingDue.current = localDueFields(result.task.dueAt);
      setDraft({ title: result.task.title, description: result.task.description ?? "", priority: result.task.priority,
        status: result.task.status as Draft["status"], ...editingDue.current });
    } catch (cause) { if (mounted.current && revision === readRevision.current) setError(cause instanceof Error ? cause.message : "Current task details are unavailable."); }
    finally { if (mounted.current && revision === readRevision.current) setLoading(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault(); if (pendingRef.current || sendingRef.current) return;
    const originalDue = editingDue.current ?? localDueFields(null);
    const dueChanged = !editing || draft.dueDate !== originalDue.dueDate || draft.dueTime !== originalDue.dueTime;
    if (Intl.DateTimeFormat().resolvedOptions().timeZone !== timeZone) {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (editing && !dueChanged) {
        const fields = localDueFields(editing.dueAt);
        editingDue.current = fields; setDraft(current => ({ ...current, ...fields }));
      }
      setDueError("The browser’s timezone changed. Review the date, time and timezone before saving again."); return;
    }
    // Unchanged local fields preserve the original ISO instant, including
    // seconds/fractions and either occurrence of a repeated local clock time.
    const due = dueChanged ? parseLocalDue(draft) : { ok: true as const, dueAt: editing?.dueAt ?? null };
    if (!due.ok) { setDueError(due.error); return; }
    setDueError("");
    const dueAt = due.dueAt;
    const body: TaskMutation = { operationId: `web-${crypto.randomUUID()}`, description: draft.description.trim() || null, priority: draft.priority,
      ...(editing ? { expectedVersion: editing.version, newTitle: draft.title.trim(), status: draft.status,
        ...(dueChanged ? { dueAt } : {}) } : { title: draft.title.trim(), dueAt }) };
    void send({ ...(editing ? { taskId: editing.id } : {}), body });
  }

  const locked = Boolean(pending) || loading || sending || !recoveryReady || connectionChanged;
  const shown = visibleTasks(tasks, view, search, sort, clock);
  function taskCard(task: TaskView, selected = false) {
    return <article key={task.id} className={styles.task} aria-label={`Task: ${task.title}`}>
      <div>
        <h3>{selected ? task.title : <button className="text-button" type="button" disabled={locked} onClick={() => selectTask(task.id)}>{task.title}</button>}</h3>
        <div className={styles.meta}><span>{readable(task.status)}</span><span>{task.priority} priority</span><span>{task.dueAt ? `Due ${timestamp(task.dueAt)}` : "No due date"}</span></div>
        <details className={styles.taskDetails} open={selected || undefined}>
          <summary>Details and history</summary>
          {task.description ? <p>{task.description}</p> : <p>No additional details.</p>}
          <p className={styles.scope}>Last updated {timestamp(task.updatedAt)} · Source: {task.source} · Version {task.version}</p>
        </details>
      </div>
      <div className="task-actions">{task.requiresApproval ? <a className="secondary-button" href="#approvals">Review in Approvals</a>
        : task.editable ? <><button className="secondary-button" disabled={locked} type="button" onClick={() => void edit(task)}>Edit</button>
          {task.status !== "done" && <button className="secondary-button" disabled={locked} type="button" onClick={() => {
            if (pendingRef.current) return;
            void send({ taskId: task.id, body: { operationId: `web-${crypto.randomUUID()}`, expectedVersion: task.version, status: "done" } });
          }}>Complete</button>}</> : <span className="muted-copy">Read-only</span>}</div>
    </article>;
  }

  return <section className="panel task-manager" id="task-manager" aria-labelledby="task-manager-title">
    <div className="panel-heading">
      <div><p className="eyebrow">Your project work</p><h2 id="task-manager-title">Tasks · {projectName}</h2>
        <p>Capture your next step, find active work and review completed tasks.</p></div>
      <button className="secondary-button" type="button" onClick={() => void load()} disabled={connectionChanged || loading || sending || Boolean(pending)}>Refresh tasks</button>
    </div>
    <p className="task-freshness" role="status">{checkedAt ? `List checked ${timestamp(checkedAt)}.` : "Task list has not been confirmed yet."}
      {loading ? " Checking Core…" : ""}{readError ? " Last shown items may be stale." : ""}</p>
    {readError && <p className="task-feedback task-feedback-error" role="alert">{readError}</p>}
    {connectionChanged && <div className="task-feedback"><button className="secondary-button" type="button" onClick={() => window.location.reload()}>Reload and review connection</button></div>}
    {notice && <p className="task-feedback" role="status">{notice}</p>}
    {error && <p className="task-feedback task-feedback-error" role="alert">{error}</p>}
    {pending && <div className="task-feedback" role="status"><strong>{sending ? "Saving — waiting for Core" : "Not yet confirmed by Core"}</strong>
      <p>Your original request is retained in this tab. Retrying checks the same save and will not create a duplicate. Keep this tab open until the result is confirmed.</p>
      <button className="secondary-button" type="button" disabled={sending || !recoveryReady} onClick={() => void send(pending)}>Retry same request</button></div>}
    <form className={styles.capture} id="task-capture" aria-label={editing ? "Edit task" : "Create task"} onSubmit={submit}>
      <h3>{editing ? "Edit task" : "Add a task"}</h3>
      <p className={styles.scope}>Saving to <strong>{projectName}</strong></p>
      <fieldset disabled={Boolean(pending) || loading || sending || !recoveryReady}>
        <div className={styles.captureTitle}>
          <div className="task-field"><label htmlFor="task-title">What needs to happen?</label><input id="task-title" name="title" required maxLength={180} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Add your next step" /></div>
          <button className="primary-button" type="submit">{editing ? "Save changes" : "Save task"}</button>
          {editing && <button className="secondary-button" type="button" onClick={() => { setEditing(null); setDraft(emptyDraft()); setDueError(""); }}>Cancel edit</button>}
        </div>
        <details className={styles.optional} open={editing || dueError ? true : undefined}>
          <summary>Details, priority and due date{editing ? " · status" : " (optional)"}</summary>
          <div className="task-field"><label htmlFor="task-description">Details</label><textarea id="task-description" name="description" maxLength={2_000} rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></div>
          <div className="task-fields">
            <div className="task-field"><label htmlFor="task-priority">Priority</label><select id="task-priority" value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as Draft["priority"] })}>{["low", "normal", "high", "critical"].map(value => <option key={value}>{value}</option>)}</select></div>
            <div className="task-field"><label htmlFor="task-due-date">Due date</label><input id="task-due-date" type="date" aria-describedby={`task-due-help${dueError ? " task-due-error" : ""}`} aria-invalid={Boolean(dueError)} value={draft.dueDate} onChange={event => { const value = event.currentTarget.value; setDueError(""); setDraft(current => ({ ...current, dueDate: value })); }} /></div>
            <div className="task-field"><label htmlFor="task-due-time">Due time</label><input id="task-due-time" type="time" step="60" aria-describedby={`task-due-help${dueError ? " task-due-error" : ""}`} aria-invalid={Boolean(dueError)} value={draft.dueTime} onChange={event => { const value = event.currentTarget.value; setDueError(""); setDraft(current => ({ ...current, dueTime: value })); }} /></div>
            {editing && <div className="task-field"><label htmlFor="task-status">Status</label><select id="task-status" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Draft["status"] })}>{["open", "in_progress", "blocked", "done"].map(value => <option value={value} key={value}>{readable(value)}</option>)}</select></div>}
          </div>
          <p id="task-due-help" className={styles.scope}>Timezone: {timeZone || "checking browser timezone…"}. Set both date and time, or leave both empty. A due date does not schedule a notification.</p>
          {dueError && <p id="task-due-error" className="task-feedback task-feedback-error" role="alert">{dueError}</p>}
          <button className="secondary-button" type="button" disabled={!draft.dueDate && !draft.dueTime} onClick={() => { setDraft(current => ({ ...current, dueDate: "", dueTime: "" })); setDueError(""); }}>Clear due date</button>
        </details>
      </fieldset>
    </form>
    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="Task views">{TASK_VIEWS.map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => selectView(value)}>{TASK_VIEW_LABELS[value]}</button>)}</div>
      <div className={styles.searchRow}>
        <label>Search loaded tasks<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a title or detail" /></label>
        <label>Sort loaded tasks<select value={sort} onChange={event => setSort(event.target.value as TaskSort)}><option value="priority">Priority first</option><option value="due">Due date first</option><option value="updated">Recently updated</option></select></label>
      </div>
      <p className={styles.scope} role="status">{checkedAt ? <><strong>{shown.length} matching {shown.length === 1 ? "task" : "tasks"}</strong> among {tasks.length} loaded records. {cursor ? "More records are available; load more to extend this view." : "End of the returned list."}</> : "Waiting for a verified task list."}
        {readError && " The last loaded records may be stale."} Due-day views use {DAILY_TIME_ZONE}. {view !== "all" && "Decision reviews are in Approvals."}</p>
    </div>
    {targetId && <div className={styles.selected} ref={targetRef} tabIndex={-1} aria-label="Selected task">
      <h3>Selected task</h3>
      <p className={styles.scope}>Opened directly from your link; this task may be outside the loaded list or current filter.</p>
      {targetLoading && <p role="status">Opening the current task…</p>}
      {targetError && <><p role="alert">{targetError}</p><button className="secondary-button" type="button" disabled={locked} onClick={() => setTargetRetry(current => current + 1)}>Retry opening task</button></>}
      {pending && <p>Confirm the pending save before opening this task again.</p>}
      {targetTask && taskCard(targetTask, true)}
      <button className="secondary-button" type="button" onClick={() => { setTargetId(null); rememberView(view, null); }}>Close selected task</button>
    </div>}
    <div className={styles.list}>
      {shown.length === 0 && !loading && !readError && checkedAt && <p className="muted-copy">{cursor ? "No matches in the loaded records. Load more or change the filters." : "No matching tasks in the returned list. Try another view or add a task."}</p>}
      {shown.map(task => taskCard(task))}
    </div>
    {cursor && <div className="task-load-more"><button className="secondary-button" disabled={loading || sending || Boolean(pending)} type="button" onClick={() => void load(cursor)}>Load more tasks</button></div>}
  </section>;
}
