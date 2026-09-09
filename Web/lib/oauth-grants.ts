import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "@neondatabase/serverless";
import { APIError } from "better-auth/api";

export const MCP_SCOPES = [
  "mcp:context:read",
  "mcp:sync",
  "mcp:event:write",
  "mcp:task:write",
  "mcp:decision:propose",
] as const;
export const OAUTH_SCOPES = ["offline_access", ...MCP_SCOPES];
export const LINK_SURFACES = ["chatgpt", "codex", "copilot", "other"] as const;
export type LinkSurface = (typeof LINK_SURFACES)[number];
export type ProjectGrant = {
  id: string;
  owner_id: string;
  user_id: string;
  client_id: string;
  project_key: string;
  surface: LinkSurface;
  scopes: string[];
};

export function oauthEnabled() {
  return process.env.BOB_AUTH_OAUTH_ENABLED === "true";
}
export function grantOwnerId() {
  const owner = process.env.BOB_AUTH_CORE_OWNER_ID?.trim();
  if (!owner) throw new Error("OAuth requires BOB_AUTH_CORE_OWNER_ID.");
  return owner;
}
export function mcpResource() {
  const value = process.env.BOB_AUTH_MCP_RESOURCE?.trim();
  if (!value) throw new Error("OAuth requires BOB_AUTH_MCP_RESOURCE.");
  const url = new URL(value);
  const local =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.pathname !== "/mcp/linked" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("OAuth requires a canonical HTTPS /mcp/linked resource.");
  return url.toString();
}

export async function liveGrant(
  pool: Pool,
  id: string,
  userId: string,
): Promise<ProjectGrant | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const result = await pool.query(
    `SELECT g.id, g.owner_id, g.user_id, g.client_id, p.project_key, g.surface, g.scopes
    FROM bob_oauth_project_grants g JOIN bob_projects p ON p.id=g.project_id AND p.owner_id=g.owner_id
    WHERE g.id=$1 AND g.user_id=$2 AND g.owner_id=$3 AND g.revoked_at IS NULL
      AND p.deleted_at IS NULL AND p.status='active' AND p.project_key<>'personal'`,
    [id, userId, grantOwnerId()],
  );
  return result.rows[0] ?? null;
}

// Only the owner consent route supplies a reference; browser session state is
// never used as a mutable "current project" for simultaneous authorization flows.
export async function approveProjectGrant(
  pool: Pool,
  input: {
    userId: string;
    clientId: string;
    projectKey: string;
    surface: LinkSurface;
    scopes: string[];
    oauthQuery: string;
    operationId: string;
  },
): Promise<ProjectGrant> {
  const owner = grantOwnerId();
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        clientId: input.clientId,
        projectKey: input.projectKey,
        surface: input.surface,
        scopes: [...input.scopes].sort(),
        query: createHash("sha256").update(input.oauthQuery).digest("hex"),
      }),
    )
    .digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM bob_auth_user WHERE id=$1 FOR UPDATE", [
      input.userId,
    ]);
    const existing = await client.query(
      `SELECT id, request_fingerprint, revoked_at FROM bob_oauth_project_grants
      WHERE owner_id=$1 AND user_id=$2 AND operation_id=$3`,
      [owner, input.userId, input.operationId],
    );
    if (existing.rows[0]) {
      if (
        existing.rows[0].request_fingerprint !== fingerprint ||
        existing.rows[0].revoked_at
      )
        throw new APIError("CONFLICT", {
          error: "operation_conflict",
          error_description:
            "This approval operation conflicts with an earlier request.",
        });
      const active = await client.query(
        `SELECT id FROM bob_projects WHERE owner_id=$1 AND project_key=$2
        AND project_key<>'personal' AND status='active' AND deleted_at IS NULL FOR SHARE`,
        [owner, input.projectKey],
      );
      if (active.rowCount !== 1)
        throw new Error("The project grant is no longer available.");
      await client.query("COMMIT");
      return {
        id: existing.rows[0].id,
        owner_id: owner,
        user_id: input.userId,
        client_id: input.clientId,
        project_key: input.projectKey,
        surface: input.surface,
        scopes: input.scopes,
      };
    }
    const project = await client.query(
      `SELECT id FROM bob_projects WHERE owner_id=$1 AND project_key=$2
      AND project_key<>'personal' AND status='active' AND deleted_at IS NULL FOR SHARE`,
      [owner, input.projectKey],
    );
    if (project.rowCount !== 1)
      throw new Error("Select an available engineering project.");
    const id = randomUUID();
    await client.query(
      `INSERT INTO bob_oauth_project_grants(id,owner_id,user_id,client_id,project_id,surface,scopes,operation_id,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        owner,
        input.userId,
        input.clientId,
        project.rows[0].id,
        input.surface,
        input.scopes,
        input.operationId,
        fingerprint,
      ],
    );
    await client.query(
      `INSERT INTO bob_events(id,owner_id,project_id,event_type,summary,source,details)
      VALUES($1,$2,$3,'oauth.grant.approved','Owner approved a project connection.','web',$4::jsonb)`,
      [
        randomUUID(),
        owner,
        project.rows[0].id,
        JSON.stringify({ grantId: id, surface: input.surface }),
      ],
    );
    await client.query("COMMIT");
    return {
      id,
      owner_id: owner,
      user_id: input.userId,
      client_id: input.clientId,
      project_key: input.projectKey,
      surface: input.surface,
      scopes: input.scopes,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeProjectGrant(
  pool: Pool,
  id: string,
  userId: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const changed = await client.query(
      `UPDATE bob_oauth_project_grants SET revoked_at=now()
      WHERE id=$1 AND user_id=$2 AND owner_id=$3 AND revoked_at IS NULL RETURNING project_id`,
      [id, userId, grantOwnerId()],
    );
    // Revoking the grant is sufficient to deny access and refresh immediately;
    // remove the provider's tokens and consents in the same owner transaction.
    await client.query(
      'DELETE FROM bob_auth_oauth_access_token WHERE "referenceId"=$1 AND "userId"=$2',
      [id, userId],
    );
    await client.query(
      'DELETE FROM bob_auth_oauth_refresh_token WHERE "referenceId"=$1 AND "userId"=$2',
      [id, userId],
    );
    await client.query(
      'DELETE FROM bob_auth_oauth_consent WHERE "referenceId"=$1 AND "userId"=$2',
      [id, userId],
    );
    if (changed.rows[0])
      await client.query(
        `INSERT INTO bob_events(id,owner_id,project_id,event_type,summary,source,details)
      VALUES($1,$2,$3,'oauth.grant.revoked','Owner revoked a project connection.','web',$4::jsonb)`,
        [
          randomUUID(),
          grantOwnerId(),
          changed.rows[0].project_id,
          JSON.stringify({ grantId: id }),
        ],
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
