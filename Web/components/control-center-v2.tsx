import type {
  ActivityItem,
  ControlCenterAdminData,
  InterfaceCredentialSummary,
} from "@/lib/types";
import styles from "./control-center-v2.module.css";

type ControlCenterV2Props = {
  data: ControlCenterAdminData | null;
  activity: ActivityItem[];
  coreReady: boolean;
  selectedProject: string;
};

type GateState = "passed" | "failed" | "waiting";

type ReleaseGate = {
  label: string;
  state: GateState;
  detail: string;
};

const SURFACES = [
  { key: "bobai", name: "BobAI", role: "Mobile and voice" },
  { key: "copilot", name: "GitHub Copilot", role: "Coding interface" },
  { key: "codex", name: "Codex", role: "Engineering agent" },
  { key: "chatgpt", name: "ChatGPT", role: "Conversation interface" },
  { key: "web", name: "Control Center", role: "Owner administration" },
] as const;

function relativeTime(value: string | undefined): string {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function latestSurfaceActivity(activity: ActivityItem[], surface: string) {
  return activity.find((item) => item.source.toLowerCase() === surface.toLowerCase());
}

function latestMatchingEvent(activity: ActivityItem[], patterns: RegExp[]) {
  return activity.find((item) => patterns.some((pattern) => pattern.test(item.eventType)));
}

function eventGate(
  label: string,
  event: ActivityItem | undefined,
  fallback: string,
): ReleaseGate {
  if (!event) return { label, state: "waiting", detail: fallback };
  const normalized = `${event.eventType} ${event.summary}`.toLowerCase();
  const failed = /(failed|failure|error|blocked)/.test(normalized);
  return {
    label,
    state: failed ? "failed" : "passed",
    detail: `${event.summary} · ${relativeTime(event.createdAt)}`,
  };
}

function releaseGates(activity: ActivityItem[], coreReady: boolean): ReleaseGate[] {
  const buildEvent = latestMatchingEvent(activity, [
    /validation\./i,
    /build\./i,
    /deployment\./i,
  ]);
  const functionalEvent = latestMatchingEvent(activity, [
    /acceptance\./i,
    /functional\./i,
  ]);

  return [
    eventGate("Build", buildEvent, "Awaiting a recorded validation or deployment outcome."),
    {
      label: "Runtime",
      state: coreReady ? "passed" : "failed",
      detail: coreReady ? "Bob Core is responding in production." : "Bob Core is unavailable or degraded.",
    },
    eventGate("Functional", functionalEvent, "A live owner acceptance test is still required."),
  ];
}

function statusText(state: GateState) {
  if (state === "passed") return "Passed";
  if (state === "failed") return "Attention";
  return "Waiting";
}

function credentialForSurface(
  credentials: InterfaceCredentialSummary[],
  surface: string,
) {
  return credentials.find((credential) => credential.surface === surface);
}

function scopeLabel(scope: string) {
  return scope.replaceAll(":", " · ").replaceAll("-", " ");
}

export function ControlCenterV2({
  data,
  activity,
  coreReady,
  selectedProject,
}: ControlCenterV2Props) {
  const project = data?.selectedProject;
  const gates = releaseGates(data?.releaseEvents ?? activity, coreReady);
  const enabledCredentials = data?.interfaces.filter((credential) => credential.enabled).length ?? 0;
  const disabledCredentials = data?.interfaces.filter((credential) => !credential.enabled).length ?? 0;

  return (
    <>
      <section className={styles.commandSection} id="command-center">
        <div className={styles.sectionHeader}>
          <div>
            <p className="eyebrow">Control Center v2</p>
            <h2>Owner command center</h2>
            <p>Projects, approvals, interfaces, permissions, and release readiness in one place.</p>
          </div>
          <form className={styles.projectPicker} method="get">
            <label htmlFor="project-picker">Active project</label>
            <div>
              <select id="project-picker" name="project" defaultValue={project?.projectKey ?? selectedProject}>
                {(data?.projects ?? [
                  {
                    projectKey: selectedProject,
                    name: selectedProject,
                    description: null,
                    repository: null,
                    status: "active" as const,
                    updatedAt: new Date(0).toISOString(),
                  },
                ]).map((item) => (
                  <option key={item.projectKey} value={item.projectKey}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button type="submit">Open</button>
            </div>
          </form>
        </div>

        {!data ? (
          <div className={styles.unavailable}>
            <strong>Administration data is not available yet.</strong>
            <p>The dashboard remains read-only until the scoped Control Center credential is active.</p>
          </div>
        ) : (
          <div className={styles.summaryGrid}>
            <article>
              <span>Project</span>
              <strong>{project?.name ?? selectedProject}</strong>
              <small>{project?.repository ?? "No repository linked"}</small>
            </article>
            <article>
              <span>Pending approvals</span>
              <strong>{data.approvals.length}</strong>
              <small>{data.approvals.length === 1 ? "Owner decision waiting" : "Owner decisions waiting"}</small>
            </article>
            <article>
              <span>Active credentials</span>
              <strong>{enabledCredentials}</strong>
              <small>{disabledCredentials} disabled · {data.legacyCredentialCount} legacy</small>
            </article>
            <article>
              <span>Registered projects</span>
              <strong>{data.projects.length}</strong>
              <small>Bob Core remains authoritative</small>
            </article>
          </div>
        )}
      </section>

      <div className={styles.twoColumnGrid}>
        <section className={`panel ${styles.releasePanel}`} id="release-health">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Release gates</p>
              <h2>Build, runtime, functional</h2>
              <p>Green deployment alone is not a completed release.</p>
            </div>
          </div>
          <div className={styles.gateList}>
            {gates.map((gate) => (
              <article className={`${styles.gateRow} ${styles[gate.state]}`} key={gate.label}>
                <span className={styles.gateIcon} aria-hidden="true" />
                <div>
                  <strong>{gate.label}</strong>
                  <p>{gate.detail}</p>
                </div>
                <b>{statusText(gate.state)}</b>
              </article>
            ))}
          </div>
        </section>

        <section className={`panel ${styles.securityPanel}`} id="security">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Security posture</p>
              <h2>Permission boundaries</h2>
              <p>Bob interfaces receive only the access they need.</p>
            </div>
          </div>
          <div className={styles.securityList}>
            <div><span>◉</span><p><strong>Server-only Core token</strong><small>The browser never receives a Bob Core credential.</small></p></div>
            <div><span>◇</span><p><strong>Project-bound clients</strong><small>Interfaces cannot silently switch to another Bob project.</small></p></div>
            <div><span>⌁</span><p><strong>Owner-reviewed decisions</strong><small>AI proposals do not become authoritative without approval.</small></p></div>
            <div><span>≋</span><p><strong>Privacy-safe activity</strong><small>No raw prompts, credentials, or private reasoning.</small></p></div>
          </div>
        </section>
      </div>

      <section className={`panel ${styles.approvalsPanel}`} id="approvals">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Owner approval inbox</p>
            <h2>Decision proposals</h2>
            <p>Review proposals before Bob Core promotes them into active project decisions.</p>
          </div>
          <span className="count-badge">{data?.approvals.length ?? 0}</span>
        </div>

        {!data || data.approvals.length === 0 ? (
          <div className={styles.emptyState}>
            <span>✓</span>
            <div>
              <strong>No pending decision proposals.</strong>
              <p>New proposals from Copilot, Codex, ChatGPT, or BobAI will appear here.</p>
            </div>
          </div>
        ) : (
          <div className={styles.approvalList}>
            {data.approvals.map((approval) => (
              <article className={styles.approvalCard} key={approval.id}>
                <div className={styles.approvalTopline}>
                  <span>{approval.surface ?? approval.source}</span>
                  <time dateTime={approval.createdAt}>{relativeTime(approval.createdAt)}</time>
                </div>
                <h3>{approval.decisionTitle}</h3>
                <p>{approval.proposal}</p>
                {approval.reason && <blockquote>{approval.reason}</blockquote>}
                <form action={`/api/approvals/${approval.id}`} method="post" className={styles.approvalForm}>
                  <input type="hidden" name="project" value={project?.projectKey ?? selectedProject} />
                  <label>
                    Optional owner note
                    <input name="note" maxLength={500} placeholder="Reason, adjustment, or audit note" />
                  </label>
                  <div>
                    <button className={styles.rejectButton} type="submit" name="action" value="reject">
                      Reject
                    </button>
                    <button className={styles.approveButton} type="submit" name="action" value="approve">
                      Approve decision
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`panel ${styles.interfacesPanel}`} id="interfaces">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Interfaces and credentials</p>
            <h2>Connected Bob surfaces</h2>
            <p>Connection state is separated from credential state and last activity.</p>
          </div>
          <span className="count-badge">{data?.interfaces.length ?? 0}</span>
        </div>

        <div className={styles.interfaceGrid}>
          {SURFACES.map((surface) => {
            const credential = credentialForSurface(data?.interfaces ?? [], surface.key);
            const latest = latestSurfaceActivity(activity, surface.key);
            const protectedCredential = credential?.id === "control-center-bobai";
            return (
              <article className={styles.interfaceCard} key={surface.key}>
                <div className={styles.interfaceHeader}>
                  <span className={styles.surfaceAvatar}>{surface.name.charAt(0)}</span>
                  <div>
                    <strong>{surface.name}</strong>
                    <small>{surface.role}</small>
                  </div>
                  <span className={credential?.enabled ? styles.credentialOn : styles.credentialOff}>
                    {credential ? (credential.enabled ? "Enabled" : "Disabled") : "Not provisioned"}
                  </span>
                </div>

                <div className={styles.interfaceMeta}>
                  <span>Last activity</span>
                  <strong>{relativeTime(latest?.createdAt)}</strong>
                </div>

                {credential ? (
                  <>
                    <div className={styles.scopeList}>
                      {credential.scopes.map((scope) => (
                        <span key={scope}>{scopeLabel(scope)}</span>
                      ))}
                    </div>
                    <form action={`/api/credentials/${credential.id}`} method="post" className={styles.credentialForm}>
                      <input type="hidden" name="project" value={project?.projectKey ?? selectedProject} />
                      <input type="hidden" name="enabled" value={credential.enabled ? "false" : "true"} />
                      <button
                        type="submit"
                        disabled={protectedCredential}
                        title={protectedCredential ? "The Control Center cannot disable its own active credential." : undefined}
                      >
                        {protectedCredential
                          ? "Protected owner credential"
                          : credential.enabled
                            ? "Revoke access"
                            : "Enable access"}
                      </button>
                    </form>
                  </>
                ) : (
                  <p className={styles.provisioningCopy}>A dedicated scoped credential has not been registered.</p>
                )}
              </article>
            );
          })}
        </div>

        {(data?.legacyCredentialCount ?? 0) > 0 && (
          <div className={styles.legacyNotice}>
            <span>!</span>
            <p>
              <strong>{data?.legacyCredentialCount} legacy read credential{data?.legacyCredentialCount === 1 ? "" : "s"}</strong>
              <small>Migrate or revoke legacy hashes after the structured Control Center credential is accepted.</small>
            </p>
          </div>
        )}
      </section>
    </>
  );
}
