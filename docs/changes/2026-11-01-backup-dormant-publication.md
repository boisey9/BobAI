# Dormant backup publication candidate and hosted testing handoff

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **local candidate; publication and activation require separate owner approval**. Candidate branch: `codex/backup-dormant-publication`. Baseline: `9536d6c24de090f4c4c2716cead64811107da3ab`. The working source containing unrelated dashboard/client changes is preserved separately. This document supersedes the next-step and missing-interface statements in earlier backup packets while retaining their dated evidence.

## Exact candidate and publication boundary

The candidate is assembled in an isolated worktree from the immutable baseline. The [complete publication manifest](2026-11-01-backup-dormant-publication-manifest.json) identifies every proposed changed path and its content hash, excluding the manifest's own self-hash. A separate local validation receipt binds the manifest, resulting Git tree and final local commit. Recheck those identities before any publication; a branch name alone does not identify approved bytes.

The candidate contains:

- The exact 47 backup runtime/test/toolchain paths from the [qualified restore inventory](2026-11-01-backup-restore-source-inventory.json), without runtime edits.
- An explicit `codex/backup-dormant-publication: false` entry in both [Core](../../Core/vercel.json) and [Web](../../Web/vercel.json) Git deployment maps. Existing entries, including `main:false`, and all other configuration are preserved.
- Sixteen backup change records/inventories, three narrowly projected index/runbook/gate updates over the baseline, this packet and its complete manifest.

The October 31 snapshot record retains its backup evidence but renders its separate local dashboard-record reference as dated plain text. That avoids bringing unrelated dashboard source into this candidate. All other selected historical records and the 37/44/47-path inventories retain their source bytes. The projected [implementation index](../../implementation.md), [recovery runbook](../recovery.md) and [release gates](../release-gates.md) describe this candidate without importing unpublished dashboard/client changes.

The branch guards cover automatic Git-triggered deployments for these two projects. Vercel documents that unspecified branches default to deployment-enabled and that any matching true rule wins; the reviewed maps contain no true rule. These settings do not prohibit an explicitly invoked CLI/API deployment or change other branches' behavior. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration). No such deployment is authorized here.

**Proposed first external action:** publish only the final reviewed dormant commit to `codex/backup-dormant-publication` and open a draft PR against `main`. Do not merge it, publish an image, configure secrets/permissions, dispatch a workflow or deploy. GitHub source CI may run; its result and absence of new Core/Web deployments require readback. Existing branch protections remain unchanged. If the remote branch exists or `main` has advanced, stop and reconcile the new state; never force-push or silently replace reviewed bytes.

## Qualification carried forward and checks for this slice

The runtime source is identical to the [restore-operation qualification](2026-11-01-backup-restore-operation.md): 1,832 Core tests passed with zero failures and 123 gated skips; types, eight owned-child lifecycle checks and three import dry runs passed. PostgreSQL 17 and 18 each passed all 17 synthetic database cases. The pinned Linux suite passed 1,045 backup tests with zero failures and 18 skips, including all 99 restore-operation/process tests. These are overlapping suites, not additive totals.

The first four real restore cases consume the downloaded first bundle after its originals are removed. The fifth uses a second local encrypted capture directly to verify the current ledger-absent format. These tests qualify local operating logic and public copied-access quarantine, not remote TLS/IAM, hosted workflow execution, owner login or service RPO/RTO. No new Production backup or transfer occurred in this preparation.

Validation for this slice passed: all 70 proposed paths are accounted for; 47 qualified runtime paths and dependency pins match; the other 448 baseline files and all 523 original-workspace files are preserved. Whitespace/diff checks pass, and 183 relative links plus nine anchors resolve. The two branch guards are the only configuration changes; both literal testing holds, disabled/null binding and Production workflow remain unchanged. All 63 focused testing-runner checks pass, and the actual CLI refuses `--prepare`, `--check` and `--run` with `testing_disabled` in a clean environment. Independent source-boundary and documentation reviews have no remaining findings; the runbook provenance omission was corrected and re-reviewed. Full runtime suites were not repeated for unchanged source. Temporary dependency symlinks used for the focused check were removed before inventory validation. Final measured receipts are retained outside the proposed commit.

## Current hosted execution blockers

