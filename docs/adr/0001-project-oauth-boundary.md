# Project OAuth boundary

Status: implemented behind feature flags; production activation pending.

Bob needs supported account linking for clients whose authentication cannot use an arbitrary Codex bearer header. It also needs immediate project revocation, Personal isolation and owner-approved scope selection across simultaneous linking requests.

Use Better Auth's MCP provider for OAuth and PKCE, with opaque tokens and live server-to-server introspection. Bob owns a separate project-grant table. A grant ID becomes the immutable authorization reference; the Core gateway checks the live grant alongside protocol claims. Use the existing validated MCP registry and preserve compatibility endpoints during migration.

Opaque tokens provide effective standard access-token revocation without relying on JWT expiry or introducing a separate token denylist. This adds an authorization-server/database dependency on each linked request. Fail closed with a recoverable unavailable response, retain short deadlines, and measure that latency separately during the pilot. Ordinary bearer clients and deterministic task persistence retain their existing path.

Keep consent separate from identity authentication. The owner selects a project and permissions after the provider validates the signed request; a browser session's currently displayed project is never an authorization input. Approvals and audit events commit atomically with an operation fingerprint. Neither OAuth login nor an approved project connection activates a decision or memory proposal.

Restrict registration to provider-validated CIMD and offline owner provisioning. The browser cannot create arbitrary OAuth clients or bypass Bob's consent route. OAuth clients, tokens and project grants are excluded from company exports and invalidated during restore. Owner recovery revokes all existing project grants and sessions.

Operational setup, recovery and acceptance are documented in [account linking](../account-linking.md). Production owner passkeys and real external-client acceptance remain required before this replaces any compatibility credential.
