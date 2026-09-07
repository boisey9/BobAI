# BobAI Implementation Index

Last updated: 2026-09-07

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

### Dependable daily Bob — implementation in progress

The approved five-stage roadmap is tracked in [release gates](docs/release-gates.md). [PR #41](https://github.com/boisey9/BobAI/pull/41) merged September 7 (`1e51a5a`); migration 003 and the shared-context foundation are live in Core and Web. PostgreSQL concurrency/isolation, deployed staging browser checks, and Core/Web/iOS CI passed. Live Codex now retrieves the approved baseline memories. Real owner passkeys and physical iPhone acceptance remain open.

[PR #42](https://github.com/boisey9/BobAI/pull/42), merged as `7fd2135`, releases encrypted snapshot-consistent backups, protected empty-database restoration, backup freshness checks, and database-backed credential limits. Local Core checks pass 127 tests. An isolated PostgreSQL drill passed all 16 table counts, concurrent snapshot consistency, corruption/nonempty-destination rejection, session/grant revocation, restored task replay/update and concurrent rate limits. Protected staging, Core/Web CI and production health passed. Production request-limit accounting is active. Branch `codex/recovery-operations` tracks operational activation. The nightly workflow is disabled until its dedicated storage credential and environment are configured; no scheduled-backup or RPO claim is made yet.

Current contracts: [product](docs/product.md), [architecture](docs/architecture.md), [security](docs/security.md), [deployment/recovery](docs/deployment.md), [company IT/VARS](docs/company-it-vars.md). Details: [continuity release](docs/changes/2026-09-06-dependable-continuity-foundation.md), [recovery and limits](docs/changes/2026-09-07-encrypted-recovery-and-request-limits.md).

Production Core now uses a dedicated database runtime role; inherited owner passwords were rotated on all four existing Neon branches after an unsafe test-driver shutdown diagnostic. Old credentials are rejected, and live context plus transactional activity still pass. The isolated `codex/database-error-safety` fix adds sanitized pool diagnostics across both deployables and recovery tools. See [credential remediation and validation](docs/changes/2026-09-07-database-driver-diagnostics.md).

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

1. Complete dependable owner access and recovery activation, then each remaining stage in [release gates](docs/release-gates.md). FOMOflow's bootstrap bundle merge is already complete.
2. Run the FOMOflow bundle dry-run and live idempotent import; verify ten memories plus one import event.
3. Provision dedicated `codex-fomoflow`, connect canonical FOMOflow Codex to `/mcp/sync`, and prove read/write synchronization plus `fomoflow` ↔ `bobai` / `rfq` isolation.
4. Mark FOMOflow Import #3 `imported` only after all gates pass.
5. Start the approved Bob Core Playbook Engine implementation plan and first vertical slice for `SAAS_DEVELOPMENT_V1`.
6. Complete Microsoft Copilot and GitHub Copilot live acceptance.
7. Add owner-approved memory proposal controls and eventually remove legacy read hashes.

## Current detailed change records

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
