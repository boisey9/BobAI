"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { fixture, fixtureDate, groups, initialBoard, placeCard, sampleQuestion,
  type Board, type DraftFields, type Group, type Project, type Source } from "./fixtures";
import { workbenchSampleProjects } from "@/lib/workbench/sample-projects";
import { boardDraftId, replaceSourceLayout } from "@/lib/workbench/layout-contract";
import { LayoutReview } from "./layout-review";
import { TaskCreationReview } from "./task-creation-review";
import styles from "./workbench.module.css";

type Panel = "sources" | "board" | "bob";
type DragKind = "source" | "card" | "finding";
type DragItem = { project: Project; kind: DragKind; id: string };
type Evidence = { question: string; sources: Source[] };
type Draft = DraftFields & { evidence: Evidence };
type ProjectState = {
  selected: string[];
  question: string;
  evidence: Evidence | null;
  draft: Draft | null;
  board: Board;
  history: Board[];
};
type Editor = { draft: Draft; destination: Group };
const DRAG_TYPE = "application/x-bob-workbench";
const DRAFT_ID = boardDraftId;
const groupLabel = (group: Group) => groups.find(item => item.id === group)!.label;

function sampleState(project: Project, stress: boolean): ProjectState {
  return {
    selected: [], question: sampleQuestion, evidence: null, draft: null,
    board: initialBoard(fixture(project, stress).sources), history: [],
  };
}

function localPlacement(state: ProjectState, board: Board): ProjectState {
  return state.board === board ? state
    : { ...state, board, history: [...state.history.slice(-19), state.board] };
}

function isExternalDrop(event: DragEvent) {
  return event.dataTransfer.types.includes("Files") || event.dataTransfer.types.includes("text/uri-list");
}

function Inspector({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title}
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className={styles.row}><h2>{title}</h2>
      <button type="button" className={styles.quiet} onClick={close}>Close</button></div>
    {children}
  </dialog>;
}

type WorkbenchProps = { initialProject: Project } & (
  | { ownerPreview: true; stress: false; readReview: false; taskReview: false; layoutReview: false; projectReadsHref?: "/workbench/reads" }
  | { ownerPreview?: false; stress: boolean; readReview: boolean; taskReview: boolean; layoutReview: boolean; projectReadsHref?: never }
);

