# BobAI Implementation Index

Last updated: 2026-08-24

This file is the compact current-state index for BobAI. Detailed implementation history through 2026-08-23 is preserved in `docs/archive/implementation-through-2026-08-23.md`. Meaningful new changes belong in `docs/changes/` and are linked here.

## Current architecture

Bob Core is the authoritative owner of Bob continuity: approved memory, projects, decisions, tasks, recent cross-surface state, permissions, and tool orchestration. The repository is authoritative for implementation, tests, schemas, dependencies, and deployment configuration. AI providers and user-facing clients are replaceable interfaces/reasoning engines.

Runtime layout:

- `BobAI/` — native SwiftUI iPhone client.
- `Core/` — TypeScript/Hono Bob Core backend on Vercel.
- `Web/` — owner-only responsive Bob Control Center on Vercel.
- Neon PostgreSQL — durable memory and structured project state.
- Bob Core MCP — shared project context for external AI interfaces.

Production services:

- Bob Core: `https://bob-core.vercel.app`
- External read-only MCP: `https://bob-core.vercel.app/mcp/context`
- Primary/privileged MCP boundary: `https://bob-core.vercel.app/mcp`

## Current release state

### Bob Core v0.2 Shared Context

Live in production. Structured projects, decisions, tasks, events, approved memories, activity, and authenticated `/v1/context` are available through the shared Bob Core service.

### Bob Control Center Web v1

Live in production. Owner login, Core status, memory/shared-context status, project state, and activity are functioning through server-side Bob Core access. The browser does not receive the Bob Core credential.

### Bob Interface Credentials v1 — PR #19

Implementation complete and validated on the feature branch. This milestone introduces separate revocable credentials per interface/project without changing the primary iPhone/device credential or requiring a database schema migration.

Key behavior:

- structured interface credential metadata under `bob_projects.metadata.auth.interfaceCredentials`;
- raw credentials remain client-side; Bob Core stores SHA-256 hashes only;
- scopes: `status:read`, `context:read`, `activity:read`, `mcp:context:read`;
- project-bound and surface-bound authorization;
- trusted interface identity headers are stripped from incoming requests and injected only after verification;
- external AI interfaces use permanently read-only `/mcp/context`;
- primary `/mcp` stays separately protected for future privileged capabilities;
- legacy Control Center `readCredentialHashes` remain compatible during migration;
- `copilot` is now a first-class Shared Context surface;
- Codex configuration moves to `/mcp/context` with `BOB_CORE_CODEX_TOKEN`.

Validation on PR #19:

- locked dependency install passed;
- TypeScript typecheck passed;
- 18 Vitest files passed;
- 84 tests passed;
- Bob Core Vercel preview passed;
- Bob Control Center Vercel preview passed.

Detailed record: `docs/changes/2026-08-24-interface-credentials-v1.md`.

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, or private keys.
- Raw interface credentials live only in execution environments, OS secure stores, or approved secret managers.
- Bob Core project metadata stores hashes and non-secret scope/identity metadata only.
- External interface MCP is read-only by endpoint design.
- A project-bound interface credential cannot retrieve another Bob project.
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought or raw prompts by default.
- Approved memory, conversation history, executable tools, and authoritative project decisions remain separate layers.

## Known risks / open items

- Dedicated Copilot, Codex, and ChatGPT credentials still require live token generation, hash registration, and client acceptance tests after Interface Credentials v1 reaches production.
- Existing Control Center credential still uses the legacy read-hash compatibility path; migrate it to a structured interface credential only after the new path is accepted in production.
- Codex production MCP handshake remains unaccepted until `BOB_CORE_CODEX_TOKEN` is configured in the authorized client environment.
- ChatGPT MCP connection remains future work after the scoped external MCP path is accepted.
- Audited MCP write tools are intentionally not implemented yet and must use a separate privileged permission boundary.
- Multi-project Control Center state remains a later milestone.

## Next recommended tasks

1. Merge and deploy Bob Interface Credentials v1 after green build/preview gates.
2. Generate a dedicated Copilot credential locally, register only its SHA-256 hash under project `bobai`, and run the first live `/mcp/context` acceptance test.
3. Configure GitHub Copilot/VS Code to call `bob_get_context` and verify Bob Core forces `projectKey=bobai` and `surface=copilot`.
4. Generate/configure the dedicated Codex credential and complete the real Codex handshake.
5. Connect ChatGPT with its own `mcp:context:read` credential.
6. Migrate the Control Center from the legacy read-hash list to a structured `web` credential after production acceptance.
7. Design audited write-capable MCP tools behind a separate privileged endpoint/credential model.
8. Expand the Control Center to multi-project health and release state.

## Current detailed change records

- `docs/2026-08-23-bob-control-center-web-v1.md`
- `docs/2026-08-23-bob-core-shared-context-v0.2.md`
- `docs/changes/2026-08-24-interface-credentials-v1.md`
- `Core/MCP.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
