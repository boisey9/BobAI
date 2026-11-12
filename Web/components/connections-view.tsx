import Link from "next/link";
import type { ControlCenterAdminData, ActivityItem } from "@/lib/types";
import { contextTime } from "./context-source-status";

const surfaces = [
  ["codex", "Codex"], ["chatgpt", "ChatGPT"], ["bobai", "iPhone"],
  ["web", "Control Center"], ["copilot", "GitHub Copilot"],
  ["microsoft-copilot", "Microsoft Copilot"], ["other", "Other interfaces"],
];

type Props = {
  data: ControlCenterAdminData | null;
  activity: ActivityItem[];
  project: string;
  activityUnavailable: boolean;
};

export function ConnectionsView({ data, activity, project, activityUnavailable }: Props) {
  const oauth = data?.oauthConnections;
  return <div className="connections-summary">
    <div className="connection-explainer">
      <strong>Access is permission. Activity is an observation. A client test verifies the full connection.</strong>
      <p>Selected project: <strong>{data?.selectedProject.name ?? project}</strong>. Conversation history is not automatically shared.</p>
    </div>
    <div className="connection-grid">{surfaces.map(([key, label]) => {
      const credentials = (data?.interfaces ?? []).filter(credential => credential.surface === key);
      const grants = (oauth?.grants ?? []).filter(grant => grant.surface === key);
      const active = data?.selectedProject.status === "active" && (
        credentials.some(credential => credential.enabled) || grants.some(grant => !grant.revokedAt)
      );
      const latest = activity
        .filter(event => event.projectKey === project && event.source === key && Number.isFinite(Date.parse(event.createdAt)))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      const accessLabel = active ? "Access granted"
        : !data || oauth?.status !== "available" ? "Access partly unverified"
        : data.selectedProject.status !== "active" ? "Project inactive"
        : "No scoped record returned";
      return <article className="connection-card" key={key} aria-label={`${label} connection`}>
        <div className="connection-card-heading">
          <h3>{label}</h3>
          <span className={`connection-tag ${active ? 'authorized' : ''}`}>{accessLabel}</span>
        </div>
        <dl>
          <div><dt>Project binding</dt><dd>{project}</dd></div>
          <div><dt>Static credentials</dt><dd>{data
            ? `${credentials.filter(credential => credential.enabled).length} enabled · ${credentials.filter(credential => !credential.enabled).length} disabled`
            : 'Unavailable'}</dd></div>
          <div><dt>OAuth project grants</dt><dd>{oauth?.status === 'available'
            ? `${grants.filter(grant => !grant.revokedAt).length} approved · ${grants.filter(grant => grant.revokedAt).length} revoked`
            : 'Not available from this Core'}</dd></div>
          <div><dt>Last observed activity</dt><dd>{activityUnavailable ? 'Activity unavailable'
            : latest ? contextTime(latest.createdAt) : 'None returned in this bounded feed'}</dd></div>
          <div><dt>Successful client test</dt><dd>Not recorded in this view</dd></div>
        </dl>
        <details>
          <summary>Access details</summary>
          {credentials.map(credential => <p key={credential.id}>
            <strong>Static · {credential.enabled ? 'Enabled' : 'Disabled'}</strong> · Created {contextTime(credential.createdAt)}
            <br/>{credential.scopes.join(' · ')}
          </p>)}
          {grants.map(grant => <p key={grant.id}>
            <strong>OAuth · {grant.revokedAt ? 'Revoked' : 'Approved'}</strong> · {contextTime(grant.revokedAt ?? grant.createdAt)}
            <br/>{grant.scopes.join(' · ')}
          </p>)}
          {credentials.length + grants.length === 0 && <p>No access record was returned. Missing records do not prove a client is disconnected.</p>}
          {data && data.selectedProject.status !== 'active' && <p>The project is inactive. These records are historical access details.</p>}
        </details>
      </article>;
    })}</div>
    <p className="muted-copy">
      Static access checked {contextTime(data?.generatedAt)}. OAuth access checked {contextTime(oauth?.checkedAt)}
      {oauth?.truncated ? ' · First 100 grants shown.' : ''}. Activity and access do not establish live client connectivity.
    </p>
    <Link className="secondary-button" href={`/account?project=${encodeURIComponent(project)}`}>Review owner connections</Link>
  </div>;
}
