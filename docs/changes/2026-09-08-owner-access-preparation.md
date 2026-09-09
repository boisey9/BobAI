# Owner-access activation preparation

PR #44 is merged as `9833e22`; PR #45 is merged as `ed0716e`. Both Core and Web are READY on the latter exact source. PR #45's two review findings were fixed and passed 139 Core tests, final Core/Web CI, and repeated isolated PostgreSQL/provisioning/browser acceptance. Production owner authentication and OAuth remain disabled, with migrations 004 and 007 unapplied.

## Separate Web database authority

The owner-auth runtime receives a dedicated `bob_web_` role instead of the database owner or Core runtime credential. The provisioning command requires reviewed migrations 004/007, an absent role, and a new private output file outside the repository. It commits the role and explicit grants transactionally only after the credential artifact and its parent directory are synchronized. An uncertain COMMIT preserves the private artifact for reconciliation.

The role can manage the fourteen explicitly listed authentication/OAuth/grant tables, read project registrations, append audit events, and obtain the project row lock required by consent. PostgreSQL requires UPDATE on a column for `FOR SHARE`; only `bob_projects.updated_at` is granted. It cannot update project identity/status, read existing audit history, or directly access tasks, approved memories or operation receipts. Owner business operations continue through Web's separately protected server-only Core credential.

The role has no superuser, role/database creation, replication, row-security bypass or public-schema creation. Future auth tables require a reviewed grant update; no default blanket table grants are added. Its database access is still owner-service authority, not a project/device credential.

The isolated PostgreSQL acceptance now provisions this role through the actual operator command, verifies mode-0600 secret output and absence of printed credentials, refuses existing output/role names, and verifies the original credential remains usable. Direct task/memory/receipt/event reads, project-status changes/deletion and DDL are denied. The full provider/grant lifecycle and local browser flow use the restricted role, including consent row locks and append-only auditing.

Final local acceptance passed all 139 Core tests/import checks, actual PostgreSQL role provisioning/permission denial, protocol/refresh/receipt/concurrency checks, private OAuth client provisioning, and browser password/passkey continuation, consent/decline/CSRF, offline renewal and revocation. PR #46 source `61ae5b8` completed automated review with no findings; final head `b238139` passed Core/Web CI and merged as `cbb88db762082827eeb4a67614d9ab3eb0096ce2`. Core `bob-core-evox8x1ji-erikboisvert9-5389s-projects.vercel.app` and Web `bob-control-center-erikboisvert9-33dkdv0gw.vercel.app` are READY on that source. Production role creation and owner ceremony remain separate gates.

## Pre-migration recovery evidence

A fresh encrypted operator backup was created at `2026-09-09T02:21:16.255Z` (September 8 in Toronto), UUID `547a8509-d000-4ee1-9169-474b880ab76a`, 65,861 bytes. Its private local artifact and encrypted manifest restored into a new empty database on isolated recovery branch `br-solitary-wind-ay86swt0`: all ten production tables matched, foreign keys validated, and copied interface credentials were removed. Restore took five seconds. The copy is retained privately for migration acceptance; no production data was changed.

Local runtime acceptance of that restored copy also passed: six approved project baseline memories, project memory isolation, persisted task creation, identical operation replay, conflicting operation rejection, completion with the expected version, and stale-version rejection. It used a fresh temporary local Core credential; no restored interface credential was reused.

The dedicated nightly storage credential is not created. Automatic browser approval review requires action-time confirmation. A separate automatic approval rejection held the encrypted operator upload pending explicit data/destination approval. No upload, scheduler activation, scheduled-run success or complete RPO/RTO is claimed. The private age identity remains outside deployment infrastructure.

## Remaining activation gates

Finish the explicit storage approvals, private upload/read-back and scheduled runner acceptance. Apply the already reviewed additive auth migrations only after the pre-migration backup gate is accepted. Provision the dedicated Web role, bootstrap the supplied sole owner with a private recovery artifact, configure only production auth secrets, and verify real owner passkeys/session revocation on the permanent Web origin. Provision OAuth clients and independently test their real account-linking flows before legacy credential retirement. Stages 2–5 and the daily pilot remain open.
