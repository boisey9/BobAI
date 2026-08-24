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
- Bob Core MCP — shared context and scoped two-way project synchronization.
- `.github/agents/bob.agent.md` — GitHub Copilot custom Bob agent profile.

Production services:

- Bob Core: `https://bob-core.vercel.app`
- External read-only MCP: `https://bob-core.vercel.app/mcp/context`
- External scoped sync MCP: `https://bob-core.vercel.app/mcp/sync`
- Primary/privileged MCP boundary: `https://bob-core.vercel.app/mcp`

## Current release state

### Bob Core v0.2 Shared Context

Live in production. Structured projects, decisions, tasks, events, approved memories, activity, and authenticated `/v1/context` are available through the shared Bob Core service.

### Bob Control Center Web v1

Live in production. Owner login, Core status, memory/shared-context status, project state, and activity are functioning through server-side Bob Core access. The browser does not receive the Bob Core credential.

### Bob Interface Credentials v1

Live in production. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens remain client-side; Bob Core stores SHA-256 hashes and non-secret scope metadata only.

Current read scopes:

```text
status:read
context:read
activity:read
mcp:context:read
```

### Bob Core Two-Way Sync v1

Implementation complete on the feature branch. It adds a deliberately constrained synchronization layer for Copilot and future Bob interfaces.

New scopes:

```text
mcp:sync
mcp:event:write
mcp:task:write
mcp:decision:propose
```

New external endpoint:

```text
https://bob-core.vercel.app/mcp/sync
```

New tools:

- `bob_record_event`;
- `bob_create_task`;
- `bob_update_task`;
- `bob_propose_decision`.

Safety boundaries:

- direct memory writes unavailable;
- direct active-decision writes unavailable;
- decision proposals create owner-review tasks;
- task deletion/cancellation unavailable;
- arbitrary event types unavailable;
- every write uses an idempotent operation ID;
- trusted project, surface, interface ID, and scopes come from the verified credential.

Detailed record: `docs/changes/2026-08-24-bob-core-two-way-sync-v1.md`.

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, or private keys.
- Raw interface credentials live only in execution environments, OS secure stores, or approved secret managers.
- Bob Core project metadata stores hashes and non-secret scope/identity metadata only.
- `/mcp/context` is permanently read-only.
- `/mcp/sync` exposes only tools granted by the interface credential.
- `/mcp` remains separately protected.
- A project-bound interface credential cannot retrieve or mutate another Bob project.
- External interfaces cannot directly activate decisions or write memory.
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought or raw prompts by default.
- Approved memory, conversation history, executable tools, and authoritative project decisions remain separate layers.

## Known risks / open items

- Dedicated Copilot, Codex, and ChatGPT credentials still require live token generation, hash registration, and client acceptance.
- The standalone GitHub Copilot app must be configured with the `/mcp/sync` server and dedicated Copilot credential.
- Existing Control Center credential still uses the legacy read-hash compatibility path; migrate it to a structured `web` credential only after the new path is accepted in production.
- Codex production MCP handshake remains unaccepted until `BOB_CORE_CODEX_TOKEN` is configured in the authorized client environment.
- ChatGPT MCP connection remains future work after the scoped external MCP path is accepted.
- Direct memory mutation and active-decision writes require a separate owner-approval workflow.
- Multi-project Control Center state remains a later milestone.

## Next recommended tasks

1. Merge and deploy Bob Core Two-Way Sync v1 after green CI and Vercel preview gates.
2. Generate a dedicated Copilot credential locally and register only its hash under project `bobai`.
3. Configure the standalone GitHub Copilot app to use `/mcp/sync`.
4. Select the repository Bob custom agent and run the live two-way acceptance test.
5. Confirm a Copilot-created task/event appears in Bob Control Center and is visible from another Bob interface.
6. Submit a Copilot decision proposal and confirm it remains pending owner review.
7. Generate/configure the dedicated Codex credential and complete the real Codex handshake.
8. Connect ChatGPT with its own scoped credential.
9. Add owner approval controls in Control Center for decision proposals and future memory proposals.
10. Expand Control Center to multi-project health and release state.

## Current detailed change records

- `docs/2026-08-23-bob-control-center-web-v1.md`
- `docs/2026-08-23-bob-core-shared-context-v0.2.md`
- `docs/changes/2026-08-24-interface-credentials-v1.md`
- `docs/changes/2026-08-24-bob-core-two-way-sync-v1.md`
- `Core/MCP.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
