"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createLayoutClient, type LayoutIntent, type SavedLayout } from "@/lib/workbench/layout-client";
import { sampleLayoutScope, sameLayout, sourceLayout } from "@/lib/workbench/layout-contract";
import type { Board, Project } from "./fixtures";
import styles from "./workbench.module.css";

type State =
  | { kind: "loading" | "unavailable" | "expired"; saved: SavedLayout | null }
  | { kind: "ready" | "conflict"; saved: SavedLayout }
  | { kind: "saving" | "uncertain"; saved: SavedLayout; intent: LayoutIntent }
  | { kind: "checking" | "readback"; saved: SavedLayout; receipt: SavedLayout };

export function LayoutReview({ project, stress, active, board, applyLayout }: {
  project: Project;
  stress: boolean;
  active: boolean;
  board: Board;
  applyLayout: (project: Project, expected: Board, replacement: Board, undoable: boolean) => void;
}) {
  const id = useId();
  const scope = useMemo(() => sampleLayoutScope(project, stress ? "stress" : "standard")!, [project, stress]);
  const client = useMemo(() => createLayoutClient(scope), [scope]);
  const [state, setState] = useState<State>({ kind: "loading", saved: null });
  const [error, setError] = useState("");
  const status = useRef<HTMLParagraphElement>(null);
  const started = useRef(false);
  const working = useRef(false);
  const placements = sourceLayout(board);
  const dirty = !sameLayout(placements, state.saved?.board ?? scope.defaultBoard);
  const unresolved = state.kind === "saving" || state.kind === "uncertain"
    || state.kind === "checking" || state.kind === "readback";

  useEffect(() => {
    if (!unresolved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unresolved]);

  const load = useCallback(async (automatic: boolean, previous: SavedLayout | null) => {
    if (working.current) return;
    working.current = true;
    setError("");
    setState({ kind: "loading", saved: previous });
    try {
      const result = await client.read(previous?.binding);
      if (result.kind === "snapshot") {
        // Use the board captured when the read began. Late reads cannot erase a move.
        applyLayout(project, board, result.snapshot.board ?? scope.defaultBoard, !automatic);
        setState({ kind: "ready", saved: result.snapshot });
      } else setState({ kind: result.kind === "expired" ? "expired" : "unavailable", saved: previous });
    } finally {
      working.current = false;
    }
  }, [applyLayout, board, client, project, scope]);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void load(true, null);
  }, [active, load]);

  async function confirmReadback(saved: SavedLayout, receipt: SavedLayout) {
    setState({ kind: "checking", saved, receipt });
    const result = await client.read(saved.binding);
    if (result.kind === "expired") {
      setError("The layout was accepted before this preview profile expired. Current readback is unavailable.");
      setState({ kind: "expired", saved });
    } else if (result.kind !== "snapshot") {
      setState({ kind: "readback", saved, receipt });
    } else if (result.snapshot.version !== receipt.version || !result.snapshot.board || !receipt.board
        || !sameLayout(result.snapshot.board, receipt.board)) {
      setState({ kind: "conflict", saved });
    } else {
      setState({ kind: "ready", saved: { ...result.snapshot, replayed: receipt.replayed } });
    }
  }

  async function save(saved: SavedLayout, intent: LayoutIntent, retrying: boolean) {
    if (!active || working.current) return;
    working.current = true;
    status.current?.focus({ preventScroll: true });
    setError("");
    setState({ kind: "saving", saved, intent });
    try {
      const result = await client.save(saved.binding, intent);
      if (result.kind === "snapshot") await confirmReadback(saved, result.snapshot);
      else if (result.kind === "expired") {
        setError(retrying ? "The original save is unconfirmed. This preview profile expired before it could be recovered." : "");
        setState({ kind: "expired", saved });
      } else if (result.kind === "conflict") setState({ kind: "conflict", saved });
      else if (result.kind === "refused" && !retrying) {
        setError("This preview refused the save. Your source arrangement is still on this board.");
        setState({ kind: "ready", saved });
      } else setState({ kind: "uncertain", saved, intent });
    } finally {
      working.current = false;
    }
  }

  async function retryReadback(saved: SavedLayout, receipt: SavedLayout) {
    if (!active || working.current) return;
    working.current = true;
    status.current?.focus({ preventScroll: true });
    try { await confirmReadback(saved, receipt); }
    finally { working.current = false; }
  }

  let message: string;
  switch (state.kind) {
    case "loading": message = "Checking the saved layout…"; break;
    case "unavailable": message = "Saved layout unavailable. Your current arrangement is still on the board."; break;
    case "expired": message = "Layout preview profile expired or changed. Your current arrangement is still on the board."; break;
    case "conflict": message = "Layout conflict. Another save changed this layout. Your arrangement is still on the board."; break;
    case "saving": message = "Saving source layout…"; break;
    case "checking": message = "Save accepted. Checking the stored layout…"; break;
    case "uncertain": message = "Layout save unconfirmed. Retry the same save to recover its result."; break;
    case "readback": message = "Save accepted. Layout readback pending."; break;
    case "ready":
      message = dirty ? "Unsaved source layout changes."
        : state.saved.version === 0 ? "Default source layout."
          : "Saved layout · version " + state.saved.version + (state.saved.replayed ? " · Original save recovered" : "");
  }

  return <section className={styles.taskCreation} hidden={!active} aria-labelledby={id}>
    <h3 id={id}>Source layout</h3>
    <p ref={status} role="status" tabIndex={-1}>{message}</p>
    <div className={styles.layoutActions}>
      {state.kind === "ready" && <button className={styles.primary} type="button" disabled={!dirty} onClick={() => {
        void save(state.saved, { operationId: crypto.randomUUID(), expectedVersion: state.saved.version, board: placements }, false);
      }}>Save layout</button>}
      {(state.kind === "ready" || state.kind === "conflict" || state.kind === "unavailable") && <>
        <button className={styles.quiet} type="button" onClick={() => {
          status.current?.focus({ preventScroll: true });
          void load(false, state.saved);
        }}>Load saved layout</button>
        <button className={styles.quiet} type="button" disabled={sameLayout(placements, scope.defaultBoard)}
          onClick={() => {
            status.current?.focus({ preventScroll: true });
            applyLayout(project, board, scope.defaultBoard, true);
          }}>Restore default layout</button>
      </>}
      {state.kind === "uncertain" && <button className={styles.quiet} type="button"
        onClick={() => void save(state.saved, state.intent, true)}>Retry same save</button>}
      {state.kind === "readback" && <button className={styles.quiet} type="button"
        onClick={() => void retryReadback(state.saved, state.receipt)}>Retry layout readback</button>}
    </div>
    {error && <p className={styles.warning} role="alert">{error}</p>}
    <p className={styles.footnote}>Saved source placements use this browser’s 24-hour local preview profile.</p>
  </section>;
}
