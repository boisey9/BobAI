# Actual local memory-continuity drill

Accepted predecessor: 76-file requirements checkpoint, task-3/REVIEW-PRIVATE-TESTING-REQUIREMENTS.md. Preserved unchanged. This follow-on verifies approved preservation against existing implementation; it does not accept candidate, select validator, activate hosting or turn local receipts into trusted external evidence.

## Exact implementation boundary

Five new scripts only: local-memory-transport.mjs, check-local-memory-continuity.mjs, local-memory-crash-fixture.mjs, local-memory-cold-read.mjs, run-isolated-memory-continuity.mjs. Original context/service, context/neon-store, memory/service, memory/neon-store and migrations are unchanged. Drill adapts existing check-continuity-postgres.mjs without changing its original Neon-branch contract. Existing real Neon driver executes store SQL: its fetchFunction is replaced only inside an explicit synthetic process with a strict exact-target HTTP-result adapter backed by the real driver's PostgreSQL wire Pool. No hosted fetch is performed. Request results use actual PostgreSQL rows/types, not mocked data. Single-query adapter refuses batches; no claim of complete Neon HTTP endpoint compatibility. Existing loopback WebSocket proxy forwards to a fresh private Unix socket. Normal runtime never imports these scripts.

Owned fresh PostgreSQL17.11 cluster, no production data/clone; env sanitized; explicit installed binary; fixture credentials synthetic; fsync on; listen_addresses empty; private socket0700. Runner checks settings initially and after cold restart, refuses occupied loopback3434, terminates only its children, stops cluster and preserves receipts/data. Synthetic admin is used to seed/drill existing application owner filtering; this does NOT prove deployed database roles/RLS or authorization at HTTP/UI boundary.

## Actual checks

1. Twelve identical concurrent task creates: one task/event, original receipt; conflicting payload rejected.
2. Two concurrent optimistic updates: one success, stale version rejected; stable IDs and monotonic versions.
3. Fresh service replay returns original v1 response rather than latest task state.
4. Failure before receipt commit rolls back task and event.
5. Separate child SIGKILL immediately after actual transaction commit: replacement-client identical retry produces one task/event/receipt.
6. Real memory store filters owner/project/Personal/sensitive/pending/other-project records. Two-project and Personal context reads, missing and foreign project denial.
7. Baseline preserved independently of long unrelated phrasing; stable bounded context revision.
8. Bounded20 task and6 memory context, explicit truncated/partial flags with excess real rows.
9. Actual active decision returned, superseded omitted; proposal produces review work without active decision. Returned authority rule says active decisions outrank stale context; this does not test model obedience.
10. Handoff persists independently.
11. No-memory dependency explicitly unavailable; decision-source outage is a clearly injected method failure over otherwise real service/store, resulting unavailable/partial/empty rather than invented data.
12. Actual database stop/restart plus fresh Node process retrieves same memory/task/handoff/decision IDs; memory content and lost-response task survive.

## Receipts and limits

Final owned root is recorded in workflow-validation/memory-runner.json. JSON contains fourteen assertion groups and cold-restart comparison. Prior failures retained: synthetic endpoint spelling; harness wrong proposal parameter; cold restart omitted socket/TCP-off options. That failed owned cluster briefly used default loopback5432 and /tmp socket, then was stopped; no hosted connection/data or live configuration touched. Final runner applies and asserts private options on both starts. Failure logs are diagnostics, not passing acceptance.

No Core/Web runtime changes, migrations on shared targets, new credentials, plugin writes, grant changes, commit/push/deploy or validator certification. Legacy memory scopes are not tightened or reinterpreted. Existing memory search/admin APIs and owner auth boundaries are not exhaustively end-to-end tested here; cross-project project-context filtering is tested, not a claim of every API/cache surface isolation. Cold restart covers persisted synthetic context, not power-loss/crash recovery of the PostgreSQL server, production restore custody or all provider behaviors.

## Next gate

Independent review of exact scripts/receipts and memory transport boundary. Only after acceptance, update the versioned required-check catalog to point at this drill; predecessor still truthfully marks the old missing procedure unavailable. Actual validator identity/key/report source, independent candidate review and owner final walkthrough remain separate. No additional owner preservation-requirements approval is needed.

## Independent P2 cleanup correction

Original finding retained under review/pre-cleanup-fix/REVIEW-MEMORY-CONTINUITY.md with original runner/manifest/patch/pass receipts. Original finally awaited a newly attached close listener after an already-exited proxy, skipping database stop. Corrected helper tracks child lifecycle immediately, checks exited/error state, rejects early exit/readiness timeout, bounds SIGTERM then SIGKILL, and attempts database shutdown independently even when child termination fails. PG start/stop invocations have15s timeout; a start attempt marks cleanup responsibility before execution, avoiding uncertain-start omission. Cleanup failure reports AggregateError, not a false guarantee that an OS-unresponsive process was stopped.

Eight bounded child regression cases pass, including already-closed, before-readiness exit, failed executable, concurrent exit, resistant child, readiness timeout, unsettled child timeout and dual cleanup errors. Additional actual PostgreSQL acceptance reuses only the newly stopped marked synthetic cluster: already-exited, failed-start and child-timeout paths each reach actual pg_ctl shutdown, then pg_ctl status confirms stopped. Full14-group continuity/cold restart drill rerun against corrected final runner. No owned final proxy/PG remains; actual fixture records retained. Syntax checks cover all eight new scripts/helper/test files.