| Gate | Current evidence and required next action |
| --- | --- |
| Local interfaces | Versioned capture-to-recovery handoff, private Get-only download operator and shared restore/quarantine are implemented and locally qualified. Do not schedule these implementations again. |
| Recovery directory | [The runner](../../Core/scripts/lib/backup-testing-runner.mjs) requires `BOB_BACKUP_TESTING_RECOVERY_DIRECTORY`, but [the dormant workflow](../../.github/workflows/backups-testing.yml) neither creates nor supplies it. Enabling flags/bindings alone would fail `testing_recovery_unbound`. Review explicit directory wiring before activation. |
| Independent handoff custody | The directory must be canonical, user-owned `0700`, outside checkout and disjoint from the private adapter temporary root. An ephemeral sibling directory satisfies only local filesystem requirements. Approve and implement authenticated retention/transfer and independent readback before calling hosted recovery accepted; a log, disposable runner directory or self-authenticated receipt from the backup store is insufficient. |
| Image identity and pull | The local qualified toolchain ID is `sha256:29fc124322ec343fa443f6729cfdd927c858936aa5e719f635bc597528596216`. It is not a published manifest digest. Publish only that reviewed toolchain through a separate approval, bind the actual `ghcr.io/boisey9/bob-backup-runner@sha256:…` identity and repull/requalify it. The disposable Linux application-test image is excluded. |
| Registry visibility | Public/private visibility remains an owner choice. Private visibility needs a separately reviewed pre-container pull-authentication design. The workflow has only `contents:read`; final-step backup storage secrets cannot authenticate an earlier image pull. No package permission, PAT, login or visibility change is included. |
| Synthetic source and restore | Select an entirely synthetic PostgreSQL 18 source and a separately verified empty, same-major hosted restore destination. Record actual provider/project/branch/endpoint/database/role identities. The whole database is captured; a project UUID does not filter its rows. No Production clone or retired staging reuse. |
| Effective authority | Approve and test separate capture/ledger principals, exact storage account/bucket/prefix/actions and revocation, public age recipient and independently held private key. Review inherited/PUBLIC/function/default grants. No owner credential or broad legacy provisioner workaround. |
| Restore transport | The shipped restore uses Neon WebSocket and libpq. Actual target identity, TLS and role checks remain unqualified against a hosted destination. `review.restoreTarget` metadata is not consumed as policy by that CLI; verify destination authority independently. Known optional authority schemas remain refused. |
| Workflow/source activation | Both job conditions retain literal false holds; the binding is disabled with null targets. Runtime requires manual dispatch on `main`, exact repository/workflow identity, GitHub-hosted Linux/X64 and `GITHUB_SHA === BOB_BACKUP_TESTING_APPROVED_SHA`. It cannot run from this feature branch. Binding or hold edits create a new activation revision requiring new approval. |

The [earlier authority worksheet](2026-11-01-backup-testing-authority-packet.md) supplies proposed names and denial cases, not selected resources or permission. No hosted destination, custody location, registry visibility, cost cap or cleanup authority has been approved in this packet.

## Ordered handoff and acceptance

1. Review and approve the exact dormant source commit for feature-branch publication/draft PR only. Read back its SHA, diff, CI and deployment state. A merge requires separate approval.
2. Resolve the registry visibility/pull path, synthetic source/restore/storage targets, independent handoff custody, a bounded testing budget and cleanup scope. Secure values stay outside Git/chat. No existing private destination is assumed.
3. Implement and review the missing workflow recovery-directory and independent-custody wiring locally. Prove wrong destination, unavailable custody, conflict, partial/lost acknowledgement and runner disposal behavior without weakening the current failure boundary.
4. Separately authorize qualified toolchain publication and testing-only provisioning, secure input placement and effective allow/deny checks. Bind actual resulting identities after readback, not guessed names. Confirm no Production data/authority is inherited.
5. Review/publish/merge the final activation revision, separately approve its exact SHA and manually dispatch one bounded synthetic run. Keep retention and schedules off. Approval of the dormant source SHA does not authorize this new revision.
6. Verify capture visibility and denials, three-object upload/readback, independent anchor custody and Get-only download, exact-bundle integrity/relationships, empty-destination restore/quarantine, operator recovery and failure/revocation cases. Record build/runtime/functional evidence, timings and cleanup/deactivation. No automatic rerun after uncertainty.

The current exporter creates a new UUID on each invocation; invoking it again is not recovery of the prior run. Lost acknowledgements may leave ledger/objects, a retained handoff, or restored data. Preserve the original identity and reconcile the approved objects/destination. Failed quarantine may leave copied access in a restored database; keep it isolated. A lost COMMIT acknowledgement remains uncertain even when a later rollback returns. Do not restore over a nonempty target or broaden permissions to continue.

## Production and client release remain separate

The owner confirms an offline copy of the current BobCore key but has no separate recovery destination. Off-device restoration using that copy, recurring protection/failure reporting, owner-access recovery and measured full-service RPO/RTO remain prerequisites for risky Production changes. The October 31 encrypted snapshot is dated evidence; freshness and hashes must be rechecked for an actual cutover.

The installed ChatGPT plugin and authenticated Codex/ChatGPT reads are separate accepted milestones recorded in the retained workspace. Full write/retry/readback/refresh/revocation acceptance and Vercel effective configuration/immutable release/rollback parity remain open. Dashboard/client source is not included in this backup candidate. Existing Vercel/Neon architecture and configured cloud provider remain unchanged; Acer/Jarvis is deferred.

## Authority evidence and local checkpoint

GitHub `main` was read during this slice and matched the baseline above; the open-PR query returned no results. These are dated observations, not a reservation against concurrent remote changes. Recheck before publication.

BobCore context at `2026-11-01T18:43:13.011Z`, revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`, matched BobAI UUID `10000000-0000-4000-8000-000000000001`, repository and `codex` surface. All five sources were available; events/memories were truncated and `partial:true`. Tasks and handoffs remain dated, so implementation and current permission claims are grounded separately.

The packet's outcome remains a pending local checkpoint. No BobCore task/event/handoff write, push, PR, merge, image publication, workflow dispatch, resource provisioning, upload/download, deployment, migration or existing credential/permission change is performed by preparing this candidate.
