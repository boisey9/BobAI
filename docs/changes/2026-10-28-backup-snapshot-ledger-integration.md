# Backup export snapshot and separate ledger integration

Date: 2026-10-28 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **reviewed and implemented locally; default-off; operational activation remains gated.** Branch `codex/integrate-backup-coverage`, based on `7817de4712c5c1b44e772aaeb2893f6a8beb679a`. Changes were uncommitted and unpublished at initial validation; the [later publication preflight](#publication-preflight--october-28) records the owner's subsequent commit/push request and the deployment conflict. This succeeds the [standalone coverage slice](2026-10-28-backup-coverage-preflight.md), whose dated record is preserved.

## Authorization, authority and review baseline

The owner authorized review of backup coverage, integration of preflight into the export snapshot, and separation of capture from ledger writes. Scope remains local/default-off: no push, PR, merge, deployment, migration, existing permission/credential change, storage upload, schedule activation or BobCore synchronization write. Fixture roles, grants, tables and encryption keys existed only in newly created synthetic databases; no real credential or existing recovery key was used or changed. Acer/Jarvis remain deferred.

Fresh BobCore context returned authority `bob-core` v0.2, project `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, surface `codex`. Revision `968249dd1bd9d79da3f663b7446864162f727248c3f6a0719a962dd455a9c0b7`; generated `2026-10-28T19:09:54.950Z`, sources checked `2026-10-28T19:09:54.776Z`. All five sources were available, with `partial=true` and truncated events/memories. Tasks remain dated September 9 and the latest handoff October 23; explicit environment/credential binding is absent. The differing retrieval revision is not evidence of a new deployment or completed operational gate. Retired staging was not used.

Related task: `b22684f4-6041-46a0-9c9d-cda955a8d21a`, **Complete owner access, recovery and operational reliability**, observed version `7`, `in_progress`. Its older auth and recovery statements do not supersede the newer October 23/24 and October 28 evidence. No task was closed or synchronized.

The previous slice's twelve dirty paths matched its saved SHA-256 receipt before edits. Seventeen relevant files, including the existing exporter and protected workflow/provisioner/restore tools, were copied to `/private/tmp/bob-export-snapshot-20261028-br8z0uga/before/` with `before-sha256.json`. This preserves a reviewable baseline for previously uncommitted work. The initial coverage/bundle review passed **53 focused tests**.

## Review findings and resulting changes

| Finding | Resolution |
| --- | --- |
| A standalone preflight rolls back before a later export | Reused its checks through a callback whose lifetime is inside the same held read-only transaction. Coverage, locks, counts and `pg_dump` share that snapshot. A standalone receipt cannot authorize a later export. |
| The standalone profile allows legacy ledger INSERT/UPDATE | The integrated capture profile rejects **all** write privileges, including the ledger exception. The standalone compatibility contract remains unchanged. |
| Existing runner registers the run before capture through one credential | It now finishes capture, confirms rollback and closes the capture connection before opening a separately bound, separately validated ledger connection. A coverage/capture refusal causes no ledger or storage action. |
| `NOT LIKE 'pg_%'` treats `_` as a wildcard | Changed the count inventory to exclude the literal reserved `pg_` prefix. The real fixture exports/restores a valid `pgx` table, and the covered/count table lists must match before `pg_dump` starts. |
| Child commands inherited all parent credentials | `pg_dump` receives only its capture credential and a minimal process environment; read-only defaults are forced. `age` receives no database, ledger, storage or provider secrets. |
| Uploaded receipt previously had no readback | Archive, encrypted manifest **and receipt** now require matching readback. Downloads are bounded to the expected size. Retention is separately opt-in and follows verified ledger acknowledgement. |

These are changes to the local candidate, not deployed fixes. The earlier standalone implementation had no export/ledger integration and did not claim one.

## Execution and failure contract

1. **Disabled by default.** `backup-database.mjs` requires an explicitly enabled private version-1 job plan. Missing/disabled configuration exits nonzero before reading either URL file, constructing clients or creating an artifact directory. The complete legacy environment, including a schedule-enable variable, cannot activate it.
2. **Bind two principals.** The plan includes the existing capture preflight plan, a distinct ledger role, instance/public recipient, explicit HTTPS storage destination and `retentionEnabled`. Both URLs must match the same reviewed direct host/port/database, with the separately expected roles. URL override parameters and shared principals fail before connection.
3. **Hold the capture snapshot.** Capture uses `REPEATABLE READ READ ONLY`, explicit search path, bounded statements/locks and a seven-minute idle limit for the bounded dump/encryption phase. Source/project identity and reviewed schema digest must pass. The strict profile permits ordinary unpartitioned tables only and no write authority. It takes ACCESS SHARE locks on those tables, checks coverage again, and runs the existing encrypted bundle helper before a final coverage check.
4. **Assert inventory parity.** The count inventory must exactly match the covered table names before dump/encryption starts. The independent dump connection uses the same validated capture URL, enforced read-only defaults and the transaction's exported snapshot. The encrypted version-1 manifest gains optional coverage metadata (project UUID, environment, schema digest and table count); older restore format/validation remains compatible.
5. **Finish capture before effects.** Confirm rollback and close the capture connection. Export failure, inventory drift, denied access, unconfirmed rollback or failed close prevents opening the ledger connection and prevents uploads/listing/deletion. The artifact directory is local and private; the CLI cleans it at exit.
6. **Validate and write through the ledger role.** A separate read-only inspection binds its database, server major and expected role. It must have SELECT/INSERT/UPDATE on the non-RLS ordinary `public.bob_backup_runs` table, no read access to other user relations (including individual-column SELECT), no other row writes and no elevated role/ownership privileges. Only then do explicit short read-write transactions insert/update the bound run. Mutations require exactly one matching returned run ID and use owner/instance guards.
7. **Verify before retention.** Register `running`, upload/read back all three objects, then confirm the `verified` ledger update. Only an explicitly enabled retention flag permits listing of at most 100 pages/20,000 objects and deletion of recognized expired keys for that instance. Repeated pagination tokens fail; the current bundle and foreign/unknown keys remain protected. Housekeeping failure preserves a previously verified backup status while recording failure metadata.

A newly created table **after** the pinned snapshot is consistently absent from that backup; the following run sees changed schema and refuses the old digest. Conflicting DDL on an already covered table is blocked by capture's ACCESS SHARE locks. Ordinary concurrent data writes remain possible and are excluded consistently from the earlier snapshot. The job does not claim a database-wide DDL freeze.

Registration/verification with a lost COMMIT acknowledgement is an unknown outcome, not permission to repeat the insert or upload blindly. The CLI includes the allocated run ID in its sanitized failure event. Reconcile that ID and storage state through authorized readback before another operation. A failed preflight has no database failure row by design; its failure is emitted locally. Upload failure after registration marks the ledger failed when possible; marking failure cannot convert an already verified backup into an unverified one. A process crash can leave a stale running row or partial object set; automatic resumption/orphan cleanup remains outside this slice.

## Activation boundary and proposed authority

The dedicated capture and ledger roles remain **proposals**, not newly provisioned identities. The current `bob_backup_personal` is unsuitable for either strict profile: it intentionally lacks 14 auth/OAuth table reads and already has broader business-table reads plus ledger writes. Do not broaden it, put the database owner into CI, or rerun the unchanged legacy provisioner.

The intended capture role has reviewed CONNECT/schema-USAGE/SELECT authority over the complete source table set, no application/ledger writes, no ownership/membership/BYPASSRLS and no automatic future-table grants. Reading sensitive authentication rows requires explicit owner approval even when the output is encrypted. The ledger role reads/writes only its operational table. These checks are not a comprehensive function/extension/role-management or PUBLIC/TEMP privilege audit; that review remains part of the exact operational permission packet.

Both connections belong to one runner process. Compromise of that process can expose both credentials and captured sensitive rows; separate roles do not establish process isolation. The schema digest still covers relation/column/flag metadata rather than every constraint, index, function, extension or ACL. Independent source and permission review remains necessary.

No enabled plan, URL file, credential or environment setting was created. The unchanged GitHub workflow still calls the old environment-only command and therefore cannot run this candidate successfully. Future workflow/private-file wiring is a separate reviewed activation change; toggling its existing schedule variable is insufficient.

A non-executable planning example, deliberately disabled and containing placeholders:

```json
{
  "version": 1,
  "enabled": false,
  "capture": {
    "version": 1,
    "enabled": false,
    "environment": "testing",
    "target": {
      "host": "reviewed-test-endpoint.invalid",
      "port": 5432,
      "database": "neondb",
      "role": "bob_backup_complete_v1",
      "postgresMajor": 18
    },
    "project": {
      "key": "bobai",
      "id": "<verified testing project UUID>",
      "ownerId": "<verified owner ID>",
      "repository": "boisey9/BobAI"
    },
    "expectedSchemaDigest": "<reviewed 64-character SHA-256>"
  },
  "ledgerRole": "bob_backup_ledger_v1",
  "instance": "bobcore-testing",
  "recipient": "<owner public age recipient>",
  "storage": {
    "bucket": "<isolated backup bucket>",
    "endpoint": "https://reviewed-storage.invalid/",
    "region": "us-east-2"
  },
  "retentionEnabled": false
}
```

The future operator command accepts `--plan-file`, `--capture-url-file` and `--ledger-url-file`; all are bounded, canonical, user-owned private files outside the checkout. Source environment/endpoint mapping must be independently verified: the environment string is an operator declaration, not cloud attestation. The runner receives only the public encryption recipient. The private decryption identity stays in independent owner custody. The current CLI storage adapter still uses one explicitly configured storage principal; separate least-privilege storage/retention authority and session-credential lifecycle require operational review before activation.

## Validation and recovery evidence

| Check | Verified result |
| --- | --- |
| Initial review | Prior slice hashes matched; 53 coverage/bundle tests passed before implementation. |
| Focused Node 22.22.2 compatibility | **83 passed**: 47 preflight, six bundle-boundary and 30 orchestration/CLI tests. Includes legacy-environment refusal, strict role separation, failure ordering, corrupt readback, bounded object bodies, registration uncertainty and retention failure. |
| Full Core / Node 24.19.0 | TypeScript, **869 tests**, eight lifecycle checks and all three import dry runs passed. Default Vitest reports 123 skipped: the unchanged 106 gated cases plus 17 PostgreSQL cases executed separately below. |
| Native PostgreSQL 17.11 | **17 passed, zero skipped**, final fixture `/private/tmp/bob-backup-coverage-run-1kOap9`, approximately 8.9 seconds of Vitest. |
| Cached Docker PostgreSQL 18.6 | **17 passed, zero skipped**, fixture `/private/tmp/bob-backup-coverage-run-h7sAnZ`, approximately 47.7 seconds of Vitest. Exact image `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66`. |
| Complete snapshots | Existing 24-table encrypted-helper fixture still passes. Integrated fixture captures/restores **25 tables including `pgx`**, with matching counts/content fingerprints, excludes concurrent writes/later objects, blocks conflicting DDL, writes verified state only through the ledger role, and rejects the changed schema on the next run. |
| No-effects refusals | Actual missing SELECT, schema drift, capture write authority, RLS, wrong project and export failure produce no ledger row or storage effects. Real capture cannot insert ledger rows; real ledger cannot read synthetic auth rows or modify tasks. Storage in these tests is an in-memory adapter: no remote upload or storage credential was used. |
| Existing behavior | No Web or Core/src runtime, configuration, dependency, migration, provisioner, restore-tool or workflow file changed. Web's earlier type/build result remains dated evidence; no browser or hosted acceptance was repeated or claimed. |

The real fixture initially exposed a text-parameter cast mismatch; explicit UUID/timestamp casts corrected the ledger statements. Initial Docker attempts failed because the image initializes through its default internal Unix socket. The runner now provides both internal sockets, mode 0700, with no TCP listener; fixture initialization waits for the image's final startup. These attempts were retained as diagnostic evidence, not counted as passes.

The Docker container `66a4d876c2befa39aeac649b2714f9fa8b563db45883ff8fb6d13b56c7f7b43b` used network `none`, no published ports or persistent mounts, a read-only root and temporary PostgreSQL directories. It was removed after its exact image/ownership/isolation check. Native clusters were stopped. Synthetic plaintext/archive/key directories and sockets were removed; nonsecret receipts and stopped native synthetic database files remain. The existing RFQ container stayed `created`/unstarted; Docker Desktop was stopped again. No software/image was installed or pulled.

The fixture runner supports either `--pg-bin=/absolute/installed/postgres/bin` or `--docker-image=sha256:<exact-cached-image-id>`. It never accepts an existing database URL/data directory or pulls an image. Docker mode requires an already-running local Desktop Unix socket; it does not start/stop Desktop itself. Commands for the current installed tools:

```sh
# From Core/, with a clean environment:
node node_modules/vitest/vitest.mjs run tests/backup-job.test.mjs tests/backup-coverage.test.mjs tests/backup.test.mjs
node scripts/run-isolated-backup-coverage.mjs --pg-bin=/usr/local/opt/postgresql@17/bin
node scripts/run-isolated-backup-coverage.mjs --docker-image=sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66
```

Logs and the preserved source baseline are under `/private/tmp/bob-export-snapshot-20261028-br8z0uga/`; database receipts are in the two fixture directories above. Final diff checks passed: whitespace, 58 local-link targets, four anchors, the exact fourteen-file scope and preservation of prior records/protected files. The test measurements do not establish Production RPO/RTO or authenticated Neon/S3 transport acceptance.

## Files changed and preserved

Changed in this slice (14 paths):

- [Export CLI](../../Core/scripts/backup-database.mjs), [job coordinator](../../Core/scripts/lib/backup-job.mjs), [bundle/environment helper](../../Core/scripts/lib/backup.mjs).
- [Coverage inspector](../../Core/scripts/lib/backup-coverage.mjs), [snapshot/private-input coordinator](../../Core/scripts/lib/backup-preflight.mjs), [standalone inspection CLI](../../Core/scripts/check-backup-coverage.mjs).
- [Owned fixture runner](../../Core/scripts/run-isolated-backup-coverage.mjs), [orchestration tests](../../Core/tests/backup-job.test.mjs), [preflight tests](../../Core/tests/backup-coverage.test.mjs), [actual PostgreSQL tests](../../Core/tests/backup-coverage-postgres.test.mjs).
- This record, [implementation.md](../../implementation.md), [recovery runbook](../recovery.md), [release gates](../release-gates.md).

The three previous October 28 change records remain byte-identical. Their inherited untracked paths make **17 dirty paths in the combined working tree**. The existing role provisioner, restore CLI and backup workflow are preserved; the shared count helper deliberately changes its prefix filter for correct export/restore parity. No commit was created.

## Exact next task and remaining blockers

**Next task: prepare and independently review the operational activation/recovery packet for this integrated candidate.** It should name the verified testing source, exact least-privilege capture/ledger grant diff, private disabled plan, approved storage/retention boundaries, independent key-custody procedure, release source mapping and rollback/revocation steps. Preparation is local; executing any grant, credential, upload, schedule or deployment requires separate owner authorization.

After approval, the first operational acceptance is a testing-environment run through real authenticated transports, followed by download and isolated restore of that exact artifact and independent-key verification. Production activation remains a subsequent explicit step. Do not regenerate already-applied migration source or replace either code tree wholesale.

Remaining blockers are unchanged operationally: the intentional 14-table Production denial; unapproved real capture/ledger authority; no verified current off-device artifact or independent BobCore key copy (the older Staging copy is unverified); no observed recurring schedule/ledger/retention/failure evidence; and unproven full-service RPO/RTO, canonical owner/client/provider acceptance and release approval. PostgreSQL 18 SQL/capture/restore acceptance is now closed **locally**; hosted Neon/S3 transport, source/permission mapping and recovery custody are not. No hardware/Acer work is required for this hosted milestone.

## Pending BobAI checkpoint — not uploaded

Date 2026-10-28; project `bobai`, UUID `10000000-0000-4000-8000-000000000001`; surface `codex`. Stable operation ID `11d7f5aa-346c-4225-abf8-63892221298c`. Related task `b22684f4-6041-46a0-9c9d-cda955a8d21a`, observed version `7`; refresh the expected version before any later update.

Outcome: reviewed the hash-matching prior backup coverage slice; implemented default-off snapshot-bound encrypted capture and separately validated ledger writes on local branch `codex/integrate-backup-coverage`. Fixed `pgx` inventory parity, removed ambient secrets from child environments, verified all object readbacks and bounded retention failure behavior. Node 22 focused 83, Node 24 Core 869 plus eight lifecycle/three import checks, and 17 actual PostgreSQL cases on each of 17.11 and 18.6 pass. Complete 25-table synthetic restore/concurrency/DDL/no-effects acceptance passed; owned fixtures and synthetic secrets were cleaned up and Docker returned to stopped state.

Unresolved: real backup authority/activation, current off-device artifact/key custody, authenticated hosted transports, recurring protection, complete hosted RPO/RTO and release/client acceptance. Next: prepare/review the exact activation/recovery packet without executing it. No shared-state write, publication, deployment, migration or existing permission/credential change occurred. The broader critical task remains open. Reuse this operation ID only for identical content and verify scoped receipt/readback before claiming synchronization.

## Publication preflight — October 28

The owner subsequently requested a commit and push to GitHub `main`. This authorizes Git publication, while the earlier no-deployment, migration, permission and credential restrictions remain unresolved for automatic release side effects.

- GitHub `main` was freshly read as `36552fc430b06b91ee1e47acef124e4ea36987c0`. The existing seven-commit local series is a fast-forward successor; no remote commit needs replacement. The new local commit includes the 17 reviewed working-tree paths, including the three preceding October 28 records.
- All 17 file hashes matched the final validation receipt before the publication-only additions to this record and `implementation.md`. Runtime/test bytes are unchanged from the 83 focused, 869 full Core and 17-per-version PostgreSQL results above. No additional runtime acceptance is claimed.
- Authenticated, read-only Vercel project API inspection confirmed `bob-core` (`prj_XAZztFjDMPxdhRTWADjBaeCpoTEZ`, root `Core`) and `bob-control-center-erikboisvert9` (`prj_j7CZ6MgNYfOFS9N16wBoQOIxVvF1`, root `Web/`) are linked to `boisey9/BobAI`, production branch `main`, with `gitProviderOptions.createDeployments=enabled` and automatic domain assignment enabled. Neither repository Vercel configuration disables deployments for `main`. The GitHub push workflows validate source; they do not themselves deploy. [Vercel's GitHub deployment behavior](https://vercel.com/docs/git/vercel-for-github) means this push can release both applications.
- The local commit is prepared without changing deployment configuration. The push is held for the owner to resolve whether to permit that production release or authorize disabling automatic deployments before publication. No remote ref, deployment, database, credential or permission was changed by this preflight.
- Fresh BobCore read at `2026-10-28T19:54:45.424Z` returned the same matching BobAI UUID/repository/Codex identity and revision `968249dd1bd9d79da3f663b7446864162f727248c3f6a0719a962dd455a9c0b7`. All sources were available; events/memories remained truncated, dated task records persisted, and explicit environment/credential binding was absent. This dated per-project publication checkpoint remains local and has not been uploaded. The earlier checkpoint payload/operation ID is unchanged; any later publication event needs its own operation ID and verified receipt/readback.

Publishing source will not by itself close backup activation, recovery custody, hosted acceptance or hybrid/node gates. The old environment-only backup workflow remains incompatible with the new explicit-plan CLI until separately reviewed wiring is authorized.

## Approved main deployment guard — October 28

The owner resolved the publication conflict by explicitly authorizing `main` deployment-disable settings in both applications, followed by commit and push to GitHub `main`. Deployments, migrations, permission and credential changes remain prohibited.

This follow-up changes four paths: `Core/vercel.json`, `Web/vercel.json`, this record and `implementation.md`. Each configuration gains only `git.deploymentEnabled.main=false`; all other values are preserved. [Vercel documents this branch setting](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled) as preventing deployments on commits to that branch. There is no matching enabled wildcard rule. Other branch rules and GitHub test/build workflows remain unchanged; this setting does not authorize manual CLI/API deployments or prevent a separately authorized future release.

The source baseline is backup commit `4a4b4e29481703079376c3fb57f4ca02ec131c75`, with a clean working tree before this follow-up. GitHub `main` was freshly verified as `36552fc430b06b91ee1e47acef124e4ea36987c0`, with eight local commits ahead and none behind. Publication uses an ordinary fast-forward push of the final guarded commit to `refs/heads/main`, without pushing the feature branch or tags. No migration runner or deployment command is involved.

Pre-push Vercel project and deployment-list reads establish these existing latest deployment IDs for comparison: Core `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk`; Web `dpl_Yo8hz4fQ8NLjkW42aGT2eiXPNtv1`. Both report READY/production. Post-push verification must confirm the exact remote Git commit, both committed `main=false` values, no deployments associated with that commit or added since the push, and unchanged deployment IDs. Production application acceptance is not claimed by these repository checks.

Validation passed: both parsed configurations differ from their parent only by the new `main=false` entry; both existing Vercel configuration tests pass; whitespace, exact four-file scope and 54 local-link targets pass. Implementation/test bytes from the previously recorded backup validation remain unchanged; no additional full backup or database run is necessary for these JSON/documentation changes.

The per-project checkpoint remains local: fresh BobCore context generated `2026-10-28T21:20:13.714Z` returned matching BobAI UUID/repository/Codex identity, revision `2480260b70dd7aadb4f9e6a2fb257534a1c52c652c052018fbbb0bad836814a2`, all sources available, `partial=true` and truncated events/memories. Task records remain dated and explicit environment/credential binding is absent. This publication does not claim synchronization, mark the critical recovery task complete or change any active decision. Remote push and deployment readback results are reported after execution, rather than presumed by this commit.

## Publication attempt result — October 28

Guard commit `df0dfee387f8aa6a84a18ef7442f8a9ca22c1a39` was created with a clean working tree. At `2026-10-28T21:22:29.983Z`, an ordinary push of `HEAD:refs/heads/main` with tag following disabled was attempted. GitHub rejected it with `GH006`, “Changes must be made through a pull request” and “Cannot change this locked branch.” No force-push, permission change, protection bypass or subsequent retry was attempted.

Readback confirms remote `main` is still `36552fc430b06b91ee1e47acef124e4ea36987c0`. The read-only branch-protection API confirms `lock_branch.enabled=true`, `enforce_admins.enabled=true`, one required approving review and code-owner review required. Publishing therefore requires an owner-authorized path through the repository's lock and pull-request rules; the current prohibition on permission changes is preserved. A future PR branch must also have its automatic deployment behavior reviewed before publication, because this guard targets only `main`.

Post-attempt Vercel reads through `2026-10-28T21:24:00.186Z` return zero new deployments since the attempt for each project. Latest Core deployment remains `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk`; latest Web deployment remains `dpl_Yo8hz4fQ8NLjkW42aGT2eiXPNtv1`, both READY/production with unchanged project update timestamps. The guard has not reached GitHub and is not claimed active there. No PR, feature-branch/tag publication, deployment, migration, permission/credential change or BobCore write occurred. This result is retained as a local pending project checkpoint; backup and release blockers remain open.

## Guarded feature-branch publication — October 28

The owner subsequently authorized a guard for the feature branch, publication of that branch and a PR to `main`, while preserving branch protections and prohibiting deployments, migrations and credential changes. This follow-up adds only `git.deploymentEnabled["codex/integrate-backup-coverage"]=false` to `Core/vercel.json` and `Web/vercel.json`, alongside the existing `main=false` guard. All other configuration and GitHub CI remain intact. The PR includes the earlier reviewed architecture/reconciliation, disabled hybrid contracts and backup integration series; it is not limited to the two guard entries. Migration 008 is restored source only and must not be rerun from this publication.

The clean starting commit was `37812096ad525dfe12a4ad809cb71bba70ffa9bc`. Preflight readback found GitHub `main` still at `36552fc430b06b91ee1e47acef124e4ea36987c0`, no remote `codex/integrate-backup-coverage` branch and no existing PR for that head. Validation passed: exact four-file follow-up scope (both configurations, this record and `implementation.md`), parsed configuration comparison allowing only the new branch entry, both existing Vercel configuration tests, whitespace and 55 local-link targets. A cumulative 100-file credential-pattern scan had no matches; all ten backup implementation/test file hashes still match their full validation receipt. The cumulative application/test source remains the previously validated candidate. After publication, verify the remote head and PR base/head, unchanged `main` and protections, and no deployments for the new SHA or since publication.

Read-only protection inspection confirms `lock_branch.enabled=true`, administrator enforcement, one required approving review, code-owner review when applicable, dismissal of stale approvals and approval of the latest reviewable push. Force pushes and deletions remain disabled. The owner can unlock only the read-only lock via **repository Settings → Branches → Edit the rule matching `main` → clear Lock branch → Save changes**, leaving all review and other protection settings unchanged. [GitHub's rule-editing instructions](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule) describe this owner action. Unlocking does not merge the PR, satisfy its required review or authorize a release. No protection-setting write is part of this task.

The pre-publication latest Vercel deployments are still Core `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk` and Web `dpl_Yo8hz4fQ8NLjkW42aGT2eiXPNtv1`. Both are READY/production. Only the guarded feature branch is authorized for this push; do not publish additional branches/tags or invoke a deployment. Existing backup/recovery, independent review and hosted acceptance gates remain open.

BobCore checkpoint remains local: context generated `2026-10-29T00:59:10.450Z` (October 28 in Toronto) returned BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, surface `codex` and revision `2480260b70dd7aadb4f9e6a2fb257534a1c52c652c052018fbbb0bad836814a2`. All sources were available, with partial/truncated events and memories, dated tasks and no explicit environment/credential binding. No checkpoint upload or cross-project connection is claimed by GitHub publication. The completion report and PR record carry the actual push/CI/deployment readbacks after execution.

## PR 49 publication and CI portability — October 28

Commit `1f22ece3e09e84fac8d62856275e19d3a9dd9050` was pushed only to `codex/integrate-backup-coverage` at `2026-10-29T01:02:53.906Z` (October 28 in Toronto). [PR #49](https://github.com/boisey9/BobAI/pull/49) was opened against `main` and attached to the task. Readback confirmed the exact remote feature SHA, unchanged `main` at `36552fc430b06b91ee1e47acef124e4ea36987c0`, unchanged protection settings and zero deployments since publication for either project. The latest deployment IDs remained the preflight baseline. The PR is open and review-required; no merge occurred.

Both initial Web CI runs passed. Core CI failed in 25 tests because two new backup fixtures created their private directories under the macOS-specific `/private/tmp`, which does not exist on GitHub's Linux runner. The correction is confined to `Core/tests/backup-job.test.mjs` and `Core/tests/backup-coverage.test.mjs`: use `join(tmpdir(), prefix)` from Node's OS API. Existing cleanup and all test assertions remain intact; no application/exporter behavior, deployment guard, workflow, permission or credential changed.

After correction, **85 focused tests pass** with an explicit fresh OS temporary root and complete fixture cleanup. The full clean-environment Node 24 `npm run check` passes TypeScript, **869 tests**, lifecycle checks and all three import dry runs; **123 gated cases remain skipped** as previously explained. Logs are under `/private/tmp/bob-pr49-ci-ehlzeb4t/`. The prior PostgreSQL 17/18 acceptance remains dated evidence; these fixture-only changes do not require repeating a real database or hosted recovery operation. The follow-up also updates this record and `implementation.md`; final Linux checks and unchanged deployments/protections are read back after pushing it to the same guarded PR branch.

The actual classic protection rule is named `main`. Its read-only lock, required PR/review rules, last-push approval, administrator enforcement, force-push denial and deletion denial are preserved. The owner unlock procedure above clears only **Lock branch**; required review still applies, and a PR author cannot satisfy their own approving-review requirement. This task provides instructions and does not execute a protection change. BobCore synchronization and operational release gates remain pending.
