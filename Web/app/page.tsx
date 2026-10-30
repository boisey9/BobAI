import {workspaceEntryEnabled} from "@/lib/workflow-entry";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ActivityTimeline } from "@/components/activity-timeline";
import { BobMark } from "@/components/bob-mark";
import { ControlCenterV2 } from "@/components/control-center-v2";
import { ProjectState } from "@/components/project-state";
import { StatusCard } from "@/components/status-card";
import { TaskManager } from "@/components/task-manager";
import { TodaySummary } from "@/components/today-summary";
import styles from "@/components/control-center-v2.module.css";
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
  const fallback =
    process.env.BOB_CONTROL_CENTER_DEFAULT_PROJECT?.trim() || "bobai";
  const candidate = value?.trim().toLowerCase() || fallback.toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,99}$/.test(candidate) ? candidate : "bobai";
}

function safeMessage(value: string | undefined): string | null {
  const message = value?.trim();
  return message ? message.slice(0, 240) : null;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  if (!(await hasOwnerSession())) redirect("/login");
  if(workspaceEntryEnabled())redirect("/work");
  const csrfToken = await getOwnerCsrfToken();
  if (!csrfToken) redirect("/login");

  const params = await searchParams;
  const selectedProject = projectKey(params.project);
  const notice = safeMessage(params.notice);
  const actionError = safeMessage(params.error);
  const data = await getDashboardData(selectedProject);
  const coreReady = data.status?.status === "ready";
  const contextReady =
    data.context !== null &&
    data.context.sources?.tasks?.status === "available" &&
    data.context.sources?.decisions?.status === "available";
  const activityUnavailable = data.errors.some((error) => error.startsWith("Activity:"));
  const memoryReady =
    data.context !== null &&
    data.context.sources?.memories?.status === "available";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BobMark />
        <nav aria-label="Control Center navigation">
          <Link className="nav-link" href="/account">
            Owner access
          </Link>
          <Link className="nav-link" href={`/chat?project=${selectedProject}`}>
            Talk to Bob
          </Link>
          <a className="nav-link active" href="#today">
            <span>◫</span> Today
          </a>
          <a className="nav-link" href="#project-state">
            <span>◎</span> Project workspace
          </a>
          <a className="nav-link" href="#approvals">
            <span>◇</span> Approvals
          </a>
          <a className="nav-link" href="#task-manager">
            <span>✓</span> Tasks
          </a>
          <a className="nav-link" href="#interfaces">
            <span>⌁</span> Interfaces
          </a>
          <a className="nav-link" href="#release-health">
            <span>◆</span> Implementation evidence
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
              <small>
                {coreReady
                  ? "Readiness reported"
                  : "Connection degraded"}
              </small>
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
            <p className="eyebrow">Bob · daily workspace</p>
            <h1>Your day, in view.</h1>
            <p>
              Plan your next step, capture commitments, and resume the selected project.
            </p>
          </div>
          <div className="topbar-actions">
            <span
              className={`live-pill ${coreReady ? "is-live" : "is-degraded"}`}
            >
              <span /> {coreReady ? "Core live" : "Degraded"}
            </span>
            <Link
              className="secondary-button"
              href={`/?project=${selectedProject}`}
            >
              ↻ Refresh workspace
            </Link>
          </div>
        </header>

        <div className="workspace-toolbar">
          <form className={styles.projectPicker} method="get">
            <label htmlFor="project-picker">Active project</label>
            <div>
              <select id="project-picker" name="project" defaultValue={selectedProject}>
                {(data.controlCenter?.projects ?? [{ projectKey: selectedProject, name: data.context?.project.name ?? selectedProject }]).map((project) => (
                  <option key={project.projectKey} value={project.projectKey}>{project.name}</option>
                ))}
              </select>
              <button type="submit">Open</button>
              <Link className="secondary-button" href="/projects/new">New project</Link>
            </div>
          </form>
          <nav className="workspace-links primary-workspace-nav" aria-label="Daily workspace navigation">
            <a href="#today">Today</a>
            <a href="#task-manager">Tasks</a>
            <a href="#project-state">Project workspace</a>
            <a href="#approvals">Approvals</a>
            <Link href={`/chat?project=${selectedProject}`}>Talk to Bob</Link>
            <Link href="/account">Owner access</Link>
          </nav>
        </div>

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

        <TodaySummary context={data.context} administration={data.controlCenter} />

        <section id="overview" aria-labelledby="overview-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">System overview</p>
              <h2 id="overview-heading">Bob at a glance</h2>
            </div>
            <span>
              Project: {data.context?.project.name ?? selectedProject}
            </span>
          </div>

          <div className="status-grid">
            <StatusCard
              label="Bob Core"
              value={
                coreReady ? "Online" : data.status ? "Degraded" : "Unavailable"
              }
              detail={
                data.status
                  ? `v${data.status.version} · ${data.status.model}`
                  : "No status response"
              }
              state={
                coreReady ? "healthy" : data.status ? "warning" : "offline"
              }
              symbol="◉"
            />
            <StatusCard
              label="Memory"
              value={memoryReady ? "Available" : !data.context || data.context.sources?.memories?.status === "unavailable" ? "Unavailable" : "Unverified"}
              detail={
                memoryReady
                  ? "Approved memory read succeeded"
                  : "No successful source check reported"
              }
              state={memoryReady ? "healthy" : "warning"}
              symbol="⌁"
            />
            <StatusCard
              label="Shared Context"
              value={
                data.status?.sharedContext?.enabled
                  ? `v${data.status.sharedContext.version}`
                  : "Unavailable"
              }
              detail={
                contextReady
                  ? `${data.context?.decisions.length ?? 0} decisions · ${data.context?.tasks.length ?? 0} tasks returned`
                  : "Project state could not load"
              }
              state={
                data.status?.sharedContext?.enabled && contextReady
                  ? "healthy"
                  : "warning"
              }
              symbol="▱"
            />
            <StatusCard
              label="Owner approvals"
              value={data.controlCenter ? `${data.controlCenter.approvals.length} returned` : "Unavailable"}
              detail={
                data.controlCenter
                  ? `${data.controlCenter.interfaces.filter((credential) => credential.enabled).length} active interface credentials`
                  : "Administration scope unavailable"
              }
              state={
                data.controlCenter
                  ? data.controlCenter.approvals.length > 0
                    ? "warning"
                    : "healthy"
                  : "warning"
              }
              symbol="◇"
            />
          </div>
          {data.status?.checks && (
            <ul aria-label="Dependency readiness">
              {Object.entries(data.status.checks).map(([name, check]) => (
                <li key={name}>
                  <strong>{name}</strong>: {check.status.replaceAll("_", " ")}
                  {check.detail ? ` — ${check.detail}` : ""}
                  {check.checkedAt
                    ? ` · checked ${new Date(check.checkedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
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

        <TaskManager key={`${selectedProject}:${csrfToken}`} project={selectedProject} csrfToken={csrfToken} />
        <ProjectState context={data.context} />

        <ControlCenterV2
          data={data.controlCenter}
          activity={data.activity}
          coreReady={coreReady}
          activityUnavailable={activityUnavailable}
          selectedProject={selectedProject}
          csrfToken={csrfToken}
        />

        <section className="panel" id="activity" style={{ marginTop: 18 }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operational audit</p>
              <h2>Recent activity</h2>
              <p>Up to 50 recent records. This bounded feed is not complete project history or release acceptance.</p>
            </div>
            <span className="count-badge">{activityUnavailable ? "Unavailable" : `${Math.min(data.activity.length, 50)} shown`}</span>
          </div>
          <ActivityTimeline activity={data.activity.slice(0, 50)} unavailable={activityUnavailable} />
          <div className="privacy-note">
            <span aria-hidden="true">⌾</span>
            <p>
              Raw prompts, credentials, sensitive memories, and private
              chain-of-thought never belong in the activity feed. Bob Core
              stores operational results and approved project state only.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
