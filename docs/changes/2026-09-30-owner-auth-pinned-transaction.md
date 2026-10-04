# Local owner authentication and pinned transaction successor

Preserves accepted directory/recovery checkpoint (base 78bf3d066977262d6c4b6142634e34a3707832f3, patch d185dfeac99bd8bc63a8dec6c0f9547c086be1a34b6a2fa3eb2015a36c27f1fd; independent review ../task-3/REVIEW-P2-REREVIEW.md). Original checkpoint remains frozen. No publication or live activation.

The new owner-access factory accepts the application's authoritative getSession API rather than client owner/project claims. It disables session-cookie caching, verifies explicit server-bound user/email/actor, verified email, expiry and revocation, then resolves only exact active project grants. Missing or malformed identity fails before project lookup. Directory results are bounded and independently scoped. No legacy owner-wide credential fallback.

The transaction factory requires an explicitly approved isolated Unix-socket target and exact configured database/login role. It verifies actual database, session/current role, socket connection and restricted role flags before BEGIN, pins one connection/backend, accepts only 18 exact reviewed parameterized application statements; rejects every other callback statement and taints the transaction even if the callback catches rejection, and rechecks authorization before COMMIT. Failed COMMIT acknowledgement is unconfirmed, never automatically retried. Immutable receipt reconciliation resolves it safely.

Synthetic fixtures exercise existing owner-auth migration 004, authoritative-shaped session records, scoped registry reads and a restricted isolated LOGIN role. They deliberately do not prove Better Auth signature/passkey authentication. Existing browser fixture now uses these adapters rather than a literal bearer-to-principal shortcut. No auth migration was changed or applied to a live database.

Remaining boundaries: production getSession API/request binding and registry instantiation are not mounted; Web-to-Core delegated identity must be explicitly specified before real use (a shared owner token is not promoted into verified session authority). Local fixture revalidation is synthetic and not a production request binding. Separate auth/database services cannot claim atomic revocation-versus-commit ordering merely from a precommit recheck; in-flight revocation policy/serialization requires security review. Hosted database targets remain unsupported by this factory, with no fallback.

Mandatory regression baseline, required checks, trusted evidence issuers, evidence/approval freshness and release authority remain unresolved and fail closed. Fixture policy is synthetic only. Release remains disabled; ordinary legacy tasks are unchanged. Native/calendar work and seven-day unfinished-draft follow-on are preserved and not implemented here.

Final source/test hashes and exact receipt outcomes are in review/selected-manifest.json and review/REVIEW-PACKET.md. Earlier failed assertions (wrong recovery and history projection fields) remain in workflow-validation/adapter-final.json; corrected receipts are distinct. No inferred final-release acceptance.


## Independent P2 boundary correction

Review task-3/REVIEW-AUTH-TRANSACTION.md found END and comment-prefixed COMMIT escaped the previous prefix filter. The old patch/manifest/review packet and independent findings are retained in review/pre-boundary-fix. This was a trusted callback contract defect; no inspected current service query or demonstrated client payload used it.

The corrected callback cannot submit arbitrary SQL: it may invoke only exact registered application statements, with values carried separately as parameters. Comments, aliases, CTEs, DO/CALL, multi-statements and session/role control are not registered and cannot be forwarded. A rejected/concurrent callback attempt taints the transaction so a swallowed exception cannot permit COMMIT. The adapter alone issues BEGIN/COMMIT/ROLLBACK. This is an application operation allowlist, not a general SQL sandbox. Trusted host code, the underlying pool/driver, registered statement bodies and database functions/triggers/schema remain security boundaries. Any statement or database-code change requires review; code with independent database access is outside this interface's guarantee.

Actual PostgreSQL regressions first insert through an allowed statement, then attempt END, commented COMMIT/END, ABORT, session authorization and multi-statement control; the callback catches denial and final authorization is configured to deny. They verify the entire transaction rolls back with zero packets, receipts and history. Existing revocation-before-commit rollback remains independently covered; normal parameterized service/browser operations and unknown actual COMMIT acknowledgement reconciliation remain covered.

The first new PG boundary receipt (postgres-boundary-final.json) failed six direct inserts before exercising control attempts because the fixture omitted required RLS owner/project context. Corrected tests use the registered parameterized set_config operation first; the failed receipt is retained. This is distinct from the independent original transaction-control defect.
