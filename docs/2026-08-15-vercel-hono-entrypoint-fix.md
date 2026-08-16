# Bob Core Vercel Hono Entrypoint Fix

**Timestamp:** 2026-08-15 21:11 EDT  
**Task:** Resolve production HTTP 404 from `bob-core.vercel.app`

## Business reason

The iPhone successfully stored Bob Core configuration and reached the deployed Vercel hostname, but the authenticated status request returned HTTP 404. GitHub showed the Bob Core merge had deployed successfully to Vercel, so the failure was narrowed to application-route detection rather than build failure or iPhone networking.

## Files reviewed

- `Core/index.ts`
- `Core/src/index.ts`
- `Core/src/app.ts`
- `Core/tsconfig.json`
- `Core/tests/app.test.ts`
- Vercel Hono deployment documentation
- GitHub deployment status for the Bob Core merge commit

## Files modified

- `Core/index.ts`
- `Core/tests/vercel-entrypoint.test.ts`
- `docs/2026-08-15-vercel-hono-entrypoint-fix.md`
- `implementation.md`

## Summary of changes

- Replaced the indirect root re-export with a Vercel-recognized Hono entrypoint that directly imports `hono`.
- The root entrypoint now creates a Hono application and mounts the existing Bob Core application at `/`.
- Added a regression test that imports the production Vercel entrypoint and verifies `/health` is routed successfully.
- Kept the existing Bob Core implementation in `src/` unchanged so authentication, request validation, OpenAI integration, and logging behavior remain isolated and testable.

## Security considerations

- No credentials, API keys, or device tokens were added or changed.
- Authentication remains enforced under `/v1/*` by the existing Bob Core middleware.
- The public `/health` endpoint continues to expose only service/version/environment status.
- The fix changes routing/detection only; it does not weaken authorization boundaries.

## UX / product considerations

- The iPhone should be able to use the simple base URL `https://bob-core.vercel.app` without path-specific workarounds.
- Once Vercel routes the Hono application correctly, `Save & Test Connection` should resolve `/v1/status` instead of returning HTTP 404.

## Testing / validation performed

- Confirmed GitHub reported a successful Vercel deployment for the Bob Core merge commit.
- Verified the production code already defines `/`, `/health`, `/v1/status`, and `/v1/chat` routes.
- Compared the entrypoint with Vercel's documented Hono requirement: a recognized entry file should directly import `hono` and default-export a Hono application.
- Added a regression test against the exact root Vercel entrypoint.
- GitHub Actions is required to re-run dependency installation, TypeScript checking, and all Bob Core tests before merge.

## Remaining risks / next steps

1. Let GitHub Actions validate the entrypoint wrapper and new test.
2. Merge the fix after CI succeeds.
3. Confirm the automatic production Vercel redeployment completes.
4. Open `https://bob-core.vercel.app/health`; expect HTTP 200 JSON.
5. Re-run **Save & Test Connection** on the iPhone using base URL `https://bob-core.vercel.app` and the existing device token.
6. If `/health` still returns Vercel's platform 404 after the code fix, verify Vercel **Root Directory = Core** and **Framework Preset = Hono** in project settings.
