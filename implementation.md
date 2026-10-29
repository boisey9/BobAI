# BobAI Implementation Index

Last updated: 2026-10-28

Publication scope, 2026-10-28: the owner authorized pushing `codex/integrate-backup-coverage` and opening a PR to `main`, with branch protections unchanged. Both [Core](Core/vercel.json) and [Web](Web/vercel.json) now explicitly disable automatic Git deployments for **both `main` and `codex/integrate-backup-coverage`**, preserving other branch rules and GitHub CI. The earlier direct-main push was rejected because `main` is locked and requires a reviewed PR; the owner must handle unlocking through repository settings. No merge, deployment, migration, permission or credential change is authorized. See the [feature-branch publication scope and owner instructions](docs/changes/2026-10-28-backup-snapshot-ledger-integration.md#guarded-feature-branch-publication--october-28) and [earlier rejected-push readback](docs/changes/2026-10-28-backup-snapshot-ledger-integration.md#publication-attempt-result--october-28). Earlier local-only statements below describe their original milestones; source publication does not close operational release gates.

Current owner scope, 2026-10-28: **finish the hosted BobCore foundation; Acer and Jarvis are deferred.** Local branch `codex/integrate-backup-coverage`, based on `7817de4`, integrates coverage into the held encrypted-export snapshot and separates capture from ledger writes, default-off. **83 focused checks on Node 22, 869 full Core tests on Node 24, eight lifecycle checks and three import dry runs pass.** All **17 real database cases pass on each of PostgreSQL 17.11 and 18.6**, including a complete 25-table synthetic restore. Default Core reports 123 gated cases skipped, including those 17 separately executed cases; the original 106 hosted/database cases remain gated. Web is unchanged; its earlier types/build evidence is retained.

The preceding recovery task produced a current encrypted backup and passed a complete 24-table Docker restore, owner recovery/login/revocation and selected Core continuity checks. **Production capture permissions, off-device artifact/current-key custody, recurring protection and complete hosted recovery remain open.** The integrated runner requires an explicit private plan and distinct capture/ledger credentials; no enabled plan, credential or schedule wiring was created. It has not run against Production. See the [review, integration evidence and exact next task](docs/changes/2026-10-28-backup-snapshot-ledger-integration.md), [operational recovery evidence](docs/changes/2026-10-28-encrypted-backup-docker-restore.md) and [release gates](docs/release-gates.md#current-hosted-foundation-milestone--october-28). No publication, deployment, migration, existing permission/credential change or synchronization write occurred.

Local documentation milestone 2026-10-26: **BobCore Hybrid Phase 0 architecture is documented; the hybrid runtime is not implemented or accepted.** Vercel remains the primary Command Center host, Neon and BobCore retain authority, and the Acer is the proposed secure local compute node. Optional local hosting uses the same Web application. See [architecture, readiness evidence, reconciliation inventory, and acceptance gates](docs/changes/2026-10-26-bobcore-hybrid-phase-0.md). Local branch only; no PR, deployment, migration, credential/provider change, or Production write.

Local implementation slice 2026-10-26: **Core project identity and checkpoint authorization are selectively reconciled and locally tested**, on `codex/reconcile-core-context-checkpoints`. Context exposes the stored project UUID; scoped MCP checkpoint writes reuse existing atomic receipts; optional expected-project validation preserves older REST payloads; exact migration 008 source is restored without execution. Core checks pass 504 tests plus eight lifecycle checks and three import dry runs; Web type checking passes. Database/hosted suites remain disabled (106 skipped). See [source provenance, compatibility, validation, and pending synchronization](docs/changes/2026-10-26-core-context-checkpoint-reconciliation.md). No publication or runtime acceptance is implied.

Local successor 2026-10-26: **Core provider/runtime reconciliation is implemented and tested**, on `codex/reconcile-core-provider-runtime`, based on reviewed checkpoint commit `681ad29`. It restores bounded OpenAI retry/error behavior, optional reasoning configuration, and the owner-only project-creation path while preserving governed/private runtime isolation and authentication wrappers. Core checks pass 552 tests, eight lifecycle checks, and three import dry runs; Web types pass; 106 database/hosted cases remain disabled. See [selected source, preserved behavior, validation, and pending checkpoint](docs/changes/2026-10-26-core-provider-runtime-reconciliation.md). No deployment, migration, credential/provider change, or remote publication occurred.

Local successor 2026-10-26: **Web authentication/session/consent is selectively reconciled and locally tested**, on `codex/reconcile-web-auth-session-consent`, based on reviewed provider/runtime commit `2cb86dd` (85 targeted review tests passed). The four selected Web source changes add private authentication failures, owner consistency proofs, and explicit optional checkpoint consent while retaining governed-workflow navigation and authorization gates. Core checks pass 603 tests, eight lifecycle tests and three import dry runs; 106 database/hosted cases remain skipped. Web types and webpack build pass. See [source provenance, security boundaries, tests, deferred interfaces, and pending checkpoint](docs/changes/2026-10-26-web-auth-session-consent-reconciliation.md). No credentials, Production settings, or release state changed; BobCore synchronization and live acceptance remain pending.

Local successor 2026-10-26: **Web task/context/project reconciliation and remaining Core task APIs are implemented and tested locally**, on `codex/reconcile-web-task-context`, based on reviewed authentication/session/consent commit `fccbf791fc01e939ff1516a773f9f85cbfc1cd63` (82 targeted review tests passed). Explicit task reads, approval-task protection, compatible project UUID guards, owner task/project flows, exact retry recovery, and source-aware context views reuse BobCore authority and preserve governed-workflow entry. Core checks pass **661 tests**, eight lifecycle checks and three import dry runs; **106 database/hosted cases remain skipped**. Web types/build and synthetic browser acceptance for task/project recovery and mobile layout pass. See [source selection, complete changed-file inventory, validation, remaining reconciliation and pending checkpoint](docs/changes/2026-10-26-web-task-context-project-reconciliation.md). No live task/project creation or synchronization is claimed.

Local successor 2026-10-26: **Owner-reviewed Web checkpoint import and the remaining saved-source inventory are reconciled locally**, on `codex/reconcile-web-checkpoint-import`, based on reviewed task/context/project commit `2f49117d9bbf6d9905f6a571ad3cbe54e0995505` (76 targeted review tests passed). The importer requires fresh scoped context, an exact short-lived review proof, explicit confirmation and verified receipts; partial batches recover with the original file/operation IDs. Core checks pass **702 tests**, eight lifecycle checks and three import dry runs; **106 database/hosted cases remain skipped**. Web types/build and synthetic browser confirmation/recovery/mobile checks pass. See [behavior, exact 14-file diff, limitations and pending checkpoint](docs/changes/2026-10-26-web-checkpoint-import-reconciliation.md) and [complete source inventory](docs/changes/2026-10-26-bobcore-source-reconciliation-inventory.md): 110 saved hashes verified, 78 exact matches, 29 intentional differences, three retired diagnostics omitted, and all 24 repository-only governed-workflow files preserved. No real checkpoint import, live synchronization or hybrid runtime acceptance is claimed.

Local successor 2026-10-26: **Default-off hybrid contracts and manual routing policy are implemented and validated locally**, on `codex/bobcore-hybrid-contracts`, based on reviewed checkpoint-import/source-inventory commit `ce5203ae807546978e303df9a3dab6f8b642e4e1` (83 targeted review tests passed). Strict device/heartbeat/run/lease contracts and a pure evaluator reuse BobCore context and require explicit cloud/local intent; no runtime dispatcher, endpoint or worker is enabled. Legacy chat rejects explicit hybrid routing fields before inference while valid existing requests retain their provider behavior. **90 focused hybrid tests and 792 full Core tests pass**, plus eight lifecycle checks and three import dry runs; **106 database/hosted cases remain skipped**. Web types/build pass. Fresh BobCore read now matches BobAI UUID/repository/codex, with partial and dated records; the completion checkpoint remains local under owner instruction. See [13-file scope, protocol limits, validation, context evidence and next task](docs/changes/2026-10-26-hybrid-contracts-manual-routing.md). No hybrid runtime or Acer/Ollama acceptance is claimed.

Local candidate update 2026-09-30: first-release focus is Web plus governed project workflow; native/calendar/email work is preserved and deferred per explicit owner direction. Staged durable packet service and local Web wiring pass 22 actual isolated PostgreSQL, 167 Core and 15 rendered integration checks after prerequisite candidate-binding correction; independent re-review and activation remain gated. See `docs/changes/2026-09-30-governed-workflow-slice.md`.

Local successor 2026-10-02: protected owner-workflow HTTPS and governed-only preview startup remain default-off. Fresh locked Node24 checks pass 465 Core tests, Web types/build, 77 actual PostgreSQL cases, 27 synthetic HTTPS/bootstrap cases and 38 rendered owner-flow cases; final hashes and review limits are in the task-local review packet. No hosted identity/access/configuration/deployment or production migration. See `docs/changes/2026-10-02-private-protected-https.md`.

Detailed implementation history through 2026-08-23 is preserved in `docs/archive/implementation-through-2026-08-23.md`. Meaningful current changes are recorded under `docs/changes/`.

## Project identity

BobAI is officially **Bob Import #1** and the reference implementation for the Bob Project Standard.

```text
project key: bobai
repository: boisey9/BobAI
status: active
import status: imported
import sequence: 1
reference project: true
```

Bob Core remains authoritative for registered project identity, active decisions, tasks, approved memory, permissions, and cross-interface events. Repositories remain authoritative for implementation, schemas, tests, dependencies, technical documentation, and deployment configuration.

Detailed review: `docs/changes/2026-08-27-bobai-first-imported-project-review.md`.

## Current architecture

- `BobAI/` — native SwiftUI iPhone client.
- `Core/` — TypeScript/Hono Bob Core backend on Vercel.
- `Web/` — owner-only responsive Bob Control Center on Vercel.
- Neon PostgreSQL — durable memory and structured Bob project state.
- Bob Core MCP — shared context and scoped two-way synchronization.
- `.github/agents/bob.agent.md` — GitHub Copilot Bob agent profile.
- `.codex/config.toml` — BobAI Codex Bob Core MCP configuration.
- Microsoft Copilot / Copilot Studio — separate work/general Bob interface.

Production services:

- Bob Core: `https://bob-core.vercel.app`
- External read-only MCP: `https://bob-core.vercel.app/mcp/context`
- External scoped sync MCP: `https://bob-core.vercel.app/mcp/sync`
- Primary/privileged MCP boundary: `https://bob-core.vercel.app/mcp`

## Current release state

### Current readiness checkpoint — 2026-10-28

- **Six implementation slices preserved locally:** identity/checkpoints (`681ad29`), provider/runtime (`2cb86dd`), Web authentication/session/consent (`fccbf79`), task/context/project (`2f49117`), checkpoint import/source inventory (`ce5203a`), and default-off hybrid contracts/manual policy (`7817de4`). Earlier October 28 checks passed 792 Core tests and Web types/build; the integrated backup successor now passes 869 Core tests plus 17 separately executed PostgreSQL cases on each of 17.11/18.6. The original 106 database/hosted cases remain gated. The pinned checkpoint inventory is 78 exact / 29 different / three omitted; the successor is 77 exact / 30 different / three omitted. All 110 saved hashes and 24 preserved governed-workflow files were reverified in the hosted review. This does not prove current deployed parity or independent approval. The current branch is `codex/integrate-backup-coverage`; node work on `codex/bobcore-device-heartbeat` is deferred without discarding its baseline. Complete the hosted recovery/access/release gates first.
- **Existing operational evidence:** the October 23/24 release record reports applied migrations 004/007/008 and accepted owner passkey login, task persistence, and chat. October 26 alias checks matched that release. This supersedes the older pending-passkey/auth-migration statements below; historical test results are not fresh acceptance.
- **Access evidence and remaining gates:** the owner-designated [Prepare BobCore readiness](codex://threads/01a1507c-319e-7789-b2d7-d0bd4dc4e01a?hostId=durable) remains the later operational handoff. On October 26 at 23:04 UTC the new BobCore connection returned matching BobAI UUID, repository and `codex` surface; the prior unavailable-connector limitation is partly resolved. All sources were available, but events/memories were truncated and task/handoff records predated the newer local work. No explicit environment/credential-binding field was returned; configured Production URLs alone do not complete access acceptance. Password retirement, full environment/credential and two-way client acceptance, and dated-state reconciliation remain open. Retired staging was not used. Phase 0 and implementation checkpoints remain local under the owner's local-only instruction; no task/event write, grant, credential or live consent change occurred.
- **Recovery prerequisite, refreshed October 28:** encrypted local backup `0d4fe156-a6ee-4d3e-8e5b-0e015332fa93` covers all 24 current tables. Isolated Docker PostgreSQL 18.6 restoration matched every content fingerprint, 236 constraints and 25 foreign keys; corruption/nonempty refusal, copied-access quarantine, actual owner login/recovery revocation, six baseline memories and selected task continuity checks passed. The disposable container and plaintext/password files were removed. Existing Docker had no BobCore backup container/volume. The restricted backup role deliberately lacks access to 14 auth/OAuth tables, so unattended complete backups require an approved coverage design. Off-device backup/key custody, recurring runs/retention and full hosted RPO/RTO are still unverified. The earlier empty Production ledger, skipped schedules and six-hour history are unchanged by this local task. See the [current artifact, acceptance and remaining gate](docs/changes/2026-10-28-encrypted-backup-docker-restore.md).
- **Local backup integration successor:** source/project/schema checks, read-only table locks, counts and encrypted export share one snapshot; capture closes before a separately validated ledger writer opens. Fixed `pgx` inventory parity, bounded all three object readbacks and explicit optional retention. Real PostgreSQL 17.11/18.6 fixtures pass coverage denial, capture/ledger isolation, concurrent writes/DDL and complete 25-table restoration. The export CLI is default-off; no workflow/provisioner or real permission/credential change occurred. Capture/ledger authority, hosted transport and operational activation remain unapproved/unverified. See the [fourteen-file integration and next task](docs/changes/2026-10-28-backup-snapshot-ledger-integration.md) and [earlier standalone slice](docs/changes/2026-10-28-backup-coverage-preflight.md).
- **October 28 authority/readiness update:** BobCore returned matching BobAI UUID/repository/`codex`, all sources available, and truncated events/memories. Tasks/handoff remain dated and the response lacks explicit environment/credential binding. The hosted status check could not complete canonical deployment/alias and Web acceptance reads; inspection errors are not evidence of a Production outage. October 23/24 owner acceptance remains dated evidence; recovery metadata was refreshed read-only on October 28. The [current hosted review](docs/changes/2026-10-28-hosted-bobcore-readiness.md) records the fresh revision, limits, acceptance gates and local pending checkpoint.
- **Deferred hybrid acceptance:** the future first milestone remains an authenticated Acer heartbeat followed by one successful Ollama inference routed through BobCore in verified testing. The owner deferred Acer/Jarvis on October 28; it is not a blocker for the hosted-foundation milestone. Manual routing, live Core authorization and a separate one-hour encrypted operational buffer remain planned. Hosted hybrid inference is not local-only content processing. No hybrid runtime or node acceptance is claimed.

Detailed evidence, proposed interfaces, small implementation slices, risks, and the pending checkpoint are in the [Phase 0 change record](docs/changes/2026-10-26-bobcore-hybrid-phase-0.md). Acer hardware/software and model suitability remain unverified. Documentation completion does not close any runtime or recovery gate.

### Historical dependable daily Bob release record

The following dated release narrative is preserved as historical evidence. Its live-client, pending-authentication, deployed-revision, and feature-readiness statements must be read with the October 26 checkpoint above.

The approved five-stage roadmap is tracked in [release gates](docs/release-gates.md). [PR #41](https://github.com/boisey9/BobAI/pull/41) merged September 7 (`1e51a5a`); migration 003 and the shared-context foundation are live in Core and Web. PostgreSQL concurrency/isolation, deployed staging browser checks, and Core/Web/iOS CI passed. Live Codex now retrieves the approved baseline memories. Real owner passkeys and physical iPhone acceptance remain open.

[PR #42](https://github.com/boisey9/BobAI/pull/42), merged as `7fd2135`, releases encrypted snapshot-consistent backups, protected empty-database restoration, backup freshness checks, and database-backed credential limits. Local Core checks pass 127 tests. An isolated PostgreSQL drill passed all 16 table counts, concurrent snapshot consistency, corruption/nonempty-destination rejection, session/grant revocation, restored task replay/update and concurrent rate limits. Protected staging, Core/Web CI and production health passed. Production request-limit accounting is active. Branch `codex/recovery-operations` tracks operational activation. The nightly workflow is disabled until its dedicated storage credential and environment are configured; no scheduled-backup or RPO claim is made yet.

Current contracts: [product](docs/product.md), [architecture](docs/architecture.md), [security](docs/security.md), [deployment/recovery](docs/deployment.md), [company IT/VARS](docs/company-it-vars.md). Details: [continuity release](docs/changes/2026-09-06-dependable-continuity-foundation.md), [recovery and limits](docs/changes/2026-09-07-encrypted-recovery-and-request-limits.md).

Production Core now uses a dedicated database runtime role; inherited owner passwords were rotated on all four existing Neon branches after an unsafe test-driver shutdown diagnostic. Old credentials are rejected. PR #44 merged as `9833e22` after owner approval on September 8 (Toronto); both production deployables are READY on that source and health plus transactional activity pass. Sanitized pool diagnostics cover both deployables and recovery tools. See [credential remediation and validation](docs/changes/2026-09-07-database-driver-diagnostics.md).

[PR #45](https://github.com/boisey9/BobAI/pull/45) merged as `ed0716e`; Core/Web are READY on that source. It adds owner-reviewed project OAuth at `/mcp/linked`, signed consent, PKCE, opaque-token introspection, revocation, private client provisioning, and recovery cleanup. Both review findings are fixed; 139 Core tests, final Core/Web CI and repeated PostgreSQL protocol/provisioning/browser acceptance pass. Web build and a 24-table restore passed. Production migrations 004/007 and owner-auth/OAuth activation remain pending. See [account-linking change](docs/changes/2026-09-07-project-account-linking.md) and [operator runbook](docs/account-linking.md).

[PR #46](https://github.com/boisey9/BobAI/pull/46) merged as `cbb88db`; Core/Web are READY on that source. It supplies separately restricted Web database-role provisioning. Actual private CLI, permission-denial, PostgreSQL/protocol/browser acceptance and final Core/Web CI pass; automated review completed with no findings. A fresh local encrypted production backup (ten tables) restored in five seconds and passed restored context/task replay/conflict/version acceptance. Production role/auth activation, encrypted upload and dedicated nightly storage credential creation remain pending. See [owner-access preparation](docs/changes/2026-09-08-owner-access-preparation.md).

OAuth/ChatGPT, device pairing, production owner passkeys, scheduled-backup activation, usage/spending controls, Today/offline/EventKit, QStash/APNs, the two-week pilot and company cutover remain open gates.

### Bob Core v0.2 Shared Context

Live. Structured projects, decisions, tasks, events, approved memories, activity, and authenticated project context are available through Bob Core.

### Bob Core Bootstrap Import v1

Live and proven across multiple projects. Bootstrap Import v1 moves curated, approved durable project knowledge into Bob Core without treating raw conversation history as authoritative memory.

Committed fixtures now cover:

```text
BobAI      Import #1 · 7 approved memories
RFQ        Import #2 · 8 approved memories
FOMOflow   Import #3 · 10 approved memories (prepared/reconciling)
```

The importer remains idempotent by `operationId` plus bundle hash, preserves unrelated project metadata, records approved memory provenance, and emits one `project.imported` event per completed bundle operation.

Detailed records:

- `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`
- `docs/changes/2026-08-27-bobai-first-imported-project-review.md`
- `docs/changes/2026-08-27-rfq-import-2-bootstrap-preparation.md`
- `docs/changes/2026-09-03-fomoflow-import-3-bootstrap-preparation.md`

### RFQ Import #2 — accepted

RFQ is officially the second imported Bob project.

```text
project key: rfq
name: MicroBird RFQ
repository: boisey9/bird-quote-e2e
import sequence: 2
import status: imported
imported at: 2026-09-03
```

Acceptance completed:

- live Bob Core registration verified;
- eight approved RFQ bootstrap memories verified with provenance;
- exactly one `project.imported` event verified;
- dedicated `codex-rfq` credential registered without reusing BobAI credentials;
- Codex retrieved RFQ context from Bob Core without owner re-explanation;
- Codex created and updated `Verify RFQ Codex synchronization` through `/mcp/sync`;
- Bob Core verified the task under project `rfq` and interface `codex-rfq`;
- an explicit request for `bobai` through the RFQ credential remained bound to `rfq`;
- no BobAI memories, decisions, tasks, or events were exposed;
- the RFQ verification task was closed as `done` and `project.import.accepted` was recorded;
- RFQ repository PR #5 merged the dedicated Codex configuration and final import manifest to `main`.

The divergent RFQ Azure recovery branch still requires targeted reconciliation if any of its branch-only work is considered for recovery. It must not be merged wholesale merely because it contains historical Codex work.

### FOMOflow Import #3 — reconciling

FOMOflow is now the active third-project import.

```text
project key: fomoflow
name: FOMOflow
repository: boisey9/FomoFlow
import sequence: 3
import status: reconciling
canonical import-contract merge: ec0067a90ddfd5c2bfd4909b7ef1a9fd7473b71a
```

Canonical repository preparation is complete on FOMOflow `main`:

- `.bob/project.yml` defines stable project identity and sequence 3;
- root `AGENTS.md` connects project work to Bob Core while keeping the repository authoritative for implementation;
- `docs/changes/2026-09-03-bob-core-import-3-reconciliation.md` records current V2 architecture, Supabase backend ownership, source precedence, branch reconciliation, security reconciliation, and import gates;
- FOMOflow PR #6 passed Frontend CI and Vercel Preview before merge.

The canonical audit established that the active application is the authenticated V2 shell under `src/v2/**` with Analyze, Watchlist, Alerts, and Intelligence. Supabase PostgreSQL, migrations, Edge Functions, scheduled jobs, user-scoped alert/watchlist/snapshot state, service-role-backed operations, Twelve Data integration, and Vercel are part of the current runtime picture.

Branch reconciliation at Import #3 start:

- `codex/subscription-login` is fully contained in current `main`;
- `codex/v1-cleanup` is fully contained in current `main`;
- `codex/fix-context-classification-display-bias-c712g6` is fully contained in current `main`;
- `preview` is fully contained in current `main`;
- older `codex/fix-context-classification-display-bias` has two unique commits only on retired V1 paths and must not be merged wholesale.

The committed Bob Core fixture `Core/imports/fomoflow-bootstrap-v1.json` contains six canonical source descriptors and ten approved memories covering current architecture, V2 identity, action-first decision vocabulary, fail-closed decision safety, RR policy, authoritative background-alert ownership, security reconciliation, branch reconciliation, and the AI trading-execution boundary.

Import #3 deliberately adds **no broker connectivity, order placement, autonomous trading, or external financial execution authority**. Product decision labels such as `EXECUTE LONG` / `EXECUTE SHORT` are not permission for a Bob interface to place a trade.

Remaining gates before `imported`:

1. **Merge complete:** the BobAI bootstrap preparation is present in main `51d836c82f0a00b31ee74ba6b4753cc3bfad9c74`;
2. **Dry-run complete:** local validation of `fomoflow-bootstrap-v1.json` passes;
3. live standard importer creates/reconciles the `fomoflow` project, ten approved memories, and exactly one matching `project.imported` event;
4. FOMOflow is owner-visible/selectable in Control Center;
5. dedicated `codex-fomoflow` credential is provisioned without reusing BobAI/RFQ credentials;
6. Codex reads FOMOflow context and writes one safe synchronized task/event;
7. FOMOflow credential is proven unable to read `bobai` or `rfq` state;
8. only then are Bob Core and repository import state changed to `imported`.

Security reconciliation remains an explicit FOMOflow task. The June 24 audit is historical baseline evidence, while later July hardening materially improved authentication, user scoping, alert ownership, provider loading, data-integrity handling, and production dependency findings. Remaining current launch debt includes broader legacy beta-table RLS cleanup, dependency/toolchain modernization, provider quota telemetry, and exchange-calendar work; these must be revalidated against current code before closure.

Detailed record: `docs/changes/2026-09-03-fomoflow-import-3-bootstrap-preparation.md`.

### Bob Interface Credentials v1

Live. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens remain client-side; Bob Core stores only SHA-256 hashes and non-secret scope metadata.

Normal Bob interfaces remain strictly project-bound. RFQ proved that a credential requesting another project is either denied or bound back to its trusted project. FOMOflow must receive new `fomoflow`-bound credentials; BobAI and RFQ credentials must never be reused.

### Bob Core Two-Way Sync v1

Live. Scoped interfaces can retrieve context, record safe activity, create/update tasks, and submit owner-reviewed decision proposals through `/mcp/sync`. External interfaces cannot directly activate decisions, write memory, delete tasks, or bypass project permissions.

### Codex Bob Core Sync v1

BobAI uses dedicated `codex-bobai`. RFQ uses separate `codex-rfq`. Both follow the same scoped synchronization model without sharing raw credentials. FOMOflow will receive `codex-fomoflow` only after its bootstrap import is live and verified.

### GitHub Copilot Bob Agent MCP v1

Merged in PR #24. The repository Bob agent embeds Bob Core MCP and references a dedicated GitHub Agents secret. Final live owner acceptance remains pending.

### Microsoft Copilot Interface v1

Provisioned as its own Bob surface and isolated from GitHub Copilot. Live Copilot Studio acceptance remains pending.

### Bob Control Center v2

Live for owner login, system/project status, approvals rendering, interface/scope inventory, credential rendering, release gates, and responsive mobile/desktop presentation.

The prior Safari/Vercel owner-action issue was replaced with a signed CSRF token bound to the authenticated owner session. The protection remains layered: signed owner session, HttpOnly/Secure/SameSite Strict cookie, signed owner-action token, server-only Bob Core credential, Bob Core authorization, and idempotent decision transaction.

### Owner Multi-Project Control Center v1 — accepted

Accepted in production on 2026-09-03.

The implementation keeps every ordinary Bob interface project-bound and adds one explicit owner-admin exception:

```text
surface: web
ownerWide: true
scope: control-center:owner
```

Production acceptance passed:

- Core tests/typecheck green;
- Web typecheck/build green;
- Bob Core and Control Center previews green;
- PR #38 merged to `main` as `03799bc06ff7fad0ee15e6a9994fa544e2162b49`;
- both production Vercel deployments green after merge;
- only `control-center-bobai` metadata was upgraded with `ownerWide: true` and `control-center:owner`, without token rotation or exposure;
- Bob Core confirmed two registered projects: BobAI and MicroBird RFQ;
- the production Control Center displayed `Registered projects: 2`;
- the owner selected MicroBird RFQ and received RFQ-specific administration state and the RFQ-bound `codex-rfq` interface;
- ordinary RFQ/BobAI Codex isolation remains unchanged;
- Bob Core recorded `acceptance.control_center_owner_multiproject` events for both `bobai` and `rfq`;
- docs-only PR #39 closed the repository acceptance record.

Detailed record: `docs/changes/2026-09-03-control-center-owner-multiproject-v1.md`.

## Bob project import contract

A project is fully imported only when it has:

1. a unique active Bob Core registration and stable project key;
2. a `.bob/project.yml` aligned to the Bob Project Standard;
3. matching repository/Bob Core project identity and authority boundaries;
4. project-bound decisions, tasks, events, and approved memory/context where applicable;
5. explicit project-bound interface permissions;
6. owner-visible state in Control Center;
7. at least one interface that can retrieve Bob Core context without the owner re-explaining the project;
8. proven cross-project isolation.

BobAI permanently owns import sequence `1`. RFQ owns import sequence `2`. FOMOflow is reserved as sequence `3` while reconciliation and acceptance are in progress.

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, or private keys.
- Raw interface credentials live only in execution environments, OS secure stores, GitHub Agents secrets, Copilot Studio secure connections, `~/.codex/.env`, or approved secret managers.
- Raw ChatGPT exports and private import bundles do not belong in Git history or approved memory.
- Bootstrap imports contain curated approved durable facts only; they do not silently activate historical decisions/tasks.
- The browser never receives a Bob Core credential or credential hash.
- Owner mutation forms use a signed session-bound CSRF token; browser/proxy host heuristics are not an authorization boundary.
- `/mcp/context` is permanently read-only.
- `/mcp/sync` exposes only tools granted by the verified interface credential.
- `/mcp` remains separately protected.
- Ordinary project-bound credentials cannot silently switch projects.
- `control-center:owner` is an owner-Web-only exception and requires explicit `ownerWide: true` metadata.
- External AI interfaces cannot directly activate decisions or write memory.
- Decision approval is owner-controlled and the Neon transaction is idempotent/audited.
- FOMOflow Bob integration adds no trade-execution authority; any future broker/order execution requires a separate approved architecture and consequence boundary.
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought, raw prompts by default, or credentials.

## Known risks and open items

- FOMOflow Import #3 bootstrap merge and local dry-run are complete. Live bootstrap import, dedicated Codex credential, owner visibility, read/write synchronization, and BobAI/RFQ isolation proof remain unverified.
- FOMOflow legacy security debt must be reconciled against current code, especially broader beta-era RLS and remaining launch hardening tasks.
- The divergent RFQ Azure recovery branch requires targeted comparison before it can be classified as superseded or selectively recovered.
- GitHub Copilot and Microsoft Copilot still require final live acceptance workflows.
- BobAI and ChatGPT do not yet have dedicated structured interface credentials for every desired workflow.
- Four legacy Control Center read hashes remain for migration compatibility.
- Memory approval controls are not yet available in Control Center.
- Bob Core Playbook Engine / `SAAS_DEVELOPMENT_V1` is approved for implementation planning but not yet implemented.

## Next recommended tasks

1. Prepare and independently review the integrated backup candidate's operational activation/recovery packet: verified testing source, exact capture/ledger privilege diff, disabled private plan, storage/retention boundaries, independent key custody and rollback/revocation. Do not execute grants or create credentials as part of preparation. PostgreSQL 18.6 SQL/capture/restore and no-effects refusals now pass locally; real authenticated transport, downloaded artifact restoration, current-key custody and recurring/hosted RPO/RTO remain operational gates. See the [exact next task and blockers](docs/changes/2026-10-28-backup-snapshot-ledger-integration.md#exact-next-task-and-remaining-blockers).
2. Independently review reconciled source `7817de4` and complete authorized real-database/authentication acceptance. The Core/Web reconciliation and disabled hybrid contracts already exist locally; do not repeat those slices or rerun migration 008 from its restored source filename.
3. Complete canonical owner-access/password-retirement and independent Codex/ChatGPT acceptance, with verified environment/project/surface binding, scoped write/retry/readback and isolation. Preserve working access until replacements pass acceptance.
4. Publish and release only with explicit approval; verify exact source/deployment mapping, runtime, owner workflows and rollback. Reconcile BobCore status only through an authorized scoped write and verified receipt. See the [hosted acceptance sequence](docs/changes/2026-10-28-hosted-bobcore-readiness.md#exact-next-task-and-execution-order).

Acer/Jarvis and the heartbeat/Ollama milestone are deferred by the owner's October 28 direction. They are not prerequisites for hosted-foundation completion.

### Earlier backlog — revalidate before scheduling

These older cross-project and release recommendations are retained for continuity; verify their current project state before acting. They do not supersede the hosted-foundation priority above.

1. Complete dependable owner access and recovery activation, then each remaining stage in [release gates](docs/release-gates.md). FOMOflow's bootstrap bundle merge is already complete.
2. Run the FOMOflow bundle dry-run and live idempotent import; verify ten memories plus one import event.
3. Provision dedicated `codex-fomoflow`, connect canonical FOMOflow Codex to `/mcp/sync`, and prove read/write synchronization plus `fomoflow` ↔ `bobai` / `rfq` isolation.
4. Mark FOMOflow Import #3 `imported` only after all gates pass.
5. Start the approved Bob Core Playbook Engine implementation plan and first vertical slice for `SAAS_DEVELOPMENT_V1`.
6. Complete Microsoft Copilot and GitHub Copilot live acceptance.
7. Add owner-approved memory proposal controls and eventually remove legacy read hashes.

## Current detailed change records

- [Snapshot-bound capture and separate ledger](docs/changes/2026-10-28-backup-snapshot-ledger-integration.md): prior-slice review, default-off export integration, PostgreSQL 17/18 acceptance, no-effects failures and local pending checkpoint.
- [Default-off backup coverage preflight](docs/changes/2026-10-28-backup-coverage-preflight.md): source/project/schema binding, complete-catalog denial, proposed capture authority, isolated acceptance and local pending checkpoint.
- [Current encrypted backup and Docker restore](docs/changes/2026-10-28-encrypted-backup-docker-restore.md): current 24-table artifact, isolated owner/Core acceptance, cleanup, recurring coverage gap and pending checkpoint.
- [Hosted BobCore readiness review](docs/changes/2026-10-28-hosted-bobcore-readiness.md): fresh local validation and provenance, hosted acceptance gates, deferred node scope and pending checkpoint.
- [BobCore Hybrid Phase 0 architecture and foundation](docs/changes/2026-10-26-bobcore-hybrid-phase-0.md): documentation only; source reconciliation first, recovery prerequisite, and authenticated heartbeat plus Ollama acceptance plan.
- `docs/2026-08-23-bob-control-center-web-v1.md`
- `docs/2026-08-23-bob-core-shared-context-v0.2.md`
- `docs/changes/2026-08-24-interface-credentials-v1.md`
- `docs/changes/2026-08-24-bob-core-two-way-sync-v1.md`
- `docs/changes/2026-08-24-control-center-v2.md`
- `docs/changes/2026-08-25-copilot-bob-agent-mcp-v1.md`
- `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`
- `docs/changes/2026-08-25-microsoft-copilot-interface-v1.md`
- `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`
- `docs/changes/2026-08-27-bobai-first-imported-project-review.md`
- `docs/changes/2026-08-27-control-center-session-csrf.md`
- `docs/changes/2026-08-27-rfq-import-2-bootstrap-preparation.md`
- `docs/changes/2026-09-03-control-center-owner-multiproject-v1.md`
- `docs/changes/2026-09-03-fomoflow-import-3-bootstrap-preparation.md`
- `Core/MCP.md`
- `Core/imports/README.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`

- [Private first-release workflow prototype](docs/changes/2026-09-30-project-workflow-prototype.md): isolated local desktop/mobile synthetic screen review and unwired fail-closed acceptance contract; owner UX feedback, durable transitions and live activation pending.

Local isolated continuation 2026-09-30: authorized directory selection, immutable policy-version structures and server receipt reconciliation verified with25 PostgreSQL/17 browser cases. New slice pending independent review; prior P1 checkpoint frozen. See `docs/changes/2026-09-30-directory-policy-reconciliation.md`.

Local P2 correction: coherent transaction-bound recovery/workspace and numeric history ordering verified with27 PostgreSQL/20 browser checks; independent re-review pending. Draft recovery remains a separate approved follow-on.

## 2026-09-30 — owner-auth/pinned-transaction local successor

Separate candidate preserves accepted P1 and P2 directory/recovery checkpoints. Adds authoritative-shaped owner/session resolution, bounded exact project grants, explicit isolated database target and one-connection transaction guards. Actual synthetic PostgreSQL fixtures exercise revocation-before-commit rollback, unknown COMMIT outcome/receipt reconciliation/idempotent retry, and multi-digit immutable history ordering. See docs/changes/2026-09-30-owner-auth-pinned-transaction.md and hash-bound review packet. Live adapters, grants, migrations, providers, release and optional drafts remain disabled/unimplemented.

Independent adapter P2 review corrected: exact reviewed callback operations replace SQL prefix filtering; rejected operations taint the transaction and cannot be swallowed into a commit. Actual PostgreSQL early-control rollback regressions added. See corrected hash-bound packet and preserved pre-boundary-fix review evidence.

## 2026-10-01 — local owner-session delegation successor

Owner-approved dedicated Web/Core connection uses single-use exact-action/session/project-version proofs, separate private verifier clients, current authoritative session/project checks and per-request transaction revalidation. Synthetic Web→Core→verifier→restricted workflow DB acceptance covers replay/confusion/revocation and interrupted retry; no MCP grant widening. See docs/changes/2026-10-01-owner-session-delegation.md and hash-bound successor packet. Accepted34 sources/receipts preserved; all live credentials, policy/activation and deployment remain gates.

## 2026-10-01 — actual owner-auth local acceptance

Accepted43 checkpoint preserved. Separate successor runs existing Better Auth1.7.3/Neon1.1.0 against synthetic local PostgreSQL and the actual Web/private verifier/Core path: Core197, PostgreSQL43, rendered25 pass. No live auth or hosted activation. See docs/changes/2026-10-01-local-real-owner-auth.md and frozen hash-bound review packet for limits and production gates.

## 2026-10-01 — local owner direction and synthetic encrypted recovery

Separate successor preserves accepted51/55. Versioned exact owner direction plus fail-closed evidence contract; missing real issuer/baseline remains denied. Core206 and sequential PostgreSQL43/recovery4 pass, including actual age-encrypted snapshot/restore, RLS permission failures and restored-authority quarantine/revoke-regrant. No live role strategy, deletion, hosted policy or2-hour service recovery accepted. See docs/changes/2026-10-01-owner-policy-synthetic-recovery.md and frozen review packet.

## 2026-10-01 — immutable evidence verification interfaces

Separate successor preserves accepted59. Strict signed candidate/spec/check/report verification interfaces with actual synthetic Ed25519 adversarial cases; Core230/types/emitted build pass. Real baseline/issuers and authority adapters remain unset, no SQL sink/route/live trust mounted. See docs/changes/2026-10-01-immutable-evidence-verification.md and hash-bound review packet. Owner morning behavior/check/issuer recommendations are planning, not baseline acceptance.

Independent evidence P2 correction: shared validated final acceptance time for issuer/evidence expiry; original failing source/receipt bundle preserved. Actual pre-fix regression retained; final Core239/types/build pass,33 evidence cases. Await independent re-review before dependent adapters/sink.

- 2026-10-01 local-only authenticated source/report and transactional evidence-storage successor: exact signed record/report/check bindings; same-record durable replay consumption, canonical JSONB retry comparison and scoped atomic import. See `docs/changes/2026-10-01-transactional-evidence-storage.md` and hash-bound review packet. Real issuer/baseline unset; legacy acceptance and all hosted/release gates unchanged. Test receipts, failures and final results are explicitly separated.

- 2026-10-01 integrated evidence compatibility successor: readonly candidate-bound workspace evidence summary, blocked readiness UI, preserved legacy packet/receipt/task semantics and encrypted restore of imported evidence/replay metadata. See `docs/changes/2026-10-01-integrated-evidence-compatibility.md` and final hash-bound review packet. Accepted68 preserved; baseline/issuer/current-authority adapter and all live/release activation remain unset. Actual outcomes are recorded separately from retained failed fixture/regression receipts.

## 2026-10-01 — local actual-memory preservation drill

Separate successor to accepted76, task-3/REVIEW-PRIVATE-TESTING-REQUIREMENTS.md. Real context/memory services and stores execute against disposable synthetic PostgreSQL via guarded local-only Neon transport; concurrency/retries/rollback/Personal/project filtering/truncation/decision authority/handoff/cold restart covered. See docs/changes/2026-10-01-local-memory-continuity.md and review/memory-manifest.json. Independent review pending; no runtime/catalog eligibility, issuer certification or live activation change.

Memory-drill independent P2: fixed bounded owned-child lifecycle/readiness and guaranteed database-stop attempt despite child failure; eight child regressions and three actual PG adverse-cleanup scenarios pass. Original rejected runner/history retained; correction awaits independent re-review.

## 2026-10-01 — private required-check adapters (local only)

Separate successor to accepted85/76: catalog v2 maps reviewed memory drill; authenticated scoped/signature/report adapters for required formats, separate independent-review/owner records, final authority rechecks. See docs/changes/2026-10-01-private-check-adapters.md and review/adapters-manifest.json. No runtime mounting/real trust; independent review pending.

## 2026-10-01 — inherited owner proof final-expiry correction

Separate successor to unaccepted89; identical inherited43 module confirmed. Final-after-await proof/session clock checks and post-insert issuance denial;17 deterministic boundary tests and2actual PG rollback cases. See docs/changes/2026-10-01-owner-delegation-final-expiry.md. Independent current-target follow-up blocked by platform safety restriction and not retried; local tests do not substitute for review. No live/acceptance changes.

## 2026-10-01 — persistent private-check capture/reader, local only

Accepted91 expiry review completed (task-3/REVIEW-OWNER-EXPIRY-CORRECTION.md); earlier restriction note is historical. Separate successor provides immutable PostgreSQL report capture, authenticated project-scoped reader, exact retries and generation invalidation.430 source/47 workflow/12 storage/13 new PG tests and Core type/emitted build pass. No Web runtime changes, no fresh browser or encrypted restore run in this slice. See docs/changes/2026-10-01-private-record-persistence.md; independent review pending; no live activation.

## 2026-10-01 — report runner/recovery/producer, local successor

Separate successor to frozen persistence candidate. Versioned four-suite inventories, encrypted new-schema restore/quarantine and fixed runner's synthetic producer with source-before/after binding. No live trust or routes. See docs/changes/2026-10-01-private-record-recovery-producer.md and review/recovery-producer-manifest.json for final receipts and limits; independent review pending.

## 2026-10-01 — visible workspace successor

Isolated local UI: safe post-login project entry, saved-work queue/next-action guidance, exact-candidate evidence/source details and honest History labeling. Focused5 plus selected Web type/build pass; independent synthetic PG72 pass. Full37 rendered receipt incomplete after timeout/lost supervision and read-only approval-review service timeouts. Diagnostic screens only, independent review/handoff pending; no owner server swap/extension. See docs/changes/2026-10-01-visible-project-workspace.md and review/visible-workspace-manifest.json.

- 2026-10-04: Scoped deterministic command rejection recovery; see docs/changes/2026-10-04-deterministic-workflow-rejections.md. Local successor, publication awaits independent review.
