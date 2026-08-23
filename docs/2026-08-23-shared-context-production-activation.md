# Bob Core v0.2 — Production Shared Context activation

## Timestamp

2026-08-23 03:55 EDT

## Task name

Activate Bob Core Shared Context after production schema migration and project bootstrap.

## Business reason

Shared Context has been implemented, validated, migrated to the production Neon schema, and seeded with BobAI's initial authoritative project state. Bob Core now needs the deployed runtime feature enabled so BobAI, Codex, ChatGPT, and future interfaces can retrieve the same bounded project context.

## Files reviewed

- `Core/vercel.json`
- `Core/tests/vercel-config.test.ts`
- `Core/src/config.ts`
- `Core/src/context/factory.ts`
- `Core/src/context/service.ts`
- `Core/src/app.ts`
- `Core/migrations/002_shared_context_v0_2.sql`
- `docs/2026-08-23-bob-core-shared-context-v0.2.md`

## Files modified

- `Core/vercel.json`
- `Core/tests/vercel-config.test.ts`
- Added this documentation file

## Summary of changes

- Added the static, non-secret Vercel runtime setting `BOB_CORE_SHARED_CONTEXT_ENABLED=true` to `Core/vercel.json`.
- Added a regression test that verifies the deployment configuration contains the activation setting.
- Preserved the existing Core-only ignored-build rule.

## Production prerequisites already completed

- Migration `002_shared_context_v0_2.sql` was validated on an isolated Neon branch.
- Migration `cecf9d04-fdff-4eb8-b931-0ae1400e6ec0` was approved and applied to the production BobAI Memory Neon main branch.
- Production schema verification passed.
- BobAI was registered as project key `bobai` with five active architecture decisions, seven active implementation tasks, and three project events.
- PR #11 was merged into `main` as Bob Core v0.2 Shared Context foundation.

## Security considerations

- The activation value is a non-secret feature flag; no provider key, database URL, bearer token, or credential is stored in `vercel.json`.
- Shared Context remains behind the existing Bob Core bearer-token authentication middleware.
- Sensitive memories remain excluded from automatic context assembly.
- Project-scoped memories remain isolated by `projectKey`.
- No raw conversation persistence is enabled.

## UX/product considerations

- This activation does not change the iPhone UI.
- It enables the backend contract required for the same Bob project state to be consumed by BobAI, Codex, ChatGPT, and future clients.

## Testing and validation

- `Core/tests/vercel-config.test.ts` now validates the activation setting.
- GitHub Actions must pass the full Bob Core type-check and Vitest suite before merge.
- After deployment, the production acceptance test must call authenticated `/v1/context?project=bobai&surface=...` and verify project, decisions, tasks, events, and memory isolation.

## Remaining risks / next steps

1. Run GitHub Actions on the activation branch.
2. Merge only after CI passes.
3. Confirm the production Vercel deployment completes.
4. Run the authenticated Shared Context acceptance test.
5. Mark the deployment/activation/acceptance tasks complete in Bob Core.
6. Implement Bob Core MCP transport and connect Codex first.
