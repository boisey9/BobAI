import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceChat } from "@/components/workspace-chat";
import { getControlCenterAdmin } from "@/lib/bob-core";
import { getOwnerCsrfToken, hasOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  if (!(await hasOwnerSession())) redirect("/login");
  const csrf = await getOwnerCsrfToken();
  if (!csrf) redirect("/login");
  const requested =
    (await searchParams).project?.trim().toLowerCase() ?? "personal";
  const projectKey = /^[a-z0-9][a-z0-9_-]{0,99}$/.test(requested)
    ? requested
    : "personal";
  const administration = await getControlCenterAdmin(projectKey).catch(
    () => null,
  );
  const projects = administration?.projects ?? [];
  return (
    <main
      className="dashboard-main"
      style={{ maxWidth: 960, margin: "0 auto" }}
    >
      <header className="topbar">
        <div>
          <p className="eyebrow">Bob conversation</p>
          <h1>{administration?.selectedProject.name ?? projectKey}</h1>
          <p>
            Approved context follows the selected workspace. Conversation
            history stays in this page.
          </p>
        </div>
        <Link href={`/?project=${projectKey}`} className="secondary-button">
          Control Center
        </Link>
      </header>
      <nav
        aria-label="Conversation workspace"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}
      >
        {projects.map((project) => (
          <Link
            className="secondary-button"
            key={project.projectKey}
            aria-current={
              project.projectKey === projectKey ? "page" : undefined
            }
            href={`/chat?project=${project.projectKey}`}
          >
            {project.name}
          </Link>
        ))}
      </nav>
      <WorkspaceChat key={projectKey} projectKey={projectKey} csrf={csrf} />
    </main>
  );
}
