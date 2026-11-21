"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { parseLocalDue } from "@/lib/task-due-date";
import { createWorkbenchTaskClient, type WorkbenchTaskIntent, type WorkbenchTaskReceipt } from "@/lib/workbench/task-creation";
import type { WorkbenchSampleProject } from "@/lib/workbench/sample-projects";
import type { DraftFields, Source } from "./fixtures";
import styles from "./workbench.module.css";

type ReviewDraft = DraftFields & { evidence: { sources: readonly Source[] } };
type State =
  | { kind: "ready" }
  | { kind: "preparing" }
  | { kind: "sending" | "uncertain" | "creation-expired"; intent: WorkbenchTaskIntent }
  | { kind: "reading" | "readback-pending" | "readback-expired"; intent: WorkbenchTaskIntent; receipt: WorkbenchTaskReceipt }
  | { kind: "verified"; intent: WorkbenchTaskIntent; receipt: WorkbenchTaskReceipt; current: CurrentTask };

const client = createWorkbenchTaskClient((path, options) => fetch(path, options));
type CurrentTask = Extract<Awaited<ReturnType<typeof client.read>>, { kind: "current" }>;

const refusals = {
  binding: "The preview connection changed before this create was accepted.",
  conflict: "The operation ID is already bound to a different request. This create was refused.",
  invalid: "The preview refused this task payload. Check the proposed fields.",
  denied: "The preview refused task creation for this sample.",
};

function descriptionWithCitations(draft: ReviewDraft) {
  const citations = draft.evidence.sources.map(source => "• " + source.title + " (" + source.revision + "), " + source.locator);
  return [draft.description.trim(), "Sample evidence\n" + citations.join("\n")].filter(Boolean).join("\n\n");
}

