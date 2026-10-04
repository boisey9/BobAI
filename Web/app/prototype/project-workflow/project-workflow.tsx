"use client";

import { useEffect, useRef, useState } from "react";
import { BobMark } from "@/components/bob-mark";
import styles from "./workflow.module.css";

type Scenario = "ready" | "loading" | "empty" | "error" | "recovery" | "changed";
type Tab = "work" | "history" | "review";
const projects = [{ key: "bobcore", name: "Bob Core", goal: "Keep project work dependable across every interface." },
  { key: "sample", name: "Sample website", goal: "Prepare a clear first version for owner review." }];
const steps = ["Capture", "Specification", "Verification", "Owner review", "Accepted"];

export function ProjectWorkflowPrototype() {
  const captureInput = useRef<HTMLInputElement>(null);
  const [focusCapture, setFocusCapture] = useState(false);
  const [project, setProject] = useState("bobcore");
  const [scenario, setScenario] = useState<Scenario>("ready");
  const [tab, setTab] = useState<Tab>("work");
  const [draft, setDraft] = useState("");
  const [captured, setCaptured] = useState<Record<string, string[]>>({});
  const [captureState, setCaptureState] = useState<"idle" | "pending" | "saved">("idle");
  const [criteria, setCriteria] = useState("Reopen the project and recover the same work packet, decisions and approved memory.\nA wrong-project request returns no project content.");
  const [decision, setDecision] = useState<"none" | "approved" | "changes">("none");
  const [message, setMessage] = useState("");
  useEffect(() => { if (focusCapture && scenario === "ready") { captureInput.current?.focus(); setFocusCapture(false); } }, [focusCapture, scenario]);
  const selected = projects.find(p => p.key === project)!;
  const eligible = scenario === "ready" && decision === "none";
  const reset = (next: string) => {
    setProject(next); setScenario("ready"); setDecision("none"); setTab("work"); setDraft(""); setCaptureState("idle"); setFocusCapture(false); setMessage("");
    setCriteria(next === "bobcore" ? "Reopen the project and recover the same work packet, decisions and approved memory.\nA wrong-project request returns no project content." : "The owner can navigate the sample home page on desktop and mobile.");
  };
  const capture = () => {
    if (!draft.trim()) return;
    if (scenario === "recovery") { setCaptureState("pending"); setMessage("Demo: this capture is pending. Retry will use the same local request."); return; }
    setCaptured(p => ({ ...p, [project]: [...(p[project] ?? []), draft.trim()] }));
    setDraft(""); setCaptureState("saved"); setMessage("Demo capture saved for this project. No request was sent to Bob Core.");
  };
  const retry = () => {
    if (captureState === "pending" && draft.trim()) {
      setCaptured(p => ({ ...p, [project]: [...(p[project] ?? []), draft.trim()] })); setDraft(""); setCaptureState("saved");
    }
    setScenario("ready"); setMessage("Demo recovery complete. The same request was confirmed once.");
  };
  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <BobMark />
      <div className={styles.workspace}><span className={styles.eyebrow}>Your workspace</span><strong>Projects</strong><p>One place to pick up where you left off.</p></div>
      <label className={styles.projectLabel} htmlFor="project">Active project</label>
      <select id="project" value={project} onChange={e => reset(e.target.value)}>{projects.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
      <nav aria-label="Project navigation" className={styles.nav}>
        {(["work", "history", "review"] as Tab[]).map(t => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t === "work" ? "Project work" : t === "history" ? "History & memory" : "Owner review"}{t === "review" && <span className={styles.navCount}>{decision === "none" ? "1" : "0"}</span>}</button>)}
      </nav>
      <div className={styles.sidebarFoot}><span className={styles.dot} /> Local screen prototype<p>Synthetic projects · no live connection</p></div>
    </aside>
    <main className={styles.main}>
      <div className={styles.prototypeBar}><strong>Review prototype</strong><span>Actions simulate the journey. Nothing is saved to Bob Core.</span></div>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Project workspace</p><h1>{selected.name}</h1><p className={styles.subtitle}>{selected.goal}</p></div>
        <span className={styles.badge}>Project context · demo</span>
      </header>
      <div className={styles.mobileTabs} role="group" aria-label="Project sections">
        {(["work", "history", "review"] as Tab[]).map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "work" ? "Work" : t === "history" ? "History" : "Review"}</button>)}
      </div>
      <section className={styles.contextStrip} aria-label="Project context"><span><strong>Current direction</strong> Owner-approved evidence before progress</span><span><strong>Source</strong> Synthetic review fixture</span></section>
      <div role="status" aria-live="polite" className={styles.notice}>{message}</div>
      {scenario === "loading" ? <section className={styles.statePanel} aria-busy="true"><span className={styles.eyebrow}>Opening this project</span><h2>Retrieving project context…</h2><p>Work, memory and approvals will appear after the source responds.</p><div className={styles.skeleton} /><div className={styles.skeleton} /></section>
      : scenario === "error" ? <section className={styles.statePanel} role="alert"><span className={styles.eyebrow}>Connection needs attention</span><h2>Your project could not be refreshed.</h2><p>No current context is available. Existing work has not been marked complete or replaced.</p><button className={styles.primary} onClick={retry}>Retry project refresh</button></section>
      : scenario === "empty" ? <section className={styles.statePanel}><span className={styles.eyebrow}>A clear starting point</span><h2>This project has no work packet yet.</h2><p>Capture an outcome you want. Bob can help turn it into a specification before work begins.</p><button className={styles.primary} onClick={() => { setScenario("ready"); setFocusCapture(true); }}>Capture the first next step</button></section>
      : <>
        {scenario === "recovery" && <section className={styles.warning} role="status"><strong>Offline capture stays pending.</strong><p>Keep the original request. A retry must recover its receipt before another save is attempted.</p><button className={styles.secondary} onClick={retry}>Retry same request</button></section>}
        {scenario === "changed" && <section className={styles.warning} role="alert"><strong>This candidate has changed.</strong><p>Earlier checks and approval no longer apply. Verify the updated candidate before asking for approval.</p></section>}
        {tab === "history" ? <section className={styles.card}><p className={styles.eyebrow}>Resume with context</p><h2>History & approved memory</h2><p className={styles.helper}>Only this project's synthetic records are shown.</p><ol className={styles.history}><li><span>Today · demo</span><strong>Verification evidence added</strong><p>Project restart and wrong-project denial checks passed for candidate C-014.</p></li><li><span>Earlier · demo</span><strong>Specification reviewed</strong><p>Keep project history available after restart. Preserve approval boundaries.</p></li><li><span>Approved memory · demo</span><strong>{selected.goal}</strong><p>Source and approval belong with each durable record.</p></li></ol><button className={styles.secondary} onClick={() => setTab("work")}>Resume current work</button></section>
        : <div className={styles.columns}>
          <div className={styles.workColumn}>
            {tab === "work" && <section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>Capture once</p><h2>What needs to happen?</h2></div><span className={styles.quietBadge}>In {selected.name}</span></div><label htmlFor="capture" className={styles.srOnly}>Capture a next step for {selected.name}</label><form onSubmit={e => { e.preventDefault(); capture(); }}><div className={styles.captureRow}><input ref={captureInput} id="capture" value={draft} maxLength={240} placeholder="Add a next step or something to remember…" disabled={captureState === "pending"} onChange={e => setDraft(e.target.value)} /><button className={styles.primary} disabled={!draft.trim() || captureState === "pending"} type="submit">Capture</button></div></form><p className={styles.helper}>{captureState === "pending" ? "Pending · not confirmed. Retry the same request." : "Prototype capture is held only in this page. Live capture will require a Core receipt."}</p>{(captured[project] ?? []).map((item, i) => <div className={styles.captureItem} key={i}><span>Demo saved</span><strong>{item}</strong></div>)}</section>}
            <section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>{tab === "review" ? "Candidate for owner review" : "Next work"}</p><h2>{project === "bobcore" ? "Make project resumption dependable" : "Review the sample home page"}</h2></div><span className={styles.quietBadge}>P1 · proposed</span></div><p className={styles.helper}>One work packet keeps the outcome, specification and evidence together.</p><ol className={styles.stepper} aria-label="Work packet progress">{steps.map((step, i) => <li key={step} className={i < 3 && scenario === "ready" || decision === "approved" ? styles.complete : i === 3 ? styles.current : ""}><span>{i + 1}</span>{step}</li>)}</ol><div className={styles.outcome}><strong>Outcome</strong><p>{project === "bobcore" ? "Open a project on another interface and recover the same accepted state, without re-explaining it." : "The owner can review the same page and content on desktop and mobile."}</p></div><label htmlFor="criteria" className={styles.fieldLabel}>Specification · acceptance criteria</label><textarea id="criteria" value={criteria} rows={4} onChange={e => { setCriteria(e.target.value); setScenario("changed"); setDecision("none"); }} /><p className={styles.helper}>Changing the specification invalidates this candidate's verification.</p><div className={styles.sectionDivider} /><div className={styles.cardHeading}><div><p className={styles.eyebrow}>Verification</p><h3>Evidence for candidate C-014</h3></div><span className={scenario === "ready" ? styles.success : styles.quietBadge}>{scenario === "ready" ? "2 checks passed · demo" : "Verification required"}</span></div><ul className={styles.checks}><li><span aria-hidden="true">✓</span><div><strong>Project history survives restart</strong><p>Same record IDs and versions returned · synthetic fixture</p></div></li><li><span aria-hidden="true">✓</span><div><strong>Another project cannot read this state</strong><p>UI/API/context denial · synthetic fixture</p></div></li></ul><details className={styles.details}><summary>Candidate and source details</summary><p>Example candidate: C-014. Example specification: S-003. Evidence must match source, configuration, project and regression baseline. These labels are fixtures, not verified runtime identities.</p></details></section>
          </div>
          <aside className={styles.reviewColumn}><section className={styles.reviewCard}><p className={styles.eyebrow}>Owner review</p><h2>{decision === "approved" ? "Accepted in this demo" : decision === "changes" ? "Changes requested" : "Ready for your decision?"}</h2><p>{decision === "approved" ? "The simulated approval belongs to candidate C-014. It has no authority outside this page." : decision === "changes" ? "The packet returns to preparation. It is not accepted or ready to release." : "Review the outcome and its evidence. Approval belongs to this exact candidate."}</p><dl className={styles.reviewFacts}><div><dt>Project</dt><dd>{selected.name}</dd></div><div><dt>Candidate</dt><dd>C-014 · demo</dd></div><div><dt>Specification</dt><dd>{scenario === "changed" ? "Changed · needs review" : "Reviewed · demo"}</dd></div><div><dt>Evidence</dt><dd>{scenario === "ready" ? "Complete · demo" : "Not current"}</dd></div></dl><button className={styles.primary} disabled={!eligible} onClick={() => { setDecision("approved"); setMessage("Demo approval recorded for C-014 only. No live approval or release occurred."); }}>Approve demo candidate</button><button className={styles.secondary} disabled={decision !== "none"} onClick={() => { setDecision("changes"); setMessage("Demo changes requested. The packet is not accepted."); }}>Request changes</button><p className={styles.helper}>{!eligible && decision === "none" ? "Approval is blocked until the current candidate is verified." : "This is acceptance of a work packet, not deployment permission."}</p></section><section className={styles.parked}><h3>Up next & parked</h3><p><strong>P2 · Next</strong><br />Review memory lifecycle</p><p><strong>P3 · Parked</strong><br />Additional integrations</p><small>Priority labels are proposed for owner review.</small></section></aside>
        </div>}
      </>}
      <footer className={styles.footer}><details><summary>Prototype review controls</summary><label htmlFor="scenario">Inspect a state</label><select id="scenario" value={scenario} onChange={e => { setScenario(e.target.value as Scenario); setDecision("none"); setMessage(""); }}><option value="ready">Ready for review</option><option value="loading">Loading</option><option value="empty">Empty project</option><option value="error">Source unavailable</option><option value="recovery">Offline / pending recovery</option><option value="changed">Candidate changed</option></select><p>Fixtures only. No credentials, API calls, persistent storage, live projects or release action.</p></details></footer>
    </main>
  </div>;
}
