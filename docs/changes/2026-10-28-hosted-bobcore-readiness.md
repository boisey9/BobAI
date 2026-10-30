# Hosted BobCore readiness review

Date: 2026-10-28 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **local hosted-foundation review and validation complete; operational release acceptance remains open**. Branch: `codex/bobcore-hosted-readiness`. Reviewed source: `7817de4712c5c1b44e772aaeb2893f6a8beb679a`. This work changes documentation only; it does not release that source.

Follow-up later on October 28: the owner authorized the next recovery task. A [current encrypted backup and isolated Docker restore](2026-10-28-encrypted-backup-docker-restore.md) now pass complete 24-table integrity, owner recovery/login/revocation and selected Core continuity acceptance. That successor records the remaining intentional backup-role coverage gap, off-device/key-custody requirements and recurring/full-service recovery gates. The no-backup-execution statements and original next-task description below are the dated baseline of this earlier review, not the later operational result.

## Scope and completion boundary

The owner directed work to proceed on BobCore while deferring Acer and Jarvis. The current milestone is the hosted foundation: existing Core and Web on Vercel, authoritative state in Neon, owner authentication, shared context, tasks, project creation, checkpoint import, and scoped client continuity. Existing cloud-provider selection is preserved.

Acer enrollment, heartbeat, Ollama, Jarvis, automatic routing, voice, advanced dashboard work, and local-only content processing are outside this milestone. Existing hybrid contracts remain preserved and disabled. Their acceptance is not a prerequisite for completing the hosted foundation. The existing `codex/bobcore-device-heartbeat` branch remains at the same parent commit; no device implementation was added.

The owner has not lifted the local-only restrictions. There was no push, PR, merge, deployment, migration, credential/configuration change, backup export, restore, production mutation, or BobCore synchronization write. No application listener or browser session was started. This review does not approve any future release action.

## Verified baseline and authority

The repository mapping, `AGENTS.md`, and the project/interface/activity standards were read. The checkout was clean before creating the hosted-readiness branch. The reviewed local sequence is:

| Commit | Preserved work |
| --- | --- |
| `3214f48` | Phase 0 architecture and readiness documentation |
| `681ad29` | Core project identity and checkpoint authorization; missing migration 008 source restored without execution |
| `2cb86dd` | Core provider/runtime and owner project creation reconciliation |
| `fccbf79` | Web authentication, session consistency proofs and optional checkpoint consent |
| `2f49117` | Web task/context/project flows and remaining Core task APIs |
| `ce5203a` | Owner-reviewed checkpoint import and saved-source inventory |
| `7817de4` | Default-off hybrid contracts and manual routing policy; preserved but deferred |

The October 28 read-only status check refreshed GitHub `main` as `36552fc430b06b91ee1e47acef124e4ea36987c0`. The local source series is ahead of that baseline and has not been published by this work. A saved deployment payload is not a complete repository, and local reconciliation is not proof of current deployed-byte parity.

Fresh BobCore retrieval for this task returned:

| Field | Evidence |
| --- | --- |
| Authority | `bob-core`, version `0.2` |
| Project | `bobai`, UUID `10000000-0000-4000-8000-000000000001`, BobAI, active |
| Repository / requesting surface | `boisey9/BobAI` / `codex` |
| Revision | `f2ea3cb2a95c8d655fce427ed20f62723b7bbe9776e1385395b0b2ce229416e7` |
| Generated | `2026-10-28T13:28:11.044Z` |
| Sources checked | `2026-10-28T13:28:10.829Z`; all five available |
| Completeness | `partial=true`; events and memories truncated; decisions, tasks and handoffs not truncated |
| Freshness limits | Latest task update September 9; latest handoff October 23 at 12:04 UTC |
| Environment limit | No explicit environment or credential-binding field is returned; matching identity/read access does not establish complete Production client acceptance |

The critical related task remains **Complete owner access, recovery and operational reliability**, ID `b22684f4-6041-46a0-9c9d-cda955a8d21a`, version `7`, `in_progress`. It was not changed or marked complete. The September 7 active scoped-access decision supersedes the older blanket read-only description; it does not authorize writes during this local-only task. The retired staging connector was not used.

