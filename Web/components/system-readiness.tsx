import type { CoreStatus } from "@/lib/types";
import type { DashboardHealth } from "@/lib/dashboard-health";
import { contextTime } from "./context-source-status";
import { StatusCard } from "./status-card";

function CheckDetails({ status, name, label, fallback }: {
  status: CoreStatus | null;
  name: string;
  label: string;
  fallback?: string;
}) {
  const check = status?.checks?.[name];
  return (
    <li>
      <strong>{label}: {check?.status.replaceAll("_", " ") || "not reported"}</strong>
      {(check?.detail || fallback) && <span>{check?.detail || fallback}</span>}
      <small>{check?.checkedAt ? `Checked ${contextTime(check.checkedAt)}` : "Check time not reported"}</small>
    </li>
  );
}

export function SystemReadiness({ status, health }: {
  status: CoreStatus | null;
  health: DashboardHealth;
}) {
  return (
    <div id="system-readiness" className="status-grid readiness-grid" role="group" aria-label="System readiness">
      <StatusCard label="Core connectivity" {...health.connectivity} symbol="◉">
        <ul className="readiness-checks" aria-label="Core connectivity checks">
          <CheckDetails status={status} name="process" label="Core process" />
          <CheckDetails status={status} name="database" label="Database" />
          <CheckDetails status={status} name="context" label="Core context" />
        </ul>
        <p className="readiness-note">Core service checks. Selected-project results appear below.</p>
        {status && <p className="readiness-note">Service version {status.version}</p>}
      </StatusCard>
      <StatusCard label="Inference status" {...health.inference} symbol="⌁">
        <p className="readiness-note">Configured model: {status?.model || "Not reported"}</p>
        <ul className="readiness-checks" aria-label="Inference checks">
          <CheckDetails status={status} name="provider" label="Model observation" />
        </ul>
        <p className="readiness-note">Observations apply only to the responding Core process. A refresh does not run inference.</p>
      </StatusCard>
      <StatusCard label="Operational readiness" {...health.operations} symbol="◇">
        <ul className="readiness-checks" aria-label="Operational checks">
          <CheckDetails status={status} name="backup" label="Backup monitoring"
            fallback={status?.checks?.backup?.status === "not_configured"
              ? "Monitoring is not configured; backup protection is unverified here."
              : !status?.checks?.backup ? "Backup protection is unverified here." : undefined} />
          <CheckDetails status={status} name="scheduler" label="Scheduled delivery" />
        </ul>
        <p className="readiness-note">Backup monitoring does not verify restore drills or independent recovery-key custody. Release acceptance remains separate.</p>
      </StatusCard>
    </div>
  );
}
