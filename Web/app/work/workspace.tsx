"use client";
import { useEffect,useRef,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { BobMark } from "@/components/bob-mark";
import type { GovernedPacket,WorkflowWorkspace,WorkflowDirectory,WorkflowRecovery } from "@/lib/governed-workflow";
import styles from "../prototype/project-workflow/workflow.module.css";
import {packetNextStep,packetStateLabel} from "@/lib/workspace-journey";
import localStyles from "./workspace.module.css";

type Pending={project:string;command:Record<string,unknown>};
export function GovernedWorkspace({projectKey,initial,initialError,csrf,selectedPacket,projects,recovery,recoveryOperation}:{projectKey:string;initial:WorkflowWorkspace|null;initialError:string|null;csrf:string;selectedPacket?:string|undefined;projects:WorkflowDirectory["projects"];recovery:WorkflowRecovery|null;recoveryOperation?:string|undefined}){
  const router=useRouter();const pending=useRef<Pending|null>(null);
  const [navigating,startNavigation]=useTransition();
  const alertRef=useRef<HTMLElement>(null);
  const [tab,setTab]=useState<"work"|"history"|"review">("work");
  const [data,setData]=useState(initial);const [error,setError]=useState(initialError);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const [capture,setCapture]=useState("");const [selected,setSelected]=useState(selectedPacket??initial?.packets[0]?.id??"");
  const packet=data?.packets.find(p=>p.id===selected)??data?.packets[0];
  const [specification,setSpecification]=useState(packet?.specification??"");
  const [switchProject,setSwitchProject]=useState(projectKey);
  const records=data?.records.filter(r=>r.packetId===packet?.id)??[];
  const currentEvidence=records.filter(r=>r.kind==="evidence"&&r.content.candidateDigest===packet?.candidateDigest);
  const evidenceSummary=data?.packetEvidence?.find(s=>s.packetId===packet?.id&&s.candidateDigest===packet.candidateDigest);
  const evidenceComplete=evidenceSummary?.evidenceComplete===true&&evidenceSummary.bindingCurrent&&evidenceSummary.candidatePresent&&data?.policyConfigured===true;
  const nextStep=data&&packet?(specification!==packet.specification?{title:"Save the revised specification",detail:"Unsaved criteria do not belong to the current candidate. Save the revision before another review.",action:"edit"}:packetNextStep(data,packet)):null;
  const evidenceLabels:Record<string,string>={missing:"missing evidence",ambiguous:"conflicting evidence",invalid:"invalid evidence",policy_missing:"policy not accepted",candidate_changed:"candidate changed",untrusted:"untrusted issuer",expired:"expired evidence",failed:"failed",not_run:"not run",verification_pending:"stored · verification pending",pass:"pass"};
  const specificationAccepted=records.some(r=>r.kind==="specification"&&r.content.digest===packet?.specificationDigest);
  useEffect(()=>{if(error)alertRef.current?.focus();},[error]);
  async function submit(command?:Record<string,unknown>){
    if(busy)return;
    if(!pending.current&&command)pending.current={project:projectKey,command:{operationId:crypto.randomUUID(),...command}};
    const input=pending.current;if(!input)return;
    window.history.replaceState(null,"",`/work?project=${encodeURIComponent(projectKey)}&operation=${encodeURIComponent(String(input.command.operationId))}`);
    setBusy(true);setError(null);setMessage("");
    try{const response=await fetch("/api/workflow",{method:"POST",headers:{"content-type":"application/json","x-bob-owner-csrf":csrf},body:JSON.stringify(input)});
      const result=await response.json();if(!response.ok){if(result.outcome==="rejected")pending.current=null;throw new Error(result.error??"Save not confirmed");}
      const next=(result.currentPacket??result.packet) as GovernedPacket;
      setData(previous=>previous?{...previous,packets:[next,...previous.packets.filter(p=>p.id!==next.id)]}:previous);
      setSelected(next.id);setSpecification(next.specification);setCapture("");pending.current=null;
      setMessage(result.idempotent?"Original receipt recovered. The current packet is shown.":"Core confirmed this work packet update.");
      window.history.replaceState(null,"",`/work?project=${encodeURIComponent(projectKey)}&packet=${encodeURIComponent(next.id)}`);
      const refreshed=await fetch(`/api/workflow?project=${encodeURIComponent(projectKey)}`,{cache:"no-store"});
      if(refreshed.ok){const current=await refreshed.json();if(current.project?.project_key===projectKey)setData(current as WorkflowWorkspace);}
      else setError("The save is confirmed, but current records could not be refreshed. Reload to retrieve them.");
    }catch(e){setError(e instanceof Error?e.message:"Save not confirmed. Retry the same request.");}
    finally{setBusy(false);}
  }
  function transition(action:string,extra:Record<string,unknown>={}){if(packet)void submit({packetId:packet.id,expectedVersion:packet.version,action,...extra});}
  const recoveryLocked=!!recoveryOperation&&recovery?.outcome!=="committed";
  const locked=recoveryLocked||busy||navigating||!!pending.current||data?.paused===true;
  return <div className={`${styles.shell} ${localStyles.container}`}><aside className={styles.sidebar}><BobMark/><label className={styles.projectLabel} htmlFor="governed-project">Project</label>
    <form className={localStyles.projectForm} onSubmit={e=>{e.preventDefault();if(!locked&&projects.some(p=>p.project_key===switchProject))startNavigation(()=>router.push(`/work?project=${encodeURIComponent(switchProject)}`));}}>
      <select id="governed-project" className={styles.projectSelect} value={switchProject} disabled={locked||!projects.length} onChange={e=>setSwitchProject(e.target.value)}>{!projects.some(p=>p.project_key===projectKey)&&<option value={projectKey}>Selected project unavailable</option>}{projects.map(p=><option key={p.project_key} value={p.project_key}>{p.name}</option>)}</select><button className={styles.secondary} disabled={locked}>Open project</button></form>
    <nav className={styles.nav} aria-label="Project navigation">{(["work","history","review"] as const).map(t=><button key={t} aria-current={tab===t?"page":undefined} onClick={()=>setTab(t)}>{t==="work"?"Project work":t==="history"?"History":"Owner review"}</button>)}</nav>
    <a href="/account" className={localStyles.accountLink}>Account & connections</a>
    <div className={styles.sidebarFoot}>Local governed workflow candidate<p>Authoritative server records · release disabled</p></div></aside>
    <main className={styles.main} aria-busy={busy||navigating}><header className={styles.header}><div><p className={styles.eyebrow}>Project workspace</p><h1>{data?.project.name??projectKey}</h1><p>{data?.project.description??"Project work, specification, evidence and owner review."}</p></div><span className={styles.badge}>{projectKey} · Core records</span></header>
    <div className={styles.mobileTabs} aria-label="Project sections">{(["work","history","review"] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
    <p className={styles.notice} role="status" aria-live="polite">{busy?"Waiting for Core confirmation…":navigating?"Retrieving project work…":message}</p>
    {recoveryOperation&&<section className={styles.statePanel}><h2>{recovery?.outcome==="committed"?"Original operation confirmed":"Operation needs reconciliation"}</h2><p>{recovery?.outcome==="committed"?"Core retained the original receipt. Current packet state is shown; no command was repeated.":"Recovery is not confirmed in this view. Keep the identifier; a missing receipt does not recreate your request."}</p><p>Operation: {recoveryOperation}</p>{recovery?.outcome==="committed"?<button onClick={()=>router.replace(`/work?project=${encodeURIComponent(projectKey)}&packet=${encodeURIComponent(recovery.currentPacket!.id)}`)}>Continue with current packet</button>:<button onClick={()=>router.refresh()}>Check receipt again</button>}</section>}
    {error&&<section ref={alertRef} tabIndex={-1} className={styles.warning} role="alert"><strong>Project work needs attention</strong><p>{error}</p>{pending.current?<><p>The save is unconfirmed. Retry the same operation here, or reload to check its retained receipt identifier. The original request contents are not stored beyond this page.</p><button className={styles.secondary} disabled={busy} onClick={()=>void submit()}>Retry same request</button></>:<button className={styles.secondary} onClick={()=>router.refresh()}>Retry project refresh</button>}</section>}
    {data?.paused&&<p className={styles.warning}>Workflow is paused. Records remain readable; transitions are blocked.</p>}
    {data&&!data.policyConfigured&&<p className={styles.warning}>Trusted evidence, regression and review policy have not been accepted. Capture remains available; candidate verification is blocked.</p>}
    {!data?<section className={styles.statePanel}><h2>Current project records are unavailable.</h2><p>No synthetic data is substituted for missing project context.</p></section>:tab==="history"?<section className={styles.card}><h2>Project history & ordinary tasks</h2>
      <h3>Governed work history</h3><ul className={styles.history}>{data.workflowHistory.map(h=><li key={h.sequence}><strong>{h.action} · {h.state} · v{h.version}</strong><p>Packet {h.packet_id} · {h.created_at}</p></li>)}</ul>{data.workflowHistoryTruncated&&<p>Showing the latest 100 governed records.</p>}
      <ul className={styles.history}>{data.history.map(h=><li key={h.id}><strong>{h.summary}</strong><p>{h.source} · {h.created_at}</p></li>)}</ul>{data.historyTruncated&&<p>Showing the latest 100 history records.</p>}
      <h3>Existing tasks</h3><ul>{data.tasks.map(t=><li key={t.id}>{t.title} · {t.status} · {t.priority}</li>)}</ul>{data.tasksTruncated&&<p>Showing 100 tasks.</p>}<p className={styles.helper}>Ordinary task completion remains separate from governed review and release. Approved memory is not connected to this view yet.</p></section>:<div className={styles.columns}><div className={styles.workColumn}>
      {tab==="work"&&<section className={styles.card}><h2>What needs to happen?</h2><form onSubmit={e=>{e.preventDefault();void submit({packetId:crypto.randomUUID(),action:"capture",expectedVersion:0,title:capture,specification:"",predecessors:[]});}}><div className={styles.captureRow}><input aria-label="Capture a governed work packet" value={capture} maxLength={300} disabled={locked} onChange={e=>setCapture(e.target.value)}/><button className={styles.primary} disabled={locked||!capture.trim()}>Capture</button></div></form><p className={styles.helper}>Creates an explicit governed packet in this project. It does not change an ordinary task.</p></section>}
      <section className={styles.card} aria-label="Project work queue"><div className={styles.cardHeading}><div><p className={styles.eyebrow}>Capture or resume</p><h2>Your work</h2></div><span className={styles.quietBadge}>{data.packets.length} saved</span></div>{data.packets.length?<ul className={localStyles.queue}>{data.packets.map(item=><li key={item.id}><button className={localStyles.queueItem} aria-pressed={packet?.id===item.id} disabled={locked} onClick={()=>{setSelected(item.id);setSpecification(item.specification);}}><strong>{item.title}</strong><span>{packetStateLabel(item)}</span><small>{packetNextStep(data,item).title}</small></button></li>)}</ul>:<p>No saved work yet. Capture the first outcome above.</p>}</section>
      {!packet?<section className={styles.statePanel}><h2>This project has no governed packet yet.</h2><p>Capture an outcome, then write and accept its specification.</p></section>:<section className={styles.card}>
        <label htmlFor="governed-packet" className={styles.fieldLabel}>Resume work packet</label><select id="governed-packet" className={styles.projectSelect} value={packet.id} disabled={locked} onChange={e=>{setSelected(e.target.value);setSpecification(data.packets.find(p=>p.id===e.target.value)?.specification??"");}}>{data.packets.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <h2>{packet.title}</h2><span className={styles.quietBadge}>{packetStateLabel(packet)} · version {packet.version}</span>
        {packet.state==="reviewed"&&!packet.acceptanceCurrent&&<p className={styles.warning}>Historical review retained. Its prerequisite or policy changed; this packet cannot satisfy downstream work until a new candidate is verified and reviewed.</p>}
        <ol className={styles.stepper} aria-label="Governed packet state">{["draft","ready","reviewed","released"].map(s=><li key={s} className={s===packet.state?styles.current:""}>{s}</li>)}</ol>
        <label htmlFor="governed-spec" className={styles.fieldLabel}>Specification · acceptance criteria</label><textarea id="governed-spec" rows={5} value={specification} disabled={locked} onChange={e=>setSpecification(e.target.value)}/>
        <button className={styles.secondary} disabled={locked||!specification.trim()||specification===packet.specification} onClick={()=>transition("revise",{specification})}>Save specification revision</button>
        <p className={styles.helper}>Saving a revision returns this packet to draft and invalidates its candidate. Owner acceptance and trusted checks must match the new candidate.</p>
        <section id="candidate-evidence" tabIndex={-1} className={localStyles.evidencePanel} aria-label="Exact candidate evidence"><h3>Evidence for this candidate</h3><p className={styles.helper}>These results belong only to the selected packet and its current candidate. A different run cannot satisfy this review.</p>
        {!packet.candidateDigest?<p>Implementation and a candidate are not attached yet.</p>:!evidenceSummary?<p>No verified summary is attached to this candidate. Stored evidence alone cannot make it ready.</p>:<><p className={localStyles.evidenceStatus}>{evidenceComplete?"All required evidence was current at the last Core read":"Readiness blocked · evidence needs attention"}</p><ul className={styles.checks}>{evidenceSummary.checks.map(check=><li key={check.id}><div><strong>{check.id} · {evidenceLabels[check.status]??"verification unavailable"}</strong><p>{check.status==="verification_pending"?"Captured and stored, not certified.":null}</p><p>{check.status==="pass"?"Pass recorded at the last Core read. Core rechecks before advancing.":check.status==="verification_pending"?"Immutable evidence is saved. Current issuer and baseline verification is not connected; readiness remains blocked.":"This check cannot satisfy readiness."}</p>{check.expiresAt&&<p>Evidence valid until: {new Date(check.expiresAt).toISOString()}</p>}<details><summary>Source and binding</summary><p>Candidate: {packet.candidateId}</p><p>Binding: {packet.candidateDigest}</p><p>Evidence records: {check.recordIds.length?check.recordIds.join(", "):"No current record"}</p>{records.filter(r=>r.kind==="evidence"&&check.recordIds.includes(r.id)&&r.content.candidateDigest===packet.candidateDigest).map(r=><p key={r.id}>Recorded {r.createdAt}{typeof r.content.issuer==="string"?" · issuer "+r.content.issuer:""}</p>)}</details></div></li>)}</ul><p className={styles.helper}>Evidence checked by Core at {new Date(evidenceSummary.evaluatedAt).toISOString()}. This read result is not an approval.</p></>}
        {!currentEvidence.length&&<p>No current immutable verification evidence.</p>}</section>
        <details className={styles.details}><summary>Candidate and source details</summary><p>Candidate: {packet.candidateId??"Not recorded"}</p><p style={{overflowWrap:"anywhere"}}>Binding: {packet.candidateDigest??"Not recorded"}</p><p>Predecessors: {packet.predecessors.join(", ")||"None declared"}</p><p>Candidate/source creation requires a reviewed producer adapter. The UI cannot assert a successful check.</p></details>
      </section>}
    </div><aside className={styles.reviewColumn}><section className={styles.reviewCard}><p className={styles.eyebrow}>Owner review</p><h2>{packet?.state==="reviewed"?"Candidate reviewed":"Next step"}</h2>{nextStep?<><h3>{nextStep.title}</h3><p>{nextStep.detail}</p>{nextStep.action==="edit"&&<button className={styles.primary} disabled={locked} onClick={()=>document.getElementById("governed-spec")?.focus()}>Write acceptance criteria</button>}{nextStep.action==="evidence"&&<button className={styles.secondary} onClick={()=>{const el=document.getElementById("candidate-evidence");el?.scrollIntoView({block:"start"});el?.focus();}}>Inspect evidence</button>}{nextStep.action==="history"&&<button className={styles.secondary} onClick={()=>setTab("history")}>Open saved history</button>}</>:<p>Capture an outcome to begin this project.</p>}
      {packet&&<><dl className={styles.reviewFacts}><div><dt>Project</dt><dd>{projectKey}</dd></div><div><dt>State</dt><dd>{packetStateLabel(packet)}</dd></div></dl>
        <button className={styles.secondary} disabled={locked||specificationAccepted||!packet.specification.trim()||specification!==packet.specification} onClick={()=>transition("accept_specification",{specificationDigest:packet.specificationDigest})}>{specificationAccepted?"Specification accepted":"Accept exact specification"}</button>
        <button className={styles.secondary} disabled={locked||!data.policyConfigured||!evidenceComplete||packet.state!=="draft"||!packet.candidateDigest||specification!==packet.specification} onClick={()=>transition("ready",{candidateDigest:packet.candidateDigest})}>Verify readiness</button>
        <button className={styles.primary} disabled={locked||!data.policyConfigured||!evidenceComplete||packet.state!=="ready"||specification!==packet.specification} onClick={()=>transition("review",{candidateDigest:packet.candidateDigest,decision:"approve"})}>Approve exact candidate</button>
        <button className={styles.secondary} disabled={locked||!data.policyConfigured||packet.state!=="ready"} onClick={()=>transition("review",{candidateDigest:packet.candidateDigest,decision:"changes_requested"})}>Request changes</button></>}
      <p className={styles.helper}>Reviewed records owner acceptance of a work packet. It grants no deployment permission. Release is disabled until its policy is explicitly approved.</p></section></aside></div>}
    </main></div>;
}
