# Bob Core Vercel Build Validation

**Timestamp:** 2026-08-15  
**Task:** Validate the OpenAI SDK import fix against Bob Core CI

## Business reason

Prevent the production Bob Core deployment from failing TypeScript compilation in Vercel after a successful GitHub CI run.

## Files reviewed

- `Core/src/ai/openai-provider.ts`
- `Core/tests/openai-provider-import.test.ts`
- `Core/package.json`
- `Core/tsconfig.json`

## Files modified

- Added `Core/tests/openai-provider-import.test.ts`
- Added this validation note

## Summary

A regression test now constructs `OpenAIResponsesProvider` using the same SDK import path compiled by Bob Core. This complements the existing TypeScript check and API tests.

## Security considerations

The regression test uses a fake API key and does not perform network calls. No production credentials are present.

## Testing

GitHub Actions must complete dependency installation, TypeScript checking, and all tests before this fix is merged.

## Next steps

1. Merge only after CI passes.
2. Confirm Vercel rebuild succeeds.
3. Verify `/health` returns JSON.
4. Re-test Bob Core from the iPhone.
