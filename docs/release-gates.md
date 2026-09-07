# Dependable Bob release gates

Updated September 7, 2026 (Toronto). This is the acceptance ledger for the approved five-stage plan. “Implemented” means repository code exists; it does not mean deployed or accepted by the owner.

| Stage | Implemented in the current branch | Remaining gate |
| --- | --- | --- |
| 1: continuity | SQL-filtered baseline memory, Personal workspace, shared chat/context assembly, transactional receipts/audit, stable task IDs/versions, REST capture/update, handoffs, stale-state reconciliation | PR #41 and migration 003 live; production owner-browser, physical iPhone and independent client acceptance remain tracked |
| 2: dependable access | Feature-gated Better Auth passkeys, durable owner sessions/revocation, offline owner bootstrap/recovery command, dependency readiness, bounded provider retries/abort deadline; recovery branch adds encrypted backup/restore and credential limits | Real owner passkeys, project OAuth/PKCE, device grants, legacy retirement, nightly backup activation/key custody, request-limit release, usage/budget controls |
| 3: everyday experience | Workspace-aware Web conversation and iPhone conversation isolation; Core task mutation API | Today, direct task UI, protected offline outbox, EventKit, permission/freshness handling, memory review, reviewed Apple execution and physical iPhone acceptance |
| 4: proactive follow-through | Detailed product/data/acceptance contracts and tracked tasks | QStash jobs/outbox, APNs/inbox, briefs/reminders, integrations, playbook, independent client acceptance and two-week pilot |
| 5: company pilot | Deployment/data-boundary and IT/VARS contract | Separate company infrastructure, owner-selected export/import, isolated migration drill, Entra/tenant approval and controlled cutover |

## Evidence collected

- Final local Core verification: 113 tests across 23 files, TypeScript checks, and all three bootstrap dry-runs passed. Web production build/typecheck and the six changed Swift files' syntax parse passed; GitHub macOS CI passed Debug/Release builds and simulator launch on `94d2ab9`.

- An isolated Neon PostgreSQL 18 branch was created from the production parent with 0.25 CU and five-minute suspension. These tests did not change production; migration 003 was separately released on September 7 after backup and review.
- Actual PostgreSQL checks exercised twelve concurrent identical task requests, one task/audit outcome, conflicting payload rejection, competing task versions, rollback after a forced pre-receipt exception, saved-response replay through a new store instance, owner/workspace/privacy filtering, long-task baseline memory, context revisions, and separate handoffs.
- The rollback check forces a pre-receipt transaction exception. A separate child was killed with SIGKILL after commit before returning its task result; a replacement authorized client replayed the saved response, with exactly one task, audit event and receipt verified in PostgreSQL.
- Owner authentication checks exercised sole-owner signup restriction, origin rejection, durable login, required user verification for a registration challenge, unauthenticated enrollment denial, and immediate revocation after constructing a new auth instance.
- The offline recovery command was exercised against the synthetic owner: all prior sessions were revoked, its generated temporary password successfully authenticated, and the private artifact was removed. This does not satisfy the separate full-database restoration gate.
- Browser automation exercised a virtual authenticator for enrollment/sign-in, two independent sessions and revocation, CSRF rejection, project/Personal conversation isolation, a real pending approval transaction in PostgreSQL, and native sign-out. It is not evidence of a physical iPhone passkey ceremony, voice, accessibility, or notification delivery.
- Bob Core Codex context and scoped create/update/event/proposal operations succeeded live with the existing dedicated credential. Other clients require independent acceptance.
- The live BobAI duplicate-title audit found no candidates among the reviewed active/completed task states; nothing was deleted.
- The FOMOflow bootstrap merge is present in BobAI main at `51d836c82f0a00b31ee74ba6b4753cc3bfad9c74`. Its local bundle dry-run passes. Import, owner visibility, credential provisioning, and isolation are still separate gates.
- The older credential policy reconciliation was approved by the owner in Control Center on September 7 at 11:12:02 UTC and is now active. It was not activated by an interface.

