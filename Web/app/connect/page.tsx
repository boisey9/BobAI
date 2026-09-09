import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { hasOwnerSession, getOwnerCsrfToken } from "@/lib/session";
import {
  ownerAuthEnabled,
  withOwnerAuth,
  withOwnerDatabase,
} from "@/lib/owner-auth";
import { grantOwnerId, oauthEnabled, OAUTH_SCOPES } from "@/lib/oauth-grants";
import { OwnerConnect } from "@/components/owner-connect";

export const dynamic = "force-dynamic";
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!ownerAuthEnabled() || !oauthEnabled()) notFound();
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      query.append(key, item);
  if (!(await hasOwnerSession())) redirect(`/login?${query}`);
  const clientId = query.get("client_id");
  if (!clientId || query.toString().length > 16000)
    return (
      <main className="dashboard-main">
        <p>
          This connection request is incomplete. Start linking again in the
          client.
        </p>
        <Link href="/account">Owner access</Link>
      </main>
    );
  const requestHeaders = await headers();
  const clientResponse = await withOwnerAuth((auth) =>
    auth.handler(
      new Request(
        new URL(
          `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
          process.env.BOB_AUTH_BASE_URL,
        ),
        { headers: requestHeaders },
      ),
    ),
  );
  if (!clientResponse.ok)
    return (
      <main className="dashboard-main">
        <p>
          This client could not be verified. Start linking again in the client.
        </p>
      </main>
    );
  const client = await clientResponse.json();
  const projects = await withOwnerDatabase(
    async (pool) =>
      (
        await pool.query(
          `SELECT project_key AS key, name FROM bob_projects
    WHERE owner_id=$1 AND status='active' AND deleted_at IS NULL AND project_key<>'personal' ORDER BY name`,
          [grantOwnerId()],
        )
      ).rows,
  );
  const requested = query.get("scope")?.split(" ").filter(Boolean) ?? [];
  if (
    !requested.includes("mcp:sync") ||
    !requested.includes("mcp:context:read") ||
    requested.some((scope) => !OAUTH_SCOPES.includes(scope))
  )
    return (
      <main className="dashboard-main">
        <p>
          This client requested unsupported permissions. Reconnect using Bob’s
          project context scopes.
        </p>
      </main>
    );
  return (
    <main
      className="dashboard-main"
      style={{ maxWidth: 800, margin: "0 auto" }}
    >
      <Link href="/account">← Owner access</Link>
      <OwnerConnect
        oauthQuery={query.toString()}
        clientId={clientId}
        clientName={
          typeof client.client_name === "string"
            ? client.client_name
            : "Project client"
        }
        requestedScopes={requested}
        projects={projects}
        csrf={(await getOwnerCsrfToken())!}
      />
    </main>
  );
}
