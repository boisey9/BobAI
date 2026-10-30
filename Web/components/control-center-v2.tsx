import type {
  ActivityItem,
  ControlCenterAdminData,
  InterfaceCredentialSummary,
} from "@/lib/types";
import styles from "./control-center-v2.module.css";
import { ActivityTimeline } from "./activity-timeline";
import { contextTime } from "./context-source-status";

type ControlCenterV2Props = {
  data: ControlCenterAdminData | null;
  activity: ActivityItem[];
  coreReady: boolean;
  activityUnavailable: boolean;
  selectedProject: string;
  csrfToken: string;
};

const SURFACES = [
  { key: "bobai", name: "BobAI", role: "Mobile and voice" },
  { key: "copilot", name: "GitHub Copilot", role: "Coding interface" },
  {
    key: "microsoft-copilot",
    name: "Microsoft Copilot",
    role: "General and work interface",
  },
  { key: "codex", name: "Codex", role: "Engineering agent" },
  { key: "chatgpt", name: "ChatGPT", role: "Conversation interface" },
  { key: "web", name: "Control Center", role: "Owner administration" },
] as const;

function relativeTime(value: string | undefined): string {
  if (!value) return "No activity returned";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60_000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function latestSurfaceActivity(activity: ActivityItem[], surface: string) {
  return activity.find(
    (item) => item.source.toLowerCase() === surface.toLowerCase(),
  );
}

function credentialsForSurface(
  credentials: InterfaceCredentialSummary[],
  surface: string,
) {
  return credentials.filter((credential) => credential.surface === surface);
}

function scopeLabel(scope: string) {
  return scope.replaceAll(":", " · ").replaceAll("-", " ");
}

export function ControlCenterV2({
  data,
  activity,
  coreReady,
  activityUnavailable,
  selectedProject,
  csrfToken,
}: ControlCenterV2Props) {
  const project = data?.selectedProject;
  const enabledCredentials =
    data?.interfaces.filter((credential) => credential.enabled).length ?? 0;
  const disabledCredentials =
    data?.interfaces.filter((credential) => !credential.enabled).length ?? 0;

  return (
    <>
      <section className={styles.commandSection} id="command-center">
        <div className={styles.sectionHeader}>
          <div>
            <p className="eyebrow">Owner controls</p>
            <h2>Review and access</h2>
            <p>
              Review proposals and manage access for the selected workspace.
            </p>
          </div>

        </div>

        {!data ? (
          <div className={styles.unavailable}>
            <strong>Administration data is not available yet.</strong>
            <p>
              Approval and credential records could not be retrieved. This does not establish their current state. Tasks have their own read and save status.
            </p>
          </div>
        ) : (
          <div className={styles.summaryGrid}>
            <article>
              <span>Project</span>
              <strong>{project?.name ?? selectedProject}</strong>
              <small>{project?.repository ?? "No repository linked"}</small>
            </article>
            <article>
              <span>Proposals returned</span>
              <strong>{data.approvals.length}</strong>
              <small>
                {data.approvals.length === 1
                  ? "Owner decision waiting"
                  : "Owner decisions waiting"}
              </small>
            </article>
            <article>
              <span>Active credentials</span>
              <strong>{enabledCredentials}</strong>
              <small>
                {disabledCredentials} disabled · {data.legacyCredentialCount} legacy
              </small>
            </article>
            <article>
              <span>Registered projects</span>
              <strong>{data.projects.length}</strong>
              <small>Projects returned by Bob Core</small>
            </article>
          </div>
        )}
      </section>

      <div className={styles.twoColumnGrid}>
        <section className={`panel ${styles.releasePanel}`} id="release-health">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recorded activity</p>
              <h2>Implementation evidence</h2>
              <p>Recorded outcomes are evidence to inspect, not enforced release gates.</p>
            </div>
          </div>
          <div className="evidence-status">
            <p><strong>Core readiness:</strong> {coreReady ? "Ready reported by the status endpoint." : "Not confirmed ready."} This does not verify a deployed candidate or a release.</p>
            <p><strong>Release acceptance: unverified.</strong> Exact candidate checks, independent review and owner approval are not established by this feed.</p>
            <p className="muted-copy">Administration snapshot: {contextTime(data?.generatedAt)}. Up to four returned implementation records are shown; history may be incomplete.</p>
            <a href="#activity">See recent activity</a>
          </div>
          <ActivityTimeline activity={data?.releaseEvents.slice(0, 4) ?? []} unavailable={!data} idPrefix="implementation" />
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
            <div>
              <span>◉</span>
              <p>
                <strong>Server-only Core token</strong>
                <small>The browser never receives a Bob Core credential.</small>
              </p>
            </div>
            <div>
              <span>◇</span>
              <p>
                <strong>Project-bound clients</strong>
                <small>Interfaces cannot silently switch to another Bob project.</small>
              </p>
            </div>
            <div>
              <span>⌁</span>
              <p>
                <strong>Owner-reviewed decisions</strong>
                <small>AI proposals do not become authoritative without approval.</small>
              </p>
            </div>
            <div>
              <span>≋</span>
              <p>
                <strong>Privacy-safe activity</strong>
                <small>No raw prompts, credentials, or private reasoning.</small>
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className={`panel ${styles.approvalsPanel}`} id="approvals">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Owner approval inbox</p>
            <h2>Decision proposals</h2>
            <p>
              Review proposals before Bob Core promotes them into active project decisions.
            </p>
          </div>
          <span className="count-badge">{data ? `${data.approvals.length} returned` : "Unavailable"}</span>
        </div>

        {!data ? (
          <div className={styles.unavailable}>
            <strong>Approval inbox unavailable.</strong>
            <p>Refresh workspace to retrieve proposals. An unavailable inbox does not mean that no proposals are pending.</p>
          </div>
        ) : data.approvals.length === 0 ? (
          <div className={styles.emptyState}>
            <span>✓</span>
            <div>
              <strong>No proposals returned.</strong>
              <p>
                No proposals were returned in this administration snapshot. Only authorized interfaces can submit proposals.
              </p>
            </div>
          </div>
        ) : (
          <div className={styles.approvalList}>
            {data.approvals.map((approval) => (
              <article className={styles.approvalCard} key={approval.id}>
                <div className={styles.approvalTopline}>
                  <span>{approval.surface ?? approval.source}</span>
                  <time dateTime={approval.createdAt}>
                    {relativeTime(approval.createdAt)}
                  </time>
                </div>
                <h3>{approval.decisionTitle}</h3>
                <p>{approval.proposal}</p>
                {approval.reason && <blockquote>{approval.reason}</blockquote>}
                <form
                  action={`/api/approvals/${approval.id}`}
                  method="post"
                  className={styles.approvalForm}
                >
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <input
                    type="hidden"
                    name="project"
                    value={project?.projectKey ?? selectedProject}
                  />
                  <label>
                    Optional owner note
                    <input
                      name="note"
                      maxLength={500}
                      placeholder="Reason, adjustment, or audit note"
                    />
                  </label>
                  <div>
                    <button
                      className={styles.rejectButton}
                      type="submit"
                      name="action"
                      value="reject"
                    >
                      Reject
                    </button>
                    <button
                      className={styles.approveButton}
                      type="submit"
                      name="action"
                      value="approve"
                    >
                      Approve decision
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel alignment-panel" id="alignment" aria-labelledby="alignment-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Project continuity</p>
            <h2 id="alignment-heading">Interface alignment</h2>
            <p>Use the same authorized workspace and retrieve fresh Bob Core context when resuming work.</p>
          </div>
        </div>
        <div className="evidence-status">
          <p><strong>Cross-interface acceptance: unverified in this view.</strong> An enabled credential or recent activity does not prove that ChatGPT, Codex, iPhone and Web are using the same build or current context.</p>
          <p>Bob Core stores shared tasks, active decisions, approved memory and handoffs. Conversation history is not automatically shared between interfaces.</p>
          <nav className="workspace-links" aria-label="Continuity sources">
            <a href="#task-manager">Current tasks</a><a href="#decisions">Active decisions</a><a href="#handoffs">Resume from a handoff</a><a href="#interfaces">Inspect access</a>
          </nav>
        </div>
      </section>

      <section className={`panel ${styles.interfacesPanel}`} id="interfaces">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Interfaces and credentials</p>
            <h2>Interface access and activity</h2>
            <p>
              These records describe access and returned activity, not verified client connectivity.
            </p>
          </div>
          <span className="count-badge">{data ? `${data.interfaces.length} credentials` : "Unavailable"}</span>
        </div>

        <div className={styles.interfaceGrid}>
          {SURFACES.map((surface) => {
            const credentials = credentialsForSurface(
              data?.interfaces ?? [],
              surface.key,
            );
            const latest = latestSurfaceActivity(activity, surface.key);
            return (
              <article className={styles.interfaceCard} key={surface.key}>
                <div className={styles.interfaceHeader}>
                  <span className={styles.surfaceAvatar}>
                    {surface.name.charAt(0)}
                  </span>
                  <div>
                    <strong>{surface.name}</strong>
                    <small>{surface.role}</small>
                  </div>
                  {credentials.length === 0 && (
                    <span className={styles.credentialOff}>{data ? "No credential returned" : "Unverified"}</span>
                  )}
                </div>

                <div className={styles.interfaceMeta}>
                  <span>Last returned activity</span>
                  <strong>{activityUnavailable ? "Unavailable" : relativeTime(latest?.createdAt)}</strong>
                </div>

                {credentials.length > 0 ? (
                  <ul className={styles.credentialList}>
                    {credentials.map((credential) => {
                      const protectedCredential =
                        credential.id === "control-center-bobai";
                      const action = protectedCredential
                        ? "Protected owner credential"
                        : credential.enabled
                          ? "Revoke access"
                          : "Enable access";
                      return (
                        <li className={styles.credentialEntry} key={credential.id}>
                          <div className={styles.credentialHeader}>
                            <h3 className={styles.credentialId}>{credential.id}</h3>
                            <span
                              className={
                                credential.enabled
                                  ? styles.credentialOn
                                  : styles.credentialOff
                              }
                            >
                              {credential.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div className={styles.scopeList}>
                            {credential.scopes.map((scope) => (
                              <span key={scope}>{scopeLabel(scope)}</span>
                            ))}
                          </div>
                          <form
                            action={`/api/credentials/${encodeURIComponent(credential.id)}`}
                            method="post"
                            className={styles.credentialForm}
                            aria-label={`${credential.id} access`}
                          >
                            <input type="hidden" name="csrfToken" value={csrfToken} />
                            <input
                              type="hidden"
                              name="project"
                              value={project?.projectKey ?? selectedProject}
                            />
                            <input
                              type="hidden"
                              name="enabled"
                              value={credential.enabled ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              disabled={protectedCredential}
                              aria-label={`${action} for ${credential.id}`}
                              title={
                                protectedCredential
                                  ? "The Control Center cannot disable its own active credential."
                                  : undefined
                              }
                            >
                              {action}
                            </button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.provisioningCopy}>
                    {data ? "No dedicated scoped credential was returned for this surface." : "Credential records are unavailable. Refresh workspace to retry."}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {(data?.legacyCredentialCount ?? 0) > 0 && (
          <div className={styles.legacyNotice}>
            <span>!</span>
            <p>
              <strong>
                {data?.legacyCredentialCount} legacy read credential
                {data?.legacyCredentialCount === 1 ? "" : "s"}
              </strong>
              <small>
                Migrate or revoke legacy hashes after the structured Control Center credential is accepted.
              </small>
            </p>
          </div>
        )}
      </section>
    </>
  );
}
