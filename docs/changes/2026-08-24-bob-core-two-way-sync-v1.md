# Bob Core Two-Way Sync v1

Date: 2026-08-24

## Objective

Allow GitHub Copilot and future Bob interfaces to keep safe project state synchronized with Bob Core without sharing the primary device credential or granting direct authority over memory and active decisions.

## Scope

This milestone adds:

- scoped external MCP sync endpoint;
- activity writes;
- task creation/reuse;
- task updates;
- owner-reviewed decision proposals;
- operation idempotency;
- trusted project/surface/interface binding;
- Bob custom-agent profile for GitHub Copilot;
- tests and documentation.

It does not add:

- direct memory writes;
- direct active-decision creation, supersession, or revocation;
- task deletion or cancellation;
- arbitrary event types;
- external communications;
- shell, deployment, database, or other executable tools;
- multi-user authorization.

## Architecture

```text
GitHub Copilot / Codex / future interface
                 |
       dedicated raw interface token
                 |
                 v
https://bob-core.vercel.app/mcp/sync
                 |
       interface credential gateway
       - verify SHA-256 hash
       - check mcp:sync
       - bind project
       - bind surface
       - bind interface ID
       - inject trusted scopes
                 |
                 v
       scope-filtered MCP tools
                 |
                 v
          SharedContextService
                 |
                 v
            Neon PostgreSQL
      tasks / events / project state
```

The existing endpoints remain:

```text
/mcp/context  permanent external read-only context
/mcp          separately protected primary Bob Core MCP
```

## Credential scopes

Two-way sync uses:

```text
mcp:sync
mcp:context:read
mcp:event:write
mcp:task:write
mcp:decision:propose
```

Tool discovery is filtered by the verified scopes. A credential without a write scope does not see that tool.

## Tools

### `bob_get_context`

Reads the credential-bound project and surface.

### `bob_record_event`

Records one of the bounded operational event kinds:

```text
work.started
work.progress
work.completed
work.blocked
validation.passed
validation.failed
deployment.completed
deployment.failed
```

### `bob_create_task`

Creates a persistent task or reuses a task with the same normalized title.

### `bob_update_task`

Updates description, priority, or status. Allowed statuses are:

```text
open
in_progress
blocked
done
```

### `bob_propose_decision`

Records a decision proposal event and creates a high-priority owner-review task. It does not create an active decision.

## Idempotency

Every write requires `operationId`.

Bob Core records the operation ID in the audit event. A retry of the same operation returns the prior state. Reuse of the same operation ID for a different event/tool fails with a safe conflict.

This prevents duplicate tasks/events when an MCP client reconnects or retries a request.

## Data changes

No schema migration is required.

The existing tables are used:

- `bob_tasks`;
- `bob_events`;
- `bob_projects`;
- `bob_decisions` remains read-only to this interface layer.

Task metadata and event details store only safe audit fields such as operation ID, trusted interface ID, trusted surface, and explicit project-state content.

## Security

- Raw interface tokens are never committed or stored in Neon.
- Bob Core stores only SHA-256 hashes and non-secret credential metadata.
- Incoming internal identity headers are removed.
- Project, surface, interface ID, and scopes are injected only after credential verification.
- `/mcp/context` remains permanently read-only.
- `/mcp/sync` requires `mcp:sync`.
- Tool registration is scope filtered.
- Direct memory writes are unavailable.
- Direct active-decision writes are unavailable.
- Task cancellation/deletion is unavailable.
- Arbitrary event types are unavailable.
- Decision proposals explicitly require owner review.
- Activity excludes raw prompts and private reasoning by design.

## GitHub Copilot agent

Added:

```text
.github/agents/bob.agent.md
```

The profile instructs Copilot to:

- retrieve Bob Core context before meaningful work;
- inspect repository truth;
- synchronize meaningful task/activity changes;
- submit decisions as proposals only;
- use stable operation IDs;
- avoid credentials, raw prompts, and private reasoning.

The MCP server itself remains configured in the Copilot app/CLI secure settings because the raw token must not enter the repository.

## Files changed

- `.github/agents/bob.agent.md`
- `AGENTS.md`
- `Core/MCP.md`
- `Core/src/context/types.ts`
- `Core/src/context/in-memory-store.ts`
- `Core/src/context/neon-store.ts`
- `Core/src/context/service.ts`
- `Core/src/security/interface-credential.ts`
- `Core/src/mcp/mount.ts`
- `Core/src/mcp/server.ts`
- `Core/tests/interface-credential.test.ts`
- `Core/tests/mcp.test.ts`
- `Core/tests/sync-service.test.ts`
- `Core/tests/vercel-entrypoint.test.ts`
- `docs/standards/bob-interface-standard-v1.md`
- `implementation.md`

## Validation plan

Required before merge:

1. locked dependency installation;
2. TypeScript typecheck;
3. complete Vitest suite;
4. interface scope isolation;
5. task/event idempotency;
6. decision proposal boundary;
7. production Vercel wrapper regression;
8. Bob Core preview deployment;
9. Control Center preview deployment.

Required after production deployment:

1. generate a dedicated Copilot token locally;
2. register only its hash in `bobai` project metadata;
3. configure standalone Copilot app MCP server at `/mcp/sync`;
4. select the Bob custom agent;
5. call `bob_get_context`;
6. create a test task;
7. confirm the task and activity appear in Bob Control Center;
8. update the task to done;
9. submit a test decision proposal;
10. confirm the active decision list is unchanged and a review task exists.

## Rollback

Code rollback:

- revert the feature merge;
- existing `/mcp/context`, primary `/mcp`, Control Center, and iPhone paths remain independent.

Credential rollback:

- set the interface credential `enabled` field to `false` or remove its metadata record;
- no other Bob interface credential is affected.

State rollback:

- sync tools do not delete data;
- test tasks/events can be marked done or removed through an owner-admin workflow if needed;
- decision proposals never become active automatically.
