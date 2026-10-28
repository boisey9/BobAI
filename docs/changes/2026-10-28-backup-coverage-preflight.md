# Backup coverage preflight and authentication-isolation reconciliation

Date: 2026-10-28 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **local implementation and synthetic acceptance complete; Production backup authority and recurring protection remain unresolved.** Branch: `codex/reconcile-backup-coverage`, based on `7817de4712c5c1b44e772aaeb2893f6a8beb679a`. Changes remain uncommitted and unpublished. This succeeds the [manual encrypted backup and Docker recovery task](2026-10-28-encrypted-backup-docker-restore.md).

## Scope and authority

The owner authorized the next local recovery task. This slice adds a standalone, default-off, read-only coverage check, isolated tests and a proposed least-privilege design. It does not grant backup authority or activate a job. Acer/Jarvis remain deferred; Vercel, Neon and BobCore retain their existing roles.

Fresh BobCore retrieval returned authority `bob-core` version `0.2`, project `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, requesting surface `codex`. Revision: `6dee4afc8082b342786b89b4d63f511575e2b5854a53850b4932ec768e8be84c`; generated `2026-10-28T16:35:19.182Z`, source check `2026-10-28T16:35:19.014Z`. All five sources were available; `partial=true`, events/memories truncated. Tasks remain dated September 9 and the latest handoff October 23. No explicit environment/credential-binding field was returned. The retired staging connector was not used. Matching project identity is evidence of the read; incomplete/dated context does not establish complete Production client acceptance.

The related task is `b22684f4-6041-46a0-9c9d-cda955a8d21a`, **Complete owner access, recovery and operational reliability**, observed version `7`, `in_progress`. Newer owner instructions and dated implementation/operational evidence supersede its stale pending-auth claims without silently updating that task.

No Production database connection, export, write, migration, role/grant/credential change, deployment, upload, scheduler activation, push, PR, merge or BobCore synchronization write occurred in this slice. Local test roles and data existed only in a newly created disposable PostgreSQL cluster. No existing recovery key was accessed, generated or rotated. A synthetic encryption key was created for the fixture and removed afterward.

## Verified foundation and reuse

| Evidence | Finding and implication |
| --- | --- |
| October 28 manual backup/restore record | A real encrypted snapshot restored all 24 current tables, 236 constraints and 25 foreign keys; copied-access quarantine, actual owner recovery/login/revocation and selected Core continuity passed. This is dated operational evidence from the preceding task, not a new run here. |
| October 23 authentication-isolation correction | `bob_backup_personal` deliberately cannot read 14 auth/OAuth tables. The existing role's successful authentication does not establish complete backup coverage. Do not undo that boundary as an automatic fix. |
| Existing backup implementation | [Bundle/inventory helper](../../Core/scripts/lib/backup.mjs), [unattended runner](../../Core/scripts/backup-database.mjs), [role provisioner](../../Core/scripts/lib/backup-role.mjs), [restore operator](../../Core/scripts/restore-database.mjs) and [workflow](../../.github/workflows/backups.yml) remain unchanged. The provisioner still contains broad public-table/default grants and must not be rerun as the solution to this gap. |
| October 19 candidate | Selectively reused catalog-inspection concepts from `bobcore-production-recovery-local-20261019/source/Core/scripts/lib/backup-coverage.mjs`, SHA-256 `eb2811fce6b98b4168c8521a2dca6a197851b18bee4a386a2cd7d7cc9ed7b57e`, and its tests. The saved candidate is local source evidence, not deployed acceptance. |
| New safeguards | Empty catalogs fail; schema fingerprints include columns/types/defaults and view definitions; explicit source/project binding precedes acceptance. The old grant planner, alternate capture profiles and approved-bypass strategy were not imported. |

The five pre-existing dirty documentation files were preserved. This task edits three of those indexes/runbooks and adds its own record; the two earlier October 28 change records remain byte-for-byte intact. Baseline copies/hashes are under `/private/tmp/bob-backup-coverage-20261028-w2xf2q9c/`.

## Implemented contract

The new [operator CLI](../../Core/scripts/check-backup-coverage.mjs) is not imported by an application or scheduled workflow. Without an explicitly enabled private plan it exits nonzero with `backup.coverage.refused` / `disabled`, before reading a connection file or constructing a pool. No active plan or credential file was created.

An enabled version-1 plan must name the environment, exact direct host/port/database/backup role, PostgreSQL major, BobAI project key/UUID/owner/repository, and reviewed schema SHA-256. Testing supports PostgreSQL 17 or 18; a Production-labelled plan requires 18. The environment label is operator-supplied: independent endpoint-to-environment verification remains required. Project UUID alone cannot distinguish a restored clone from its source.

Both input files must be absolute canonical paths outside the checkout, regular files owned by the executing user with no group/other permissions and bounded size. Symlinked paths, extra/override connection parameters, pooled hosts, mismatched identity and missing explicit TLS policy are rejected. Private files and their containing directories must remain under trusted operator control. Neither file belongs in Git, a browser, chat or a shared artifact.

The [preflight coordinator](../../Core/scripts/lib/backup-preflight.mjs) uses a dedicated connection and one `REPEATABLE READ READ ONLY` transaction, bounded statement/lock/idle timeouts, and explicit catalog search path. It checks database/user/server-major and BobAI UUID/owner/repository, then evaluates the complete user-relation catalog. Every successful or rejected begun check rolls back; unconfirmed rollback is a failure. Diagnostics expose stable codes, not raw driver errors, URLs, table rows, authentication hashes or schema expressions.

The [coverage inspector](../../Core/scripts/lib/backup-coverage.mjs) checks `pg_catalog`, including relations the role cannot read. It refuses:

- Missing schema usage or full relation SELECT, including grants on only some columns.
- Elevated role attributes, database ownership/CREATE, role membership, relation ownership/schema CREATE, and table/column writes. The only compatibility exception is INSERT/UPDATE on `public.bob_backup_runs`; it does not permit a preflight write or authorize future use of that exception.
- Any enabled/forced/active RLS, even if the current query happens to see some or all rows. No BYPASSRLS or row-policy alteration is attempted.
- Empty table inventories, unreviewed schema fingerprints, partitions, materialized views, foreign tables and large objects.

Ordinary tables, sequences with SELECT only, and ordinary view definitions are represented. The digest pins relation names/kinds, columns/positions/types/nullability/defaults/identity/generated attributes, view definitions, partition and RLS flags. It deliberately excludes read grants so a permission repair cannot approve schema drift. Schema fingerprint review and access review are separate steps.

A success returns `backup.coverage.checked`, the bound project/environment, schema digest and counts, `completeVisibility: true`, and **`backupVerified: false`**. It is a time-bound inspection result, not export authorization, a successful backup, a restore test, or reusable proof for a later connection.

### Explicit limits

- The preflight is standalone. The current unattended exporter still lacks this guard, and schedules remain disabled. A later integration must run identity/coverage checks and export in the **same held snapshot**, before ledger/upload/retention side effects; a prior CLI result is insufficient.
- That integration must also compare covered ordinary tables with the export/count inventory. The existing helper uses `NOT LIKE 'pg_%'`, whose underscore is a SQL wildcard; the inspector excludes the literal reserved `pg_` prefix. A valid schema such as `pgx` therefore needs an explicit parity test and reviewed correction before generalized export acceptance. The current observed public-only source and synthetic fixture do not exercise that edge case.
- The fingerprint is not a complete DDL/security audit: constraints, indexes, functions, triggers, custom types/extensions, object ACLs and role-management privileges need separate review. This inspector does not certify all possible executable-function or session privileges. It avoids row content but schema default/view expressions can be sensitive, so raw catalog objects must stay private.
- PostgreSQL sequences are not transactional row snapshots. Later export integration needs explicit sequence-state/high-water verification; the current Production observation has no sequences. View definitions carry no separate stored rows. Neither is claimed as a table-content fingerprint.
- Current actual catalog/export/restore regression ran on installed PostgreSQL **17.11**. Production is **18.6**. The preceding Docker drill establishes actual PostgreSQL 18.6 restoration, but does not execute this new preflight; repeat its cases on isolated 18.6 before operational adoption. The 18 requirement in a Production plan is a guard, not compatibility evidence.
- The private-file/URL CLI refusals and transaction logic are tested; authenticated Neon network transport for this new CLI has not been exercised. No Production preflight was run to turn a known access denial into an operational change.

## Proposed least-privilege authority — pending owner review

**Recommendation: preserve `bob_backup_personal` and every Core/Web auth boundary, and introduce a separately approved complete-capture principal.** The proposed name `bob_backup_complete_v1` is illustrative, not an existing credential. Keep its authority separate from application roles and from the operator's database-owner credential.

| Boundary | Proposed permission and control |
| --- | --- |
| Capture principal | CONNECT to the verified source; schema USAGE and SELECT on each explicitly reviewed table in the complete 24-table inventory. No role membership, superuser/BYPASSRLS/role creation/database creation/replication, ownership or application-row writes. No broad future-table default grants. New tables/schema/RLS changes stop coverage until separately reviewed. |
| Sensitive auth state | Explicitly authorize encrypted disaster capture of password/passkey/session/OAuth material. This is a security-policy decision: a complete reader can exfiltrate those rows if compromised, even though it cannot modify them. It cannot be inferred from ordinary project-memory access. |
| Execution host | Prefer an owner-controlled, isolated capture runner first. The database-owner credential never enters unattended CI. A later CI host needs a reviewed trust boundary, exact code/ref/environment restrictions and a separately approved revocable capture credential. No assertion of short-lived credentials until issuance/expiry behavior is verified. |
| Backup ledger | Separate the capture connection from a narrowly scoped operational ledger writer. The current runner uses one credential for capture and ledger writes, so this separation requires a small explicit refactor. Do not silently reuse a broader credential. |
| Storage and retention | Keep artifact creation/readback and destructive retention separately authorized. Verify the provider's actual bucket/prefix/permission capabilities before promising that split; use a different retention principal where supported. Existing storage credentials and objects stay unchanged. |
| Encryption and key custody | Encrypt locally before storage; the runner receives only the public age recipient. Keep the decryption key in owner custody, independently recoverable if this Mac fails. Verify the independent copy by decrypting a selected artifact without disclosing it to Codex. |
| Recovery | Restore into an isolated empty destination, compare complete data/relationships, quarantine all copied sessions/tokens/grants before accepting client access, exercise owner recovery and independent client reauthorization. Future device grants/leases must be invalidated; jobs must not auto-resume. |

A managed Neon protection path is an alternative only after its actual retention, complete-content recovery, independent access and measured restore behavior are verified. The previously observed six-hour history/unprotected branch and empty backup ledger are not equivalent to accepted off-device protection. The owner may choose that path; this proposal is not an active BobCore decision.

## Validation and cleanup

| Check | Result |
| --- | --- |
| Focused preflight/CLI suite | **47 passed**, including disabled-before-secret-access, private input/target rejection, schema drift, missing SELECT, role elevation, RLS, sanitized errors and rollback failure. Initial failures were test-fixture argument/assertion errors; corrected before final acceptance. |
| Real isolated PostgreSQL | **10 passed, zero skipped**, PostgreSQL 17.11, about 15.6 seconds for Vitest. All 14 deliberate denials were visible in the 24-table catalog; positive preflight preserved rows/ACLs/ledger; column/table/view changes, schema/RLS/write/membership/sequence/unsupported-storage guards and actual rollback passed. |
| Existing encrypted export and restore | The restricted full-reader fixture passed coverage, then reused `createEncryptedBundle` and its snapshot. An intervening synthetic task update was excluded consistently. Authenticated manifest/counts and all 24 restored table-content fingerprints matched an empty isolated destination. This is backup-helper integration evidence, not a new Production restore or an integration of preflight into the unattended runner. |
| Full Core check | **839 tests passed**, eight child-lifecycle checks and three bootstrap import dry runs passed; TypeScript passed. Default Vitest reports 116 skipped: the existing 106 gated cases plus the ten new PostgreSQL cases executed separately above. No skipped hosted case is relabelled as executed. |
| Web | No Web changes; its preceding October 28 type/build success remains dated evidence. No new browser or hosted acceptance is claimed. |
| Diff | `git diff --check`, whitespace checks including untracked sources, 59 local-link targets, exact twelve-path scope and preservation review passed. The two prior records are byte-identical; the existing exporter/bundle/provisioner/restore/workflow files are byte-identical to HEAD. No application runtime, configuration, migration, credential or deployment file changed. |

Reproduce the fixture with installed tools, no package installation:

```sh
# From Core/, with a clean Node 24 environment and installed PostgreSQL/age tools:
node node_modules/vitest/vitest.mjs run tests/backup-coverage.test.mjs
node scripts/run-isolated-backup-coverage.mjs --pg-bin=/absolute/installed/postgres/bin
```

The runner creates its own cluster with no TCP listener, host authentication rejected, a mode-0700 Unix socket, synthetic roles/data and filesystem sync enabled. It accepts no database URL or existing data directory and discards inherited service/database/provider credentials. The new tests additionally verify the runner ownership marker, data directory and disabled listener before mutation. This Mac uses `/usr/local/opt/postgresql@17/bin`; the fixture expects existing age tools at `/usr/local/bin`.

An initial sandboxed `initdb` attempt could not allocate shared memory and created no usable database. The authorized isolated runner succeeded outside that sandbox. Final receipts are `/private/tmp/bob-backup-coverage-run-hIf884/{vitest.json,cleanup.json}`; the full Core log is `/private/tmp/bob-backup-coverage-20261028-w2xf2q9c/core-check.log`. Cleanup stopped the owned cluster and removed its socket, synthetic archive/plaintext and synthetic recovery key. Nonsecret receipts and stopped synthetic database files remain for inspection. Docker and all existing containers/volumes were untouched in this slice. No immediate-erasure claim is made about OS memory/snapshots.

## Exact next implementation task and blockers

**Next task: review this capture-authority proposal, then integrate the coverage guard into the existing encrypted export snapshot and separate capture from ledger writes, while keeping activation default-off.** Proposed local branch: `codex/integrate-backup-coverage`. Add PostgreSQL 18.6 acceptance, covered/exported-table parity (including the `pgx` schema edge case), source/digest mismatch and mid-run schema/concurrency checks, and prove any coverage denial prevents ledger/upload/retention side effects. Reuse the existing archive/restore format and source-binding conventions. Do not add grants or create a credential as an incidental code change.

Operational steps remain blocked on the owner's explicit choice of capture authority and execution/storage boundary. After review, prepare the exact privilege diff for approval; then independently authorized operations can verify the selected off-device artifact through download/restoration, independent key custody, and a scheduled run with readback, retention and failure reporting. The new check does not make the existing scheduled credential complete.

Remaining blockers:

1. Current Production capture authority still intentionally excludes all 14 auth/OAuth tables. No role/schema/credential policy was changed or activated.
2. The owner confirmed an offline key copy for Bob Staging, but no established current BobCore copy. The older key has not been fingerprint-matched; do not count it or replace it on assumption. Current off-device artifact verification and independent key custody remain incomplete.
3. Recurring backup/ledger/retention/failure evidence and full hosted-service RPO/RTO are still unproven. Current target remains 24-hour RPO/two-hour service RTO; isolated tests do not establish them.
4. PostgreSQL 18.6 preflight/transport acceptance, independent source review, full owner/client OAuth/passkey/provider workflows, deployment-source reconciliation and explicit release authorization remain separate gates.
5. BobCore context is partial/dated and lacks explicit environment binding; repository checkpoints remain local. Correct project context does not authorize writes under the current local-only direction.

## Changed-file inventory

New: [CLI](../../Core/scripts/check-backup-coverage.mjs), [catalog inspector](../../Core/scripts/lib/backup-coverage.mjs), [transaction coordinator](../../Core/scripts/lib/backup-preflight.mjs), [isolated runner](../../Core/scripts/run-isolated-backup-coverage.mjs), [unit/CLI tests](../../Core/tests/backup-coverage.test.mjs), [PostgreSQL integration tests](../../Core/tests/backup-coverage-postgres.test.mjs), and this record.

Updated: [implementation index](../../implementation.md), [recovery runbook](../recovery.md), [release gates](../release-gates.md). Ten files changed in this slice. The two pre-existing untracked October 28 assessment/backup records remain preserved, yielding twelve dirty paths in the combined working tree. No commit or PR was created.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-28. Project: `bobai`, UUID `10000000-0000-4000-8000-000000000001`; surface `codex`. Stable operation ID: `3441afe0-9724-4acf-af5c-2487dc17b2fb`. Related task: `b22684f4-6041-46a0-9c9d-cda955a8d21a`, observed version `7`; refresh the expected version before any later task update.

Outcome: local branch `codex/reconcile-backup-coverage` selectively reuses the prior recovery candidate and adds a standalone default-off, source/project/schema-bound read-only catalog preflight. It refuses hidden auth tables, schema drift, filtered rows, excess authority and unsupported storage. Focused 47, isolated PostgreSQL 10, full Core 839, lifecycle eight and import dry-run three checks pass. Complete synthetic encrypted snapshot/24-table restore and owned-cluster cleanup passed. Documentation proposes a separate complete-capture reader, separate ledger/storage authority and independent key custody without approving or provisioning them.

Unresolved: deliberate current 14-table denial; no approved recurring capture design, off-device/current-key acceptance, schedule/retention/failure proof or full hosted RPO/RTO. New PostgreSQL 18.6 and hosted transport acceptance and independent review remain pending. Next: review the explicit authority proposal, integrate preflight in the existing export snapshot and separate ledger writes, default-off. No Production/database/credential/deployment change, upload, publication or synchronization occurred. The critical recovery task remains open. Reuse this operation ID only for identical content and verify a scoped receipt/readback before claiming synchronization.
