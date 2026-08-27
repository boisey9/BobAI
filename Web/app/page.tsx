import Link from "next/link";
import { redirect } from "next/navigation";

import { ActivityTimeline } from "@/components/activity-timeline";
import { BobMark } from "@/components/bob-mark";
import { ControlCenterV2 } from "@/components/control-center-v2";
import { ProjectState } from "@/components/project-state";
import { StatusCard } from "@/components/status-card";
import { getDashboardData } from "@/lib/bob-core";
import { getOwnerCsrfToken, hasOwnerSession } from "@/lib/session";

type DashboardPageProps = {
  searchParams: Promise<{
    project?: string;
    notice?: string;
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function projectKey(value: string | undefined): string {
  const fallback = process.env.BOB_CONTROL_CENTER_DEFAULT_PROJECT?.trim() || "bobai";
  const candidate = value?.trim().toLowerCase() || fallback.toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,99}$/.test(candidate) ? candidate : "bobai";
}

function safeMessage(value: string | undefined): string | null {
  const message = value?.trim();
  return message ? message.slice(0, 240) : null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  if (!(await hasOwnerSession())) redirect("/login");
  const csrfToken = await getOwnerCsrfToken();
  if (!csrfToken) redirect("/login");

  const params = await searchParams;
  const selectedProject = projectKey(params.project);
  const notice = safeMessage(params.notice);
  const actionError = safeMessage(params.error);
  const data = await getDashboardData(selectedProject);
  const coreReady = data.status?.status === "ready";
  const contextReady = data.context !== null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BobMark />
        <nav aria-label="Control Center navigation">
          <a className="nav-link active" href="#overview">
            <span>◫</span> Overview
          </a>
          <a className="nav-link" href="#command-center">
            <span>◎</span> Command center
          </a>
          <a className="nav-link" href="#approvals">
            <span>◇</span> Approvals
          </a>
          <a className="nav-link" href="#interfaces">
            <span>⌁</span> Interfaces
          </a>
          <a className="nav-link" href="#project-state">
            <span>◆</span> Project state
          </a>
          <a className="nav-link" href="#activity">
            <span>≋</span> Activity
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="authority-card">
            <span className="pulse-ring" aria-hidden="true" />
            <div>
              <strong>Bob Core</strong>
              <small>{coreReady ? "Authoritative state online" : "Connection degraded"}</small>
            </div>
          </div>
          <form action="/api/logout" method="post">
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Owner dashboard</p>
            <h1>Good evening, Rick.</h1>
            <p>One Bob. Same memory. Same project state. Owner-controlled permissions.</p>
          </div>
          <div className="topbar-actions">
            <span className={`live-pill ${coreReady ? "is-live" : "is-degraded"}`}>
              <span /> {coreReady ? "Core live" : "Degraded"}
            </span>
            <Link className="secondary-button" href={`/?project=${selectedProject}`}>
              ↻ Refresh
            </Link>
          </div>
        </header>

        {notice && (
          <section className="error-banner" role="status">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Owner action completed.</strong>
              <p>{notice}</p>
            </div>
          </section>
        )}

        {actionError && (
          <section className="error-banner" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>The owner action could not be completed.</strong>
              <p>{actionError}</p>
            </div>
          </section>
        )}

        <section id="overview" aria-labelledby="overview-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">System overview</p>
              <h2 id="overview-heading">Bob at a glance</h2>
            </div>
            <span>Project: {data.context?.project.name ?? selectedProject}</span>
          </div>

          <div className="status-grid">
            <StatusCard
              label="Bob Core"
              value={coreReady ? "Online" : "Unavailable"}
              detail={data.status ? `v${data.status.version} · ${data.status.model}` : "No status response"}
              state={coreReady ? "healthy" : "offline"}
              symbol="◉"
            />
            <StatusCard
              label="Memory"
              value={data.status?.memory?.enabled ? "Online" : "Unavailable"}
              detail={data.status?.memory?.enabled ? `${data.status.memory.storage} · ${data.status.memory.capture}` : "Not reported"}
              state={data.status?.memory?.enabled ? "healthy" : "warning"}
              symbol="⌁"
            />
            <StatusCard
              label="Shared Context"
              value={data.status?.sharedContext?.enabled ? `v${data.status.sharedContext.version}` : "Unavailable"}
              detail={contextReady ? `${data.context?.decisions.length ?? 0} decisions · ${data.context?.tasks.length ?? 0} tasks` : "Project state could not load"}
              state={data.status?.sharedContext?.enabled && contextReady ? "healthy" : "warning"}
              symbol="▱"
            />
            <StatusCard
              label="Owner approvals"
              value={`${data.controlCenter?.approvals.length ?? 0} pending`}
              detail={data.controlCenter ? `${data.controlCenter.interfaces.filter((credential) => credential.enabled).length} active interface credentials` : "Administration scope unavailable"}
              state={data.controlCenter ? (data.controlCenter.approvals.length > 0 ? "warning" : "healthy") : "warning"}
              symbol="◇"
            />
          </div>
        </section>

        {data.errors.length > 0 && (
          <section className="error-banner" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>Some Control Center data is unavailable.</strong>
              {data.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          </section>
        )}

        <ControlCenterV2
          data={data.controlCenter}
          activity={data.activity}
          coreReady={coreReady}
          selectedProject={selectedProject}
          csrfToken={csrfToken}
        />

        <ProjectState context={data.context} />

        <section className="panel" id="activity" style={{ marginTop: 18 }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operational audit</p>
              <h2>Recent activity</h2>
              <p>Actions and outcomes—not private reasoning.</p>
            </div>
            <span className="count-badge">{data.activity.length}</span>
          </div>
          <ActivityTimeline activity={data.activity.slice(0, 50)} />
          <div className="privacy-note">
            <span aria-hidden="true">⌾</span>
            <p>
              Raw prompts, credentials, sensitive memories, and private chain-of-thought
              never belong in the activity feed. Bob Core stores operational results and
              approved project state only.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
