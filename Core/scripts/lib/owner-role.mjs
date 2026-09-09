import { quoteIdentifier } from "./backup.mjs";

// Deliberate table allowlist: future auth migrations must review runtime grants.
export const OWNER_AUTH_TABLES = [
  "bob_auth_user",
  "bob_auth_session",
  "bob_auth_account",
  "bob_auth_verification",
  "bob_auth_passkey",
  "bob_auth_rate_limit",
  "bob_auth_oauth_client",
  "bob_auth_oauth_resource",
  "bob_auth_oauth_client_resource",
  "bob_auth_oauth_refresh_token",
  "bob_auth_oauth_access_token",
  "bob_auth_oauth_consent",
  "bob_auth_oauth_client_assertion",
  "bob_oauth_project_grants",
];

export async function provisionOwnerRole(client, role, password) {
  if (
    !/^bob_web_[a-z0-9_]{1,48}$/.test(role ?? "") ||
    !/^[A-Za-z0-9_-]{40,100}$/.test(password)
  )
    throw new Error(
      "A dedicated bob_web_ role and generated credential are required.",
    );
  if (
    (await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]))
      .rowCount
  )
    throw new Error(
      "The owner runtime role already exists; reconcile before retrying.",
    );
  for (const table of OWNER_AUTH_TABLES)
    if (
      !(
        await client.query("SELECT to_regclass($1) AS relation", [
          `public.${table}`,
        ])
      ).rows[0].relation
    )
      throw new Error(
        "Reviewed owner and OAuth migrations are required before granting access.",
      );
  const identifier = quoteIdentifier(role);
  await client.query(
    `CREATE ROLE ${identifier} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier}`);
  await client.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON ${OWNER_AUTH_TABLES.map((table) => `public.${quoteIdentifier(table)}`).join(",")} TO ${identifier}`,
  );
  await client.query(`GRANT SELECT ON public.bob_projects TO ${identifier}`);
  // PostgreSQL requires UPDATE on at least one column for consent's FOR SHARE.
  // Only the modification timestamp is writable, never project identity/state.
  await client.query(
    `GRANT UPDATE(updated_at) ON public.bob_projects TO ${identifier}`,
  );
  await client.query(`GRANT INSERT ON public.bob_events TO ${identifier}`);
  const privilege = await client.query(
    `SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
    has_schema_privilege($1,'public','CREATE') AS can_create_objects FROM pg_roles WHERE rolname=$1`,
    [role],
  );
  if (Object.values(privilege.rows[0]).some(Boolean))
    throw new Error("Unexpected owner runtime privilege; abort provisioning.");
}
