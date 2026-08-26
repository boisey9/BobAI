# Codex Bob Core Sync v1

Date: 2026-08-25

## Objective

Connect Codex to the same Bob Core continuity used by other Bob interfaces, while keeping Codex project-bound, separately revocable, and unable to directly write memory or activate decisions.

Bob Core remains authoritative for persistent BobAI state. Codex remains the engineering interface and coding agent.

## Current state before this change

The repository already included `.codex/config.toml` with a required remote MCP connection to the read-only Bob Core endpoint:

```text
https://bob-core.vercel.app/mcp/context
```

Only `bob_get_context` was enabled. The environment variable name was already reserved as:

```text
BOB_CORE_CODEX_TOKEN
```

The live Codex handshake was not complete because a dedicated structured Codex credential had not yet been provisioned and the Codex desktop environment had not yet received the raw token.

## Repository changes

`.codex/config.toml` now targets:

```text
https://bob-core.vercel.app/mcp/sync
```

The Codex Bob interface is allowlisted for these tools:

```text
bob_get_context
bob_record_event
bob_create_task
bob_update_task
bob_propose_decision
```

This matches the existing scoped two-way Bob Core interface contract.

A helper script was added at:

```text
scripts/provision-codex-bob-core-token.sh
```

The script:

- generates a dedicated high-entropy Codex token locally on the owner's Mac;
- writes the raw token only to `~/.codex/.env` as `BOB_CORE_CODEX_TOKEN`;
- preserves other existing entries in that file;
- restricts the file to owner access;
- never prints the raw token;
- prints only the SHA-256 hash needed for Bob Core registration.

## Intended Bob Core credential

Credential identity:

```text
id: codex-bobai
surface: codex
project: bobai
enabled: true
```

Scopes:

```text
mcp:context:read
mcp:sync
mcp:event:write
mcp:task:write
mcp:decision:propose
```

The structured credential is not registered until the owner generates the token locally and supplies only its SHA-256 hash for registration.

## Security boundaries

Codex must not receive:

- memory write permission;
- direct decision activation permission;
- credential administration permission;
- project switching outside `bobai`;
- destructive task deletion/cancellation tools;
- primary Bob Core device credentials.

The raw Codex token must never be committed, copied into repository files, stored in Bob Core metadata, or pasted into chat. Bob Core stores only the SHA-256 hash and non-secret scope metadata.

## Owner provisioning step

From the BobAI repository on the owner's Mac:

```bash
bash scripts/provision-codex-bob-core-token.sh
```

The command prints only a SHA-256 value. That hash can be provided to Bob for Bob Core registration.

After Bob Core registers `codex-bobai`, restart the Codex desktop app so it reloads `~/.codex/.env` and the repository MCP configuration.

## Acceptance plan

### Read acceptance

Ask Codex to retrieve the current BobAI project context and report one active decision and the highest-priority active task without changing state.

Expected result: `bob_get_context` succeeds using the `codex` interface.

### Task and activity acceptance

Ask Codex to create a normal-priority task named `Codex synchronization test` and record a concise acceptance event.

Expected result: the task and event become visible through Bob Core and the Control Center.

### Decision-boundary acceptance

Ask Codex to propose:

```text
Codex acceptance proves Bob Core two-way synchronization.
```

Expected result: a decision-review task appears in the owner approval inbox. The proposal must not become an active decision until the owner approves it.

### Project-isolation acceptance

The credential must remain bound to `bobai`; Codex must not silently retrieve or mutate another Bob project.

## Release gates

- Repository configuration: implemented on `feature/codex-bob-core-sync-v1`.
- Dedicated local raw token: pending owner execution of the provisioning script.
- Structured Bob Core `codex-bobai` credential: pending token hash.
- Live Codex MCP handshake: pending credential registration and app restart.
- Two-way functional acceptance: pending live Codex test.

Do not mark this interface fully connected until the live MCP read/write/decision-proposal acceptance succeeds.
