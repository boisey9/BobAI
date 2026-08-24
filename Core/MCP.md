# Bob Core MCP

Bob Core exposes provider-independent Shared Context through authenticated MCP endpoints for Codex, GitHub Copilot, ChatGPT, and future AI interfaces.

## Endpoints

### External read-only interfaces

```text
https://bob-core.vercel.app/mcp/context
```

Transport: Streamable HTTP.

Authentication: a dedicated Bob interface credential with scope `mcp:context:read`.

This endpoint is intentionally permanent read-only infrastructure. Future write-capable MCP tools must not be added here.

### Primary Bob Core MCP

```text
https://bob-core.vercel.app/mcp
```

Authentication: the primary Bob Core device credential.

The primary endpoint remains reserved for explicitly privileged Bob Core clients and future capabilities that require a stronger permission boundary.

## Credential model

Every external interface receives its own revocable credential for the Bob project it is allowed to read. The raw token is stored only by the client/secret store. Bob Core stores only its SHA-256 hash and non-secret metadata under the project's `metadata.auth.interfaceCredentials` collection.

A credential record contains an ID, trusted surface, scopes, and enabled state. The project key is inherited from the project row where the credential is registered.

For read-only MCP clients, grant only:

```text
mcp:context:read
```

The gateway binds the credential's project and surface before the MCP tool executes, so a client cannot retrieve another project by changing tool arguments.

Legacy Control Center `readCredentialHashes` remain supported for REST reads during migration but are not used for new MCP interfaces.

## First tool

The read-only interface endpoint exposes:

```text
bob_get_context
```

Use it before substantial project work to retrieve Bob Core's bounded authoritative context for a project: current project metadata, active decisions, active tasks, recent events, and approved relevant non-sensitive memories.

For BobAI, the project key is:

```text
bobai
```

## Credential generation

From `Core/`:

```bash
npm run generate:interface-token -- copilot
npm run generate:interface-token -- codex
npm run generate:interface-token -- chatgpt
```

The command prints a raw token and SHA-256 hash. Store the raw token only in the interface's secure configuration and register only the hash in Bob Core project metadata. Never commit either the raw token or a secret-bearing local configuration file.

## Codex

Project-scoped Codex configuration lives at `.codex/config.toml` and points to `/mcp/context`. It reads its dedicated bearer value from:

```text
BOB_CORE_CODEX_TOKEN
```

`AGENTS.md` defines the required Bob Core preflight. Bob Core is configured as required for BobAI work, so a missing credential or unavailable Core should fail initialization rather than silently create a separate project context.

## GitHub Copilot

Configure the VS Code/User MCP server to use:

```text
https://bob-core.vercel.app/mcp/context
```

with a dedicated `copilot` interface credential. Do not use the primary Bob Core device token or the Control Center token.

## Security boundary

- External interface MCP is permanently read-only at `/mcp/context`.
- The primary `/mcp` path remains separately authenticated.
- Interface credentials are project-bound and surface-bound.
- Credentials are scope-checked before Bob Core rewrites them to the internal primary authorization path.
- Internal interface headers are stripped from incoming requests and recreated only after credential verification.
- No read-only MCP tool can create, modify, or delete memories, projects, decisions, tasks, or events.
- Sensitive memories are excluded before MCP receives Shared Context.
- Project-scoped memories remain isolated by project key.
- Tool output omits internal database identifiers and arbitrary storage metadata.
- Unexpected service/database failures return safe errors rather than raw upstream details.

## Validation

Automated tests cover:

- missing authentication is rejected;
- `tools/list` exposes only `bob_get_context`;
- the tool is marked read-only, non-destructive, and idempotent;
- interface credentials are scope checked;
- project-bound credentials cannot read another project;
- trusted project/surface bindings override conflicting MCP arguments;
- internal identity headers cannot be spoofed through the gateway;
- production Vercel wrapper preserves the credential gateway;
- legacy Control Center read hashes remain compatible.

A production client acceptance test additionally requires a dedicated interface token registered in Bob Core project metadata and stored in that client's secure configuration.