export function TaskCreationReview({ project, draft, active }: {
  project: WorkbenchSampleProject; draft: ReviewDraft | null; active: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [dueTime, setDueTime] = useState("");
  const [zone, setZone] = useState("");
  const [state, setState] = useState<State>({ kind: "ready" });
  const [error, setError] = useState("");
  const running = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const unresolved = state.kind === "preparing" || state.kind === "sending" || state.kind === "uncertain"
    || state.kind === "reading" || state.kind === "readback-pending";

  useEffect(() => {
    if (!unresolved) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unresolved]);

  async function finishReadback(intent: WorkbenchTaskIntent, receipt: WorkbenchTaskReceipt) {
    setState({ kind: "reading", intent, receipt });
    const current = await client.read(intent, receipt);
    if (current?.kind === "current") setState({ kind: "verified", intent, receipt, current });
    else setState({ kind: current?.kind === "binding-ended" ? "readback-expired" : "readback-pending", intent, receipt });
  }

  async function submitIntent(intent: WorkbenchTaskIntent, previouslyUncertain: boolean) {
    setState({ kind: "sending", intent });
    const result = await client.create(intent);
    if (result.kind === "receipt") {
      await finishReadback(intent, result.receipt);
    } else if (result.kind === "refused" && !previouslyUncertain) {
      setError(refusals[result.reason]);
      setState({ kind: "ready" });
    } else if (result.kind === "refused" && result.reason === "binding") {
      setState({ kind: "creation-expired", intent });
    } else {
      if (result.kind === "refused") setError("The retry was refused. The outcome of the original request is still unknown.");
      setState({ kind: "uncertain", intent });
    }
  }

  const description = draft ? descriptionWithCitations(draft) : "";

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!draft || !active || !open || state.kind !== "ready" || running.current || description.length > 2000) return;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone !== zone) {
      setZone(timeZone);
      setError("The browser time zone changed. Review the due time again before creating the task.");
      return;
    }
    const due = parseLocalDue({ dueDate: draft.dueDate, dueTime: draft.dueDate ? dueTime : "" });
    if (!due.ok) { setError(due.error); return; }
    running.current = true;
    setError("");
    feedback.current?.focus({ preventScroll: true });
    setState({ kind: "preparing" });
    try {
      let intent: WorkbenchTaskIntent;
      try {
        intent = await client.prepare(project, crypto.randomUUID(), "workbench-" + crypto.randomUUID(), {
          title: draft.title.trim(), description, priority: draft.priority, dueAt: due.dueAt,
        });
      } catch {
        setState({ kind: "ready" });
        setError("Could not verify the local preview connection. No create request was sent.");
        return;
      }
      await submitIntent(intent, false);
    } finally {
      running.current = false;
    }
  }

  async function retry() {
    if (!active || running.current || (state.kind !== "uncertain" && state.kind !== "readback-pending")) return;
    running.current = true;
    setError("");
    feedback.current?.focus({ preventScroll: true });
    try {
      if (state.kind === "uncertain") await submitIntent(state.intent, true);
      else if (state.kind === "readback-pending") await finishReadback(state.intent, state.receipt);
    } finally {
      running.current = false;
    }
  }

  if (!draft && state.kind === "ready") return null;
  const hasReceipt = state.kind === "reading" || state.kind === "readback-pending"
    || state.kind === "readback-expired" || state.kind === "verified";
  return <section className={styles.taskCreation} hidden={!active} aria-labelledby={id}>
    <h3 id={id} tabIndex={-1} ref={heading}>Synthetic task creation</h3>
    {!open && <button ref={opener} type="button" className={styles.quiet} onClick={() => {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setOpen(true);
      requestAnimationFrame(() => heading.current?.focus());
    }}>Review task creation</button>}
    {open && state.kind === "ready" && draft && <form className={styles.draftForm} onSubmit={confirm}>
      <p>Confirm the fields for one synthetic task. The run ends after 30 minutes or when the preview server restarts.</p>
      <dl>
        <dt>Destination</dt><dd>{project.name}</dd>
        <dt>Title</dt><dd>{draft.title}</dd>
        <dt>Priority</dt><dd>{draft.priority}</dd>
        <dt>Description to send</dt><dd className={styles.taskDescription}>{description}</dd>
        <dt>Due date</dt><dd>{draft.dueDate || "No due date"}</dd>
      </dl>
      {draft.dueDate && <label>Due time ({zone})<input type="time" step="60" value={dueTime}
        onChange={event => { setDueTime(event.currentTarget.value); setError(""); }} /></label>}
      {description.length > 2000 && <p className={styles.warning} role="alert">
        The description and citations exceed 2,000 characters. Shorten the board draft to keep both citations.
      </p>}
      <div className={styles.row}>
        <button type="button" className={styles.quiet} onClick={() => {
          setOpen(false); setError(""); setDueTime("");
          requestAnimationFrame(() => opener.current?.focus());
        }}>Cancel review</button>
        <button type="submit" className={styles.primary} disabled={description.length > 2000 || !draft.title.trim()}>Create synthetic task</button>
      </div>
    </form>}
    {error && <p className={styles.warning} role="alert">{error}</p>}
    <div role="status" tabIndex={-1} ref={feedback}>
      {state.kind === "preparing" && <p>Verifying the sample connection…</p>}
      {state.kind === "sending" && <p>Submitting the synthetic task…</p>}
      {state.kind === "uncertain" && <><p><strong>Creation unconfirmed</strong></p>
        <p>Keep this tab open. Retrying sends the same request and operation ID.</p></>}
      {state.kind === "creation-expired" && <p><strong>Creation unconfirmed.</strong> This preview run ended, so its receipt can no longer be recovered.</p>}
      {state.kind === "reading" && <p>Receipt confirmed. Checking the current task…</p>}
      {state.kind === "readback-pending" && <p><strong>Receipt confirmed. Readback pending.</strong> Retry the task read to verify this result.</p>}
      {state.kind === "readback-expired" && <p><strong>Receipt confirmed. Readback unavailable.</strong> This preview run ended before the current task could be verified.</p>}
      {state.kind === "verified" && <p><strong>Verified in local preview</strong> · {state.current.task.title} · current version {state.current.task.version}</p>}
    </div>
    {state.kind === "uncertain" && <button className={styles.quiet} type="button" onClick={() => void retry()}>Retry same request</button>}
    {state.kind === "readback-pending" && <button className={styles.quiet} type="button" onClick={() => void retry()}>Retry readback</button>}
    {hasReceipt && <details>
      <summary>Receipt and task details</summary>
      <dl>
        <dt>Project</dt><dd>{project.name} · <code>{project.id}</code></dd>
        <dt>Request operation ID</dt><dd><code>{state.intent.operationId}</code></dd>
        <dt>Task ID</dt><dd><code>{state.receipt.task.id}</code></dd>
        <dt>Receipt</dt><dd>{state.receipt.idempotent ? "Original receipt recovered" : "New creation receipt"} · version {state.receipt.task.version}</dd>
        {state.kind === "verified" && <>
          <dt>Readback</dt><dd>{state.current.task.status.replaceAll("_", " ")} · version {state.current.task.version} · <time dateTime={state.current.checkedAt}>{state.current.checkedAt}</time></dd>
          <dt>Current description</dt><dd className={styles.taskDescription}>{state.current.task.description ?? "No description"}</dd>
        </>}
      </dl>
    </details>}
  </section>;
}
