# BobCore testing-first backup activation and recovery packet

Date: 2026-10-30 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **packet prepared and independently reviewed locally; operational prerequisites remain open. Operational execution and Vercel cutover have not occurred.** Branch: `codex/backup-recovery-readiness`. Release candidate: `9536d6c24de090f4c4c2716cead64811107da3ab` (merged PR #49).

Current successor: the [November 1 testing authority/publication packet](2026-11-01-backup-testing-authority-packet.md) refreshes hosted resource metadata and distinguishes the published baseline from the still-unbound dormant/activation candidates. It identifies missing trusted recovery-anchor retention and an operator download entry point. The older JSON below remains a dated inert proposal; its `bobcore-testing` instance does not satisfy the later runner's `testing-` prefix. No current target, permission or activation should be inferred from that example. Original observations below retain their dates.

November 1 implementation follow-up: the [private-file workflow adapter](2026-11-01-backup-workflow-adapter.md) is now implemented, validated and independently reviewed locally, default-off (977 Core tests passed; 123 gated skips). The original packet below retains its October30 evidence date; its adapter-not-implemented wording and next-action statements are superseded only for that local code slice. Supplemental same-snapshot integrity evidence is the next local implementation task. No workflow activation, hosted transport, authority change or supplemental-integrity integration is implied.

## Objective and authorization

Later November1 update: the [integrated v2 integrity evidence](2026-11-01-backup-integrity-evidence.md) supersedes the original packet's supplemental-artifact dependency for **new v2 captures**. Content/constraint/nullability evidence now resides inside the existing encrypted manifest; no fourth object is added. Historical v1/manual artifacts retain their separately documented procedure. The [disabled testing-runner/download successor](2026-11-01-backup-testing-runner.md) prepares source-held manual wiring and downloaded-copy restoration; final local validation and independent review pass (1,240 Core tests, 123 gated skips; both 17-case PostgreSQL fixtures). It leaves the actual image and hosted source/restore/storage bindings unbound. Original stage/status wording below remains dated October30, not current acceptance.

The owner requested this packet and independent review, and expressed the intent to deploy the latest version on Vercel. This supersedes the earlier blanket deployment hold with a release objective; it does **not** waive the owner's existing requirement for verified backup/restoration before risky cutover, or authorize permission/credential changes, database migrations, backup uploads, schedule activation or reuse of retired staging. Complete the bounded preflight before a release. Keep automatic Git deployment guards and branch protections unchanged. Acer/Jarvis, hybrid execution, automatic routing and new providers remain outside this task.

This packet is the concrete successor to the [prepared readiness task](2026-10-30-backup-recovery-readiness-task.md). It distinguishes verified facts, proposed operations, and unresolved bindings. Its examples are **review material, not executable activation instructions**. The earlier task's historical no-deployment scope remains evidence of that earlier request only.

The owner now confirms an **owner-controlled offline copy of the current BobCore recovery key exists and would survive loss of this Mac**. Record this as owner-attested existence. No private key was read, transferred or requested. Successful decryption with that independent copy and recovery of the intended off-device artifact remain separate acceptance evidence.

## Verified inventory and evidence limits

Read-only observations in this packet were collected October 30, approximately 19:22–19:32 UTC. No grants, role changes, data writes, backups, storage mutations, deployments or alias changes were performed.

| Item | Verified observation | Consequence |
| --- | --- | --- |
| Source | GitHub `main` remains `9536d6c`; reviewed tree `456b73782890f90167d480848fb44d49da8eb148` | Release this immutable source, not the uncommitted documentation branch or an arbitrary latest deployment. |
| CI | [Core run 41100436022](https://github.com/boisey9/BobAI/actions/runs/41100436022) and [Web run 41100436036](https://github.com/boisey9/BobAI/actions/runs/41100436036) completed successfully on `9536d6c` | Source/build evidence; not hosted acceptance. |
| Vercel team | `team_VsUU9KUd8se5OrGvNQAGmUnJ` | Explicitly bind both release operations to this existing team. |
| Core project | `prj_XAZztFjDMPxdhRTWADjBaeCpoTEZ`, `bob-core`, root `Core`, Hono, Node `24.x` | Preserve project identity and current Production configuration. |
| Web project | `prj_j7CZ6MgNYfOFS9N16wBoQOIxVvF1`, `bob-control-center-erikboisvert9`, root `Web/`, Next.js, Node `24.x` | Extend/release the existing Web application. |
| Core canonical alias | `bob-core.vercel.app` → `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk` | Verified current Core rollback target. |
| Web canonical alias | `bob-control-center-erikboisvert9.vercel.app` → `dpl_CAkTAgNhXyySzQcqYqSxqt2Ny7PM` | Verified current Web rollback target. |
| Canonical health, follow-up check | Core `/health` and Web `/api/health` both returned HTTP200, `status:ok`, with the expected service names | Existing serving baseline responds; not proof that the candidate is deployed or that owner/database/provider workflows pass. |
| Newer Web candidate | `dpl_Yo8hz4fQ8NLjkW42aGT2eiXPNtv1`, October 23 password-retirement candidate, is latest-created but **not** canonical | Do not blindly promote it or use it as the rollback baseline. |
| Production Neon | Project `noisy-boat-43840462` (BobAI Memory), branch `br-rapid-hall-aykwycjn` (`main`), compute `ep-spring-haze-ay3tn3yp`, database `neondb`, PostgreSQL `18.6 (4e5fd08)` | Known Production source; never label it testing. |
| BobAI row | UUID `10000000-0000-4000-8000-000000000001`, key `bobai`, owner `rick`, repository `boisey9/BobAI` | Fresh read-only row evidence agrees with the repository and BobCore project registration. |
| Current schema | 24 ordinary public tables, all owned by `neondb_owner`, no table RLS/forced RLS; schema owned by `pg_database_owner` | Matches the supported relation shape; does not prove least privilege or recovery. |
| Schema fingerprint | `f0cbb98d72eeed06a0cf87da8c3f4472be6c6213d9007e84e17e4011d3667d45` from current catalog using `backupSchemaDigest` | Dated schema-shape observation only; not an enabled plan, coverage approval, all-ACL fingerprint or full constraints/indexes audit. Refresh inside the eventual capture preflight. |
| Migration 008 | Live `bob_oauth_project_grants_scopes_checkpoint_check` includes `handoffs:write`; repository migration SHA-256 `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e` | Current schema corroborates dated applied-state evidence. No migration hook or new migration requirement was found; **do not rerun 008**. |
| Provider recovery | Project history retention `21600` seconds (six hours); Production branch `protected=false` | Freshly reconfirmed limitations; no settings changed. |
| Backup operation | `bob_backup_runs` has zero rows; GitHub `BOB_BACKUP_SCHEDULE_ENABLED=false`; latest reviewed scheduled runs skipped | No current recurring protection claim. |
| Testing destinations | Existing continuity and recovery branches are archived. A separate project named BobCore Private Trial exists, but is not verified/approved as this packet's target | No existing hosted testing/restore destination is selected. Retired staging is not used. |

The last documented real bundle remains `0d4fe156-a6ee-4d3e-8e5b-0e015332fa93`, snapshot `2026-10-28T15:57:06.136Z`, archive SHA-256 `c2961f50e7acb7bf70aa77c83e2e91dcf878aa4f9d248de5fc28385cfea38df8`. It is over 51 hours old at this review, outside the 24-hour target. A newer artifact is unverified. The [October 28 drill](2026-10-28-encrypted-backup-docker-restore.md) restored 24 real tables, 236 constraints and 25 foreign keys and exercised copied-access quarantine, owner recovery and selected Core continuity. Docker was an empty disposable restore destination, not persistent backup storage. Local timings do not prove full hosted recovery within two hours.

Vercel environment inspection retrieved **names/types/targets only**, not secret values. Both projects have sensitive configuration shared between Preview and Production, including provider/device or Control Center access variables. Production database URL names are Production-targeted. That does **not** establish a safe generic Preview: shared access and Core base-URL bindings must be excluded or independently proven safe in an authorized testing environment. Effective provider/model, password-login, issuer/origin and database-role values have not been compared with the currently serving deployment. In particular, the later password-retirement candidate means current project configuration must not be presumed identical to the canonical Web build's configuration.

BobCore retrieval at `2026-10-30T19:22:48.458Z` returned matching project UUID/repository and `codex`, revision `2480260b70dd7aadb4f9e6a2fb257534a1c52c652c052018fbbb0bad836814a2`. All five sources were available; `partial=true`, events/memories truncated, task records dated September 9 and latest handoff October 23. Environment/credential binding remains unverified. No BobCore state was written; the checkpoint below remains local.

## Permission proposal based on the fresh inventory

The existing `bob_backup_personal` role has CONNECT, public-schema USAGE, read access to 10 tables, and INSERT/UPDATE on `bob_backup_runs`. Fourteen auth/OAuth tables deny even column-level SELECT. It has no elevated role flags, no database/schema ownership or CREATE, and no memberships granting it other roles. `neondb_owner` is an admin member **of** this role, not the reverse. Only Web-specific column UPDATE grants were found on `bob_projects.updated_at` and `bob_oauth_project_grants.revoked_at`.

The existing role cannot be a strict capture role (incomplete reads and ledger writes), or a strict ledger role (unrelated reads). Do not broaden or repurpose it. The legacy [role provisioner](../../Core/scripts/lib/backup-role.mjs) also grants all-public/default SELECT plus ledger writes; it is not the new dual-role provisioner.

**Proposed new testing principals, not created:** `bob_backup_capture_testing` and `bob_backup_ledger_testing`. Provision only in a separately approved isolated synthetic environment. Production names and credentials are not authorized by this proposal. Both roles require LOGIN with no superuser, BYPASSRLS, CREATEDB, CREATEROLE, replication, ownership, grant options or role memberships. Authentication material must be generated/transferred only in an approved secure channel; no passwords belong in this packet.

The exact desired table privilege delta for those new testing roles is below. Reconcile it against the **testing** catalog at execution; the Production inventory is a reference, not a claim about an uncreated test database.

| Exact tables | Capture proposal | Ledger proposal |
| --- | --- | --- |
| `bob_memory_items`, `bob_memory_events`, `bob_tasks`, `bob_decisions`, `bob_projects`, `bob_operation_receipts`, `bob_handoffs`, `bob_credential_rate_limits`, `bob_events` | SELECT only | None, including no column reads |
| `bob_auth_account`, `bob_auth_session`, `bob_auth_user`, `bob_auth_passkey`, `bob_auth_rate_limit`, `bob_auth_verification`, `bob_auth_oauth_client`, `bob_auth_oauth_client_resource`, `bob_auth_oauth_resource`, `bob_auth_oauth_access_token`, `bob_auth_oauth_client_assertion`, `bob_auth_oauth_consent`, `bob_auth_oauth_refresh_token`, `bob_oauth_project_grants` | SELECT only | None, including no column reads |
| `bob_backup_runs` | SELECT only | SELECT, INSERT, UPDATE only |
| Database/schema | CONNECT to exact database; USAGE on `public` | Same |
| Sequences, new tables, other schemas, default ACLs | No implicit future grants; unexpected relations stop the reviewed plan | No implicit grants |

No DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, schema CREATE or unrelated writes are proposed. Capture covers **the whole database, including all projects and authentication rows**; project identity checking does not make the archive project-filtered. The ledger credential is **table-scoped**, not database-enforced row/project isolation: the runner filters owner/instance/run in SQL and refuses RLS on `bob_backup_runs`. These are explicit security limits.

Additional fresh findings prevent calling this a final executable grant/revocation script:

- PUBLIC grants CONNECT and TEMPORARY on `neondb`; `bob_backup_personal` therefore has TEMP. A per-role REVOKE cannot subtract a PUBLIC grant. Do not globally revoke PUBLIC rights in Production. In isolated testing, inventory every legitimate consumer, prepare explicit replacement grants, then separately review any database-wide PUBLIC change. A new dedicated test database can instead establish reviewed defaults at creation; no creation is performed here.
- The public function `bob_advance_task_version` is invoker-security and executable by the backup role; `plpgsql` 1.0 is the only installed extension. Inventory function signatures/default/public ACLs and built-in execution paths before asserting a complete execution boundary. The relation preflight is not a function/extension privilege audit.
- Owner default ACLs grant future public table/sequence reads to the old backup role. Do not copy these defaults to the new roles. Removal from the old role is a separate reviewed retirement change; it could affect existing recovery procedures.
- Role creation, expiry, membership options, database/public ACL changes and credential revocation require separate authorization and testing. Current observations are effective privilege metadata, not authentication tests using the new roles. Preserve existing Core/Web/backup access during preparation.

**Revocation/rollback proposal:** disable the testing schedule/plan first; revoke storage access through its approved manager and verify rejection; disable login for the two newly provisioned testing roles and terminate only their identified sessions if separately authorized; revoke their exact grants/memberships after preserving receipts. Never use `DROP OWNED`, revoke existing Core/Web roles, or remove backup objects as an automatic rollback. Capture roles should own no objects; any ownership finding is a stop condition. Include before/after ACL snapshots and fresh denied-login/denied-read evidence. Testing resource deletion is separate from access revocation.

## Disabled plan and workflow adapter specification

This JSON is an **inert proposal**, kept inside documentation. Unresolved values are deliberate. Do not replace testing bindings with Production values, flip flags or save it as an operator activation file during this task.

```json
{
  "version": 1,
  "enabled": false,
  "capture": {
    "version": 1,
    "enabled": false,
    "environment": "testing",
    "target": {
      "host": "<verified isolated direct host>",
      "port": 5432,
      "database": "<verified isolated database>",
      "role": "bob_backup_capture_testing",
      "postgresMajor": 18
    },
    "project": {
      "key": "bobai",
      "id": "<verified synthetic project UUID>",
      "ownerId": "<verified synthetic owner ID>",
      "repository": "boisey9/BobAI"
    },
    "expectedSchemaDigest": "<reviewed isolated schema digest>"
  },
  "ledgerRole": "bob_backup_ledger_testing",
  "instance": "bobcore-testing",
  "recipient": "<owner-approved public age recipient>",
  "storage": {
    "bucket": "<approved isolated bucket>",
    "endpoint": "<approved HTTPS storage endpoint>",
    "region": "<verified region>"
  },
  "retentionEnabled": false
}
```

`validateBackupJobPlan` exits on `enabled:false` **before** validating the remaining fields. Demonstrating refusal proves only default-off behavior; it does not validate these placeholders. After target approval, validate the full plan with synthetic clients before introducing real secrets. The `environment` label is operator-supplied, not an attestation of destination identity. URLs must independently match the reviewed host/port/database and distinct exact roles; use a direct PostgreSQL endpoint, not a pooler.

The smallest subsequent code slice remains **Add a default-off private-file workflow adapter for the existing backup exporter**. It must:

1. Keep `.github/workflows/backups.yml` and `BOB_BACKUP_SCHEDULE_ENABLED` disabled until separately approved activation. The current workflow invokes the CLI without arguments and cannot run the integrated exporter merely by toggling its flag. Do not dispatch it as a test of the new adapter.
2. Accept approved plan, capture URL and ledger URL through secure runner inputs. Create a private temporary directory outside the checkout under the runner's canonical temporary path, directory mode `0700`, regular user-owned files `0600`, no symlinks, `umask 077`. Limits: plan 16 KiB, each URL 8 KiB. Never put URLs in process arguments, logs, caches or artifacts.
3. Invoke the existing CLI with **paths only**: `node scripts/backup-database.mjs --plan-file "$PLAN_PATH" --capture-url-file "$CAPTURE_PATH" --ledger-url-file "$LEDGER_PATH"`. These are proposed adapter-owned path variables, not commands to execute now. Pass only the public age recipient in the plan. Never give CI the private recovery identity.
4. Clean all three input files and their private directory on success, refusal, exception and catchable termination; use an ephemeral runner for uncatchable termination and prove residual-file handling. The exporter cleans its own encrypted-bundle directory, not caller-created input files. Do not promise secure physical erasure.
5. Pin reviewed action/tool/container versions and digests; keep locked dependency installation without install scripts and no secrets present during dependency setup. Use PostgreSQL 18 `pg_dump` for the currently observed Production major; testing source must be verified separately. Existing archive bound is 100 MiB and dump/encryption timeout five minutes. Measure capacity and stop rather than silently relaxing bounds.
6. Map storage configuration from the plan. The current implementation accepts one static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair; it does not pass an AWS session token. Temporary-session support or a second retention principal needs code and review. Both database URLs coexist in one process; separate database roles do not provide process isolation.
7. Emit only run UUID, safe status/error codes, sizes, hashes and timestamps. On CLI failure, never print the exception object, environment, URL, SQL parameter contents or raw archive. Preserve the failed-run UUID for reconciliation.

Adapter acceptance uses fake URLs, a synthetic plan and spies: missing/disabled/invalid/symlink/oversized/permissive files fail before network clients; enabled synthetic inputs map to all three arguments; cleanup occurs after success/failure/signals; logs and process arguments contain no secret sentinel; no real endpoint is contacted. Actual PostgreSQL acceptance is a separate bounded test, not a unit-test side effect.

## Storage, independent custody and restoration

Storage target/bucket/credential names remain **unbound** for this testing packet. Do not reuse the legacy `bob-encrypted-backups` bucket or any old object prefix merely because it appears in the workflow. Name and verify an owner-approved testing prefix and its account before upload. The archive contains full database content, including sensitive authentication material even though encrypted.

| Principal/action | Proposed authority | Evidence before acceptance |
| --- | --- | --- |
| Testing capture runner | Exact reviewed DB read profile; storage PutObject/GetObject within the testing prefix; no list/delete initially | Denied sibling-prefix access and deletion; encrypted upload and all-three-object readback |
| Testing ledger runner credential | Exact ledger table profile only | Denied business/auth table and column reads/writes; rejected wrong database/role |
| Recovery operator | Download exact encrypted archive, manifest and receipt; access independent current private key locally | Download hash match, successful authenticated decryption and empty-destination restore |
| Optional retention operator | Separately reviewed list/delete prefix boundary after recovery passes | Denied adjacent-prefix deletion, expected expiry set, pagination bounds, retained newest verified bundle |

The current runner uses one storage client. Initial transport should keep retention disabled and use a storage credential with no delete/list authority; do not claim a separate retention principal is already implemented. Retention activation requires an explicit code/authority decision. Record issuer/account, allowed prefix/actions, expiry/revocation procedure and tested denial without recording secret values. Restrict overwrite as supported; run UUID keys reduce accidental collision but are not a proven immutable-storage guarantee.

Restore procedure, to execute only after destination and data-handling authorization:

**Supplemental integrity evidence is a prerequisite, not an implemented three-object feature.** The integrated [bundle helper](../../Core/scripts/lib/backup.mjs) records counts/coverage metadata, and the [restore CLI](../../Core/scripts/restore-database.mjs) compares counts and checks validated foreign keys. They do not produce or compare full content fingerprints and a complete constraint inventory. The October28 manual operator used a separate encrypted `verification.manifest.age`. Before claiming the stronger acceptance below, independently review and reproduce that supplemental procedure against the current source: calculate fingerprints and constraint inventory during the **same held capture snapshot**, bind the encrypted verification manifest to the run UUID, source/schema identity, snapshot time and archive/manifest ciphertext hashes, and preserve its own ciphertext hash in the receipt. Keep it encrypted with the approved recipient and verify its exact upload/download/custody along with the standard bundle. Generating fingerprints from a later live snapshot is insufficient. This supplemental artifact generation/binding/transport is **not wired into the integrated three-object runner** and remains an execution dependency; the default-off three-file adapter alone does not close it. No supplemental artifact is generated or uploaded during packet preparation.

1. Record run UUID, source identity/schema/commit, snapshot timestamp, artifact sizes/hashes, upload receipt and exact object keys. Download all three standard objects **and the separately approved encrypted verification manifest** through the intended recovery access path; verify ciphertext, run/source binding and manifest/receipt pairing before decryption. If the supplemental evidence is absent, stop the stronger integrity acceptance rather than reporting a full match.
2. On an owner-controlled recovery machine, use the **independent current-key copy** to decrypt the downloaded bundle. Record only success, public-recipient/key-pairing evidence and artifact identity. Never paste/export the private identity to Codex, Git, CI, Vercel or storage. Existence confirmation alone is not this test.
3. Verify an explicitly approved empty isolated PostgreSQL 18 target with no public ingress. Refuse a nonempty target without changing it. Prefer an ephemeral local container with loopback/Unix-socket access for the first synthetic drill; its creation/removal and real-content use are separately bounded operations. Do not clone Production or resume archived staging on assumption.
4. Restore and verify same-snapshot table counts and content fingerprints, all constraints/foreign keys and approved-context/project identity. Corrupt archive, manifest mismatch and nonempty-target tests must fail safely.
5. Before starting an application against restored sensitive data, quarantine copied interface tokens, sessions, recovery challenges, OAuth clients/resources/grants/consents/access/refresh tokens and applicable primary credentials. Use isolated synthetic runtime credentials only after quarantine. Never let the restored service call live providers or authorize a copied production session.
6. Exercise owner recovery/login/revocation and independently reauthorize intended clients. When future device grants/jobs exist, invalidate grants/leases/fencing authority and hold restored work; no automatic execution/resumption. These future tables are absent from the current 24-table schema and cannot be declared tested now.
7. Rehearse hosted configuration/origin/DNS, canonical owner passkey, provider/chat and independent-client recovery in the separately authorized environment. Measure snapshot age for **RPO ≤24 hours** and the interval from incident declaration to usable recovered service for **RTO ≤2 hours**. Database restore duration alone is insufficient.
8. Preserve sanitized evidence and encrypted recovery material according to approved retention. Revoke temporary access, verify it rejected, and remove only identified disposable resources after acceptance. The backup must remain recoverable after cleanup and loss of the original Mac.

## Failure reconciliation and rollback

The CLI generates a new UUID on each invocation. It is not a resumable exactly-once protocol. Do not blindly rerun after an ambiguous outcome, and do not invent a replay flag. Reconcile the original run UUID using the exact source/owner/instance and object prefix.

| Trigger | Required response | Release/activation effect |
| --- | --- | --- |
| Missing/disabled plan; wrong source/project/role/schema; denied table or RLS | Expect refusal before ledger/storage effects; compare safe code with reviewed inventory. Do not auto-grant or update the schema digest. | Remain disabled. |
| Export, snapshot rollback or capture-close failure | Stop before opening ledger/storage work; check no ledger row/object was created. Preserve sanitized failure evidence. | No valid artifact. |
| Ledger registration COMMIT acknowledgement lost | Read the original UUID, `owner_id`, `instance_key`, `started_at` and status before another invocation. These are the registration fields; artifact hashes/keys/size are added only at verification and may be unavailable because the CLI cleans its local bundle on exit. Compare hashes only when independently retained. Distinguish absent, matching-running, mismatching and unknown states; unknown stays held. | No automatic upload/retry assumption. |
| Interrupted/partial upload or failed readback | Inspect only the original three keys, hashes and ledger state. Do not label verified or silently overwrite/delete. Prepare exact cleanup/retry action for review. | No recovery acceptance until full readback. |
| Verification COMMIT acknowledgement lost | Compare persisted verified/running/failed status with all three objects and hashes. Do not equate a client error with rollback. | Manual reconciliation. |
| Process death/stale `running` | Record last completed phase, row age and objects; classify orphan/complete/unknown. Automatic resumption and orphan deletion are not implemented. | Hold next scheduled run if ambiguous. |
| Revoked/expired database or storage credential | Verify safe denial, stop new work, preserve exact receipt. Do not fall back to owner credentials or renew scope automatically. | New authorization required for replacement. |
| Retention fails after verification | The bundle may already be verified despite command failure. Inspect retention status separately and preserve the newest verified bundle. | Backup status and retention health reported separately. |
| Restore corruption/nonempty destination | Refuse without destructive cleanup; keep original ciphertext/evidence. Use a newly approved empty destination. | Recovery gate stays open. |
| Restored copied access remains usable | Stop application exposure; quarantine/revoke only in the approved restore target and re-test. | No release. |

Loss of database acknowledgement, upload credentials or cleanup failure must never cause secret-bearing diagnostic output. Proposed ledger reconciliation writes, object deletion and credential revocation are not authorized merely by this table; record the exact intended change and obtain the applicable operating authorization first.

## Staged execution and acceptance receipts

| Stage | Exact scope and actors | Entry/exit evidence | Current status |
| --- | --- | --- | --- |
| A — packet and code preparation | Local reviewer/author; this document, current inventory and default-off adapter specification | Independent review, links/JSON/default-off checks, no runtime/config changes | Packet prepared; final review recorded below |
| B — synthetic adapter/restore | Local implementation branch; fake inputs and explicitly approved disposable PostgreSQL 18 source/empty restore target | Argument/privacy/cleanup tests, strict role denials, complete synthetic restore, failure matrix; separately reviewed supplemental integrity evidence for stronger acceptance | Adapter not implemented; target not created; supplemental evidence path not integrated |
| C — hosted testing transport | Owner-approved isolated source/restore target, newly approved test principals and bounded storage prefix; synthetic data only | Authenticated upload/readback/download, same-bundle restore, denial/expiry/revocation, no Production credentials | Target, authority, storage and credentials unresolved; no operations authorized/executed |
| D — current recovery protection | Separately authorized complete Production read-only capture, encrypted custody transfer/download, isolated restoration, owner-held key | Fresh ≤24h artifact; independent-key decrypt; relationships/quarantine/access acceptance; full RPO/RTO and recovery dependencies recorded | Current-key existence owner-confirmed; fresh artifact/custody drill remains open |
| E — application release | Requested existing Core/Web Vercel release of exact `9536d6c`; no migration/config/credential changes | Satisfied recovery gate, configuration parity, tested candidate pair, pinned rollback and canonical acceptance | Requested, **not yet eligible for cutover** |
| F — recurring backups | Separately authorized workflow activation, observed schedule, bounded retention/failure reporting | Success/ledger/readback within24h, observed failure notification and retention behavior | Disabled; workflow adapter/authority outstanding |

Recurring-backup engineering and Core/Web release are distinct operations. Do not claim Vercel deployment enables the GitHub backup job. A manual current complete artifact/restore can contribute to the recovery prerequisite while recurring automation is built, but any remaining recurring/full-service requirement in the [release ledger](../release-gates.md) must be explicitly resolved or accepted by the owner; this packet does not silently waive it.

For each execution stage retain: exact authorized scope; UTC start/finish; source commit and environment IDs; principals by nonsecret name; operation/run UUID; snapshot time; object/manifest hashes; denied-operation results; restore target identity; copied-access quarantine results; owner/client acceptance; measured RPO/RTO; cleanup/revocation receipt; unresolved exceptions. A successful receipt and independent readback are separate evidence. No raw prompts, private reasoning, database contents or credentials belong in this audit packet.

## Controlled Vercel release proposal

The user has requested the latest release. It can retain the automatic Git guards: `git.deploymentEnabled` controls Git-triggered deployments, while a separately executed manual release remains possible. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration). No new deployment has been made during this preparation.

1. Use a clean isolated checkout/export of exact `9536d6c`, not this dirty documentation worktree. Recheck GitHub main, source manifest and both successful CI runs; any new candidate restarts review. Pin CLI/build tool versions, Core/Web project/team/root IDs and exclusion of private files. Keep the existing config guards untouched.
2. Compare effective configuration of the canonical pair with the proposed builds without printing secrets. Preserve selected provider/model/reasoning, memory/shared context, owner/project, auth/session/OAuth issuer/resource/origins and password-login policy. Current project-level env presence alone does not prove parity. Keep `BOB_WORKFLOW_PRIVATE_RUNTIME_ENABLED` and `BOB_WORKFLOW_HOSTED_ENABLED` unset/false; the latter rejects Production. Keep hybrid/backup execution disabled. Stop if parity needs credentials, permissions or configuration changes outside the request.
3. Verify schema compatibility and runtime role privileges read-only; current 008 scope constraint supports no-migration release. Do not rerun 004/007/008. No migration runs from reviewed Core/Web build/install workflows.
4. Complete the recovery gate and isolated candidate acceptance first. Ordinary Preview can share sensitive Production-scoped access; `--prod --skip-domain` still uses Production configuration/database. Neither is an isolation workaround.
5. Once eligible, create **staged Production builds without domain assignment** for the exact compatible Core/Web pair, record immutable IDs, and run permitted health/config checks. Staging is still a deployment and must not precede the gate. Use the existing project bindings; do not create new projects or modify aliases early. Vercel documents [staged promotion](https://vercel.com/docs/deployments/promoting-a-deployment); promote the tested Production build, not an untested Preview rebuild.
6. Proposed order: verify old Web/new Core compatibility in testing, stage both, promote Core, confirm canonical identity/health/old-Web compatibility, then promote Web. Treat this as two non-atomic project releases. Stop and restore the prior Core if the intermediate pairing fails; do not proceed on assumption.
7. Check build, runtime and functional gates separately. Verify canonical alias IDs, healthy diagnostics, authenticated BobAI context/revision, real owner/passkey/session, task read/create/identical retry/conflict/version/project isolation, reviewed checkpoint import/receipt, OAuth scope/revocation and configured-provider chat. Use synthetic acceptance records only under their authorized write scope. Physical-owner actions and independent clients remain explicit acceptance steps, not simulated successes.
8. On identity/config/login/provider/context/task/checkpoint regression, restore the verified canonical pair: Core `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk` and Web `dpl_CAkTAgNhXyySzQcqYqSxqt2Ny7PM`. Verify old artifacts remain available and that rollback preserves canonical origins/configuration before cutover. A code rollback does not undo new data writes; do not restore a database over Production as an automatic rollback. Do not use the newer password-retirement Web candidate as a shortcut.

**Immediate release blockers:** a current complete encrypted artifact and independent-copy recovery evidence, including the reviewed supplemental same-snapshot fingerprint/constraint path; a verified isolated testing/restore binding; effective canonical-to-candidate configuration comparison (especially password-login); full hosted recovery and owner/client acceptance. Final role/PUBLIC/function/storage decisions remain prerequisites for recurring activation. These are evidence/operating gaps, not a need to rerun migration 008 or enable Git deployments.

## Independent review, validation and pending checkpoint

Two independent reviewers examined the source and actual packet. The release/recovery reviewer found no substantive issue. The backup-contract reviewer identified two documentation findings: the stronger integrity check needs supplemental same-snapshot evidence absent from the standard bundle, and initial ledger registration has no artifact fingerprint. Both were corrected; targeted independent re-review confirmed both resolved with no remaining actionable finding. This is review of documentation and source contracts, not operational acceptance.

Validation passed: `git diff --check`; conflict-marker and relative-link/anchor checks across the four changed documentation files; JSON parsing with both enable flags and retention disabled; direct validation of the documented proposal returns `disabled` as intended (remaining placeholder fields deliberately unvalidated); exact branch/base and four-document scope; Core/Web Vercel guards byte-identical to HEAD. Fresh GitHub readback confirms both successful CI runs on `9536d6c`; those runs were not rerun for documentation. No runtime tests, backup, restore, Docker operation or remote mutation was executed as part of packet preparation. No claim is made that the packet is an enabled operating plan or that all execution dependencies are resolved.

Pending local outcome: current recovery-key existence is owner-confirmed; fresh Production metadata/catalog checks corroborate the 14-table backup-role gap, empty ledger, PUBLIC TEMP, six-hour history, 24-table schema and applied checkpoint-scope constraint. PR49 source and CI are accepted; current canonical deployments remain October23 releases. The reviewed packet prepares testing-first operations and a conditional no-migration Vercel release. No production cutover, backup activation, migration, credentials/permission change or synchronization occurred.

Pending next action: implement/test the default-off three-file adapter locally, and bind an owner-approved isolated synthetic source/restore/storage environment before provisioning or hosted transport. For the requested application release, prepare the separately scoped current encrypted capture/off-device restore and effective-configuration acceptance; preserve the user's recovery prerequisite. Existing BobCore task `b22684f4-6041-46a0-9c9d-cda955a8d21a` (observed version7, in progress) stays open. A later authorized BobCore update requires fresh identity/environment/version verification, retained operation ID, receipt and readback.
