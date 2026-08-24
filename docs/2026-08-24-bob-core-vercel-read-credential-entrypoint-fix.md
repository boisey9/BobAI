# Bob Core Vercel Read-Credential Entrypoint Fix

Date: 2026-08-24

## Objective

Restore the dedicated read-only Bob Control Center credential in the production Vercel entrypoint without broadening its permissions.

## Current state and root cause

`Core/src/index.ts` correctly attaches `createReadCredentialGateway(...)` to the Bob Core app's `fetch` handler. The Vercel project, however, deploys `Core/index.ts`, which creates a second Hono app and mounts the inner Bob Core app with `app.route("/", bobCore)`.

Hono route mounting preserves routes but not the inner app's overridden `fetch` handler. As a result, the production wrapper bypassed the read-credential gateway and sent Control Center bearer tokens directly to the primary device-token middleware. This produced `invalid_device_token` even when the Control Center token hash existed in Neon and the verifier SQL returned a match.

## Change

The Vercel wrapper still creates and default-exports a Hono app for framework detection, but its `fetch` handler now delegates to `bobCore.fetch`. This preserves the security gateway installed by `Core/src/index.ts` while keeping the existing Vercel entrypoint shape.

A regression test exercises the production wrapper with a mocked Neon verifier and confirms an approved read-only credential reaches `GET /v1/status` successfully.

## Security impact

- No additional endpoint permissions are granted.
- Read-only credentials remain limited to `GET /v1/status`, `GET /v1/context`, and `GET /v1/activity`.
- Chat, memory listing/writes, MCP, and other write-capable routes remain protected by the primary device token.
- Raw Control Center credentials are not committed or logged.
- Neon stores only SHA-256 credential hashes.

## Validation gates

1. `npm run check` in `Core/` must pass.
2. The new Vercel entrypoint regression test must pass.
3. Vercel production deployment for `bob-core` must succeed after merge.
4. A live request using the registered Control Center read credential to `/v1/status` must return success.
5. Bob Control Center should then load status, shared context, and activity without the primary device token.
