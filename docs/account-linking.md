# Project account linking

This feature shipped in PR #45 (`ed0716e`) and remains disabled in production. Migration 007 requires migration 004 and the same instance database for Web authentication and Core project state. Actual ChatGPT, Codex and GitHub Copilot acceptance are separate release gates.

## Owner workflow

A client discovers Core's `/mcp/linked` resource and redirects to Bob's authorization server. The owner signs in with a passkey, selects one engineering project and the interface surface, and reviews requested permissions. Personal is excluded. Decline returns `access_denied`. Account → Project connections lists approvals and revokes a selected grant immediately.

Each approval has a stable operation ID and request fingerprint; its project grant and audit event commit together. Concurrent identical approvals reuse the grant. Reusing the operation for a different selection fails. Better Auth verifies the signed authorization request before the grant is created. A grant ID binds one authorization flow; no mutable session “current project” is used.

The connection may read project context and use selected task, activity and decision-proposal tools. Proposals remain pending owner review. Tokens cannot retrieve Personal or become owner credentials. Existing `/mcp/context`, `/mcp/sync` and privileged `/mcp` credentials retain their current contract.

## Protocol and security

Better Auth MCP 1.7.3 owns authorization-code issuance, PKCE S256, resource indicators, token rotation and standard token revocation. Core uses private server-to-server introspection of opaque tokens, then checks issuer, audience, expiry, subject, client, owner, live project grant and scopes. There is no positive token cache. The introspection request has a five-second deadline and cannot follow redirects. An authorization-service outage returns recoverable 503; invalid tokens return 401 and missing required scopes return 403 with a scope challenge. Rate accounting uses the stable grant ID, so refresh cannot evade the credential bucket.

Access tokens last fifteen minutes; refresh tokens last thirty days and rotate with strict replay detection. The resource policy includes `offline_access` when approved so the provider retains refresh rotation semantics. Reusing an old refresh token invalidates its client/user token family; clients must serialize refresh and relink after an uncertain strict-replay failure. A future retry-overlap policy needs its own acceptance evidence.

Signing out ends the browser session and its access tokens. Explicit offline consent can obtain a new access token. Before token processing, owner-scoped expired sessions are retired transactionally: old access tokens are revoked, refresh tokens without offline permission are revoked, and the session foreign keys detach preserved offline refresh tokens. This prevents a twelve-hour browser expiry from stranding an approved thirty-day connection, without reviving its old access token. Owner project revocation and offline owner recovery revoke the connection itself.

CIMD uses Better Auth's Node transport and MCP metadata profile, including destination validation and pinned DNS resolution. Dynamic registration and browser client administration are disabled. Public clients can use supported HTTPS metadata documents or an explicitly provisioned registration. The client must use its own supported OAuth flow; Codex's existing bearer credential is not a ChatGPT account-linking credential.

Reference implementation and protocol documentation: [Better Auth MCP](https://better-auth.com/docs/plugins/mcp), [OAuth provider](https://better-auth.com/docs/plugins/oauth-provider), [OpenAI account linking](https://developers.openai.com/plugins/build/auth). Installed package behavior is covered by the real PostgreSQL drill, including resource-scope filtering and token rotation.

## Configuration and operator setup

Set Web's `BOB_AUTH_OAUTH_ENABLED=true`, `BOB_AUTH_CORE_OWNER_ID` to this instance's Core owner ID, and `BOB_AUTH_MCP_RESOURCE` to the canonical Core HTTPS `/mcp/linked` URL. Existing owner authentication settings remain required. Production Web and Core must refer to the same personal instance database. Use separately scoped runtime database roles and preserve the offline operator credential.

The offline client command requires the owner setup/recovery password file, private auth configuration and the reviewed schema. Password verification is enabled only in that operator process; it does not change the deployed password-login flag. Run from Core so the pinned TS runtime can resolve:

```sh
node --import tsx ../Web/scripts/oauth-client.ts \
  --kind=resource \
  --owner-password-file=/owner-secure/owner-recovery.txt \
  --output=/owner-secure/core-oauth-client.jsonl
```

The command writes a new mode-0600 artifact outside the repository before registration. It contains the chosen client ID and secret for reconciliation if the response is lost. It registers a confidential resource verifier with no machine-to-machine grant, then removes its temporary owner session. Do not retry an uncertain registration with a different output file; reconcile the saved client ID first. Credentials are never printed or uploaded by the command.

For a client without supported CIMD, use `--kind=public --name=ClientName --redirect-uri=<exact-client-callback> --application-type=web|native`. Obtain the exact callback from that client. This creates a public PKCE registration without a shared client secret. It does not authorize a project; the owner consent screen is still required.

Configure Core's `BOB_CORE_OAUTH_ISSUER` as the canonical Web origin plus `/api/auth`, `BOB_CORE_OAUTH_RESOURCE` as the canonical `/mcp/linked` resource, and its private `BOB_CORE_OAUTH_INTROSPECTION_CLIENT_ID` and `BOB_CORE_OAUTH_INTROSPECTION_CLIENT_SECRET`. Enable `BOB_CORE_OAUTH_ENABLED` only after the paired configuration, reviewed migration and staging acceptance pass. Never expose verifier credentials to browser JavaScript or MCP clients.

Core normalizes the configured URLs before exact issuer/audience comparison. Each syntactically valid bearer attempt reserves a shared PostgreSQL verification slot before contacting Web (200/minute per owner across instances), even if ordinary credential limits are disabled. This mandatory bucket prevents invalid-token floods from exhausting Web's 600/minute introspection capacity. Exhaustion returns 429/Retry-After; unavailable capacity returns 503 without introspection. Verified grants retain their separate configured operation limit. Treat sustained 429 responses as capacity/abuse signals; changing token or forwarding headers does not reset capacity.

## Acceptance and rollout

The executable drill creates disposable databases only on the explicitly guarded recovery branch, uses generated synthetic credentials, applies reviewed migrations, and removes only its own fixtures. From Core:

```sh
BOB_TEST_BRANCH_ID=<isolated-approved-branch> \
BOB_TEST_ADMIN_URL_FILE=/owner-secure/isolated-database-url \
node --import tsx scripts/check-oauth-postgres.mjs --browser
```

The browser mode starts local Core and Web and an independent synthetic MCP client. Auth traces are off. It tests setup-password and virtual-passkey continuation, project selection, Personal exclusion, CSRF, generic-consent denial, approval, decline, actual token exchange and project revocation. It is not evidence of a real owner's passkey, physical iPhone or external product connection.

The protocol drill covers concurrent grant replay/conflicts, signed-query tampering, PKCE mismatch and concurrent code consumption, expiry, incorrect resource, missing scopes, refresh scope escalation/replay, standard token revocation and owner grant revocation. The recovery drill seeds actual OAuth rows and verifies restore/owner recovery clear tokens and revoke grants. Source timestamps, coverage and deployment status belong in the release ledger.

Before production activation: review migration 007 and database privileges, retain an encrypted pre-migration backup, complete the permanent owner origin/passkey/recovery ceremony, provision the resource verifier, validate both metadata routes over public HTTPS, and independently connect each real client. Legacy primary-token rotation stays gated. Disable the two OAuth flags to roll back the new connection boundary; do not remove the schema or alter existing bearer clients during rollback.

Database restoration disables copied OAuth clients, revokes copied project grants and clears access/refresh tokens, consents, sessions and verification records. Provision new instance-specific clients and secrets before exposing a recovered deployment. Company exports exclude every authentication/token/grant table and recreate project connections independently.
