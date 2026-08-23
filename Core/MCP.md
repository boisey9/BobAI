# Bob Core MCP

Bob Core exposes its provider-independent Shared Context through an authenticated MCP endpoint for Codex and later ChatGPT/app clients.

## Endpoint

```text
https://bob-core.vercel.app/mcp
```

Transport: Streamable HTTP.

Authentication: existing Bob Core bearer authentication.

The production bearer value is never stored in this repository. Authorized clients must provide it from their execution environment.

## First tool

The first MCP milestone intentionally exposes one read-only tool:

```text
bob_get_context
```

Use it before substantial project work to retrieve Bob Core's bounded authoritative context for a project: current project metadata, active decisions, active tasks, recent events, and approved relevant non-sensitive memories.

For BobAI, use project key:

```text
bobai
```

## Codex

Project-scoped Codex configuration lives at `.codex/config.toml` and reads the bearer value from:

```text
BOB_CORE_DEVICE_TOKEN
```

`AGENTS.md` defines the required Bob Core preflight. Bob Core is configured as required for BobAI work, so a missing credential or unavailable Core should fail initialization rather than silently create a separate project context.

## Security boundary

- MCP is read-only in this milestone.
- No MCP tool can create, modify, or delete memories, projects, decisions, tasks, or events.
- Sensitive memories are excluded before MCP receives Shared Context.
- Project-scoped memories remain isolated by project key.
- Tool output omits internal database identifiers and arbitrary storage metadata.
- Unexpected service/database failures return safe errors rather than raw upstream details.

## Validation

Automated tests cover:

- missing authentication is rejected;
- `tools/list` exposes only `bob_get_context`;
- the tool is marked read-only, non-destructive, and idempotent;
- `tools/call` returns the expected shared project context;
- unknown project keys return a safe tool error.

A true production Codex acceptance test additionally requires an authorized environment with the existing `BOB_CORE_DEVICE_TOKEN`. Do not weaken authentication or expose the token solely to automate that final client-side check.
