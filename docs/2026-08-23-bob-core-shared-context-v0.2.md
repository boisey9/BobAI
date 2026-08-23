# Bob Core v0.2 — Shared Context Foundation

## Timestamp

2026-08-23 03:35 EDT

## Task name

Bob Core v0.2 — Shared Context foundation for BobAI, Codex, and ChatGPT

## Business reason

Bob must keep one durable, provider-independent project state across multiple interfaces. BobAI, Codex, ChatGPT, and future devices should not each become separate assistants with separate project memory. Bob Core therefore needs a bounded shared-context contract that can return the same current project, decisions, tasks, recent activity, and relevant approved memories to every authorized surface.

## Files reviewed

- `README.md`
- `Core/README.md`
- `Core/.env.example`
- `Core/src/app.ts`
- `Core/src/config.ts`
- `Core/src/contracts.ts`
- `Core/src/index.ts`
- `Core/src/server.ts`
- `Core/src/memory/types.ts`
- `Core/src/memory/service.ts`
- `Core/src/memory/factory.ts`
- `Core/src/memory/neon-store.ts`
- `Core/src/memory/in-memory-store.ts`
- `Core/migrations/001_memory_v0_1.sql`
- `Core/tests/app.test.ts`
- `Core/tests/config.test.ts`
- `Core/tests/memory-service.test.ts`
- `Core/tests/test-config.ts`
- `.github/workflows/bob-core.yml`
- `Memory/Role.md`
- `implementation.md`

## Files modified or added

- Added `Core/migrations/002_shared_context_v0_2.sql`
- Added `Core/src/context/types.ts`
- Added `Core/src/context/neon-store.ts`
- Added `Core/src/context/in-memory-store.ts`
- Added `Core/src/context/service.ts`
- Added `Core/src/context/factory.ts`
- Added `Core/tests/context-service.test.ts`
- Added `Core/tests/context-api.test.ts`
- Updated `Core/src/config.ts`
- Updated `Core/src/contracts.ts`
- Updated `Core/src/app.ts`
- Updated `Core/src/index.ts`
- Updated `Core/src/server.ts`
- Updated `Core/src/memory/service.ts`
- Updated `Core/src/memory/neon-store.ts`
- Updated `Core/src/memory/in-memory-store.ts`
- Updated `Core/tests/test-config.ts`
- Updated `Core/tests/config.test.ts`
- Updated `Core/tests/memory-service.test.ts`
- Updated `Core/.env.example`
- Updated `Core/README.md`
- Added this documentation file
- Updated `implementation.md`

## Summary of changes

### Shared project-state schema

Migration 002 defines provider-independent tables for:

- `bob_projects`
- `bob_decisions`
- `bob_tasks`
- `bob_events`

Projects use a stable owner-scoped `project_key`. Decisions have explicit active/superseded/revoked state. Tasks have explicit work state and priority. Events provide a bounded recent-activity stream.

### Shared Context service

`SharedContextService` assembles one bounded package for a project and requesting surface. The package contains:

- Bob Core authority metadata
- requested project
- active decisions
- active/open tasks
- recent events
- relevant approved non-sensitive memories
- request task/surface metadata

Project-scoped memories are included only when their `metadata.projectKey` matches the requested project.

### Shared Context API

Added authenticated:

```text
GET /v1/context?project=<projectKey>&task=<optional>&surface=<surface>
```

Supported surfaces for v0.2 are `bobai`, `codex`, `chatgpt`, and `other`.

### Memory metadata extension

The existing memory JSON metadata is now used explicitly for optional:

- `projectKey`
- `tags`

Project-scoped memory creation through the API requires `projectKey`.

### Project-aware duplicate semantics

Memory v0.1 previously deduplicated active memory by owner + content. That was unsafe once project metadata existed because identical text in two projects could resolve to the first project's record.

Migration 002 changes active duplicate identity to:

```text
owner + normalized content + projectKey
```

Global memories continue using an empty project key. The Neon store and in-memory test store use the same behavior.

### Deployment feature flag

Added:

```dotenv
BOB_CORE_SHARED_CONTEXT_ENABLED=false
```

The feature intentionally defaults to disabled. Merging or deploying the code cannot activate Shared Context until migration 002 has been deliberately applied and the flag is explicitly enabled.

## Security considerations

- No production database mutation was performed as part of this code implementation.
- `/v1/context` stays behind the existing Bob Core bearer-token authentication boundary.
- Shared Context payloads are not logged.
- Sensitive memories are excluded from automatic Shared Context assembly.
- Project-scoped memories are rejected from a different project's context.
- Memory continues to be treated as factual data, not system instructions.
- Existing secret/high-risk memory rejection remains unchanged.
- Shared Context is opt-in at deployment time to prevent code/schema rollout ordering failures.
- Project tables remain owner-scoped.
- Existing provider secrets and database credentials remain server-side only.

## UX and product considerations

- Clients receive structured data instead of a large opaque prompt string.
- A stable project key allows BobAI, Codex, ChatGPT, and later devices to ask for the same project state.
- The context package is intentionally bounded; clients do not receive the complete memory database or raw conversation archive.
- Decisions, tasks, events, and memories remain separate concepts so old chat text cannot silently become an authoritative project decision.

## Testing and validation

Added automated coverage for:

- Shared Context service assembly
- active vs superseded decision filtering
- active vs completed task filtering
- recent project events
- cross-project memory isolation
- Bob Core authentication on `/v1/context`
- invalid context-request validation
- unknown-project response
- structured context-package response
- Shared Context feature-flag defaults and database requirement
- identical memory text in multiple projects
- duplicate detection within the same project

GitHub Actions run `32626358277` completed successfully on PR #11. The `validate` job installed the locked dependencies, passed TypeScript checking, and passed the complete Vitest suite via `npm run check`.

## Remaining risks and next steps

1. Review migration 002 before applying it to the private Neon database.
2. Register the initial `bobai` project plus baseline active decisions/tasks/events.
3. Enable `BOB_CORE_SHARED_CONTEXT_ENABLED=true` only after database registration is verified.
4. Run a live authenticated `/v1/context` acceptance test against Bob Core.
5. Implement Bob Core MCP transport on top of the same `SharedContextService` contract.
6. Add the first Codex adapter/`AGENTS.md` workflow.
7. Connect ChatGPT to the same Bob Core MCP tools after Codex validation.

MCP write tools, automatic project-state capture, ChatGPT integration, and Codex integration are deliberately not simulated in this milestone; they are the next layer above the new Shared Context foundation.