- Protected Vercel staging is deployed at [Bob staging](https://bob-staging-erikboisvert9.vercel.app), backed by the separate Neon branch `br-green-resonance-ayvz8l7o`. Branch-specific secrets isolate synthetic project data and fresh credentials from production. The provided sole-owner email is configured; no email was sent.
- Deployed Core exercised concurrent capture, response replay/conflicts, task version rejection, project denial of Personal context, MCP task-ID discovery and honest dependency readiness. Deployed Web passed durable setup login, virtual passkey enrollment/sign-in, cross-browser session revocation, CSRF denial, owner approval and workspace conversation clearing. Synthetic passkeys were removed after acceptance.
- One staging Z.AI request received provider code 1305/HTTP 429, attempted the bounded fallback and returned 502 in 15.7 seconds. A later request succeeded with server-assembled context. This establishes observable failure/recovery behavior, not the two-week reliability target.

## September 7 release and recovery evidence

- PR #41 merged as `1e51a5a`. Final `64b614f` Core/Web/iOS CI passed. Core and Web are deployed in production, migration 003 is applied, and live Codex context contains six approved baseline memories. Web health passed; production owner-browser and physical-device checks remain distinct from the protected staging acceptance.
- Private storage holds the encrypted pre-release archive. Its downloaded ciphertext matched, decryption authenticated, all six original table counts and foreign keys matched in an empty isolated destination, and restored context/task replay worked after credential revocation.
- The reusable recovery branch passes 124 Core tests and an actual PostgreSQL 18 drill on isolated branch `br-solitary-wind-ay86swt0`: 16 tables restored in six seconds, concurrent writes excluded consistently, corruption rejected, nonempty destination unchanged, copied sessions/grants revoked, and task receipt replay/versioned update accepted. Total fixture/restore/runtime validation took twenty seconds; this is not a complete deployment RTO measurement.
- Twelve concurrent calls through two credential-limiter instances admitted exactly the configured four. Other credentials and the separate AI bucket retained capacity, and the next minute reset the bucket.
- Nightly credentials/environment, retention execution against stored artifacts, production auth recovery and complete RPO/RTO acceptance remain open. The backup workflow is opt-in and backup readiness remains unconfigured until activation. The private recovery identity stays outside Git and deployment infrastructure.

## Pilot measurement

Use a privacy-safe operation ledger with operation class, credential ID, timestamps, outcome, and dependency failure code; omit payload content. Count a retried logical operation once by operation ID. Separate user validation/conflict errors from service failures and publish the denominator with each success rate.

Measure foreground acknowledgement-to-visible-state latency across iPhone/Web/Codex; target at most five seconds under healthy connectivity. Measure scheduled UTC dispatch time to server attempt, not notification display; target at most two minutes with healthy dependencies. Record scheduled/attempted/provider-accepted/device-acknowledged/failed separately.

For fourteen consecutive local days record brief usefulness, capture persistence, cross-interface resumption, reminder correctness, Apple snapshot freshness, notification permission state, provider fallback, and daily cost. A missed day or unresolved data-loss/isolation issue does not count as completing the pilot. Store operational evidence, not private calendar content, in the ledger.

## Required failures and edge cases

Before release, cover concurrent/replayed/conflicting operations; stale versions; owner/project/company isolation; active-decision precedence; pending-memory non-authority; expired/revoked/wrong-audience/underscoped OAuth; device termination and reconnect; Apple denial/revocation/stale/recurring/all-day/timezone cases; reminder cancellation/reschedule/retry/downtime/DST/notification denial; physical iPhone voice/playback/pairing/accessibility; browser approvals/task/recovery flows; encrypted restore and selective company import.

Each accepted release updates this ledger, its detailed change record, `implementation.md`, and the corresponding Bob Core task/event. Do not close a stage merely because its build is green.
