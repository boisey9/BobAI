# Bob security model

## Authority and isolation

Authentication precedes project selection. The gateway strips caller-supplied internal identity headers and injects only verified identity, surface, project, and scopes. Normal engineering credentials are project-bound. Personal access is denied to those credentials, including unbound compatibility read credentials. The existing owner-wide Web exception requires the trusted Web surface and owner capability; it remains server-only.

SQL reads constrain owner/project/privacy/approval before ranking or limiting. Existing unassigned memories remain Personal. Context responses omit project credential metadata. Proposals and handoffs do not activate decisions; ordinary memory or conversation text never becomes an executable instruction.

## Owner authentication migration

Better Auth 1.7.3 with the passkey plugin provides WebAuthn validation and durable sessions. A database uniqueness constraint permits one owner per deployment. Public signup is disabled; the offline bootstrap command creates only the server-configured owner email. Email changes, account linking, and user deletion are disabled. The actual owner address and all secrets belong in deployment configuration, not source files.

Passkey registration requires an authenticated owner session and user verification. Sessions expire after twelve hours, are refreshed through Better Auth, and have no cookie session cache. Every protected request reads the session from PostgreSQL; revocation therefore takes effect on the next request. The account page can enroll another passkey, revoke other sessions, and sign out. More detailed passkey inventory/removal UI remains open.

When `BOB_AUTH_ENABLED=true`, legacy HMAC cookies do not authorize requests. Legacy password authentication remains available only while the new feature is disabled. Setup/recovery password login in Better Auth is controlled separately and defaults off. Do not retire any compatibility credential until passkeys, backup access, client replacement, and owner approval protections pass acceptance.

Existing owner approval/credential forms retain their session-bound HMAC CSRF token. Better Auth routes enforce their own origin/session protections. Native setup/recovery forms validate the configured canonical auth origin, never an untrusted forwarded host. `Referrer-Policy: same-origin` supports those forms while withholding referrers from other origins. Core credentials never reach client JavaScript.

Auth rate limits use PostgreSQL rather than process memory. Until trusted edge client-IP configuration is accepted, unresolved IPs deliberately share a restrictive bucket. This is appropriate to the single-owner bootstrap but is not a completed per-credential Core abuse-control system.

## Recovery and secrets

The offline owner recovery command uses privileged database access from the owner's secure environment, generates a temporary password into a new mode-0600 file outside the repository, replaces the credential password hash, and revokes all owner sessions in one transaction. It never prints a password. Transfer the recovery artifact to an owner-controlled secure store and remove the temporary file. This is an operator recovery procedure, not a public password-reset endpoint or a substitute for encrypted database backups.

Keep provider keys, database URLs, Core tokens, auth secrets, signing keys, APNs keys, and backup decryption keys outside Git. The backup decryption key must remain outside the deployment. Logs may contain safe outcome codes, timing, IDs, and source timestamps; never raw chats, tokens, calendar content, memory content, or private reasoning. Browser traces are off for authentication acceptance because traces can capture credentials and cookies.

## Open security gates

- Project-bound OAuth with PKCE, client-specific revocation, audience/expiry/scope denial and real ChatGPT linking.
- Owner-approved phone pairing, Keychain grants, project switching and independent revocation; the current phone still has its compatibility credential.
- Per-credential Core limits, durable usage/budget enforcement and spending alerts.
- Encrypted nightly logical backup, private storage, thirty-day retention, key custody and isolated restore drill.
- Full owner memory lifecycle, reviewed EventKit changes and permission-revocation cleanup.
- Independent company authentication/data/secrets/billing and approved selective migration.

Company Microsoft email remains disconnected pending IT/VARS approval. External messages and external data mutations require their own owner-approved workflow.
