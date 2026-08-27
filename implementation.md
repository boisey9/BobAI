# BobAI Implementation Index

Last updated: 2026-08-27

Detailed implementation history through 2026-08-23 is preserved in `docs/archive/implementation-through-2026-08-23.md`. Meaningful current changes are recorded under `docs/changes/`.

## Project identity

BobAI is officially **Bob Import #1** and the reference implementation for the Bob Project Standard.

Project manifest:

```text
project key: bobai
repository: boisey9/BobAI
status: active
import status: imported
import sequence: 1
reference project: true
```

Bob Core remains authoritative for registered project identity, active decisions, tasks, approved memory, permissions, and cross-interface events. The repository remains authoritative for implementation, schemas, tests, dependencies, technical documentation, and deployment configuration.

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

The repository now formalizes import identity in `.bob/project.yml`, and the Bob Project Standard defines the eight-part import contract future projects must satisfy before receiving an import sequence.

Detailed records:

- `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`
- `docs/changes/2026-08-27-bobai-first-imported-project-review.md`

### Bob Interface Credentials v1

Live. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens remain client-side; Bob Core stores only SHA-256 hashes and non-secret scope metadata.

### Bob Core Two-Way Sync v1

Live. Scoped interfaces can retrieve context, record safe activity, create/update tasks, and submit owner-reviewed decision proposals through `/mcp/sync`. External interfaces cannot directly activate decisions, write memory, delete tasks, or bypass project permissions.

### Codex Bob Core Sync v1

Provisioned with dedicated project-bound `codex-bobai` credentials. Codex has successfully retrieved BobAI context and written synchronized Bob Core project state. It submitted the pending owner-review proposal:

```text
Codex is approved as a two-way Bob interface.
```

That proposal remains pending until the Control Center owner approval flow passes production functional acceptance.

Detailed record: `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`.

### GitHub Copilot Bob Agent MCP v1

Merged in PR #24. The repository Bob agent embeds Bob Core MCP and references a dedicated GitHub Agents secret. Live owner-side secret configuration and acceptance remain pending.

### Microsoft Copilot Interface v1

Provisioned as its own Bob surface and isolated from GitHub Copilot. Live Copilot Studio acceptance remains pending.

### Bob Control Center v2

Live for owner login, status, project state, approvals rendering, interface/scope inventory, credential rendering, release gates, and responsive mobile/desktop presentation.

Decision approval has exposed several production-only issues. The Bob Core/Neon approval transaction has now been independently exercised successfully in rollback validation, while the most recent live failure is conclusively in the browser-to-Web owner-action guard: legitimate iPhone requests returned `Invalid request origin.` before Bob Core received them.

Current fix branch replaces deployment-host/origin heuristics for sensitive owner forms with a signed CSRF token bound to the existing owner session. The protection remains layered: signed owner session, SameSite Strict cookie, signed owner-action token, server-only Bob Core credential, Bob Core authorization, and idempotent Neon transaction.

Detailed current fix: `docs/changes/2026-08-27-control-center-session-csrf.md`.

The decision approval functional gate remains **open** until the owner successfully approves the existing Codex proposal in production. Do not mark it accepted based only on CI or deployment status.

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

BobAI permanently owns import sequence `1` and is the reference project for validating future imports.

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, or private keys.
- Raw interface credentials live only in execution environments, OS secure stores, GitHub Agents secrets, Copilot Studio secure connections, `~/.codex/.env`, or approved secret managers.
- Raw ChatGPT exports and private import bundles do not belong in Git history or approved memory.
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

- Session-bound CSRF owner-action changes require green Web validation, merge/deploy, and production owner acceptance.
- The pending Codex proposal remains open until that owner acceptance passes.
- Authenticated shared-context retrieval of the seven Bootstrap Import memories remains a separate acceptance check.
- GitHub Copilot and Microsoft Copilot still require their final live acceptance workflows.
- BobAI and ChatGPT do not yet have dedicated structured interface credentials.
- Four legacy Control Center read hashes remain for migration compatibility.
- Memory approval controls are not yet available in Control Center.
- Only BobAI is currently imported; importing a second project is required for real multi-project isolation acceptance.

## Next recommended tasks

1. Validate, merge, and deploy the session-bound CSRF Control Center fix; retry the existing Codex approval and verify one active decision, one completed review task, and one approval event.
2. Complete authenticated BobAI shared-context retrieval and verify the seven imported memories through Bob Core.
3. Import a second project using the formal Bob project import contract and prove isolation against BobAI.
4. Complete Microsoft Copilot and GitHub Copilot live acceptance.
5. Provision dedicated structured credentials for BobAI and ChatGPT.
6. Add owner-approved memory proposal controls.
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
- `docs/changes/2026-08-27-bob-core-bootstrap-import-v1.md`
- `docs/changes/2026-08-27-bobai-first-imported-project-review.md`
- `docs/changes/2026-08-27-control-center-session-csrf.md`
- `Core/MCP.md`
- `Core/imports/README.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
