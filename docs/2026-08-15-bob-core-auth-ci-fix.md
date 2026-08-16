# Bob Core Authentication CI Fix

**Timestamp:** 2026-08-15  
**Task:** Resolve the first Bob Core CI failure and harden authentication responses

## Business reason

The first GitHub Actions run proved dependency installation and TypeScript compilation, but one authentication test returned HTTP 500 instead of the intended HTTP 401. Authentication failures must be predictable, structured, and must never become internal-server errors.

## Files reviewed

- `Core/src/app.ts`
- `Core/src/security/token.ts`
- `Core/tests/app.test.ts`
- GitHub Actions run `31917410064`

## Files modified

- `Core/src/app.ts`
- `Core/src/security/token.ts`
- `Core/tests/app.test.ts`
- `implementation.md`

## Summary of changes

- Replaced the bearer middleware's custom error objects with an explicit Bob Core authentication middleware.
- Added structured 401 responses for missing, malformed, and invalid bearer credentials.
- Added SHA-256 token comparison with a constant-work comparison over the resulting hashes.
- Expanded unit tests to verify both missing-token and invalid-token responses.

## Security considerations

- Plain device tokens are not logged.
- Both supplied and expected values are hashed before comparison.
- Authentication errors reveal only whether the credential was missing, malformed, or invalid; no secret values are echoed.
- Every authentication error includes the request ID for support and diagnostics.

## UX / product considerations

- The iPhone can now reliably distinguish authentication rejection from a backend crash.
- The server returns clear client-safe messages instead of stack traces or framework-specific errors.

## Testing / validation performed

- The original CI run installed all packages and passed TypeScript checking, then identified one failing authentication test.
- After the fix, GitHub Actions run `31917480823` completed successfully.
- TypeScript checking passed.
- All five backend unit tests passed.

## Remaining risks / next steps

1. Deploy Bob Core over HTTPS.
2. Validate the real iPhone status request with a production device token.
3. Add rate limiting and revocable per-device credentials before expanding beyond a single-owner deployment.
