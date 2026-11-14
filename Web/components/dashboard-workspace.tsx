
import Link from "next/link";


import { ActivityTimeline } from "@/components/activity-timeline";
import { BobMark } from "@/components/bob-mark";
import { ControlCenterV2 } from "@/components/control-center-v2";
import { ProjectState } from "@/components/project-state";
import { StatusCard } from "@/components/status-card";
import { SystemReadiness } from "@/components/system-readiness";
import { TaskManager } from "@/components/task-manager";
import { DailyNavigation } from "@/components/daily-navigation";
import { taskListView, taskSelection, workspacePageHref } from "@/lib/daily-workspace";
import { TodaySummary } from "@/components/today-summary";
import styles from "@/components/control-center-v2.module.css";
import dailyStyles from "@/components/daily-workspace.module.css";

import { getDashboardHealth } from "@/lib/dashboard-health";


import type { DashboardData } from "@/lib/types";
export function DashboardWorkspace({data,selectedProject,csrfToken,params={},notice=null,actionError=null,review=false,coreLocation="Not reported",buildId="Not reported"}:{coreLocation?:string;buildId?:string;data:DashboardData;selectedProject:string;csrfToken:string;params?:{taskView?:string;task?:string};notice?:string|null;actionError?:string|null;review?:boolean}) {
  const health = getDashboardHealth(data.status);
  const coreConnected = health.connectivity.state === "healthy";
  const contextReady =
    data.context !== null &&
    data.context.sources?.tasks?.status === "available" &&
    data.context.sources?.decisions?.status === "available";
  const activityUnavailable = data.errors.some((error) => error.startsWith("Activity:"));
  const memoryReady =
    data.context !== null &&
    data.context.sources?.memories?.status === "available";

  return (
    <div className="app-shell workspace-ux">
      <aside className="sidebar">
        <BobMark />
        <DailyNavigation project={selectedProject} />

        <div className="sidebar-bottom">
          <div className="authority-card">
            <span className={`pulse-ring state-${health.connectivity.state}`} aria-hidden="true" />
            <div>
              <strong>Bob Core</strong>
              <small>
                Connectivity: {health.connectivity.value}
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

      <main className={`dashboard-main ${dailyStyles.workspaceMain}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Bob · daily workspace</p>
            <h1>Your workspace, in view.</h1>
            <p>
              Plan your next step, capture commitments, and resume the selected project.
            </p>
          </div>
          <div className="topbar-actions">
            <span
              className={`live-pill ${coreConnected ? "is-live" : "is-degraded"}`}
            >
              <span /> Core: {health.connectivity.value}
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
              <Link className="secondary-button" href={workspacePageHref("/projects/new", selectedProject)}>New project</Link>
            </div>
          </form>
          <DailyNavigation project={selectedProject} mobile />
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

        <section className="system-location" aria-label="Data location"><div><small>Core destination</small><strong>{coreLocation}</strong></div><div><small>Context &amp; memory</small><strong>{data.status?.memory?.storage === "neon" ? "Neon PostgreSQL" : "Storage not reported"}</strong></div><div><small>File storage</small><strong>Inventory not reported</strong></div><div><small>Web source</small><strong>{buildId}</strong></div></section>
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

          <SystemReadiness status={data.status} health={health} />
          <div className="status-grid project-status-grid" role="group" aria-label="Selected project status">
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
                  ? "Review access and activity in Connections"
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

        <TaskManager apiBase={review ? "/api/review/tasks" : "/api/tasks"} key={`${selectedProject}:${csrfToken}`} project={selectedProject} projectName={data.context?.project.name ?? selectedProject} csrfToken={csrfToken} initialView={taskListView(params.taskView)} initialTaskId={taskSelection(params.task)} />
        <ProjectState context={data.context} />

        <ControlCenterV2
          data={data.controlCenter}
          activity={data.activity}
          coreConnected={coreConnected}
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
