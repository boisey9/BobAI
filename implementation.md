# BobAI Implementation Index

Last updated: 2026-08-25

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
- Microsoft Copilot / Copilot Studio — general/work Bob interface through Bob Core MCP.

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

### GitHub Copilot Bob Agent MCP v1

Merged in PR #24. The repository Bob custom agent embeds the remote `bob-core` MCP server, explicitly allowlists the five scoped Bob Core tools, and references the dedicated GitHub Agents secret `COPILOT_MCP_BOB_CORE_TOKEN`.

The structured `copilot-bobai` credential is enabled in Bob Core with project `bobai`, surface `copilot`, and the required read, sync, event, task, and decision-proposal scopes. Live GitHub Copilot acceptance still requires the owner-side Agents secret configuration.

Detailed record: `docs/changes/2026-08-25-copilot-bob-agent-mcp-v1.md`.

### Codex Bob Core Sync v1

Implementation prepared on `feature/codex-bob-core-sync-v1`.

The repository Codex configuration now targets the scoped two-way endpoint at `/mcp/sync` and allowlists:

```text
bob_get_context
bob_record_event
bob_create_task
bob_update_task
bob_propose_decision
```

A local-only provisioning helper at `scripts/provision-codex-bob-core-token.sh` generates a dedicated Codex token, writes it only to `~/.codex/.env`, and prints only the SHA-256 hash needed for Bob Core registration.

The intended `codex-bobai` credential remains pending until the owner runs the helper locally and provides the hash. Do not mark Codex connected until the structured credential is registered and live read/write/decision-proposal acceptance succeeds.

Detailed record: `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`.

### Microsoft Copilot Interface v1

Merged in PR #25, deployed to Bob Core and Control Center production, and provisioned with a dedicated structured credential.

Bob Core treats Microsoft Copilot as a distinct trusted surface:

```text
microsoft-copilot
```

This is separate from GitHub Copilot's `copilot` surface. Control Center renders Microsoft Copilot independently with its own credential status, scopes, activity, and revoke control.

The production `microsoft-copilot-bobai` credential is enabled for project `bobai` with:

```text
mcp:context:read
mcp:sync
mcp:event:write
mcp:task:write
mcp:decision:propose
```

The raw token remains only in the owner's local secure storage and the Copilot Studio secure connection. Bob Core stores the SHA-256 hash only. Live Copilot Studio acceptance is still pending.

Detailed record: `docs/changes/2026-08-25-microsoft-copilot-interface-v1.md`.

### Bob Control Center Web v1

Superseded by Control Center v2. Its owner login, server-only Bob Core access, project state, and privacy-safe activity remain part of the current implementation.

### Bob Control Center v2

Live in production and owner-accepted on iPhone after PR #21 and the Core deployment correction in PR #22.

Accepted capabilities:

- registered-project selection and project summary;
- separate Build, Runtime, and Functional release gates;
- owner approval inbox for decision proposals;
- approve/reject actions that preserve Bob Core authority;
- safe connected-interface and permission-scope inventory;
- enable/revoke controls for structured credentials;
- self-revocation protection for the active Control Center credential;
- server-side scoped administration through `/v1/control-center`;
- no token or credential-hash exposure to the browser;
- responsive mobile presentation confirmed through owner screenshots.

Production acceptance confirmed:

- Bob Core, Memory, and Shared Context online;
- administration data loaded without the prior token error;
- BobAI project summary loaded;
- structured interface credentials visible and revocable;
- owner approval inbox rendered;
- Build, Runtime, and Functional gates passed.

Detailed record: `docs/changes/2026-08-24-control-center-v2.md`.

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, or private keys.
- Raw interface credentials live only in execution environments, OS secure stores, GitHub Agents secrets, Copilot Studio secure connections, `~/.codex/.env`, or approved secret managers.
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

- Codex still requires local token generation, structured `codex-bobai` credential registration, app restart, and live two-way acceptance.
- Microsoft Copilot still requires Copilot Studio MCP configuration and live read/write/decision-proposal acceptance.
- The repository Agents secret `COPILOT_MCP_BOB_CORE_TOKEN` still requires owner configuration and live GitHub Copilot acceptance.
- Four legacy Control Center read hashes remain for migration compatibility; remove them only after the structured credential path has remained stable.
- BobAI and ChatGPT do not yet have dedicated structured interface credentials.
- ChatGPT connection remains future work after external MCP client acceptance.
- Memory approval controls are not yet available in Control Center v2.
- Credential rotation still requires trusted local raw-token generation.
- Only BobAI is currently registered as a Bob Core project; additional projects are needed to exercise real multi-project switching.

## Next recommended tasks

1. Run `scripts/provision-codex-bob-core-token.sh`, register `codex-bobai`, and complete Codex live two-way acceptance.
2. Configure Copilot Studio with `https://bob-core.vercel.app/mcp/sync` and complete Microsoft Copilot live acceptance.
3. Confirm Microsoft Copilot context, task/event sync, and decision proposal appear separately in Control Center.
4. Complete the GitHub Copilot two-way synchronization acceptance when desired.
5. Provision dedicated structured credentials for BobAI and ChatGPT.
6. Connect ChatGPT to Bob Core with its own scoped credential.
7. Add owner-approved memory proposal controls.
8. Add the universal Add Project to Bob workflow.
9. Register a second Bob project and prove multi-project switching and isolation.
10. Expand BobAI iPhone project-state and approval views.
11. Remove legacy read hashes after a stable structured-credential migration window.

## Current detailed change records

- `docs/2026-08-23-bob-control-center-web-v1.md`
- `docs/2026-08-23-bob-core-shared-context-v0.2.md`
- `docs/changes/2026-08-24-interface-credentials-v1.md`
- `docs/changes/2026-08-24-bob-core-two-way-sync-v1.md`
- `docs/changes/2026-08-24-control-center-v2.md`
- `docs/changes/2026-08-25-copilot-bob-agent-mcp-v1.md`
- `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`
- `docs/changes/2026-08-25-microsoft-copilot-interface-v1.md`
- `Core/MCP.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
