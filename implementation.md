# BobAI Implementation Index

Last updated: 2026-08-27

Detailed implementation history through 2026-08-23 is preserved in `docs/archive/implementation-through-2026-08-23.md`. Meaningful new changes are recorded under `docs/changes/`.

## Current architecture

Bob Core is the authoritative owner of Bob continuity: approved memory, projects, decisions, tasks, recent cross-surface state, interface permissions, and tool orchestration. The repository is authoritative for implementation, tests, schemas, dependencies, and deployment configuration. AI providers and user-facing clients are replaceable interfaces and reasoning engines.

Runtime layout:

- `BobAI/` — native SwiftUI iPhone client;
- `Core/` — TypeScript/Hono Bob Core backend on Vercel;
- `Web/` — owner-only responsive Bob Control Center on Vercel;
- Neon PostgreSQL — durable memory and structured project state;
- Bob Core MCP — shared context and scoped two-way project synchronization;
- `.github/agents/bob.agent.md` — GitHub Copilot custom Bob agent profile;
- `.codex/config.toml` — Codex Bob Core MCP configuration;
- Microsoft Copilot / Copilot Studio — separate general/work Bob interface through Bob Core MCP.

Production services:

- Bob Core: `https://bob-core.vercel.app`
- External read-only MCP: `https://bob-core.vercel.app/mcp/context`
- External scoped sync MCP: `https://bob-core.vercel.app/mcp/sync`
- Primary/privileged MCP boundary: `https://bob-core.vercel.app/mcp`

## Current release state

### Bob Core v0.2 Shared Context

Live in production. Structured projects, decisions, tasks, events, approved memories, activity, and authenticated project context are available through Bob Core.

### Bob Core Bootstrap Import v1

Implemented and production data-accepted for BobAI. A deterministic JSON bundle can register a new project or add approved durable memory to an existing project using the existing v0.2 schema. Every imported memory carries project scope, approved provenance, operation ID, and bundle-hash metadata; the run records the normal memory audit trail plus one idempotent `project.imported` event.

The first curated fixture, `Core/imports/bobai-bootstrap-v1.json`, contains seven BobAI memories sourced from verified repository state and explicit BobAI project context. Raw ChatGPT transcripts are not imported. No production schema change was required.

The final branch passed Bob Core typecheck/tests/import dry-run and both Vercel previews. The reviewed bundle was then written to production Neon atomically and verified: 7 active BobAI memories, 7 memory audit events, 1 import event, matching bundle hash/provenance, and preserved project authentication metadata. Final end-to-end acceptance is an authenticated Bob Core shared-context retrieval through an authorized interface credential; that authorization boundary has not been bypassed.

Detailed record: `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`.

### Bob Interface Credentials v1

Live in production. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens stay client-side; Bob Core stores SHA-256 hashes and non-secret scope metadata only.

### Bob Core Two-Way Sync v1

Live in production. Scoped interfaces can read context, record safe activity, create/update tasks, and submit owner-reviewed decision proposals through `/mcp/sync`. External interfaces cannot directly activate decisions, write memory, delete tasks, or bypass project permissions.

### GitHub Copilot Bob Agent MCP v1

Merged in PR #24. The repository Bob custom agent embeds the remote `bob-core` MCP server and references the dedicated GitHub Agents secret `COPILOT_MCP_BOB_CORE_TOKEN`. The structured `copilot-bobai` credential is enabled with the required read/sync/event/task/decision-proposal scopes. Live GitHub Copilot acceptance still requires the owner-side Agents secret configuration.

Detailed record: `docs/changes/2026-08-25-copilot-bob-agent-mcp-v1.md`.

### Codex Bob Core Sync v1

Merged in PR #27 and provisioned in Bob Core with a dedicated project-bound `codex-bobai` credential. The raw token remains only in the owner's local `~/.codex/.env`; Bob Core stores its SHA-256 hash and non-secret scope metadata.

Codex has successfully read Bob Core context and submitted a persistent owner-review decision proposal. The proposal remains pending until Control Center can complete the owner approval write path. Final Codex acceptance is not complete until the proposal is approved through the owner boundary and the resulting active decision is visible from Bob Core.

Detailed record: `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`.

### Microsoft Copilot Interface v1

Merged in PR #25, deployed to Bob Core and Control Center production, and provisioned with the dedicated structured `microsoft-copilot-bobai` credential. Microsoft Copilot is isolated from GitHub Copilot as its own Bob surface. Live Copilot Studio acceptance is still pending.

Detailed record: `docs/changes/2026-08-25-microsoft-copilot-interface-v1.md`.

### Bob Control Center v2

Live in production and owner-accepted for read/admin rendering after PR #21 and the Bob Core deployment correction in PR #22.

Current capabilities include project summary, release gates, owner decision approval inbox, connected-interface/scope inventory, credential enable/revoke controls, server-side Bob Core access, and mobile/desktop-responsive presentation.

Decision approval exposed four production-only issues during Codex acceptance:

