"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { MAX_FILE_BYTES, REVIEW_SOURCES, object, parseImportBundle, validReview, checkedReceipts,
  type ImportBundle as Bundle, type ImportReview as Review, type ImportReceipt as Receipt } from "@/lib/checkpoint-import-contract";

function TextList({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? <ul>{items.map((item, index) => <li key={index} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item}</li>)}</ul> : <p className="muted-copy">{empty}</p>;
}

export function OwnerCheckpointImport({ csrfToken }: { csrfToken: string }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [fileName, setFileName] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState<"file" | "review" | "commit" | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const busyRef = useRef(false);
  const attemptedRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!review) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [review]);
  useEffect(() => {
    if (!attempted || complete) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [attempted, complete]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (busyRef.current || attemptedRef.current || complete) return;
    const file = event.target.files?.[0];
    setBundle(null); setReview(null); setConfirmed(false); setError(""); setFileName("");
    if (!file) return;
    if (file.size > MAX_FILE_BYTES || file.size === 0) {
      setError("Choose a nonempty checkpoint JSON file no larger than 56 KiB."); return;
    }
    busyRef.current = true; setBusy("file");
    try {
      const raw = await file.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_FILE_BYTES) throw new Error("file_size");
      const parsed = parseImportBundle(JSON.parse(raw));
      if (!parsed) throw new Error("file_format");
      if (mounted.current) { setBundle(parsed); setFileName(file.name); }
    } catch {
      if (mounted.current) setError("This file does not match the Production checkpoint format. Choose the prepared JSON file; nothing was imported.");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function requestReview() {
    if (!bundle || busyRef.current || complete || reconciliationRequired) return;
    busyRef.current = true; setBusy("review"); setReview(null); setConfirmed(false); setError("");
    try {
      const response = await fetch("/api/checkpoint-import", {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { "content-type": "application/json", "x-bob-csrf": csrfToken },
        body: JSON.stringify({ action: "review", bundle }), signal: AbortSignal.timeout(30_000),
      });
      const result: unknown = await response.json();
      if (!response.ok || !validReview(result, bundle)) throw new Error("review_unavailable");
      if (mounted.current) { setReview(result); setNow(Date.now()); }
    } catch {
      if (mounted.current) setError("Current project context could not be verified. Keep the original file and try reviewing it again when connected. No import was sent by this review.");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function commit() {
    if (!bundle || !review || !confirmed || busyRef.current || complete || reconciliationRequired || review.expiresAt <= Date.now()) return;
    busyRef.current = true; attemptedRef.current = true;
    setBusy("commit"); setAttempted(true); setReview(null); setConfirmed(false); setError("");
    try {
      const response = await fetch("/api/checkpoint-import", {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { "content-type": "application/json", "x-bob-csrf": csrfToken },
        body: JSON.stringify({ action: "commit", bundle, reviewToken: review.reviewToken }),
        signal: AbortSignal.timeout(60_000),
      });
      const result: unknown = await response.json();
      if (!object(result)) throw new Error("unconfirmed");
      const accepted = checkedReceipts(response.ok ? result.receipts : result.partialReceipts, bundle);
      if (!accepted) throw new Error("unconfirmed");
      if (!mounted.current) return;
      setReceipts((current) => {
        const merged = new Map(current.map((item) => [item.projectKey, item]));
        for (const receipt of accepted) merged.set(receipt.projectKey, receipt);
        return [...merged.values()];
      });
      if (!response.ok && object(result.error) && ["operation_conflict", "project_binding_changed"].includes(String(result.error.code))) {
        setReconciliationRequired(true);
        setError(result.error.code === "operation_conflict"
          ? "An operation ID already belongs to different checkpoint content. Stop this import and keep the original file. Reconcile the saved operation before preparing any new import."
          : "The Production project connection changed. Stop this import and verify the project identity before continuing.");
      } else if (response.ok && result.complete === true && accepted.length === bundle.checkpoints.length
        && accepted.every((receipt) => receipt.verifiedBy !== "receipt_only")) {
        setComplete(true);
      } else {
        setError("The full import is not confirmed. Some checkpoints may already be saved. Review current context again, then continue with this same file and its original operation IDs.");
      }
    } catch {
      if (mounted.current) setError("The import response could not be confirmed. Some checkpoints may already be saved. Keep this tab and the original file. Review again before deliberately continuing the same import.");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  const expired = !!review && review.expiresAt <= now;
  return (
    <section className="panel" style={{ padding: 24 }} aria-labelledby="checkpoint-import-heading">
      <h2 id="checkpoint-import-heading">Choose the prepared checkpoint file</h2>
      <p>The file is kept in this tab’s memory. Reviewing sends it to your signed-in BobCore server to check the destination and show current context. Keep your original file for recovery.</p>
      <label htmlFor="checkpoint-file">Checkpoint JSON · up to 56 KiB</label>
      <input id="checkpoint-file" type="file" accept=".json,application/json" onChange={(event) => void selectFile(event)}
        disabled={busy !== null || attempted || complete} style={{ display: "block", marginBlock: 12, maxWidth: "100%" }} />
      {bundle && <p>{fileName} · {bundle.checkpoints.length} {bundle.checkpoints.length === 1 ? "project" : "projects"} · Production BobCore</p>}
      <p role="status" aria-live="polite">
        {complete ? "All checkpoints confirmed in BobCore." : busy === "commit" ? "Waiting for BobCore to confirm the import…"
          : busy === "review" ? "Reading current project context…" : busy === "file" ? "Reading the selected file…"
          : review ? "Review each project below before confirming." : attempted ? "The same import is retained for reconciliation." : "No import has been sent."}
      </p>
      {bundle && !complete && <button className="secondary-button" type="button" onClick={() => void requestReview()} disabled={busy !== null || reconciliationRequired}>
        {review || attempted ? "Review current context again" : "Review current context"}
      </button>}
      {review && <div style={{ marginTop: 24 }}>
        {review.projects.map((item) => <article key={item.project.key} style={{ marginBottom: 28, overflowWrap: "anywhere" }}>
          <h3>{item.project.name}</h3>
          <p className="muted-copy">Project: {item.project.key} · {item.project.id}</p>
          <Link href={`/?project=${encodeURIComponent(item.project.key)}#project-state`} target="_blank" rel="noopener noreferrer">Open current workspace in another tab</Link>
          <h4>Checkpoint to import</h4>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.body.outcome}</p>
          <strong>Unresolved</strong><TextList items={item.body.unresolved} empty="No unresolved items in this checkpoint." />
          <strong>Next actions</strong><TextList items={item.body.nextActions} empty="No next actions in this checkpoint." />
          <h4>Current project context</h4>
          {item.snapshot.partial && <p role="note">This snapshot is partial or limited. Check the workspace and reconcile anything missing before importing.</p>}
          <p className="muted-copy">Revision: {item.snapshot.revision} · Generated {new Date(item.snapshot.generatedAt).toLocaleString()}</p>
          <ul aria-label={`${item.project.name} source freshness`}>{REVIEW_SOURCES.map(source => <li key={source}>
            {source}: checked {new Date(item.snapshot.sources[source].checkedAt).toLocaleString()} · {item.snapshot.sources[source].truncated ? "Bounded snapshot; more records may exist" : "No truncation reported"}
          </li>)}</ul>
          <strong>Recent checkpoints</strong>
          {item.snapshot.handoffs.length ? item.snapshot.handoffs.map((handoff, index) => <div key={index} style={{ marginBlock: 12 }}>
            <p style={{ whiteSpace: "pre-wrap" }}>{handoff.outcome}</p>
            <span>Unresolved</span><TextList items={handoff.unresolved} empty="None recorded." />
            <span>Next actions</span><TextList items={handoff.nextActions} empty="None recorded." />
          </div>) : <p>No checkpoints returned in this snapshot.</p>}
          <strong>Active decisions</strong>
          {item.snapshot.decisions.length ? <ul>{item.snapshot.decisions.map((decision, index) => <li key={index} style={{ whiteSpace: "pre-wrap" }}><strong>{decision.title}</strong>: {decision.decision}</li>)}</ul> : <p>No decisions returned in this snapshot.</p>}
          <strong>Current tasks</strong>
          {item.snapshot.tasks.length ? <ul>{item.snapshot.tasks.map((task, index) => <li key={index} style={{ whiteSpace: "pre-wrap" }}>{task.title} · {task.status}</li>)}</ul> : <p>No tasks returned in this snapshot.</p>}
        </article>)}
        <p>{expired ? "This review expired. Review current context again before importing." : `Review expires ${new Date(review.expiresAt).toLocaleTimeString()}.`}</p>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy !== null || expired} />
          <span>I checked each destination and reconciled these checkpoints with the current context. I want to save these exact checkpoints.</span>
        </label>
        <button className="primary-button" type="button" onClick={() => void commit()} disabled={!confirmed || busy !== null || expired} style={{ marginTop: 16, paddingInline: 20 }}>
          {attempted ? "Continue the same import" : "Import reviewed checkpoints"}
        </button>
      </div>}
      {receipts.length > 0 && <div style={{ marginTop: 24 }}>
        <h3>Import receipts</h3>
        <ul>{receipts.map((receipt) => <li key={receipt.projectKey} style={{ overflowWrap: "anywhere" }}>
          {receipt.projectKey}: {receipt.verifiedBy === "context_readback" ? "Verified in current context"
            : receipt.verifiedBy === "operation_receipt" ? "Verified by the stored operation receipt; it may be older than the recent context list"
            : "Receipt received; verification still pending"} · {receipt.handoffId}
        </li>)}</ul>
      </div>}
      {attempted && !complete && <p>Keep this tab open. Continuing requires another review and uses the original operation IDs. If you must reopen the page, upload the same unchanged file.</p>}
      {error && <p className="form-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
      {complete && <p><Link href="/">Return to Today and projects</Link></p>}
    </section>
  );
}
