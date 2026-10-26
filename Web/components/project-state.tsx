import type { ContextPackage } from "@/lib/types";
import { ContextSourceStatus, contextTime } from "./context-source-status";

export function ProjectState({ context }: { context: ContextPackage | null }) {
  const decisionsAvailable = context?.sources?.decisions?.status === "available";
  const memoriesAvailable = context?.sources?.memories?.status === "available";
  const handoffsAvailable = context?.sources?.handoffs?.status === "available";

  return (
    <section className="panel project-panel" id="project-state" aria-labelledby="project-state-heading">
      <div className="panel-heading project-heading">
        <div>
          <p className="eyebrow">Project workspace</p>
          <h2 id="project-state-heading">{context?.project.name ?? "Project context unavailable"}</h2>
          <p>{context?.project.description ?? "Decisions, approved context and handoffs from Bob Core."}</p>
        </div>
        {context && <div className="project-badge">{context.project.status}</div>}
      </div>

      <div className="workspace-context-note">
        <p role="status" className="muted-copy">
          {!context ? "Bob Core could not load this project context. "
            : context.partial ? "Partial context: some sources are unavailable or bounded. "
            : context.sources ? "Context retrieved; source status is shown below. "
            : "Context source completeness is unverified. "}
          Snapshot generated {contextTime(context?.generatedAt)}.
        </p>
        {context?.revision && <p className="context-revision">Context revision: <code>{context.revision}</code></p>}
        <nav className="workspace-links" aria-label="Project workspace sections">
          <a href="#decisions">Decisions</a>
          <a href="#approved-memory">Approved memory</a>
          <a href="#handoffs">Handoffs</a>
          <a href="#release-health">Implementation evidence</a>
          <a href="#alignment">Interface alignment</a>
        </nav>
      </div>

      <div className="state-grid">
        <section className="state-column" id="decisions" aria-labelledby="decisions-heading">
          <div className="subheading"><h3 id="decisions-heading">Active decisions</h3></div>
          <ContextSourceStatus context={context} source="decisions" label="Decisions" />
          <p className="muted-copy">Active decisions guide this project. <a href="#approvals">Proposals awaiting owner review</a> are separate.</p>
          {!decisionsAvailable ? <p className="muted-copy">Active decisions cannot be verified from this source.</p>
            : context?.decisions.length === 0 ? <p className="muted-copy">No active decisions returned in this snapshot.</p>
            : <div className="decision-list">{context?.decisions.map(decision => (
              <article className="decision-row" key={decision.id} id={`decision-${decision.id}`}>
                <span aria-hidden="true">◇</span>
                <div>
                  <strong>{decision.title}</strong>
                  <p>{decision.decision}</p>
                  {decision.reason && <p className="muted-copy">Reason: {decision.reason}</p>}
                  <small>Source: {decision.source} · Updated {contextTime(decision.updatedAt)}</small>
                </div>
              </article>
            ))}</div>}
        </section>

        <section className="state-column" id="approved-memory" aria-labelledby="memory-heading">
          <div className="subheading"><h3 id="memory-heading">Approved memory</h3></div>
          <ContextSourceStatus context={context} source="memories" label="Approved memory" />
          <p className="muted-copy">Factual context for this workspace. Memories do not supersede active decisions or authorize actions.</p>
          {!memoriesAvailable ? <p className="muted-copy">Approved memory cannot be verified from this source.</p>
            : context?.memories.length === 0 ? <p className="muted-copy">No approved memories returned in this snapshot.</p>
            : <div className="decision-list">{context?.memories.map(memory => (
              <article className="context-record" key={memory.id} id={`memory-${memory.id}`}>
                <strong>{memory.subject ?? "Approved context"}</strong>
                <p>{memory.content}</p>
                <small>Source: {memory.source} · Updated {contextTime(memory.updatedAt)}</small>
              </article>
            ))}</div>}
        </section>
      </div>
      <section className="workspace-handoffs" id="handoffs" aria-labelledby="handoffs-heading">
        <h3 id="handoffs-heading">Recent handoffs</h3>
        <ContextSourceStatus context={context} source="handoffs" label="Handoffs" />
        <p className="muted-copy">Resume from recorded outcomes, unresolved questions and next actions. Handoffs do not activate decisions or prove release acceptance.</p>
        {!handoffsAvailable ? <p className="muted-copy">Handoffs cannot be verified from this source.</p>
          : !context?.handoffs?.length ? <p className="muted-copy">No handoffs returned in this snapshot.</p>
          : context.handoffs.map(handoff => (
            <article className="context-record" key={handoff.id} id={`handoff-${handoff.id}`}>
              <strong>{handoff.outcome}</strong>
              <p>Unresolved: {handoff.unresolved.length ? handoff.unresolved.join(" · ") : "None recorded in this handoff."}</p>
              <p>Next actions: {handoff.nextActions.length ? handoff.nextActions.join(" · ") : "None recorded in this handoff."}</p>
              <small>Source: {handoff.source} · Recorded {contextTime(handoff.createdAt)}</small>
            </article>
          ))}
      </section>
    </section>
  );
}
