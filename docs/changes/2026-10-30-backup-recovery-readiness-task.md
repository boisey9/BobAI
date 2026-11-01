# BobCore backup and recovery readiness task

Date: 2026-10-30 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **review complete; next task prepared locally; operational activation and Production deployment remain held.** Local branch: `codex/backup-recovery-readiness`, based on merged `main` commit `9536d6c24de090f4c4c2716cead64811107da3ab`.

Follow-up later October 30: the owner requested the [actual testing-first activation/recovery packet](2026-10-30-backup-activation-recovery-packet.md) and the latest Vercel release, and confirmed an offline copy of the **current BobCore key** exists. The successor records fresh catalog/permission evidence, current canonical aliases and conditional release preparation. Statements below about missing key-existence confirmation, no fresh catalog inspection and the earlier no-deployment scope are the historical baseline, not the successor's current status. Decryption with the independent copy, fresh artifact/off-device restoration and the existing recovery prerequisite remain unresolved.

## Scope and source evidence

The owner requested review of remaining backup/recovery blockers, preparation of the next readiness task, and an explanation of the absent Vercel deployment. This authorizes local planning and read-only verification. It does not authorize publication, deployment, database changes, grants, credential creation/rotation, private-key transfer, storage uploads, retention deletion, schedule activation, or changes to branch protections. Acer and Jarvis remain deferred.

