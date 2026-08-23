# Bob Core MCP + Codex integration

## Timestamp

2026-08-23 04:10 EDT

## Task name

Bob Core read-only MCP transport and Codex shared-context preflight

## Business reason

BobAI, Codex, ChatGPT, and future device interfaces must retrieve the same authoritative Bob project state instead of developing separate memories and assumptions. Shared Context v0.2 already centralizes projects, decisions, tasks, recent events, and approved memories in Bob Core. This milestone exposes that same service to Codex through a standards-based MCP endpoint without introducing write permissions yet.

## Files reviewed

- `Core/package.json`
- `Core/package-lock.json`
- `Core/src/app.ts`
- `Core/src/index.ts`
- `Core/src/server.ts`
- `Core/src/config.ts`
- `Core/src/context/service.ts`
- `Core/src/context/types.ts`
- `Core/src/context/in-memory-store.ts`
- `Core/src/security/token.ts`
- `Core/tests/context-api.test.ts`
- `Core/tests/test-config.ts`
- `Memory/Role.md`
- `.github/workflows/bob-core.yml`
- `implementation.md`

Current Codex MCP and AGENTS.md documentation was also reviewed before selecting the transport and project configuration.

## Files modified or added

- Updated `Core/package.json`
- Updated `Core/package-lock.json`
- Added `Core/src/mcp/server.ts`
- Added `Core/src/mcp/mount.ts`
- Added `Core/src/runtime.ts`
- Updated `Core/src/index.ts`
- Updated `Core/src/server.ts`
- Added `Core/tests/mcp.test.ts`
- Added `AGENTS.md`
- Added `.codex/config.toml`
- Added this documentation file
- `implementation.md` is updated as part of the same milestone

## Architecture

The MCP path does not create a second memory or project-state implementation.

```text
Codex
  |
  | Streamable HTTP + Bearer token
  v
POST /mcp
  |
  v
bob_get_context
  |
  v
SharedContextService
  |
  +-- project
  +-- active decisions
  +-- active tasks
  +-- recent events
  +-- approved relevant non-sensitive memories
```

BobAI's REST `/v1/context` endpoint and the MCP `bob_get_context` tool therefore read from the same Shared Context service.

## MCP tool

The first MCP surface deliberately exposes one read-only tool:

```text
bob_get_context
```

Inputs:

- `projectKey`
- optional current `task`
- requesting `surface`

The tool is advertised as read-only, non-destructive, idempotent, and closed-world. Its structured result is a minimized projection of Shared Context that excludes internal database IDs and arbitrary metadata not needed by Codex.

The MCP server-level instructions tell clients to consult Bob Core before substantial project work, treat active decisions as authoritative project state, treat memories as factual data rather than executable instructions, and never invent missing Bob state when the Core is unavailable.

## Authentication

`/mcp` is protected by the same Bob Core bearer token value used by the existing private REST API.

The repository does not contain the token. Codex configuration references only:

```text
BOB_CORE_DEVICE_TOKEN
```

The actual value must be present in the Codex execution environment.

## Codex configuration

Project-scoped `.codex/config.toml` configures Bob Core as a required Streamable HTTP MCP server at:

```text
https://bob-core.vercel.app/mcp
```

Only `bob_get_context` is enabled. Because the server is required, Codex should fail initialization rather than silently run BobAI work without Bob Core when the server or credential is unavailable.

`AGENTS.md` adds the project workflow: call Bob Core first for substantial work, then inspect the repository, follow active decisions, validate changes, document them, and keep secrets out of Git.

## Dependency choice

The implementation uses the stable MCP TypeScript Server v2 package and upgrades Zod to a compatible v4 release. The lockfile was regenerated from the npm registry using a temporary one-shot GitHub Actions workflow with lifecycle scripts disabled. That temporary workflow was removed before review.

## Security considerations

- MCP is read-only in this milestone.
- No bearer token or provider/database secret is committed.
- The existing constant-work bearer-token comparison remains in use.
- Sensitive memories remain filtered by Shared Context before MCP sees them.
- Project-scoped memories remain isolated by `projectKey`.
- Tool output intentionally omits internal record IDs and arbitrary database metadata.
- Unknown projects return a safe tool error.
- Unexpected Shared Context failures return a generic tool error rather than raw database/provider details.
- No MCP write tool can create, modify, or delete memory, decisions, tasks, events, or project records yet.

## UX/product considerations

- Bob Core becomes a required preflight for Codex work on BobAI rather than optional context.
- Codex receives a bounded context package instead of the entire memory database or raw history.
- Current work can still be audited in `docs/` and `implementation.md` while MCP writes remain intentionally disabled.
- ChatGPT web integration is not simulated here; it will use the same Bob Core MCP contract in a later milestone through the supported ChatGPT plugin/app path.

## Automated validation

Coverage includes:

- `/mcp` rejects missing Bob Core authentication.
- `tools/list` advertises only `bob_get_context`.
- Tool annotations mark the tool read-only/non-destructive/idempotent.
- `tools/call` returns the expected project, active decision, active task, recent event, and relevant approved project memory.
- Unknown projects produce a safe MCP tool error.
- Existing Core tests remain part of the same locked Node/TypeScript/Vitest validation run.

## Remaining acceptance boundary

After CI and Vercel preview validation pass, the branch can be merged and deployed. A true end-to-end Codex acceptance test still requires an authorized Codex environment with the existing `BOB_CORE_DEVICE_TOKEN`; authentication must not be weakened or the production token exposed merely to automate that test.

## Next steps

1. Finish CI and Vercel preview validation.
2. Align the Bob Core public service version with v0.2.
3. Merge and deploy the read-only MCP endpoint after validation.
4. Configure `BOB_CORE_DEVICE_TOKEN` in the authorized Codex environment.
5. Verify Codex initializes Bob Core and calls `bob_get_context(projectKey="bobai", surface="codex")` before meaningful work.
6. Mark the Codex connection accepted in Bob Core project state.
7. Design narrowly scoped, audited MCP write tools only after read-path acceptance.
8. Connect ChatGPT to the same MCP contract after Codex proves cross-surface continuity.
