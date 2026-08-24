import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityTimeline } from "@/components/activity-timeline";
import { BobMark } from "@/components/bob-mark";
import { ProjectState } from "@/components/project-state";
import { StatusCard } from "@/components/status-card";
import { getDashboardData } from "@/lib/bob-core";
import { hasOwnerSession } from "@/lib/session";
import type { ActivityItem } from "@/lib/types";

type DashboardPageProps = {
  searchParams: Promise<{ project?: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function projectKey(value: string | undefined): string {
  const fallback = process.env.BOB_CONTROL_CENTER_DEFAULT_PROJECT?.trim() || "bobai";
  const candidate = value?.trim().toLowerCase() || fallback.toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,99}$/.test(candidate) ? candidate : "bobai";
}

function lastActivity(activity: ActivityItem[], source: string): ActivityItem | undefined {
  return activity.find((item) => item.source.toLowerCase() === source.toLowerCase());
}

function relativeTime(value: string | undefined): string {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  if (!(await hasOwnerSession())) redirect("/login");

  const params = await searchParams;
  const selectedProject = projectKey(params.project);
  const data = await getDashboardData(selectedProject);
  const coreReady = data.status?.status === "ready";
  const contextReady = data.context !== null;

  const interfaces = [
    { name: "BobAI", source: "bobai", role: "Mobile & voice" },
    { name: "Codex", source: "codex", role: "Development" },
    { name: "ChatGPT", source: "chatgpt", role: "Conversation" },
    { name: "Web", source: "web", role: "Administration" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BobMark />
        <nav aria-label="Control Center navigation">
          <a className="nav-link active" href="#overview">
            <span>◫</span> Overview
          </a>
          <a className="nav-link" href="#project-state">
            <span>◇</span> Project state
          </a>
          <a className="nav-link" href="#tasks">
            <span>✓</span> Tasks
          </a>
          <a className="nav-link" href="#decisions">
            <span>◆</span> Decisions
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
            <p>One Bob. Same memory. Same project state.</p>
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
              label="Activity"
              value={`${data.activity.length} events`}
              detail="Privacy-safe operational timeline"
              state={data.errors.some((error) => error.startsWith("Activity:")) ? "warning" : "healthy"}
              symbol="≋"
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

        <ProjectState context={data.context} />

        <div className="lower-grid">
          <section className="panel" id="activity">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Operational audit</p>
                <h2>Recent activity</h2>
                <p>Actions and outcomes—not private reasoning.</p>
              </div>
              <span className="count-badge">{data.activity.length}</span>
            </div>
            <ActivityTimeline activity={data.activity.slice(0, 30)} />
          </section>

          <section className="panel interfaces-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Connected surfaces</p>
                <h2>Bob interfaces</h2>
                <p>Every surface reads from the same Core.</p>
              </div>
            </div>
            <div className="interface-list">
              {interfaces.map((item) => {
                const latest = lastActivity(data.activity, item.source);
                return (
                  <article className="interface-row" key={item.source}>
                    <span className="interface-avatar" aria-hidden="true">
                      {item.name.charAt(0)}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.role}</small>
                    </div>
                    <span className={latest ? "interface-seen" : "interface-waiting"}>
                      {relativeTime(latest?.createdAt)}
                    </span>
                  </article>
                );
              })}
            </div>
            <div className="privacy-card">
              <span aria-hidden="true">⌾</span>
              <div>
                <strong>Privacy boundary</strong>
                <p>
                  Raw prompts, credentials, sensitive memories, and private chain-of-thought
                  never belong in the activity feed.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
