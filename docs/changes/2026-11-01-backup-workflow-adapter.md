# Default-off private-file backup workflow adapter

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; default-off; no operational activation.** Branch `codex/backup-workflow-adapter`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`. Earlier uncommitted dashboard, recovery and client-readiness changes are preserved. This slice does not publish or deploy them.

Same-day successor: the [same-snapshot integrity integration](2026-11-01-backup-integrity-evidence.md) completes the next local task on `codex/backup-integrity-evidence`, with independent review, 1,133 passing Core tests and actual synthetic PostgreSQL 17/18 acceptance. The adapter's historical next-task and three-object counts/coverage limitations below describe its original boundary. The successor retains three objects using a mandatory integrity block in encrypted manifest v2 and corrects transient liveness-probe handling; it does not activate a workflow or close operational recovery gates.

## Objective and scope

Implement the next adapter slice from the [testing-first activation/recovery packet](2026-10-30-backup-activation-recovery-packet.md#disabled-plan-and-workflow-adapter-specification) to make the existing guarded exporter usable by a future approved runner. Reuse its strict source/schema/project/role validation, held capture snapshot, separate ledger credential and storage readback. No database, storage, provider or Production endpoint is used by adapter acceptance.

The scheduled workflow, schedule variable, Vercel deployment guards, migrations, grants and credentials remain unchanged. No enabled operator plan is created. No backup is captured or uploaded by this task, no restore target is started, and no retention or synchronization write occurs. The previously approved ChatGPT OAuth connection remains a separate milestone; Acer and Jarvis remain deferred.

## Implementation and inputs

The new [entry point](../../Core/scripts/run-backup-workflow.mjs) accepts **no command-line arguments**. The [adapter](../../Core/scripts/lib/backup-workflow.mjs) reads execution-step inputs, validates them, materializes private files, invokes the fixed existing exporter and owns cleanup. It does not install dependencies or discover credentials.

| Execution-step input | Contract |
| --- | --- |
| `BOB_BACKUP_ADAPTER_ENABLED` | Exact string `true` required; absent/other values refuse before filesystem/executable work. The existing plan and capture `enabled` gates must also pass. |
| `BOB_BACKUP_PLAN_JSON` | Reviewed JSON, maximum 16 KiB in UTF-8 bytes. Existing `validateBackupJobPlan` remains authoritative; only a public age recipient is accepted. |
| `BOB_BACKUP_CAPTURE_DATABASE_URL` | Maximum 8 KiB; must match the reviewed direct host/database/capture role. |
| `BOB_BACKUP_LEDGER_DATABASE_URL` | Maximum 8 KiB; must match the same reviewed database and a distinct ledger role. |
| `RUNNER_TEMP` | Explicit canonical absolute directory outside this checkout, owned by the current POSIX user and not writable by group/others. A label/path does not attest the remote database environment. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Existing exporter supports a static pair. This adapter refuses a supplied `AWS_SESSION_TOKEN`; temporary-session support remains unimplemented. |
| Optional `BOB_PG_DUMP_BIN`, `BOB_AGE_BIN` | Absolute operator-reviewed executable paths; omission retains the exporter's PATH lookup. Version/digest pinning is still required before workflow activation. |

Plan retention must remain **false** for this first adapter. Refusal is explicit; the wrapper does not silently change a reviewed plan or activate list/delete access. Plan labels and synthetic URL validation do not prove isolated testing or safe Production authority.

After all inputs validate, the adapter creates one unpredictable owned directory (`0700`) and exclusive regular files (`0600`) below the canonical runner temp path. It reuses `readPrivateBackupInput` for file ownership, symlink and size validation. The child command contains only the fixed exporter path and `--plan-file`, `--capture-url-file`, `--ledger-url-file` paths. The URLs and plan variables are not inherited by the child; neither are provider/Core credentials, `NODE_OPTIONS`, private identities or PostgreSQL overrides. Only minimal locale/PATH settings, the static storage pair, reviewed tool paths and the owned `TMPDIR` are passed. The exporter necessarily reads both database credentials in its own process; database-role separation is not process isolation.

Secrets must be supplied only to the execution step, never dependency installation, logs, shell interpolation, caches or artifacts. The existing scheduled workflow still invokes the exporter without its required arguments; toggling its legacy flag is not sufficient to run this adapter. Wiring, pinned tool/container versions and a reviewed ephemeral runner are a subsequent authorized activation change.

## Interruption, diagnostics and recovery limits

The exporter emits a safe `backup.started` UUID/timestamp before capture, ledger or storage work. [Process supervision](../../Core/scripts/lib/backup-exporter-process.mjs) bounds and validates child output, retains that identity for reconciliation, and does not forward arbitrary stdout/stderr. Completion requires a matching valid terminal record and successful exit. The adapter reports success only after process supervision and owned-file cleanup finish.

The exporter runs in an owned POSIX process group. Catchable cancellation, timeout, malformed output and abnormal exit trigger bounded shutdown including descendants, rather than leaving `pg_dump` or `age` running. Owned input and exporter temporary directories are removed after supervised work. Cleanup failure remains a failure with the run UUID where known; it cannot produce a success-only report. SIGINT/SIGTERM/SIGHUP are handled by the entry point. Unsupported platforms refuse before execution.

A denied termination signal or persistently unconfirmed process-group state is reported as `exporter_shutdown_failed`, including during cancellation. The same-day integrity successor corrects transient macOS liveness-probe `EPERM`: it remains unknown and is retried within existing deadlines, with only `ESRCH` confirming absence. The operator must hold retries and dispose of the isolated runner when termination cannot be confirmed. SIGKILL, host loss and process escape cannot be made recoverable by JavaScript signal handlers. Use a reviewed **ephemeral runner destroyed after every run**, including interrupted runs, before activation. The adapter never sweeps directories from other runs; synthetic residual-file acceptance verifies this boundary. Operator reconciliation and runner disposal remain required after uncatchable termination. No claim of secure physical erasure is made.

A failed/interrupted invocation may have reached an ambiguous ledger or storage outcome. Preserve its emitted UUID and follow the packet's [failure reconciliation](2026-10-30-backup-activation-recovery-packet.md#failure-reconciliation-and-rollback); do not blindly rerun, overwrite or delete objects. The adapter adds no resumable exactly-once protocol, upload authority or automatic credential fallback.

## Validation

Final validation passed on Node 24:

- Full Core Vitest run with four workers: **977 passed, 123 gated tests skipped**, across 66 passing and seven skipped files. The skipped database/hosted cases were not activated or counted as accepted.
- Four focused input-adapter/existing backup suites: **117 passed**; separate process-supervisor acceptance: **31 passed**.
- Core TypeScript checking, **eight** existing owned-child lifecycle checks and **three** bootstrap import dry runs passed.
- Independent source review found no remaining substantive findings after corrections. Final whitespace/conflict checks, **96 local links/anchors across seven documents**, four Node 24 script syntax checks and protected-file scope checks passed.

New acceptance uses synthetic inputs, injected transports and local child-process fixtures only. The initial combined run found two older fixtures using noncanonical macOS temporary paths; they now canonicalize their own created directories while the production no-symlink rule is unchanged. Review corrected late-cancellation masking of an unconfirmed shutdown and added its regression check, alongside cleanup-failure acceptance. Synthetic process startup allowance increased from two to ten seconds after contention; the explicit timeout case and production execution/shutdown limits are unchanged.

A sandbox diagnostic reproduced intermittent `EPERM` for owned process-group shutdown. Fail-closed handling is retained. Final process and full-suite acceptance used explicitly permitted local process-group signaling with the test environment restricted to `PATH`, `HOME`, `TMPDIR`, `LANG` and `LC_ALL`; no service credentials were inherited. No persistent permission changed. Existing real-database/export/restore evidence retains its original date and was not rerun. No Production backup, real database, storage upload or remote mutation is part of these checks.

Implementation scope: three new scripts (`run-backup-workflow.mjs`, `lib/backup-workflow.mjs`, `lib/backup-exporter-process.mjs`), two new test files, the exporter's awaited safe start record, and canonical temporary-path corrections in two existing tests. The recovery/release runbooks, activation packet and implementation index link this change. Earlier dashboard/client changes remain separately documented. `.github/`, `.codex/`, Core/Web Vercel guards and `Core/migrations/` have no diff from HEAD.

## Remaining readiness gates and exact next task

1. Independently review and integrate the encrypted **same-snapshot supplemental content-fingerprint/full-constraint evidence** and its artifact binding. The current standard three-object exporter still records counts/coverage; this adapter does not close the stronger integrity-evidence gap.
2. Bind an owner-approved isolated source/restore/storage destination, exact capture/ledger/storage authority, and pinned ephemeral runner/tools. Separately authorize synthetic hosted transport, download and restore acceptance before schedule activation. Keep retention off until its separate authority and behavior are accepted.
3. Select an independent off-device recovery destination and restore the current complete bundle with the owner's independent current-key copy. The October31 Mac/Docker drill and current key-existence attestation do not close this gate; the owner currently has no separate destination.
4. Complete canonical effective-configuration/rollback parity, immutable release candidate review, owner/client lifecycle and full hosted recovery acceptance before a separately authorized Vercel release. The plugin installation does not deploy Core/Web or verify recurring protection.

**Exact next local implementation task:** add same-snapshot supplemental integrity evidence and bind it to the encrypted bundle and receipt, using the reviewed manual drill as evidence; independently test tampering, mismatched snapshots and missing artifacts before changing hosted workflow wiring. Retain the existing strict capture/ledger boundary and default-off behavior. Operational activation remains a separate gate.

## Pending local checkpoint

Preflight returned correct BobAI UUID/repository and `codex` surface at `2026-11-01T14:35:48.490Z`, revision `ba34954ebe811da43d14a1c9201a893a5cfbf591e25a55f3cc92aa12d919dd32`. All sources were available; events/memories truncated, `partial=true`, tasks dated September9 and handoff October23. The new November1 OAuth grant audit event is visible; older project records are not a current account of this local work.

Outcome: the default-off private-file adapter and bounded exporter supervision are implemented, independently reviewed and locally validated (977 full-suite passes; 123 gated skips). No operational backup, transport, recurring protection or release acceptance is claimed. Remaining work is the supplemental integrity-evidence slice and the recovery/activation gates above. No event/task/handoff was written to BobCore. Future synchronization requires current identity/scope/version verification, a retained operation ID, confirmed receipt and appropriate readback under explicit authorization.