export function Workbench({ stress, readReview, initialProject, taskReview, layoutReview, ownerPreview, projectReadsHref }: WorkbenchProps) {
  const [project, setProject] = useState(initialProject);
  const [projects, setProjects] = useState(() => ({
    "demo-rfq": sampleState("demo-rfq", stress),
    "demo-bobai": sampleState("demo-bobai", stress),
  }));
  const [panel, setPanel] = useState<Panel>("sources");
  const [search, setSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [inspected, setInspected] = useState<Source | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [hover, setHover] = useState("");
  const activeDrag = useRef<DragItem | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const movedFocus = useRef<string | null>(null);
  const state = projects[project];
  const sample = fixture(project, stress);
  const draftLabel = taskReview ? "Board draft" : "Draft · not saved";
  const sources = new Map(sample.sources.map(source => [source.id, source]));
  const selected = state.selected.flatMap(id => sources.get(id) ?? []);
  const shown = sample.sources.filter(source =>
    source.title.toLowerCase().includes(search.trim().toLowerCase()));
  const home = ownerPreview ? "/" : "/review";

  function change(update: (current: ProjectState) => ProjectState) {
    setProjects(current => ({ ...current, [project]: update(current[project]) }));
  }

  const applyLayout = useCallback((key: Project, expected: Board, replacement: Board, undoable: boolean) => {
    setProjects(current => {
      const target = current[key];
      if (target.board !== expected) return current;
      const board = replaceSourceLayout(target.board, replacement);
      if (target.board === board) return current;
      const next = undoable ? localPlacement(target, board) : { ...target, board };
      return { ...current, [key]: next };
    });
  }, []);

  function clearDrag() {
    activeDrag.current = null;
    setDrag(null);
    setHover("");
  }

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clearDrag(); };
    window.addEventListener("blur", clearDrag);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", clearDrag);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  useEffect(() => {
    const target = movedFocus.current;
    if (!target) return;
    movedFocus.current = null;
    (document.getElementById("move-" + target) ?? document.getElementById("board-heading"))?.focus();
  }, [state.board, panel, editor]);

  function switchProject(next: Project) {
    if (next === project) return;
    clearDrag();
    setSearch("");
    setComparisonError("");
    setProject(next);
    setAnnouncement("Opened the " + fixture(next, stress).title + " sample project.");
  }

  function select(id: string) {
    const source = sources.get(id);
    if (!source || state.selected.includes(id)) return;
    if (state.selected.length >= 6) {
      setAnnouncement("Six sources selected. Remove one before adding another.");
      return;
    }
    change(current => current.selected.includes(id) || current.selected.length >= 6
      ? current : { ...current, selected: [...current.selected, id] });
    setComparisonError("");
    setAnnouncement(source.title + " added to selected context.");
  }

  function remove(id: string) {
    change(current => ({ ...current, selected: current.selected.filter(source => source !== id) }));
    setComparisonError("");
    setAnnouncement((sources.get(id)?.title ?? "Source") + " removed from selected context.");
  }

  function discuss(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.question.trim() !== sampleQuestion ||
      selected.length !== 2 || !state.selected.includes("delivery") || !state.selected.includes("finding")) {
      setComparisonError("This preview has a prepared answer for the sample question with the document and review note selected.");
      return;
    }
    const evidence = { question: state.question.trim(), sources: selected };
    change(current => ({ ...current, evidence }));
    setComparisonError("");
    setAnnouncement("Sample comparison ready with two evidence references.");
  }

  function openSource(source: Source) {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setInspected(source);
  }

  function focusAfterClose() {
    const target = returnFocus.current;
    returnFocus.current = null;
    requestAnimationFrame(() => target?.focus());
  }

  function openDraft(destination?: Group, opener?: HTMLButtonElement) {
    if (!state.evidence || editor) return;
    returnFocus.current = opener ?? document.getElementById("create-workbench-draft");
    const currentGroup = groups.find(({ id }) => state.board[id].includes(DRAFT_ID))?.id;
    const draft = state.draft ?? {
      title: sample.draftTitle, description: sample.draftDescription,
      priority: "high", dueDate: "", evidence: state.evidence,
    };
    setEditor({ draft, destination: destination ?? currentGroup ?? "review" });
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !editor.draft.title.trim()) return;
    const draft = { ...editor.draft, title: editor.draft.title.trim() };
    change(current => localPlacement({ ...current, draft },
      current.board[editor.destination].includes(DRAFT_ID)
        ? current.board : placeCard(current.board, DRAFT_ID, editor.destination)));
    setAnnouncement("Unsaved draft placed in " + groupLabel(editor.destination) + ".");
    movedFocus.current = DRAFT_ID;
    returnFocus.current = null;
    setEditor(null);
    setPanel("board");
  }

  function relocate(id: string, destination: Group, before?: string, focus = false) {
    if ((!sources.has(id) && id !== DRAFT_ID) || (id === DRAFT_ID && !state.draft)) return;
    const board = placeCard(state.board, id, destination, before);
    if (board === state.board) return;
    if (focus) movedFocus.current = id;
    change(current => localPlacement(current, board));
    setAnnouncement((sources.get(id)?.title ?? state.draft?.title) + " moved to " + groupLabel(destination) + ".");
  }

  function reorder(id: string, group: Group, offset: -1 | 1) {
    const index = state.board[group].indexOf(id);
    relocate(id, group, state.board[group][index + (offset === -1 ? -1 : 2)], true);
  }

  function undo() {
    const previous = state.history.at(-1);
    if (!previous) return;
    if (state.history.length === 1) movedFocus.current = "board-heading";
    change(current => ({ ...current, board: previous, history: current.history.slice(0, -1) }));
    setAnnouncement("Last board change undone.");
  }

  function dragHandle(kind: DragKind, id: string, label: string) {
    return <span className={styles.handle} draggable aria-hidden="true" title={"Drag " + label}
      data-drag={kind + "-" + id}
      onDragStart={event => {
        const item = { project, kind, id };
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
        event.dataTransfer.effectAllowed = kind === "card" ? "move" : "copy";
        activeDrag.current = item;
        setDrag(item);
      }} onDragEnd={clearDrag}>⠿</span>;
  }

  function acceptOver(event: DragEvent, target: string, kind: "context" | "board") {
    const item = activeDrag.current;
    if (!item || item.project !== project || (kind === "context" && item.kind !== "source")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = item.kind === "card" ? "move" : "copy";
    setHover(target);
  }

  function drop(event: DragEvent, destination: Group | "context", before?: string) {
    event.preventDefault();
    event.stopPropagation();
    const item = activeDrag.current;
    const supplied = event.dataTransfer.getData(DRAG_TYPE);
    clearDrag();
    if (!item || item.project !== project || supplied !== JSON.stringify(item)) {
      setAnnouncement("Drop refused. Use a card from this sample project.");
      return;
    }
    if (destination === "context") {
      if (item.kind === "source") select(item.id);
      return;
    }
    if (item.kind === "finding" && state.evidence) openDraft(destination);
    else if (item.kind !== "finding") relocate(item.id, destination, before);
  }

  function moveMenu(id: string, title: string, current?: Group, index?: number) {
    const placedGroup = groups.find(group => state.board[group.id].includes(id))?.id;
    return <details className={styles.move}>
      <summary id={current ? "move-" + id : undefined}
        aria-label={(current ? "Move " : "Move on board: ") + title}>{current ? "Move" : "Move on board"}</summary>
      <div className={styles.moves}>
        {groups.filter(group => group.id !== placedGroup).map(group => <button key={group.id} type="button"
          onClick={event => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            relocate(id, group.id, undefined, true);
            setPanel("board");
          }}>{group.label}</button>)}
        {current && index !== undefined && <>
          <button type="button" disabled={index === 0} onClick={() => reorder(id, current, -1)}>Move up</button>
          <button type="button" disabled={index === state.board[current].length - 1}
            onClick={() => reorder(id, current, 1)}>Move down</button>
        </>}
      </div>
    </details>;
  }

  return <div className={styles.shell} data-preview-project={project}
    onDragOver={event => { if (isExternalDrop(event)) event.preventDefault(); }}
    onDrop={event => {
      if (!isExternalDrop(event)) return;
      event.preventDefault();
      setAnnouncement("Use a synthetic source from the source drawer.");
    }}>
    <aside className={styles.rail}>
      <a href={home} className={styles.brand}>BobCore</a>
      <nav aria-label="Preview navigation">
        <a href={home}>{ownerPreview ? "Back to Control Center" : "Control Center review"}</a>
        <span aria-current="page">Workbench</span>
        {readReview && <a href={"/review/workbench/read?project=" + project}>Project reads</a>}
        {projectReadsHref && <a href={projectReadsHref}>Project reads</a>}
      </nav>
      <span className={styles.railNote}>{ownerPreview ? "Owner preview" : "Local review"}</span>
    </aside>
    <main className={styles.main}>
      <header className={styles.top}>
        <div><span className={styles.eyebrow}>BobCore Workbench</span>
          <h1>Bring the pieces together.</h1>
          <p>{ownerPreview ? "Try the workflow with fictional sources. Drafts and board changes reset when you leave or reload."
            : "Gather evidence, discuss it with Bob, and prepare your next step."}</p></div>
        <span className={styles.badge}>{ownerPreview ? "Owner preview · Sample data" : "Local preview · Sample data"}</span>
      </header>
      <div className={styles.project}>
        <div><h2>{sample.title} <span>· Sample</span></h2><p>{sample.reference}</p></div>
        <label>Sample project <select aria-label="Sample project" value={project}
          onChange={event => switchProject(event.currentTarget.value as Project)}>
          <option value="demo-rfq">Sample RFQ</option><option value="demo-bobai">Operations</option>
        </select></label>
      </div>
      <nav className={styles.panelNav} aria-label="Workbench panels">
        {(["sources", "board", "bob"] as const).map(item => <button key={item} type="button"
          aria-pressed={panel === item} aria-controls={"workbench-" + item} onClick={() => setPanel(item)}>
          {item === "sources" ? "Sources" : item === "board" ? "Board" : "Bob (" + selected.length + ")"}
        </button>)}
      </nav>
      <p className={styles.visuallyHidden} role="status">{announcement}</p>
      <div className={styles.grid}>
        <section id="workbench-sources" aria-labelledby="source-heading" className={styles.panel} data-active={panel === "sources"}>
          <h2 id="source-heading">Sources</h2>
          <label className={styles.visuallyHidden} htmlFor="workbench-filter">Search loaded sources</label>
          <input id="workbench-filter" placeholder="Search loaded sources" type="search"
            value={search} onChange={event => setSearch(event.currentTarget.value)} />
          <div className={styles.sourceList}>
            {shown.map(source => <article className={styles.card} key={source.id} aria-label={source.title}>
              <div className={styles.cardHeading}>{dragHandle("source", source.id, source.title)}
                <div><button type="button" className={styles.sourceTitle} onClick={() => openSource(source)}>{source.title}</button>
                  <p>{source.type} · {source.revision}</p></div>
              </div>
              <div className={styles.cardActions}>
                <button type="button" className={styles.contextButton}
                  aria-label={(state.selected.includes(source.id) ? "Remove from context: " : "Add to context: ") + source.title}
                  onClick={() => state.selected.includes(source.id) ? remove(source.id) : select(source.id)}>
                  {state.selected.includes(source.id) ? "Remove" : "+ Context"}
                </button>
                {moveMenu(source.id, source.title)}
              </div>
            </article>)}
            {shown.length === 0 && <p>No loaded sources match.</p>}
          </div>
        </section>
        <section id="workbench-board" className={styles.panel} data-active={panel === "board"} aria-labelledby="board-heading">
          <div className={styles.row}><h2 id="board-heading" tabIndex={-1}>Board</h2>
            <button type="button" className={styles.quiet} onClick={undo} disabled={state.history.length === 0}>Undo move</button></div>
          <p className={styles.panelIntro}>Arranging cards does not change project status.</p>
          <div className={styles.lanes}>
            {groups.map(group => <section key={group.id} aria-label={group.label} className={styles.lane}
              data-group={group.id} data-drop={!!drag} data-hover={hover === group.id}
              onDragOver={event => acceptOver(event, group.id, "board")}
              onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setHover(""); }}
              onDrop={event => drop(event, group.id)}>
              <h3>{group.label} <span>{state.board[group.id].length}</span></h3>
              {state.board[group.id].map((id, index) => {
                const source = sources.get(id);
                const draft = id === DRAFT_ID ? state.draft : null;
                if (!source && !draft) return null;
                const title = source?.title ?? draft!.title;
                return <article key={id} className={styles.card} aria-label={title} data-insert={hover === group.id + id}
                  onDragOver={event => acceptOver(event, group.id + id, "board")}
                  onDrop={event => drop(event, group.id, id)}>
                  <div className={styles.cardHeading}>{dragHandle("card", id, title)}
                    <div><button type="button" className={styles.sourceTitle}
                      onClick={event => source ? openSource(source) : openDraft(group.id, event.currentTarget)}>{title}</button>
                      <p className={draft ? styles.draftLabel : undefined}>{draft ? draftLabel : source!.type + " · " + source!.revision}</p></div>
                  </div>
                  {moveMenu(id, title, group.id, index)}
                </article>;
              })}
              {state.board[group.id].length === 0 && <p className={styles.emptyLane}>Move a card here from another group.</p>}
            </section>)}
          </div>
          {layoutReview && workbenchSampleProjects.map(({ projectKey }) => <LayoutReview
            key={"layout-" + projectKey} project={projectKey} stress={stress} active={project === projectKey}
            board={projects[projectKey].board} applyLayout={applyLayout} />)}
          {taskReview && workbenchSampleProjects.map(sampleProject => <TaskCreationReview
            key={sampleProject.projectKey} project={sampleProject} active={project === sampleProject.projectKey}
            draft={projects[sampleProject.projectKey].draft} />)}
          <p className={styles.footnote}>{layoutReview
            ? "Drafts and undo history stay on this page until you reload or leave."
            : "This board keeps its drafts and layout until you reload or leave."}</p>
        </section>
        <section id="workbench-bob" className={styles.panel} data-active={panel === "bob"} aria-labelledby="bob-heading">
          <div className={styles.bobHeading}><span className={styles.coreMark} aria-hidden="true">B</span>
            <div><h2 id="bob-heading">Discuss with Bob</h2><p>Prepared sample comparison</p></div></div>
          <section aria-label="Selected context" className={styles.tray} data-hover={hover === "context"}
            onDragOver={event => acceptOver(event, "context", "context")}
            onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setHover(""); }}
            onDrop={event => drop(event, "context")}>
            <div className={styles.row}><h3>Selected context</h3><span>{selected.length} of 6</span></div>
            {selected.length ? <ul>{selected.map(source => <li key={source.id}>
              <button type="button" className={styles.sourceTitle} onClick={() => openSource(source)}>
                {source.title} <small>{source.revision}</small>
              </button><button type="button" className={styles.quiet}
                aria-label={"Remove selected source: " + source.title} onClick={() => remove(source.id)}>×</button>
            </li>)}</ul> : <p>Choose or drag sources here.</p>}
            {selected.length > 1 && <button type="button" className={styles.quiet} onClick={() => {
              change(current => ({ ...current, selected: [] }));
              setComparisonError("");
              setAnnouncement("Selected context cleared.");
            }}>Clear selection</button>}
          </section>
          <form className={styles.composer} onSubmit={discuss}>
            <label htmlFor="sample-question">Sample question</label>
            <textarea id="sample-question" rows={2} maxLength={400} value={state.question}
              onChange={event => {
                const question = event.currentTarget.value;
                change(current => ({ ...current, question }));
                setComparisonError("");
              }} />
            {state.question !== sampleQuestion && <button type="button" className={styles.quiet}
              onClick={() => { change(current => ({ ...current, question: sampleQuestion })); setComparisonError(""); }}>Use sample question</button>}
            <button type="submit" className={styles.primary}>Run sample comparison</button>
            {comparisonError && <p className={styles.warning} role="alert">{comparisonError}</p>}
          </form>
          {state.evidence && <article className={styles.answer} aria-label="Sample response">
            <span className={styles.eyebrow}>Sample response · not live AI</span>
            <h3>{sample.headline}</h3><p>{sample.answer}</p>
            <h4>Used in this answer</h4>
            <ol>{state.evidence.sources.map(source => <li key={source.id}>
              <button type="button" className={styles.sourceTitle} onClick={() => openSource(source)}>
                {source.title} <small>{source.revision}</small></button>
            </li>)}</ol>
            <div className={styles.row}>{dragHandle("finding", "sample", "sample finding")}
              <button id="create-workbench-draft" className={styles.primary} type="button"
                onClick={event => openDraft(undefined, event.currentTarget)}>Create task draft</button></div>
          </article>}
        </section>
      </div>
      {inspected && <Inspector title={inspected.title} close={() => { setInspected(null); focusAfterClose(); }}>
        <p>{sample.title} sample · {inspected.type} · {inspected.revision}</p>
        <dl><dt>Source location</dt><dd>{inspected.locator}</dd>
          <dt>Fixture version date</dt><dd>{fixtureDate}</dd><dt>Availability</dt><dd>Available sample excerpt</dd></dl>
        <blockquote>{inspected.excerpt}</blockquote>
      </Inspector>}
      {editor && <Inspector title="Task draft" close={() => { setEditor(null); focusAfterClose(); }}>
        <p className={styles.draftLabel}>{draftLabel}</p>
        <form className={styles.draftForm} onSubmit={submitDraft}>
          <label>Destination project <input readOnly value={sample.title + " (sample)"} /></label>
          <label>Title <input autoFocus required maxLength={180} value={editor.draft.title}
            onChange={event => setEditor({ ...editor, draft: { ...editor.draft, title: event.currentTarget.value } })} /></label>
          <label>Description <textarea rows={3} maxLength={2000} value={editor.draft.description}
            onChange={event => setEditor({ ...editor, draft: { ...editor.draft, description: event.currentTarget.value } })} /></label>
          <div className={styles.fields}>
            <label>Priority <select value={editor.draft.priority}
              onChange={event => setEditor({ ...editor, draft: { ...editor.draft, priority: event.currentTarget.value as DraftFields["priority"] } })}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>
            </select></label>
            <label>Due date <input type="date" value={editor.draft.dueDate}
              onChange={event => setEditor({ ...editor, draft: { ...editor.draft, dueDate: event.currentTarget.value } })} /></label>
          </div>
          <label>Board group <select value={editor.destination}
            onChange={event => setEditor({ ...editor, destination: event.currentTarget.value as Group })}>
            {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select></label>
          <p>Evidence {editor.draft.evidence.sources.map(source => source.title + " " + source.revision).join(" · ")}</p>
          <div className={styles.row}><button type="button" className={styles.quiet}
            onClick={() => { setEditor(null); focusAfterClose(); }}>Cancel edits</button>
            <button type="submit" className={styles.primary} disabled={!editor.draft.title.trim()}>Place draft on board</button></div>
        </form>
      </Inspector>}
    </main>
  </div>;
}
