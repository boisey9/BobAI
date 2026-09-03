# BobAI Implementation Index

Last updated: 2026-09-03

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

### Bob Core v0.2 Shared Context

Live. Structured projects, decisions, tasks, events, approved memories, activity, and authenticated project context are available through Bob Core.

### Bob Core Bootstrap Import v1

Production data acceptance passed for BobAI. `Core/imports/bobai-bootstrap-v1.json` imported seven curated project memories and one idempotent `project.imported` event without importing raw ChatGPT transcripts or changing the production schema.

The repository formalizes BobAI import identity in `.bob/project.yml`, and the Bob Project Standard defines the eight-part import contract future projects must satisfy.

Detailed records:

- `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`
- `docs/changes/2026-08-27-bobai-first-imported-project-review.md`

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

Detailed BobAI import-preparation record: `docs/changes/2026-08-27-rfq-import-2-bootstrap-preparation.md`.

### Bob Interface Credentials v1

Live. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens remain client-side; Bob Core stores only SHA-256 hashes and non-secret scope metadata.

Normal Bob interfaces remain strictly project-bound. RFQ proved that a credential requesting another project is either denied or bound back to its trusted project.

### Bob Core Two-Way Sync v1

Live. Scoped interfaces can retrieve context, record safe activity, create/update tasks, and submit owner-reviewed decision proposals through `/mcp/sync`. External interfaces cannot directly activate decisions, write memory, delete tasks, or bypass project permissions.

### Codex Bob Core Sync v1

BobAI uses dedicated `codex-bobai`. RFQ uses separate `codex-rfq`. Both follow the same scoped synchronization model without sharing raw credentials.

### GitHub Copilot Bob Agent MCP v1

Merged in PR #24. The repository Bob agent embeds Bob Core MCP and references a dedicated GitHub Agents secret. Final live owner acceptance remains pending.

### Microsoft Copilot Interface v1

Provisioned as its own Bob surface and isolated from GitHub Copilot. Live Copilot Studio acceptance remains pending.

### Bob Control Center v2

Live for owner login, system/project status, approvals rendering, interface/scope inventory, credential rendering, release gates, and responsive mobile/desktop presentation.

The prior Safari/Vercel owner-action issue was replaced with a signed CSRF token bound to the authenticated owner session. The protection remains layered: signed owner session, HttpOnly/Secure/SameSite Strict cookie, signed owner-action token, server-only Bob Core credential, Bob Core authorization, and idempotent decision transaction.

### Owner Multi-Project Control Center v1 — implementation in progress

RFQ Import #2 exposed a remaining owner-dashboard limitation: Bob Core contained both `bobai` and `rfq`, but the Control Center selector displayed only BobAI because its structured web credential was project-bound to the BobAI row.

The approved fix keeps every ordinary Bob interface project-bound and adds one explicit owner-admin exception:

```text
surface: web
ownerWide: true
scope: control-center:owner
```

All three conditions are required before Bob Core removes project binding from the owner Control Center credential. `ownerWide` on another surface or without `control-center:owner` remains project-bound.

The Web client now explicitly scopes context, activity, and Control Center administration calls to the selected project so owner-wide project discovery never mixes project data.

Current branch: `feature/control-center-owner-multiproject-v1`.

Required remaining gates:

1. Core tests/typecheck green.
2. Web typecheck/build green.
3. Bob Core and Control Center previews green.
4. Merge to `main` and production deploy green.
5. Upgrade only `control-center-bobai` metadata with `ownerWide: true` and `control-center:owner`; do not rotate or expose its raw token.
6. Confirm the production selector shows both BobAI and MicroBird RFQ.
7. Confirm switching to RFQ loads only RFQ project state and switching back loads BobAI.
8. Reconfirm ordinary RFQ/BobAI Codex isolation remains unchanged.

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

BobAI permanently owns import sequence `1`. RFQ owns import sequence `2` after completing the contract on 2026-09-03. FOMOflow is the planned next project only after the owner multi-project Control Center baseline is accepted.

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
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought, raw prompts by default, or credentials.

## Known risks and open items

- Owner Multi-Project Control Center v1 still requires CI, preview, production credential metadata migration, and owner functional acceptance.
- The divergent RFQ Azure recovery branch requires targeted comparison before it can be classified as superseded or selectively recovered.
- GitHub Copilot and Microsoft Copilot still require final live acceptance workflows.
- BobAI and ChatGPT do not yet have dedicated structured interface credentials for every desired workflow.
- Four legacy Control Center read hashes remain for migration compatibility.
- Memory approval controls are not yet available in Control Center.
- FOMOflow has not yet started its formal Bob import; it follows the owner multi-project Control Center acceptance.
- Bob Core Playbook Engine / `SAAS_DEVELOPMENT_V1` is approved for implementation planning but not yet implemented.

## Next recommended tasks

1. Complete Owner Multi-Project Control Center v1 and verify BobAI/RFQ switching in production.
2. Begin the FOMOflow canonical-repository audit and Bob Import #3 after the multi-project owner view is stable.
3. Start the approved Bob Core Playbook Engine implementation plan and first vertical slice for `SAAS_DEVELOPMENT_V1`.
4. Complete Microsoft Copilot and GitHub Copilot live acceptance.
5. Add owner-approved memory proposal controls and eventually remove legacy read hashes.

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
- `Core/MCP.md`
- `Core/imports/README.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
