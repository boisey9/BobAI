# Owner-reviewed project account linking

## Outcome and scope

The feature branch adds a supported OAuth connection at `/mcp/linked`. The owner signs in, selects one project, reviews scopes, and can revoke the connection from Account. Personal is excluded. Existing dedicated bearer clients remain compatible. Production OAuth and owner-auth flags have not been activated, and migration 007 has not been applied to production.

## Implementation

Better Auth MCP/CIMD 1.7.3 owns protocol validation, signed redirects, PKCE S256, codes, opaque access tokens and rotating refresh tokens. Core introspects through a private verifier and independently checks issuer, audience, expiry, owner, user, client, project, scopes and a live grant. Caller identity headers are replaced by the verified binding; rate accounting survives token refresh.

An owner grant is created only inside the provider's verified-consent callback. It commits with its audit event and normalized operation fingerprint, and concurrent retries return one grant. Each flow uses an immutable grant reference. Generic consent/client mutation routes are unavailable. Native setup-password and passkey login retain the authorization request through consent; declining issues no grant.

The resource policy retains approved `offline_access`. Tests caught that omitting it from resource scopes removed it from saved refresh permissions and bypassed rotation. The corrected policy is covered by explicit replacement-token, old-token revocation and replay checks. Expired browser-session cleanup preserves independently approved offline renewal while revoking old session access tokens.

Migration 007 adds provider client/resource/token/consent tables and constrained project grants, with indexed owner/project/token references. The offline provisioning command reserves a private identity artifact before registration and supports confidential resource verifiers and public PKCE clients. It never uploads credentials. The owner recovery command now revokes OAuth grants/tokens as well as sessions; database restore additionally disables copied clients.

## Validation and limits

- Final Core typecheck, 137 regression tests across 29 files and three import dry-runs passed. Final Web production build/typecheck passed.
- Actual PostgreSQL protocol checks passed signed-query tampering, concurrent grant replay/conflicts, PKCE mismatch, one-time code use under concurrency, scope/audience/expiry denial, standard revocation, owner grant revocation, scope escalation and refresh replay rejection. Offline renewal after browser-session expiry passed without reviving its old access token.
- Local Core/Web browser automation passed native setup login, virtual passkey continuation, project selection, Personal exclusion, CSRF, direct-consent denial, approval, decline, real opaque token exchange and revocation. Final repeat also verifies offline renewal after sign-out before revoking the project grant.
- Encrypted recovery on isolated PostgreSQL 18 passed all 24 table counts, snapshot consistency, corruption/nonempty rejection, copied OAuth client/token/grant revocation, restored owner login and offline recovery revocation. Restore took nine seconds; complete fixture validation took twenty-eight seconds. This does not prove full deployment RPO/RTO.
- Final private client-provisioning checks passed for confidential verifiers and public PKCE clients: mode-0600 output, no plaintext stored client secret, no machine grant, and no secret in stdout/stderr. Final browser checks passed offline renewal after sign-out before project revocation; consent layout was visually inspected and corrected. No real owner passkey, ChatGPT/GitHub Copilot acceptance, production schema activation or primary-token retirement is claimed.

The separate database diagnostic protection from PR #44 is included locally; its exact main merge is awaiting owner approval after automatic approval review rejected that shared-branch mutation. Local HTTP staging avoids a separate rejected transfer of staging credentials to a new Vercel preview. Existing storage-credential creation/transfer approval is still pending; nightly backups remain disabled.

See [architecture decision](../adr/0001-project-oauth-boundary.md), [account-linking runbook](../account-linking.md), and [release ledger](../release-gates.md).
