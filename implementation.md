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

### Bob Interface Credentials v1

Live in production. External interfaces use separate revocable, project-bound, surface-bound credentials. Raw tokens stay client-side; Bob Core stores SHA-256 hashes and non-secret scope metadata only.

### Bob Core Two-Way Sync v1

Live in production. Scoped interfaces can read context, record safe activity, create/update tasks, and submit owner-reviewed decision proposals through `/mcp/sync`. External interfaces cannot directly activate decisions, write memory, delete tasks, or bypass project permissions.

### GitHub Copilot Bob Agent MCP v1

Merged in PR #24. The repository Bob custom agent embeds the remote `bob-core` MCP server and references the dedicated GitHub Agents secret `COPILOT_MCP_BOB_CORE_TOKEN`. The structured `copilot-bobai` credential is enabled with the required read/sync/event/task/decision-proposal scopes. Live GitHub Copilot acceptance still requires the owner-side Agents secret configuration.

Detailed record: `docs/changes/2026-08-25-copilot-bob-agent-mcp-v1.md`.

### Codex Bob Core Sync v1

Merged in PR #27 and provisioned in Bob Core with a dedicated project-bound `codex-bobai` credential. The raw token remains only in the owner's local `~/.codex/.env`; Bob Core stores its SHA-256 hash and non-secret scope metadata.

The repository Codex configuration targets `/mcp/sync` and allowlists `bob_get_context`, `bob_record_event`, `bob_create_task`, `bob_update_task`, and `bob_propose_decision`. The credential is enabled for context read, sync, event write, task write, and decision proposal. Final live Codex desktop acceptance is still required before claiming the Codex client itself is fully connected.

Detailed record: `docs/changes/2026-08-25-codex-bob-core-sync-v1.md`.

### Microsoft Copilot Interface v1

Merged in PR #25, deployed to Bob Core and Control Center production, and provisioned with the dedicated structured `microsoft-copilot-bobai` credential. Microsoft Copilot is isolated from GitHub Copilot as its own Bob surface. Live Copilot Studio acceptance is still pending.

Detailed record: `docs/changes/2026-08-25-microsoft-copilot-interface-v1.md`.

### Bob Control Center v2

Live in production and owner-accepted for read/admin rendering after PR #21 and the Bob Core deployment correction in PR #22.

Current capabilities include project summary, release gates, owner decision approval inbox, connected-interface/scope inventory, credential enable/revoke controls, server-side Bob Core access, and mobile-responsive presentation.

Decision approval has exposed two production-only issues during Codex acceptance:

1. PR #28 fixed nullable owner-note parameters in the Bob Core approval SQL. The exact approval SQL was then executed against the real pending Codex proposal inside a rollback-only transaction and completed successfully before rollback, proving the Bob Core/Neon decision-write path is healthy.
2. PR #29 replaced `request.nextUrl.origin` with proxy-aware `Host` / `X-Forwarded-Host` validation. The production owner retest still returned `{"error":"Invalid request origin."}`, proving Vercel host metadata can still differ from the browser-visible production hostname.

The current fix on `fix/control-center-fetch-metadata-origin` uses browser Fetch Metadata as the primary same-origin signal: explicit `Sec-Fetch-Site: cross-site` is rejected and `same-origin` is accepted. Fallback Origin validation also recognizes incoming proxy hosts plus Vercel production/branch/deployment host environment values. Signed owner sessions, SameSite Strict cookies, Bob Core scopes, and project binding remain unchanged.

Detailed records:

- `docs/changes/2026-08-24-control-center-v2.md`
- `docs/changes/2026-08-26-control-center-decision-save-fix.md`
- `docs/changes/2026-08-26-control-center-origin-guard-fix.md`
- `docs/changes/2026-08-27-control-center-fetch-metadata-origin-fix.md`

## Active security boundaries

- Never commit provider keys, database URLs, bearer tokens, signing material, private keys, or other credentials.
- Raw interface credentials live only in execution environments, OS secure stores, GitHub Agents secrets, Copilot Studio secure connections, `~/.codex/.env`, or approved secret managers.
- The browser never receives a Bob Core credential or credential hash.
- `/mcp/context` is permanently read-only.
- `/mcp/sync` exposes only tools granted by the interface credential.
- `/mcp` remains separately protected.
- Project-bound credentials cannot silently switch projects.
- External AI interfaces cannot directly activate decisions or write memory.
- Owner POST actions require a signed session, SameSite Strict cookie, same-origin/Fetch Metadata validation, and Bob Core authorization.
- Activity records contain operational outcomes and safe diagnostics, never private chain-of-thought, raw prompts by default, or credentials.

## Known risks and open items

- The Fetch Metadata Control Center origin fix requires green Web build/Vercel preview, merge/deployment, and owner iPhone acceptance.
- The pending Codex decision proposal remains open until the owner can approve it successfully through Control Center.
- Codex desktop still requires live read/write/decision-proposal acceptance against `codex-bobai`.
- Microsoft Copilot still requires Copilot Studio MCP configuration and live acceptance.
- The GitHub Agents secret for the Copilot Bob agent still requires owner configuration and live acceptance.
- Four legacy Control Center read hashes remain for migration compatibility.
- BobAI and ChatGPT do not yet have dedicated structured interface credentials.
- Memory approval controls are not yet available in Control Center v2.
- Only BobAI is currently registered as a Bob Core project; a second project is needed for real multi-project isolation acceptance.

## Next recommended tasks

1. Validate, merge, and deploy `fix/control-center-fetch-metadata-origin`; re-test the existing pending Codex approval from production iPhone Safari.
2. After successful approval, verify the active Bob Core decision, completed review task, and approval event.
3. Complete Codex desktop live two-way acceptance.
4. Complete Microsoft Copilot and GitHub Copilot live acceptance.
5. Provision dedicated structured credentials for BobAI and ChatGPT.
6. Add owner-approved memory proposal controls.
7. Add the universal Add Project to Bob workflow and register a second project.
8. Expand BobAI iPhone project-state and approval views.
9. Remove legacy read hashes after a stable structured-credential migration window.

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
- `Core/MCP.md`
- `Web/README.md`
- `docs/standards/bob-project-standard-v1.md`
- `docs/standards/bob-interface-standard-v1.md`
- `docs/standards/bob-activity-standard-v1.md`
