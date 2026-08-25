# Microsoft Copilot Interface v1

Date: 2026-08-25

## Objective

Connect Microsoft Copilot / Copilot Studio to Bob Core as a distinct Bob interface, separate from GitHub Copilot, while preserving Bob Core as the authoritative source for BobAI project state.

## Architecture

```text
Microsoft Copilot
  -> Copilot Studio agent
  -> Bob Core MCP /mcp/sync
  -> Bob Core project context and safe sync tools
  -> Neon/Postgres
```

Microsoft Copilot is a replaceable client. It does not own Bob identity, memory, project state, decisions, tasks, or permissions.

## Trusted interface identity

Bob Core recognizes the explicit surface:

```text
microsoft-copilot
```

This keeps Microsoft Copilot activity and permissions separate from the existing GitHub Copilot surface:

```text
copilot
```

The Control Center renders both interfaces independently.

## Credential

Interface ID:

```text
microsoft-copilot-bobai
```

Project binding:

```text
bobai
```

Surface:

```text
microsoft-copilot
```

Scopes:

```text
mcp:context:read
mcp:sync
mcp:event:write
mcp:task:write
mcp:decision:propose
```

The raw token is generated locally and entered only into Copilot Studio's secure connection. Bob Core stores only its SHA-256 hash and non-secret interface metadata.

## Copilot Studio MCP configuration

```text
Server name: Bob Core
Server URL: https://bob-core.vercel.app/mcp/sync
Authentication: API key
API key type: Header
Header name: Authorization
Header value: Bearer <raw Microsoft Copilot token>
```

Bob Core exposes only the tools permitted by the credential:

```text
bob_get_context
bob_record_event
bob_create_task
bob_update_task
bob_propose_decision
```

## Safety boundaries

- Microsoft Copilot cannot directly write persistent memory.
- Microsoft Copilot cannot activate, supersede, or revoke authoritative decisions.
- Decision proposals require owner approval in Bob Control Center.
- Microsoft Copilot cannot delete or cancel tasks.
- The credential is bound to project `bobai`.
- The credential cannot administer Bob Core or Control Center credentials.
- Activity stores operational outcomes, not raw prompts or private reasoning.

## Production state

PR #25 merged and deployed successfully on 2026-08-25.

Production validation completed before credential registration:

- Bob Core locked install, TypeScript validation, and complete Vitest suite passed;
- Control Center typecheck and production build passed;
- Bob Core Vercel production deployment passed;
- Control Center Vercel production deployment passed.

The dedicated `microsoft-copilot-bobai` credential is registered in Bob Core production with the exact locally generated SHA-256 hash supplied by the owner. The raw token was never provided to ChatGPT and remains local for Copilot Studio configuration.

Bob Core project state records the Microsoft Copilot connection task as in progress because live Copilot Studio acceptance is still pending.

## Acceptance

Remaining owner-side acceptance:

1. Configure Copilot Studio with the production `/mcp/sync` endpoint and the raw local token.
2. Confirm Copilot Studio connects successfully.
3. `bob_get_context` returns the BobAI project and identifies the surface as `microsoft-copilot`.
4. Microsoft Copilot creates a harmless normal-priority test task.
5. The task and a Microsoft Copilot activity event appear in Control Center.
6. Microsoft Copilot submits a decision proposal.
7. The proposal appears in the owner approval inbox and remains non-authoritative until approved.

## Rollback

The change is additive. Disable or remove the structured `microsoft-copilot-bobai` credential and roll Bob Core / Control Center back to the prior release. GitHub Copilot and other Bob interfaces remain independent.
