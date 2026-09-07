import Link from "next/link";
import { redirect } from "next/navigation";
import { hasOwnerSession, getOwnerCsrfToken } from "@/lib/session";
import { ownerAuthEnabled, withOwnerDatabase } from "@/lib/owner-auth";
import { oauthEnabled, grantOwnerId } from "@/lib/oauth-grants";
import { ProjectConnections } from "@/components/project-connections";
import { OwnerSecurity } from "@/components/owner-security";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!(await hasOwnerSession())) redirect("/login");
  const connections =
    ownerAuthEnabled() && oauthEnabled()
      ? await withOwnerDatabase(
          async (pool) =>
            (
              await pool.query(
                `
    SELECT g.id,p.name,g.surface,g.scopes,g.created_at AS "createdAt",c.name AS "clientName",g.client_id AS "clientId" FROM bob_oauth_project_grants g
    JOIN bob_projects p ON p.id=g.project_id AND p.owner_id=g.owner_id
    JOIN bob_auth_oauth_client c ON c."clientId"=g.client_id
    WHERE g.owner_id=$1 AND g.revoked_at IS NULL ORDER BY g.created_at DESC`,
                [grantOwnerId()],
              )
            ).rows,
        )
      : null;
  return (
    <main
      className="dashboard-main"
      style={{ maxWidth: 960, margin: "0 auto" }}
    >
      <Link href="/">← Today and projects</Link>
      {ownerAuthEnabled() ? (
        <OwnerSecurity />
      ) : (
        <p>Passkey migration has not been enabled on this deployment.</p>
      )}
      {connections && (
        <ProjectConnections
          initial={connections}
          csrf={(await getOwnerCsrfToken())!}
        />
      )}
    </main>
  );
}
