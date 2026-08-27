# BobAI Implementation Index

Last updated: 2026-08-27

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
- `.codex/config.toml` — Codex Bob Core MCP configuration.
- Microsoft Copilot / Copilot Studio — separate work/general Bob interface.

Production services:

- Bob Core: `https://bob-core.vercel.app`
- External read-only MCP: `https://bob-core.vercel.app/mcp/context`
- External scoped sync MCP: `https://bob-core.vercel.app/mcp/sync`
- Primary/privileged MCP boundary: `https://bob-core.vercel.app/mcp`

## Current release state

### Bob Core v0.2 Shared Context

Live. Structured projects, decisions, tasks, events, approved memories, activity, and authenticated project context are available through Bob Core.

### Bob Core Bootstrap Import v1

Production data acceptance passed for BobAI. `Core/imports/bobai-bootstrap-v1.json` imported seven curated project memories and one idempotent `project.imported` event without importing raw ChatGPT transcripts or changing the production schema.

The repository formalizes BobAI import identity in `.bob/project.yml`, and the Bob Project Standard defines the eight-part import contract future projects must satisfy.

Detailed records:

- `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`
- `docs/changes/2026-08-27-bobai-first-imported-project-review.md`

### RFQ Import #2 — reconciliation in progress

RFQ is now being prepared as the second Bob project.

Canonical identity:

```text
project key: rfq
name: MicroBird RFQ
repository: boisey9/bird-quote-e2e
reserved import sequence: 2
current import state: reconciling
```

The canonical repository was audited against historical RFQ/Bob context and Codex branches. Current `main`, migrations, tests, `.agents/agents.md`, Arc42, ADRs, and OpenSpec are treated as current technical truth. The starter-era root README and `boisey9/Bird-Quote` are historical evidence only when they conflict with the canonical repository.

`Core/imports/rfq-bootstrap-v1.json` contains eight curated approved RFQ memories sourced only from the canonical repository. It does not import old decisions/tasks from conversation history.

Several Codex/fix branches are already fully represented in `main` by ancestry. `codex/recovery-azure-integrated-test-20260807` remains historically divergent with branch-only commits and must be reviewed selectively; it must not be merged wholesale. The School Add-on branch is also historically divergent, but the behavior itself was explicitly promoted to `main` by later commits.

RFQ is **not yet fully imported**. Remaining gates are bootstrap validation/live import, owner-visible Bob Core registration, dedicated RFQ interface credentials, successful context retrieval, and cross-project isolation against BobAI.

Detailed record: `docs/changes/2026-08-27-rfq-import-2-bootstrap-preparation.md`.

### Bob Interface Credentials v1

Live. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens remain client-side; Bob Core stores only SHA-256 hashes and non-secret scope metadata.

RFQ must receive new RFQ-bound credentials. BobAI credentials such as `codex-bobai` must never be reused for `rfq`.

### Bob Core Two-Way Sync v1

Live. Scoped interfaces can retrieve context, record safe activity, create/update tasks, and submit owner-reviewed decision proposals through `/mcp/sync`. External interfaces cannot directly activate decisions, write memory, delete tasks, or bypass project permissions.

### Codex Bob Core Sync v1

BobAI is provisioned with a dedicated `codex-bobai` credential. Codex has successfully retrieved BobAI context and written synchronized Bob Core project state. It submitted the owner-review proposal:

```text
Codex is approved as a two-way Bob interface.
```

That proposal remains pending until the Control Center owner approval workflow passes functional acceptance.

Detailed record: `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`.

### GitHub Copilot Bob Agent MCP v1

Merged in PR #24. The repository Bob agent embeds Bob Core MCP and references a dedicated GitHub Agents secret. Final live owner acceptance remains pending.

### Microsoft Copilot Interface v1

Provisioned as its own Bob surface and isolated from GitHub Copilot. Live Copilot Studio acceptance remains pending.

### Bob Control Center v2

Live for owner login, system/project status, approvals rendering, interface/scope inventory, credential rendering, release gates, and responsive mobile/desktop presentation.

The prior Safari/Vercel `Invalid request origin.` failure was addressed by PR #36, which replaced deployment-host/origin heuristics with a signed CSRF token bound to the authenticated owner session. Both production Vercel deployments passed after merge.

The protection remains layered: signed owner session, HttpOnly/Secure/SameSite Strict cookie, signed owner-action token, server-only Bob Core credential, Bob Core authorization, and idempotent Neon decision transaction.

The decision-approval functional gate remains **open** until the owner signs in with a fresh session and successfully approves the existing Codex proposal in production. Do not mark it accepted based only on CI/deployment status.

Detailed record: `docs/changes/2026-08-27-control-center-session-csrf.md`.

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

BobAI permanently owns import sequence `1`. RFQ is the current candidate for sequence `2` and will receive it only when its import contract is complete.

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
- Project-bound credentials cannot silently switch projects.
- External AI interfaces cannot directly activate decisions or write memory.
- Decision approval is owner-controlled and the Neon transaction is idempotent/audited.
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought, raw prompts by default, or credentials.

## Known risks and open items

- Control Center owner approval still requires a live owner retest after the session-bound CSRF deployment.
- The pending Codex BobAI proposal remains open until that acceptance passes.
- RFQ Bootstrap Import #2 requires bundle validation, live idempotent import, dedicated RFQ credentials, context retrieval, and cross-project isolation proof.
- The divergent RFQ Azure recovery branch requires targeted comparison before it can be classified as superseded or selectively recovered.
- GitHub Copilot and Microsoft Copilot still require final live acceptance workflows.
- BobAI and ChatGPT do not yet have dedicated structured interface credentials.
- Four legacy Control Center read hashes remain for migration compatibility.
- Memory approval controls are not yet available in Control Center.
- FOMOflow has not yet started its Bob import audit; it follows RFQ after the RFQ import baseline is stable.

## Next recommended tasks

1. Validate and merge the RFQ Import #2 repository manifest/reconciliation PR and Bob Core bootstrap bundle PR.
2. Run the RFQ bootstrap bundle idempotently into Bob Core and verify its approved memories/project event.
3. Create RFQ reconciliation tasks in Bob Core for the divergent recovery branch and any remaining current gaps.
4. Provision a dedicated `codex-rfq` credential and run RFQ read/write plus `rfq` ↔ `bobai` isolation acceptance.
5. Retry the BobAI Codex owner decision approval with a fresh Control Center session and close that functional gate if successful.
6. Begin the FOMOflow canonical-repository audit and prepare Bob Import #3 only after RFQ establishes the second-project pattern.
7. Complete Microsoft Copilot and GitHub Copilot live acceptance.
8. Add owner-approved memory proposal controls and eventually remove legacy read hashes.

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
- `Core/MCP.md`
- `Core/imports/README.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
