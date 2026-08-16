# Bob Core Provider Error Diagnostics

**Timestamp:** 2026-08-15  
**Task:** Diagnose and improve the first live OpenAI-backed chat failure

## Objective

The physical iPhone successfully connected to Bob Core and passed the authenticated status check, but `POST /v1/chat` returned the generic message: `Bob Core could not complete the AI request. Try again shortly.` The goal of this change is to preserve secure error handling while giving the owner an actionable diagnosis for common OpenAI API failures.

## State inspected

- The public `/health` endpoint was successful.
- BobAI displayed the green `Core` state, confirming that the server URL, Bob Core device token, HTTPS connection, and `/v1/status` authentication path were working.
- The failure occurred only when Bob Core called the OpenAI Responses API.
- Existing server handling intentionally discarded provider details and returned one generic HTTP 502 response.

## Files changed

- Added `Core/src/ai/provider-error.ts`
- Updated `Core/src/app.ts`
- Added `Core/tests/provider-error.test.ts`
- Updated `Core/tests/app.test.ts`
- Added this document
- Updated `implementation.md`

## Implementation

Bob Core now classifies provider failures using non-secret SDK metadata such as HTTP status, provider error code, error class name, and provider request ID.

User-facing responses distinguish these cases:

- Invalid or rejected OpenAI API key
- Project or key permission denial
- Missing or unavailable model
- API billing not activated or quota exhausted
- Temporary rate limiting
- Invalid provider request
- OpenAI service outage
- Network/connection failure
- Unknown provider failure

The server logs only safe diagnostic metadata. It still does not log prompts, assistant responses, authorization headers, API keys, device tokens, or raw provider error messages.

## Likely current cause

For a newly created OpenAI API key, the strongest initial candidate is API billing or prepaid credits not being active. ChatGPT subscription billing and OpenAI API billing are separate. The new response classification will confirm this directly on the phone after deployment rather than requiring inference from a generic message.

## Validation

- Added unit coverage for quota, authentication, model, and unknown provider errors.
- Added an API-level test proving that an `insufficient_quota` provider failure returns an actionable message without exposing the provider request ID or raw upstream error text.
- GitHub Actions must pass TypeScript checking and the complete test suite before merge.
- Vercel production deployment and one physical-iPhone retry remain the final runtime validation.

## Security notes

- No environment variable values were read or changed.
- No API key, token, prompt, response, or raw provider error message is returned to the iPhone.
- OpenAI provider request IDs are retained only in sanitized server logs to support troubleshooting.
- Device authentication behavior is unchanged.
