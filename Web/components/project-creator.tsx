"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PROJECT_BINDING, projectPayload, publicProjectReadiness, publicProjectReceipt,
  type ProjectCreation, type ProjectReadiness, type ProjectReceipt } from "@/lib/project-contract";

type Failure = { error?: { code?: string; message?: string } };
type Pending = { schemaVersion: 1; projectBinding: string; body: ProjectCreation; attempted: boolean };
const PREFIX = "bob-project-creation:v1:";

export function ProjectCreator({ csrfToken }: { csrfToken: string }) {
  const [ready, setReady] = useState<ProjectReadiness | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [receipt, setReceipt] = useState<ProjectReceipt | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState({ name: "", projectKey: "", description: "", repository: "" });
  const sendingRef = useRef(false);
  const pendingRef = useRef<Pending | null>(null);
  const addressEdited = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    async function prepare() {
      let preparationError = "The project connection could not be verified. Reload to try again.";
      try {
        const response = await fetch("/api/projects", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
        const result = await response.json() as ProjectReadiness & Failure;
        if (!response.ok) { preparationError = result.error?.message || "Project creation is unavailable. Reload to check again."; throw new Error("readiness_failed"); }
        const anchor = publicProjectReadiness(result);
        if (!anchor || typeof result.projectBinding !== "string" || !PROJECT_BINDING.test(result.projectBinding)) throw new Error("The project connection could not be verified.");
        if (!mounted.current || controller.signal.aborted) return;
        preparationError = "This tab’s retained request could not be verified. Nothing was sent. Keep this tab for recovery and check that session storage is available.";
        const key = PREFIX + result.projectBinding;
        const raw = sessionStorage.getItem(key);
        if (Object.keys(sessionStorage).some(other => other.startsWith(PREFIX) && other !== key)) {
          setBlocked(true); setError("A different Core connection has an unconfirmed project request in this tab. Return to that connection to reconcile it. Its contents were not loaded or sent here."); return;
        }
        if (raw) {
          if (raw.length > 24_576) throw new Error("The retained request is too large to verify. Nothing was sent.");
          const value = JSON.parse(raw) as Pending;
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_retained_request");
          const body = projectPayload(value.body);
          if (!value || value.schemaVersion !== 1 || value.projectBinding !== result.projectBinding || typeof value.attempted !== "boolean"
              || Object.keys(value).some(field => !["schemaVersion", "projectBinding", "body", "attempted"].includes(field))
              || !body || body.expectedAnchorId !== anchor.anchor.id || JSON.stringify(value.body) !== JSON.stringify(body)) {
            throw new Error("The retained request could not be verified. Nothing was sent; keep this tab for recovery.");
          }
          pendingRef.current = value; setPending(value);
          setDraft({ name: body.name, projectKey: body.projectKey, description: body.description ?? "", repository: body.repository ?? "" });
          setError("This tab has a project request awaiting confirmation. Retry the same request to recover its Core receipt.");
        }
        setReady({ ...anchor, projectBinding: result.projectBinding });
      } catch {
        if (mounted.current && !controller.signal.aborted) {
          setBlocked(true); setError(preparationError);
        }
      }
    }
    void prepare();
    return () => { mounted.current = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  function clearPending(binding: string) {
    // If storage is unavailable, keep editing locked rather than risking a new
    // operation while an older intent can still be restored on the next load.
    sessionStorage.removeItem(PREFIX + binding);
    pendingRef.current = null; setPending(null);
  }

  async function send(operation: Pending) {
    if (!ready || blocked || sendingRef.current) return;
    const retained: Pending = { ...operation, attempted: true };
    try { sessionStorage.setItem(PREFIX + ready.projectBinding, JSON.stringify(retained)); }
    catch { setError("This browser cannot retain this request. Enable session storage before creating a project. Nothing was sent."); return; }
    sendingRef.current = true; pendingRef.current = retained;
    setPending(retained); setSending(true); setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", redirect: "error",
        headers: { "content-type": "application/json", "x-bob-csrf": csrfToken, "x-bob-project-binding": ready.projectBinding },
        body: JSON.stringify(operation.body), signal: AbortSignal.timeout(25_000) });
      const result = await response.json() as ProjectReceipt & Failure;
      if (!mounted.current) return;
      if (!response.ok) {
        if (result.error?.code === "project_binding_changed" || result.error?.code === "operation_conflict") {
          setBlocked(true);
        } else if (!operation.attempted && [400, 401, 403, 409, 413].includes(response.status)) {
          clearPending(ready.projectBinding);
        }
        setError(`${result.error?.message || "Core has not confirmed this request."}${operation.attempted ? " An earlier attempt may already have saved. The original request is retained; do not create a replacement." : ""}`);
        return;
      }
      const confirmed = publicProjectReceipt(result, operation.body);
      if (!confirmed) throw new Error("invalid_receipt");
      clearPending(ready.projectBinding); setReceipt(confirmed);
    } catch {
      if (mounted.current) setError("Core has not confirmed this request. Retry the same request to recover its receipt. This tab retains the request through reloads and sign-in to this same connection.");
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || pendingRef.current || sendingRef.current || blocked || receipt) return;
    const body = projectPayload({ ...draft, operationId: `web-project-${crypto.randomUUID()}`, expectedAnchorId: ready.anchor.id });
    if (!body) { setError("Use a project name and a key made of letters, numbers, hyphens or underscores. Personal is reserved. The optional repository must be an HTTPS URL without sign-in details, a query or a fragment."); return; }
    void send({ schemaVersion: 1, projectBinding: ready.projectBinding, body, attempted: false });
  }

  return <section className="panel task-manager" aria-labelledby="new-project-form-heading">
    <div className="panel-heading"><div><h2 id="new-project-form-heading">Project details</h2>
      <p>A project can be personal or professional. A code repository is optional.</p></div></div>
    {receipt ? <div className="project-created" role="status">
      <h3>Saved in Bob Core</h3><p>{receipt.project.name}{receipt.idempotent ? " · original receipt recovered" : ""}</p>
      <p>Your project starts empty. Add tasks and review its context in the project workspace.</p>
      <Link className="primary-button" href={`/?project=${encodeURIComponent(receipt.project.projectKey)}#project-state`}>Open {receipt.project.name}</Link>
    </div> : <>
      <p role="status">{blocked ? "Project creation needs attention." : sending ? "Waiting for Core to confirm this request…" : pending ? "A project request is awaiting confirmation." : ready ? "Core connection checked. Ready to create a project." : "Checking the project connection…"}</p>
      <form className="task-editor" onSubmit={submit}>
        <fieldset disabled={!ready || blocked || sending || !!pending}>
          <label htmlFor="new-project-name">Project name</label>
          <input id="new-project-name" value={draft.name} onChange={event => {
            const name = event.target.value;
            setDraft(current => ({ ...current, name, projectKey: addressEdited.current ? current.projectKey
              : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) }));
          }} required maxLength={200} autoComplete="off" />
          <label htmlFor="new-project-goal">Goal (optional)</label>
          <textarea id="new-project-goal" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} maxLength={4000} rows={3} aria-describedby="project-goal-help" />
          <small id="project-goal-help">What do you want this project to achieve?</small>
          <label htmlFor="new-project-key">Project address</label>
          <input id="new-project-key" value={draft.projectKey} onChange={event => { addressEdited.current = true; setDraft({ ...draft, projectKey: event.target.value }); }} required maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="project-key-help" />
          <small id="project-key-help">A unique address such as home-renovation. Letters, numbers, hyphens and underscores; Personal is reserved. This address stays with the project.</small>
          <label htmlFor="new-project-repository">Repository URL (optional)</label>
          <input id="new-project-repository" type="url" value={draft.repository} onChange={event => setDraft({ ...draft, repository: event.target.value })} maxLength={500} autoComplete="off" aria-describedby="project-repository-help" />
          <small id="project-repository-help">An HTTPS link only. Adding a link does not import code or connect GitHub.</small>
          <button className="primary-button" type="submit">{sending ? "Waiting for Core…" : "Create project"}</button>
        </fieldset>
      </form>
      {pending ? <div className="task-pending"><p>Pending — not yet confirmed by Core: {pending.body.name}</p>
        <button className="secondary-button" type="button" onClick={() => void send(pending)} disabled={sending || blocked || !ready}>Retry same project request</button>
        <p>Keep this tab open until the request is confirmed. Closing it may remove its recovery details.</p></div> : null}
    </>}
    {error ? <p className="task-error" role="alert">{error}</p> : null}
    <p>iPhone and AI connections need separate project access. Creating a project does not change their current permissions.</p>
  </section>;
}