- [PR #49](https://github.com/boisey9/BobAI/pull/49) merged on October 30 at `17:37:51Z`. GitHub `main` was rechecked against `9536d6c`; its tree matches reviewed head `b133333`. Both [Core CI](https://github.com/boisey9/BobAI/actions/runs/41100436022) and [Web CI](https://github.com/boisey9/BobAI/actions/runs/41100436036) passed on the merge commit. This closes the source-publication/CI step, not operational acceptance.
- The October 30 post-merge check compared the complete branch-protection response with the merge snapshot and found no changes. The owner previously removed the lock and three approval requirements; the PR requirement, administrator enforcement, conversation resolution, and force-push/deletion prohibitions remain. This review changes none of them.
- Read-only Vercel queries during this review returned zero Core/Web deployments created since the merge preflight (`2026-10-30T17:37:34Z`). The preceding 19:03 UTC verification also matched both latest deployment IDs to the pre-merge values.
- Fresh BobCore context at `2026-10-30T19:10:07.331Z` returned BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, and surface `codex`, revision `968249dd1bd9d79da3f663b7446864162f727248c3f6a0719a962dd455a9c0b7`. All sources were available; events/memories were truncated and `partial=true`. Tasks remain dated September 9 and the latest handoff October 23. Environment/credential binding remains unverified; no BobCore task/event/checkpoint was written.
- The repository-level `BOB_BACKUP_SCHEDULE_ENABLED` variable currently reads `false`. The eight latest scheduled backup runs, October 23–30, all concluded `skipped`; [the October 30 run](https://github.com/boisey9/BobAI/actions/runs/41070053964) preceded the merge and ran against old `main` `36552fc`. These are observations of skipped protection, not tests of the newly merged exporter.
- No fresh Neon catalog, privilege, backup-ledger, restore-window, or storage-object audit was performed. Those operational observations below retain their original evidence dates. No private recovery directory, private key, credential file, or backup contents were inspected in this review.

## Why Vercel has no new deployment

Both [Core/vercel.json](../../Core/vercel.json) and [Web/vercel.json](../../Web/vercel.json) contain `git.deploymentEnabled.main: false` and `git.deploymentEnabled["codex/integrate-backup-coverage"]: false`. These owner-approved settings suppress automatic Git deployments. GitHub CI validates source; it does not deploy either application. The existing hosted releases continue serving while the merged source awaits a separately authorized release.

This guard controls Git-triggered deployments, not separate manual CLI/API deployments. Do not remove it or invoke a manual deployment as part of readiness preparation. The new local documentation branch is unpublished and has no branch-specific deployment guard; any future publication must first review its deployment behavior. The backup workflow runs in GitHub Actions independently of Vercel: deploying Core/Web would not supply its missing arguments or grant backup authority. A source merge also does not wire or enable the backup schedule.

## What can be reused without repeating implementation

The merged [snapshot/ledger integration](2026-10-28-backup-snapshot-ledger-integration.md) already supplies:

- Default-off execution requiring an explicit private plan and separate capture/ledger URL files.
- Source/project/role/schema checks, read-only table locks, counts and export within one held snapshot; capture closes before ledger or storage work.
- Separate strict capture and ledger profiles, encrypted bundle creation, verification of all three uploaded objects, and bounded separately enabled retention.
- Dated isolated PostgreSQL 17.11/18.6 acceptance, including a complete **25-table synthetic fixture**. These tests do not establish authenticated hosted storage or operational acceptance.

The separate [October 28 real-backup drill](2026-10-28-encrypted-backup-docker-restore.md) restored **24 real tables**, matched **236 constraints and 25 foreign keys**, and passed corruption/nonempty refusal, copied-access quarantine, owner recovery/login/revocation, and selected Core continuity tests. Keep this evidence distinct from the synthetic 25-table fixture.

Docker was the disposable restore destination. Its container was removed and no persistent BobCore backup volume was created. The encrypted real archive is recorded in the protected Mac recovery directory, not in Docker.

## Remaining blockers and priority

| Priority | Blocker and evidence | Required closure evidence |
| --- | --- | --- |
| P0 | **Freshness:** latest documented real snapshot began `2026-10-28T15:57:06.136Z`, over 51 hours before this review. It is outside the runbook's 24-hour target; a newer backup is unverified. | A freshly captured, verified complete artifact with a recorded snapshot time; continuing evidence that protection stays within the 24-hour target. A new capture requires its own authorized operating scope. |
| P0 | **Independent custody:** no current off-device artifact/download/restore or independent current BobCore key copy has been verified. The owner previously reported only an older Bob Staging key copy. | Owner-controlled independent key custody, tested against the exact intended encrypted bundle; verify an off-device artifact by downloading and restoring it. Do not assume the old key matches or rotate/replace keys on assumption. |
| P0 | **Complete backup authority:** the October 28 evidence records deliberate denial of 14 auth/OAuth tables to `bob_backup_personal`; approval/provisioning of a real strict capture/ledger role pair remains unverified in the available evidence. | Fresh approved source/permission inventory, exact reviewed grant/revocation diff, and denial tests. Preserve authentication isolation; never substitute the database-owner credential into CI. |
| P1 | **Workflow incompatibility:** the [existing workflow](../../.github/workflows/backups.yml) calls the exporter without the new required private-file arguments. | A reviewed default-off adapter for `--plan-file`, `--capture-url-file`, and `--ledger-url-file`, with synthetic file-permission, cleanup, logging and failure tests. Turning the existing flag on alone is insufficient. |
| P1 | **Hosted transport and storage boundaries:** real Neon/S3 upload/readback/download and storage/retention permission boundaries remain unaccepted. | A separately authorized testing-first transport drill, explicit storage scope/lifetime and retention authority, and restoration of that exact downloaded artifact. |
| P1 | **Recurring operation and failure recovery:** the schedule is disabled and recent runs skipped. The October 28 ledger was empty; its current contents were not reread. | Successful scheduled runs and ledger/readback evidence, retention and failure reporting, and procedures for lost acknowledgements, stale running records and partial uploads. No automatic exactly-once recovery claim. |
| P1 | **Full service recovery:** the local drill does not prove canonical hosting/configuration, physical passkey access, provider/chat workflows, independent client reauthorization, or complete RPO/RTO. | An isolated full-service recovery rehearsal with a snapshot-loss target of at most 24 hours and restored usable service within two hours, including owner/client access and configuration recovery. |

The earlier six-hour Neon restore window and unprotected Production branch are dated infrastructure observations, not substitute backups and not freshly reverified here. Clarify them in the approved operating inventory before risky changes. Source reconciliation and passing CI do not close these recovery gates.

## Prepared next readiness task

**Title:** Prepare and independently review the testing-first backup activation and recovery packet.

**Priority:** critical. **Status:** prepared locally; not created or activated in BobCore. Relates to existing task `b22684f4-6041-46a0-9c9d-cda955a8d21a`, *Complete owner access, recovery and operational reliability* (observed version 7, in progress). Refresh context/version before any future task update; do not close the umbrella task for packet completion.

**Objective:** turn the merged exporter and existing recovery tools into a concrete, reviewable operating plan that can be approved in bounded stages without weakening Production access or prematurely enabling jobs.

### Deliverables for the next task

1. **Environment/source map.** Pin candidate commit, Core/Web configuration requirements, PostgreSQL versions, owner/project UUIDs, schema digest, and an owner-verified isolated testing source and restore destination. Retired Bob Staging is not an authorized fallback. Production or inherited credential-bearing data must not be cloned on assumption. Identify hosting/DNS/provider/client recovery dependencies without recording secret values.
2. **Exact permission proposal.** Use an authorized effective-privilege inventory to prepare the capture/ledger grant and revocation diff. Capture must be read-only and cover all required tables without filtered rows; the ledger role is confined to its required operations on `public.bob_backup_runs`. Review ownership, membership, RLS/BYPASSRLS, column privileges, PUBLIC/TEMP, function/extension execution and role-management paths. Current preflight checks are not a complete privilege audit. If the necessary inventory is unavailable, mark the diff incomplete instead of inventing grants.
3. **Disabled plan and workflow design.** Reuse the existing disabled [plan contract](2026-10-28-backup-snapshot-ledger-integration.md#activation-boundary-and-proposed-authority), replacing placeholders only with verified nonsecret values. Specify private file creation, permissions, cleanup, argument wiring, redaction, runner environment and PostgreSQL compatibility. Keep both plan and schedule gates disabled. Include a separate review of any workflow/action changes before publication.
4. **Storage and custody procedure.** Identify approved destination/prefix, upload/readback/download authority, optional retention/delete boundary, credential expiry/revocation, and owner-held independent key handling. The runner receives only the public encryption recipient; never place the private identity in chat, Git, CI, Vercel or object storage. The current single-process runner and static storage key pair do not provide process isolation or independently accepted retention/session authority.
5. **Recovery/failure procedure.** Cover capture denial, source/schema drift, ambiguous registration COMMIT, interrupted upload, partial objects, stale running ledger entries, readback failure, revoked credentials, retention failure, nonempty-target refusal, copied-access quarantine, owner recovery and explicit client reauthorization. Future device grants/job leases must be invalidated on restore; restored work must not automatically execute. Keep automatic resumption outside this task unless separately implemented and validated.
6. **Staged authorization packet.** Name exact proposed actions, principals, destinations, data sensitivity, rollback/revocation and acceptance evidence for each later stage. Review local preparation first, then separately authorize hosted testing and custody transfer; Production backup activation and application deployment are separate approvals. Do not execute these proposals during preparation.

### Smallest subsequent code slice

**Add a default-off private-file workflow adapter for the existing backup exporter.** Reuse the three existing CLI arguments and snapshot/ledger code. Validate missing/disabled inputs, file ownership/modes, correct argument mapping, secret-safe diagnostics, cleanup, and refusal before database/storage effects using synthetic inputs. Do not create real roles, broaden `bob_backup_personal`, provide an owner URL, enable a real plan/schedule, upload an artifact, or deploy. This addresses wiring; it does not by itself close custody or recovery readiness.

### Acceptance criteria

**Packet completion:** every destination and identity is verified or explicitly unresolved; the permission diff and storage/custody design are independently reviewed; workflow requirements match the actual exporter; failure/rollback steps are actionable; disabled defaults and current Vercel guards remain intact. No claim of operational readiness may rest on unverified placeholders.

**Later authorized testing:**

- Wrong source/role/project/schema and missing coverage fail with no ledger/storage effects; capture and ledger boundaries hold under concurrent changes.
- One complete encrypted bundle passes authenticated upload/readback/download with matching hashes and identity; restore only into an explicitly isolated empty destination.
- Restored counts, content fingerprints and relationships match the same snapshot; corruption and nonempty destinations are rejected.
- Copied credentials/sessions/grants are quarantined; owner recovery/login/revocation works and independent clients require explicit reauthorization.
- The independently held current recovery-key copy decrypts the intended bundle without exposing its private material.
- Lost acknowledgement/crash/partial-upload scenarios produce a clear reconciliation outcome; retries do not silently create conflicting ledger or object state.
- Scheduled success, optional retention and failure notification are observed. Measure actual snapshot age and complete service recovery against the 24-hour/two-hour targets.

**Production exit:** an explicitly authorized current backup and independent recovery custody are verified before a risky cutover; testing evidence and remaining release/client gates are reviewed; exact deployment/source mapping and rollback are approved. Keep hosted hybrid, Acer/Jarvis, automatic routing and advanced UI outside this milestone.

## Local validation and pending checkpoint

This review used separate read-only source and recovery-evidence reviews. Independent review of the draft found no architectural, authorization or scope blocker; its restore-refusal wording, evidence qualification and date corrections were applied. Documentation validation passed: whitespace/conflict checks, 52 local links/anchors, preserved historical records, branch/base identity and the exact three-document scope. No runtime tests, real backup, restore, Docker operation or live database check were needed for this documentation change; earlier test/drill results remain dated evidence.

Pending outcome: PR #49 is merged with passing post-merge CI; Vercel Git deployment guards are intact and no new deployments were observed. The schedule is explicitly disabled and recent scheduled runs skipped. Remaining blockers are current artifact freshness, independent artifact/key custody, reviewed real authority, workflow wiring, hosted transport, recurring protection and complete service recovery. The testing-first activation/recovery task is prepared locally.

Pending next action: review the task packet and resolve environment/custody/authority choices before approving execution. BobCore writeback requires verified environment/credential binding and the required scoped tool; obtain a fresh context/version and stable operation ID for the exact eventual mutation. No task creation, active decision, shared checkpoint or operational gate completion is claimed here.
