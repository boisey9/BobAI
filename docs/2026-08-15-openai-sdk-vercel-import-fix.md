# Bob Core OpenAI SDK Vercel Import Fix

**Timestamp:** 2026-08-15  
**Task:** Resolve Vercel TypeScript build failure in the OpenAI provider

## Business reason

Restore the Bob Core production deployment so the iPhone client can reach `/health`, `/v1/status`, and `/v1/chat` instead of receiving a Vercel-level 404 caused by a failed backend build.

## Files reviewed

- `Core/src/ai/openai-provider.ts`
- `Core/package.json`
- `Core/tsconfig.json`
- Vercel deployment build log supplied by the user
- Official OpenAI JavaScript/TypeScript SDK documentation

## Files modified

- `Core/src/ai/openai-provider.ts`
- `docs/2026-08-15-openai-sdk-vercel-import-fix.md`

## Summary of changes

- Replaced the ambiguous default SDK import `import OpenAI from "openai"` with the SDK-supported named import `import { OpenAI } from "openai"`.
- Kept the existing `OpenAI` client type and constructor behavior unchanged.
- No API contract, authentication, model configuration, or request payload behavior changed.

## Root cause

Vercel's TypeScript build resolved the default `OpenAI` import as a module namespace under its build environment, producing `TS2709` and `TS2351` errors (`Cannot use namespace 'OpenAI' as a type` and `This expression is not constructable`). The official OpenAI SDK exposes `OpenAI` as a named import as well, which avoids this import-resolution ambiguity.

## Security considerations

- No secrets or credentials were changed or exposed.
- The OpenAI API key remains server-side only.
- Device authentication remains unchanged.
- `store: false` remains enabled for Responses API calls.

## UX / product considerations

- This is a deployment compatibility fix only; no iPhone UI behavior changes.
- Restoring the backend build is required before the BobAI app can leave Demo mode and connect to Core.

## Testing / validation

- GitHub CI will run dependency installation, TypeScript checking, and the Bob Core test suite before merge.
- Vercel production build remains the final validation because the original error occurred specifically in the Vercel build environment.

## Remaining risks / next steps

1. Merge only after CI passes.
2. Confirm Vercel production deployment succeeds.
3. Verify `https://bob-core.vercel.app/health` returns Bob Core JSON.
4. Re-test `Save & Test Connection` from the physical iPhone.
5. Validate one real OpenAI-backed conversation.
