# BobAI Implementation Index

Last updated: 2026-08-24

Detailed implementation history through 2026-08-23 is preserved in `docs/archive/implementation-through-2026-08-23.md`. Meaningful new changes are recorded under `docs/changes/`.

## Current architecture

Bob Core is the authoritative owner of Bob continuity: approved memory, projects, decisions, tasks, recent cross-surface state, interface permissions, and tool orchestration. The repository is authoritative for implementation, tests, schemas, dependencies, and deployment configuration. AI providers and user-facing clients are replaceable interfaces and reasoning engines.

Runtime layout:

- `BobAI/` — native SwiftUI iPhone client;
- `Core/` — TypeScript/Hono Bob Core backend on Vercel;
- `Web/` — owner-only responsive Bob Control Center on Vercel;
- Neon PostgreSQL — durable memory and structured project state;
- Bob Core MCP — shared context and scoped two-way project synchronization;
- `.github/agents/bob.agent.md` — GitHub Copilot custom Bob agent profile.

Production services:

- Bob Core: `https://bob-core.vercel.app`
- External read-only MCP: `https://bob-core.vercel.app/mcp/context`
- External scoped sync MCP: `https://bob-core.vercel.app/mcp/sync`
- Primary/privileged MCP boundary: `https://bob-core.vercel.app/mcp`

## Current release state

### Bob Core v0.2 Shared Context

Live in production. Structured projects, decisions, tasks, events, approved memories, activity, and authenticated project context are available through Bob Core.

### Bob Interface Credentials v1

Live in production. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens stay client-side; Bob Core stores SHA-256 hashes and non-secret scope metadata only.

### Bob Core Two-Way Sync v1

Live in production. Scoped interfaces can read context, record safe activity, create/update tasks, and submit owner-reviewed decision proposals through `/mcp/sync`. External interfaces cannot directly activate decisions, write memory, delete tasks, or bypass project permissions.

### Bob Control Center Web v1

Live in production. Owner login, Core status, memory/shared-context status, project state, and privacy-safe activity are functioning through server-side Bob Core access.

### Bob Control Center v2

Implementation candidate on `feature/control-center-v2-final-2`.

V2 adds:

- multi-project selection;
- Build, Runtime, and Functional release gates;
- owner approval inbox for decision proposals;
- approve/reject actions that preserve Bob Core authority;
- safe connected-interface and scope inventory;
- enable/revoke controls for structured credentials;
- self-revocation protection for the Control Center;
- server-side scoped administration through `/v1/control-center`;
- no token/hash exposure to the browser.

Detailed record: `docs/changes/2026-08-24-control-center-v2.md`.

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, or private keys.
- Raw interface credentials live only in execution environments, OS secure stores, or approved secret managers.
- The browser never receives a Bob Core credential.
- Bob Core administration responses never include credential hashes.
- `/mcp/context` is permanently read-only.
- `/mcp/sync` exposes only tools granted by the interface credential.
- `/mcp` remains separately protected.
- A project-bound credential cannot retrieve or mutate another Bob project.
- External AI interfaces cannot directly activate decisions or write memory.
- Owner POST actions require a signed session and same-origin request.
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought or raw prompts by default.
- Approved memory, conversation history, executable tools, and authoritative decisions remain separate layers.

## Known risks and open items

- The structured Control Center credential must be enabled in Bob Core production with read, decision-review, and credential-management scopes before V2 owner actions function.
- The standalone GitHub Copilot app still requires final MCP client configuration and live acceptance.
- Codex production MCP handshake remains pending its dedicated client credential.
- ChatGPT connection remains future work after external MCP acceptance.
- Memory approval controls are not yet available in Control Center v2.
- Credential rotation still requires trusted local raw-token generation.
- The first multi-project experience depends on registering additional Bob Core projects.

## Next recommended tasks

1. Validate Bob Control Center v2 Core and Web builds.
2. Deploy previews and confirm no secret/hash output.
3. Register the structured project-bound Control Center credential scopes.
4. Merge and deploy V2 after green build gates.
5. Run authenticated owner acceptance for approvals and credential controls.
6. Complete the standalone Copilot two-way synchronization acceptance.
7. Connect Codex and ChatGPT with separate scoped credentials.
8. Add owner-approved memory proposal controls.
9. Add the universal Add Project to Bob workflow.
10. Expand BobAI iPhone project-state and approval views.

## Current detailed change records

- `docs/2026-08-23-bob-control-center-web-v1.md`
- `docs/2026-08-23-bob-core-shared-context-v0.2.md`
- `docs/changes/2026-08-24-interface-credentials-v1.md`
- `docs/changes/2026-08-24-bob-core-two-way-sync-v1.md`
- `docs/changes/2026-08-24-control-center-v2.md`
- `Core/MCP.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