The owner-designated [Prepare BobCore readiness](codex://threads/01a1507c-319e-7789-b2d7-d0bd4dc4e01a?hostId=durable) was read during the October 28 status check. Its later operational record and the [October 26 evidence ledger](2026-10-26-bobcore-hybrid-phase-0.md#2-evidence-ledger-and-preflight) distinguish accepted owner passkey/task/chat behavior from unfinished password retirement and independent client acceptance. Older BobCore records saying authentication migrations were never applied are not current release instructions. Do not rerun migrations 004/007/008 from those older statements.

Vercel's project metadata reported Core's production deployment `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk` as READY during that status check. Detailed deployment/alias reads returned access/not-found errors, and public-URL/CLI checks could not complete. These are inspection limitations, not proof that Production is down. Canonical alias mapping and authenticated Web behavior were not freshly accepted. October 23/24 owner acceptance remains dated evidence.

## Bounded source review

The cumulative source changes and their regression coverage were reviewed at these boundaries:

| Boundary | Review result and implementation evidence |
| --- | --- |
| Core inference/runtime | [Provider transport](../../Core/src/ai/openai-provider.ts) retains one bounded SDK attempt, cancellation, `store: false`, and Core-owned context. [Error classification](../../Core/src/ai/provider-error.ts) sanitizes supported transport failures. [Runtime](../../Core/src/runtime.ts) preserves the governed router and existing provider selection. |
| Project/surface authority | [Credential gateway](../../Core/src/security/interface-credential.ts) strips/rebinds internal authority headers, confines project credentials, and requires owner-wide Web authority for [project creation](../../Core/src/control-center/projects.ts). Checkpoint writes retain explicit scope enforcement in [MCP](../../Core/src/mcp/server.ts) and OAuth. |
| Tasks and receipts | [Context service](../../Core/src/context/service.ts), [routes](../../Core/src/context/routes.ts), and both stores retain project UUID checks, task version conflicts, approval-item protection, existing receipt fingerprints and replay behavior. PostgreSQL transaction acceptance was not executed. |
| Web authentication | [Owner authentication](../../Web/lib/owner-auth.ts) contains database/adapter errors and preserves hosted-profile and fixture guards. [Sessions](../../Web/lib/session.ts) separate live owner authorization and CSRF from purpose-specific recovery/review proofs; database failure does not become legacy authentication. |
| Web task/project consumers | [Core client](../../Web/lib/bob-core.ts), [task boundary](../../Web/lib/task-api.ts) and [project route](../../Web/app/api/projects/route.ts) validate identity, bound requests, sanitize browser-visible state and check receipts. Redirects are rejected on authenticated Core fetches. |
| Checkpoint import | [Import handler](../../Web/lib/checkpoint-import.ts), [shared contract](../../Web/lib/checkpoint-import-contract.ts) and [route](../../Web/app/api/checkpoint-import/route.ts) require owner review, live session/CSRF, pinned Production origin, matching project UUID, fresh state, unexpired proof and verified receipts/readback. Partial results preserve original operation IDs. |
| Recovery/readiness | Existing [backup readiness](../../Core/src/operations/backup-readiness.ts), [workflow](../../.github/workflows/backups.yml) and [recovery runbook](../recovery.md) exist. Source implementation and a green synthetic suite do not prove a recent artifact, scheduled run or successful restoration. |

No actionable new behavior defect was identified in this bounded review. No runtime source was changed. This is review by the same implementing agent, not independent approval, a complete security audit, visual browser acceptance, or verification of every deployed source file.

## Source provenance recheck

The saved October 23 manifest was re-read from the owner's local `bobcore-production-activation-20261023/prepared-release/` evidence directory. Its SHA-256 remains `7f07e021df38a48b1ccf1cacf679c51cf5d87eb3c05259d61eb41178de4ed2c1`.

- All **110 saved runtime files** match their complete manifest hashes.
- Against reviewed source `7817de4`: **77 exact, 30 intentionally different, three omitted**. The omissions remain `Core/src/operations/staging-target.ts`, `Web/app/api/health/configuration/route.ts` and `Web/lib/staging-target.ts`.
- All **24 repository-only governed-workflow files** remain byte-identical to the pinned GitHub baseline.
- Migration `008_oauth_checkpoint_scope.sql` remains SHA-256 `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e`. It was not executed. Its dated applied-state evidence must be checked before any later schema operation.
- The earlier [inventory](2026-10-26-bobcore-source-reconciliation-inventory.md) remains pinned to the checkpoint-import slice (78 exact / 29 different / three omitted). The [hybrid successor](2026-10-26-hybrid-contracts-manual-routing.md#validation-and-source-inventory) explains the later chat guard and comment change. No unexplained replacement or missing saved-source entry was found.

## Fresh local validation

Validation used installed locked dependencies and Node `24.19.0`. Child processes received an explicit clean environment without database, provider, application credential, or local/hosted database-fixture inputs. There are no local dotenv files beyond tracked examples. Separate empty npm configuration files avoided loading private npm configuration. No dependencies were installed or updated.

| Check | October 28 result | Limit |
| --- | --- | --- |
| Core `npm run check` | TypeScript passed; **792 tests passed across 60 files** | **106 tests across six database/hosted files skipped** |
| Owned-child lifecycle | **8 passed** | Process lifecycle tests, not service/database recovery |
| Bootstrap validation | BobAI, RFQ and FOMOflow dry runs passed | No project import or write |
| Web `npm run check` | TypeScript and Next.js `16.3.2` webpack build passed | No owner login, WebAuthn ceremony, live OAuth exchange or browser runtime acceptance |
| Saved source / migration provenance | Counts and hashes above verified | Saved local payload, not fresh Production download |

Core validation completed in approximately 30 seconds; Web validation in 47 seconds. The initial npm harness attempt stopped before running checks because both configuration layers referred to the same empty file; distinct empty files corrected the harness, and both complete checks then exited zero. Next.js generated its usual `next-env.d.ts` imports/comments; only those generated changes were restored to the saved pre-build bytes.

Local logs and machine-readable results are under `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-hosted-readiness-20261028-ite2dffm/`. This temporary directory is supplemental evidence and may expire; the results and provenance needed for review are retained in this record. No private runtime settings or production payloads were added to Git.

Final documentation validation passed for the exact three-file scope: whitespace, conflict markers, balanced fences, **55 local links/anchors**, and syntax of **eight external/deep links**. Test results, inventory counts, migration hash and restored generated-file bytes matched the recorded evidence. No runtime, migration, dependency, credential or deployment file belongs to this change.

## Current recovery inventory — read-only

The Neon database skill was consulted for this bounded inspection. Existing authenticated connectors were used without reading, creating or changing credentials. Project `noisy-boat-43840462` was freshly verified as **BobAI Memory**, PostgreSQL 18. Production branch, compute and database identities were resolved before a single aggregate `SELECT` against the backup ledger. No backup or restore script was executed.

| Evidence checked October 28 | Result |
| --- | --- |
| Production branch | `br-rapid-hall-aykwycjn`, name `main`, primary/default, `protected=false` |
| Production database / compute | `neondb` / `ep-spring-haze-ay3tn3yp`, explicitly matched to the Production branch |
| Project restore history | `21600` seconds, **six hours** |
| Backup ledger | At `2026-10-28T13:46:28.233Z`, **zero runs and zero verified runs**; latest attempt, verification and retention timestamps are null |
| Neon scheduled snapshots / snapshots | Empty schedule on Production; project snapshot list empty. This is separate from the six-hour restore history. |
| Existing backup bucket | `bob-encrypted-backups`, private |
| Inspected `personal/` objects | One listed object, `personal/2026-09-07/pre-continuity.dump.age`, 48,550 bytes, last modified September 7 at 13:14:05 UTC; no content downloaded or cryptographically verified in this review |
| Scheduled GitHub backups | Ten most recent returned scheduled runs, October 18–27, all **skipped**; latest [run 40510461455](https://github.com/boisey9/BobAI/actions/runs/40510461455) was created October 27 at 13:15:35 UTC |
| Old recovery destination | `br-solitary-wind-ay86swt0`, `codex-recovery-drill-20260907`, archived since September 25 |
| Retired testing branch | `br-green-resonance-ayvz8l7o`, archived October 28; it was not connected to, resumed or reused |

These findings confirm a current recurring-recovery gap in the inspected systems. They do not establish that no other private manual artifact exists. The old object listing proves neither coverage of the current authentication schema nor successful restoration of current state. No October 28 scheduled-run result was returned by the bounded query; none is inferred.

The [existing recovery-drill target guard](../../Core/scripts/lib/recovery-drill-target.mjs) is pinned to the now-archived September recovery branch and endpoint. Keep that guard intact. A later authorized drill needs a verified isolated destination and a reviewed target binding; do not point the script at Production, revive the retired testing environment, or bypass the guard to make the test run.

## Hosted completion gates

These gates define completion of this hosted-foundation milestone. The larger five-stage roadmap remains separate; deferring device work does not waive hosted recovery or access requirements.

| Gate | Current evidence | Required to close |
| --- | --- | --- |
| H1 — reviewed release source | Local reconciliation and fresh build/unit/contract validation pass | Independent review of the exact candidate and any resulting corrections; a separately authorized publication/release |
| H2 — recovery prerequisite | October 28 inspection confirms a six-hour restore window, unprotected Production branch, empty backup ledger, no scheduled/listed Neon snapshots, ten skipped backup runs and only an old object in the inspected private prefix | Fresh verified artifact; successful isolated restoration; table/relationship and approved-context checks; owner-access recovery; copied session/grant/token revocation; key custody; measured end-to-end RPO/RTO; observed recurring protection and retention/failure evidence |
| H3 — real persistence and auth | Synthetic route/service tests pass; older PostgreSQL drills exist | Explicitly isolated database/session/OAuth acceptance for the chosen candidate: concurrent identical/conflicting operations, restart/readback, rollback, effective role privileges, project isolation, revocation and recovery |
| H4 — canonical owner access | October 23/24 owner acceptance of passkeys, task persistence and chat | Fresh canonical-origin acceptance, preserved working passkeys and recovery, then separately approved commissioning-password retirement with rollback evidence |
| H5 — independent client continuity | Current BobAI/Codex context read succeeds; identity and surface match; complete environment/binding evidence is absent | Verify each client's origin/project/surface and scopes; scoped write, identical retry and cross-interface readback; conflicting operation and revoked/underscoped denial; any decision proposal stays pending; Personal remains separately authorized |
| H6 — hosted runtime and release acceptance | Core project metadata reports READY; current detailed inspection is limited | Verified canonical Core/Web deployment mapping to the reviewed candidate, healthy runtime diagnostics and provider failure handling, accepted owner task/chat/project/checkpoint flows, and a documented rollback target |
| H7 — shared release record | Local technical record exists; current BobCore task/handoff state is dated | After scoped writes are authorized, reconcile current evidence through verified identity, stable operation IDs, expected task versions and receipt/readback; do not upload old pending notes blindly |

Recovery targets in the existing [deployment contract](../deployment.md#backup-and-disaster-restoration-gate) are **RPO 24 hours and complete RTO two hours**. A five-second historical database restore does not measure complete service recovery, and the freshly observed six-hour provider restore window does not replace the artifact/restore gate.

Do not run an integration fixture merely because its test is skipped: enabling the existing fixtures can create schemas, roles and credentials. Those operations remain outside the current no-migration/no-credential scope. Likewise, a read-only status check is not permission to dispatch backups, change schedules, retire passwords, create grants or promote a deployment.

## Exact next task and execution order

**Next task: create and verify a current encrypted BobCore backup, then restore it into an explicitly isolated destination before any Production cutover.** The database/backup inventory above is complete; canonical deployment inspection remains limited. The old drill destination is archived, so first establish an authorized empty PostgreSQL 18 destination and review its target binding without weakening the guard. Use the existing recovery tools and preserve source Production data. The review packet must identify the exact artifact, source/destination identities, integrity results, owner-access and copied-credential revocation results, and measured RPO/RTO. Stop if a target or credential boundary cannot be verified. Creating the destination, exporting/uploading a backup, recording its verification, restoring schema/data and changing copied credentials require separately scoped execution authority under the current restrictions.

After recovery evidence is complete:

1. Independently review the exact reconciled source and execute the approved isolated persistence/authentication acceptance matrix. A source revision after this record needs appropriate revalidation.
2. Complete owner access and independent Codex/ChatGPT acceptance, including any specifically approved password retirement or consent. Preserve existing working access until the replacement is accepted.
3. Publish, merge and deploy only under later explicit approval, preserving the configured cloud provider and default-off governed/hybrid features. Verify canonical routing, runtime and owner workflows against the exact released revision; retain rollback evidence.
4. Record verified results in BobCore and the release ledger. Only then mark the hosted milestone accepted. The broader critical access/recovery task may still contain later roadmap work and must not be closed wholesale.

No Acer or Jarvis access, installation, service check or execution is needed for this sequence. Their future milestone remains deferred by owner instruction.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-28. Intended surface: `codex`. Project: `bobai`, UUID `10000000-0000-4000-8000-000000000001`. Stable operation ID: `952ef2ed-3be0-4a13-8779-026b087b590e`. Related task: `b22684f4-6041-46a0-9c9d-cda955a8d21a`, observed version `7`; obtain its current version before any later task update.

Outcome: owner deferred Acer/Jarvis; hosted foundation reviewed on local branch `codex/bobcore-hosted-readiness` at source `7817de4`. No new behavior defect found in the bounded source review. Fresh Node 24 Core checks passed 792 tests, eight lifecycle checks and three import dry runs; 106 database/hosted tests stayed skipped. Web type checking/build passed. All 110 saved source hashes, 77/30/3 dispositions, 24 preserved workflow files and migration 008 provenance reverified. Fresh read-only recovery checks confirmed an empty backup ledger, six-hour history, no Neon snapshot schedule/snapshots, ten skipped scheduled backups, one old object in the inspected prefix, and an archived drill destination. Readiness documentation distinguishes local validation, dated owner acceptance, and open operational gates.

Unresolved: independent source review, current deployment inspection, verified backup/complete restoration and recurring protection, real database/auth acceptance, password retirement, complete environment-bound two-way client acceptance, and stale BobCore release records. Hosted completion is independent of the deferred node milestone.

Next action: close the hosted recovery gate before a Production cutover, then complete the remaining hosted acceptance matrix under explicit execution scope. No production or synchronization write occurred. Reuse this operation ID only for identical checkpoint content; validate current authority/project/environment and receipts before any authorized upload.
