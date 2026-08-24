# Bob Interface Credentials v1

## Objective

Give GitHub Copilot, Codex, ChatGPT, the Control Center, and future Bob clients separate revocable credentials instead of sharing Bob Core's primary device token.

## Scope

This milestone adds a project-bound, surface-bound, scope-checked credential gateway and a dedicated permanently read-only MCP endpoint for external AI interfaces.

It does not add MCP write tools, rotate the iPhone's primary credential, expose raw credentials in Bob Core, or require a database schema migration.

## Current state before change

Bob Core used one primary bearer token for `/v1/*` and `/mcp`. A special `readCredentialHashes` list allowed the Control Center to use read-only REST endpoints after the credential was verified and internally exchanged for the primary token.

That approach proved the gateway pattern but did not provide per-interface identity, project binding, scope metadata, or a safe external MCP credential boundary.

## Design

### Structured credential metadata

New credentials are stored in a project's existing JSON metadata under:

`metadata.auth.interfaceCredentials`

Each record contains non-secret metadata:

```json
{
  "id": "copilot-bobai",
  "hash": "<sha256>",
  "surface": "copilot",
  "scopes": ["mcp:context:read"],
  "enabled": true
}
```

The raw token is never stored in Bob Core. The credential is automatically bound to the project row where the hash is registered.

### Scopes

- `status:read`
- `context:read`
- `activity:read`
- `mcp:context:read`

### MCP separation

- `/mcp/context` — external interface credentials, permanently read-only, `bob_get_context` only.
- `/mcp` — primary Bob Core credential, reserved for explicitly privileged MCP capabilities.

This path separation prevents a future MCP write tool from silently becoming available to Copilot/Codex/ChatGPT simply because those clients can reach the read-only context endpoint.

### Trusted interface identity

After verification, Bob Core strips any incoming internal identity headers and injects trusted interface metadata itself. Project-bound REST context/activity calls force the credential's project. Context calls also force the credential's surface.

The `/mcp/context` handler receives the trusted project/surface binding and overrides conflicting `projectKey` or `surface` tool arguments.

## Backward compatibility

Existing `metadata.auth.readCredentialHashes` values continue to work for the three Control Center REST reads:

- `GET /v1/status`
- `GET /v1/context`
- `GET /v1/activity`

New clients should use structured interface credentials instead.

## Credential generation

From `Core/`:

```bash
npm run generate:interface-token -- copilot
npm run generate:interface-token -- codex
npm run generate:interface-token -- chatgpt
```

The command prints a raw `bobif_...` token and its SHA-256 hash. The raw token belongs only in the client's secure configuration. Only the hash is registered in Bob Core metadata.

## Repository changes

- Added `Core/src/security/interface-credential.ts`.
- Removed the superseded `read-credential.ts` implementation.
- Added `/mcp/context` and trusted MCP project/surface binding.
- Added `copilot` as a Shared Context surface.
- Updated Codex to use `/mcp/context` and `BOB_CORE_CODEX_TOKEN`.
- Added local interface-token generation.
- Added interface-credential, MCP binding, and production-entrypoint regression tests.
- Updated `.bob/project.yml`, MCP documentation, and the interface standard.

## Security review

- Primary Bob Core token remains valid and unchanged.
- Raw interface tokens are never stored in Neon, repository files, logs, activity events, or prompts.
- Unknown tokens continue to fall through to normal Bob Core authentication and fail closed.
- Valid credentials without the required scope receive HTTP 403.
- Project-bound credentials cannot read a different project.
- Project-bound Activity requests cannot omit the project to gain owner-wide activity.
- Internal interface headers are stripped before authentication and recreated only after verification.
- `/mcp/context` is isolated from future privileged MCP capabilities by endpoint design.
- Legacy Control Center hashes remain read-only and are preserved for migration safety.

## Validation plan

Build gate:

- locked dependency installation;
- TypeScript typecheck;
- full Vitest suite;
- production Vercel entrypoint regression.

Runtime gate:

- Bob Core production deployment succeeds;
- `/health` remains healthy;
- existing Control Center continues to load with its legacy read credential.

Functional gate:

- register a dedicated Copilot credential under project `bobai` with `mcp:context:read`;
- configure Copilot to use `https://bob-core.vercel.app/mcp/context`;
- verify `tools/list` exposes only `bob_get_context`;
- call `bob_get_context` and confirm `projectKey=bobai` and `surface=copilot` even if the client supplies conflicting values;
- verify a wrong-project or ungranted-scope request fails closed.

## Rollback

Revert the application commit and redeploy Bob Core. Existing primary device authentication remains unchanged throughout the rollout. Legacy Control Center read hashes remain available, so rollback does not require rotating the Control Center credential.