1. PR #28 fixed nullable owner-note parameters in the Bob Core approval SQL.
2. PR #29 and PR #30 fixed Safari/Vercel same-origin validation. The owner retest now passes the browser/Web boundary and reaches Bob Core.
3. The owner then received `decision_review_unavailable` from Bob Core while the proposal remained open. PR #31 replaced the legacy one-shot writable CTE with an explicit idempotent Neon transaction mounted ahead of the legacy handler.
4. Production retest after PR #31 still reached Bob Core but failed during the parameterized transaction. The earlier literal-SQL rollback exercise did not reproduce Neon prepared-statement type inference. PR #34 explicitly types every dynamic value passed to PostgreSQL's variadic `jsonb_build_object`, including the calling interface ID, while preserving the PR #31 transaction and authorization boundaries.

The PR #31 transaction locks the review task, creates or reuses the active decision, completes the review task only after a decision exists, deduplicates the approval/rejection event, and logs only safe request/database codes on unexpected failure. PR #34 is the focused prepared-statement correction; production owner acceptance against the existing pending Codex proposal remains the final functional gate.

Detailed records:

- `docs/changes/2026-08-24-control-center-v2.md`
- `docs/changes/2026-08-26-control-center-decision-save-fix.md`
- `docs/changes/2026-08-26-control-center-origin-guard-fix.md`
- `docs/changes/2026-08-27-control-center-fetch-metadata-origin-fix.md`
- `docs/changes/2026-08-27-control-center-approval-transaction-v2.md`
- `docs/changes/2026-08-27-control-center-approval-json-types.md`

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, private keys, or other credentials.
- Raw interface credentials live only in execution environments, OS secure stores, GitHub Agents secrets, Copilot Studio secure connections, `~/.codex/.env`, or approved secret managers.
- Raw ChatGPT exports and local/private Bob import bundles do not belong in Git history or approved memory.
- Bootstrap imports require explicit `approved: true` per memory and never activate historical decisions/tasks.
- Bootstrap import operation IDs are bound to exact bundle hashes; changed content requires a new operation ID.
- Import bundles cannot alter reserved authentication metadata or replace an already-registered project's identity/status fields.
- The browser never receives a Bob Core credential or credential hash.
- `/mcp/context` is permanently read-only.
- `/mcp/sync` exposes only tools granted by the interface credential.
- `/mcp` remains separately protected.
- Project-bound credentials cannot silently switch projects.
- External AI interfaces cannot directly activate decisions or write memory.
- Owner POST actions require a signed session, SameSite Strict cookie, same-origin/Fetch Metadata validation, and Bob Core authorization.
- Decision approval transactions lock the pending review task and deduplicate audit events.
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought, raw prompts by default, or credentials.

## Known risks and open items

- PR #34 requires green Core/Vercel validation and production owner acceptance against the existing pending Codex proposal.
- The pending Codex proposal remains open until that owner acceptance is completed.
- Bootstrap Import v1 production data acceptance passed; authenticated shared-context retrieval of the newly imported memories remains the final functional gate.
- Microsoft Copilot still requires Copilot Studio MCP configuration and live acceptance.
- The GitHub Agents secret for the Copilot Bob agent still requires owner configuration and live acceptance.
- Four legacy Control Center read hashes remain for migration compatibility.
- BobAI and ChatGPT do not yet have dedicated structured interface credentials.
- Memory approval controls are not yet available in Control Center v2.
- Only BobAI is currently registered as a Bob Core project; a second project is needed for real multi-project isolation acceptance.

## Next recommended tasks

1. Merge/deploy PR #34 after green validation, retry the existing pending Codex approval, and verify one active decision, one completed review task, and one `decision.approved` event.
2. Complete authenticated BobAI shared-context retrieval and confirm the seven imported memories are returned through Bob Core.
3. Complete Microsoft Copilot and GitHub Copilot live acceptance.
4. Provision dedicated structured credentials for BobAI and ChatGPT.
5. Add owner-approved memory proposal controls and an export-derived candidate review flow.
6. Add the universal Add Project to Bob workflow and register a second project using the bootstrap bundle pattern.
7. Expand BobAI iPhone project-state and approval views.
8. Remove legacy read hashes after a stable structured-credential migration window.

## Current detailed change records

- `docs/2026-08-23-bob-control-center-web-v1.md`
- `docs/2026-08-23-bob-core-shared-context-v0.2.md`
- `docs/changes/2026-08-24-interface-credentials-v1.md`
- `docs/changes/2026-08-24-bob-core-two-way-sync-v1.md`
- `docs/changes/2026-08-24-control-center-v2.md`
- `docs/changes/2026-08-25-copilot-bob-agent-mcp-v1.md`
- `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`
- `docs/changes/2026-08-25-microsoft-copilot-interface-v1.md`
- `docs/changes/2026-08-26-control-center-decision-save-fix.md`
- `docs/changes/2026-08-26-control-center-origin-guard-fix.md`
- `docs/changes/2026-08-27-control-center-fetch-metadata-origin-fix.md`
- `docs/changes/2026-08-27-control-center-approval-transaction-v2.md`
- `docs/changes/2026-08-27-control-center-approval-json-types.md`
- `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`
- `Core/MCP.md`
- `Core/imports/README.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
