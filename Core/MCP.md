# Bob Core MCP

Bob Core exposes provider-independent Shared Context and audited project synchronization through authenticated MCP endpoints for Codex, GitHub Copilot, ChatGPT, and future AI interfaces.

## Endpoints

### External read-only context

```text
https://bob-core.vercel.app/mcp/context
```

Transport: Streamable HTTP.

Authentication: a dedicated Bob interface credential with scope:

```text
mcp:context:read
```

This endpoint is permanently read-only. Write tools must never be added here.

### External two-way project sync

```text
https://bob-core.vercel.app/mcp/sync
```

Transport: Streamable HTTP.

Authentication: a dedicated project-bound interface credential containing:

```text
mcp:sync
```

The tools visible on this endpoint are derived from the credential's additional scopes:

```text
mcp:context:read
mcp:event:write
mcp:task:write
mcp:decision:propose
```

The endpoint supports safe project synchronization without granting direct memory writes, direct decision activation, task deletion, or destructive operations.

### Primary Bob Core MCP

```text
https://bob-core.vercel.app/mcp
```

Authentication: the primary Bob Core device credential.

The primary endpoint remains separately protected for explicitly privileged Bob Core clients and future capabilities that require a stronger permission boundary.

## Credential model

Every interface receives its own revocable credential for the Bob project it can access. The raw token is stored only by the client or operating-system secret store. Bob Core stores only its SHA-256 hash and non-secret metadata under the project's `metadata.auth.interfaceCredentials` collection.

A credential record contains:

- interface ID;
- trusted surface;
- scopes;
- enabled state;
- project binding inherited from the project row.

Bob Core strips incoming internal identity headers, verifies the raw bearer token against stored hashes, checks endpoint scope, then injects the trusted project, surface, interface ID, and scopes. Tool arguments cannot override those bindings.

Legacy Control Center `readCredentialHashes` remain supported for REST reads during migration but are not used for new AI interfaces.

## Tools

### `bob_get_context`

Read Bob Core's bounded authoritative context:

- project metadata;
- active decisions;
- active tasks;
- recent events;
- approved relevant non-sensitive memories.

Available on `/mcp/context`, `/mcp/sync` when the credential has `mcp:context:read`, and the primary `/mcp` endpoint.

### `bob_record_event`

Record concise operational activity such as:

- work started/progress/completed/blocked;
- validation passed/failed;
- deployment completed/failed.

Requires `mcp:event:write`.

Activity contains outcomes, source, timestamp, interface identity, and a stable operation ID. It must not contain credentials, raw prompts, private reasoning, or unrelated sensitive content.

### `bob_create_task`

Create a persistent Bob Core project task, or reuse an existing task with the same title.

Requires `mcp:task:write`.

### `bob_update_task`

Update an existing task by exact title. Supported states are:

```text
open
in_progress
blocked
done
```

Task cancellation and deletion are intentionally unavailable.

Requires `mcp:task:write`.

### `bob_propose_decision`

Submit a project decision proposal for owner review.

Requires `mcp:decision:propose`.

This tool does **not** create or modify an active decision. It creates:

- a `decision.proposed` audit event;
- a high-priority owner-review task.

The decision becomes authoritative only after an approved workflow records it as an active Bob Core decision.

## Idempotency

Every write tool requires an `operationId`.

The client must:

1. generate a stable unique ID for a new operation;
2. reuse that same ID when retrying the identical operation;
3. never reuse it for different work.

Bob Core returns the prior result for a repeated identical operation and rejects an operation ID already used for another write type.

## Credential generation

From `Core/`:

```bash
npm run generate:interface-token -- copilot
npm run generate:interface-token -- codex
npm run generate:interface-token -- chatgpt
```

The command prints a raw token and SHA-256 hash.

- Store the raw token only in the interface's secure configuration.
- Register only the hash in Bob Core project metadata.
- Never commit either the raw token or a secret-bearing local configuration file.

## GitHub Copilot app

BobAI includes a repository custom agent profile at:

```text
.github/agents/bob.agent.md
```

After the standalone GitHub Copilot app is configured with the `/mcp/sync` server and a dedicated Copilot credential, select **Bob** from the agent picker. The profile requires a Bob Core preflight and tells Copilot how to synchronize tasks, progress, and decision proposals safely.

Copilot must not receive the primary Bob Core device token or the Control Center credential.

## Codex

Project-scoped Codex configuration lives at `.codex/config.toml`. It currently uses the external context endpoint and reads its dedicated bearer value from:

```text
BOB_CORE_CODEX_TOKEN
```

Codex can move to `/mcp/sync` only after its credential is deliberately granted write scopes and the live read-only handshake has passed.

## Security boundary

- `/mcp/context` is permanently read-only.
- `/mcp/sync` exposes only tools allowed by the verified credential scopes.
- `/mcp` remains separately authenticated.
- Interface credentials are project-bound and surface-bound.
- Internal identity headers cannot be supplied by the client.
- Direct active-decision writes are unavailable to external interfaces.
- Direct memory writes are unavailable to external interfaces.
- Task cancellation, deletion, and destructive operations are unavailable.
- Sensitive memories are excluded before MCP receives Shared Context.
- Project-scoped memories remain isolated by project key.
- Tool output omits internal database identifiers and arbitrary storage metadata.
- Write activity records only safe operational state and explicit decision proposals.
- Unexpected service/database failures return safe errors rather than raw upstream details.

## Validation

Automated tests cover:

- missing authentication;
- read-only endpoint tool isolation;
- sync endpoint scope-filtered tool discovery;
- trusted project/surface/interface binding;
- project isolation;
- spoofed-header removal;
- task creation, update, completion, and retry idempotency;
- event retry idempotency;
- operation-ID conflict rejection;
- decision proposal review boundaries;
- production Vercel wrapper preservation;
- legacy Control Center read compatibility.

A production client acceptance test additionally requires a dedicated interface token registered in Bob Core project metadata and stored in that client's secure configuration.
