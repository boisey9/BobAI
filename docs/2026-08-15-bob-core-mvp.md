# Bob Core MVP Bootstrap

**Timestamp:** 2026-08-15  
**Task:** Build Bob Core v0.1 and connect the iPhone client architecture

## Business reason

Move BobAI from a local hard-coded demonstration into a real personal-AI platform. The first backend milestone must prove a secure end-to-end conversation path without putting provider credentials on the phone or prematurely adding persistent memory and autonomous tools.

## Files reviewed

- `Memory/Role.md`
- `README.md`
- `.gitignore`
- `project.yml`
- `BobAI/App/BobAIApp.swift`
- `BobAI/Models/ConversationMessage.swift`
- `BobAI/Services/BobService.swift`
- `BobAI/Services/SpeechRecognizer.swift`
- `BobAI/Services/SpeechSynthesizer.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `BobAI/Views/HomeView.swift`
- `implementation.md`
- Draft PR #1 and current `feature/bootstrap-ios` branch state

## Files added

- `.github/workflows/bob-core.yml`
- `Core/.env.example`
- `Core/README.md`
- `Core/index.ts`
- `Core/package.json`
- `Core/tsconfig.json`
- `Core/vitest.config.ts`
- `Core/scripts/generate-device-token.mjs`
- `Core/src/ai/openai-provider.ts`
- `Core/src/ai/provider.ts`
- `Core/src/app.ts`
- `Core/src/config.ts`
- `Core/src/contracts.ts`
- `Core/src/index.ts`
- `Core/src/prompts/bob.ts`
- `Core/src/security/token.ts`
- `Core/src/server.ts`
- `Core/tests/app.test.ts`
- `BobAI/Services/KeychainStore.swift`
- `BobAI/Services/BobCoreConfiguration.swift`
- `BobAI/Services/BobCoreClient.swift`
- `BobAI/Views/CoreSettingsView.swift`

## Files modified

- `.gitignore`
- `README.md`
- `BobAI/App/BobAIApp.swift`
- `BobAI/Services/BobService.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `BobAI/Views/HomeView.swift`
- `implementation.md`

## Summary of changes

### Bob Core

- Added a TypeScript/Hono backend that can run locally on Node.js and deploy to Vercel.
- Added `GET /health`, authenticated `GET /v1/status`, and authenticated `POST /v1/chat`.
- Integrated the official OpenAI Node SDK through the Responses API.
- Added a provider abstraction so the model integration can later be replaced or tested without network calls.
- Added request schemas with message-count and content-length limits.
- Added secure headers, a 32 KB request limit, request IDs, no-store response headers, and structured logs that exclude message bodies and credentials.
- Added bearer-token device authentication with hashed token comparison.
- Added a token-generation script.
- Added unit tests using a fake AI provider.
- Added GitHub Actions validation for type-checking and tests.

### iPhone client

- Added Bob Core server configuration and a connection-test screen.
- Added HTTPS-only URL validation.
- Added secure device-token storage in the iOS Keychain using a device-only accessibility class.
- Added an ephemeral URL session so Bob Core API responses are not persisted in the normal URL cache.
- Added a remote chat client and authenticated status check.
- Added routing between demo mode and Bob Core mode without hiding remote-service failures.
- Added a visible Demo/Core status and settings entry point.
- Updated the conversation service boundary to send recent conversation context to Bob Core.

## Security considerations

- `OPENAI_API_KEY` remains server-side only.
- Model calls explicitly set `store: false`.
- Bob Core does not log prompts, responses, or authorization headers.
- The iPhone device token is saved in the Keychain, not UserDefaults or source code.
- The app rejects non-HTTPS Bob Core URLs.
- API input is bounded to 20 messages, 4,000 characters per message, and a 32 KB request body.
- Errors returned to clients do not expose stack traces, provider details, or secret configuration values.
- The initial static device token is appropriate for a single-owner MVP but must evolve to revocable per-device credentials before broader use.
- Rate limiting is not yet implemented and remains a deployment risk.
- Persistent memory is deliberately excluded until encryption, retention, deletion, and authorization requirements are defined.

## UX / product considerations

- The app stays usable in Demo mode when Bob Core has not been configured.
- A visible banner explains that real AI requires Bob Core rather than silently returning mock responses.
- The settings screen lets the user save and verify the URL/token without spending a model request.
- Existing stored tokens are never displayed back to the user.
- Remote errors are surfaced instead of silently falling back to mock responses, preventing false confidence.

## Testing and validation performed

- Inspected the existing repository and current iPhone-client architecture before changes.
- Parsed all new and modified Swift files with Swift 6.2 frontend syntax validation.
- Reviewed the API dependency flow: View → ViewModel → service router → Bob Core client.
- Added backend tests for health, authentication, validation, and successful provider responses.
- The first CI run installed dependencies and passed TypeScript checking, then exposed an authentication error-path defect.
- Fixed the authentication path and added missing-token and invalid-token coverage.
- Final GitHub Actions run `31917480823` completed successfully on Node.js 24.
- TypeScript checking passed and all five backend unit tests passed.
- Physical iPhone compilation and live Bob Core connection testing remain local-device validation steps.

## Remaining risks / next steps

1. Create a Vercel project with `Core` as its Root Directory.
2. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, `BOB_CORE_DEVICE_TOKEN`, and production environment values in Vercel.
3. Deploy Bob Core and validate `/health` and `/v1/status`.
4. Pull the iOS changes, regenerate the Xcode project, and run on the iPhone.
5. Save the deployed URL/token in Bob Core Settings and test one real conversation.
6. Rotate the initial device token after setup if it was exposed during testing.
7. Define Memory v0.1 policies before adding a database.
8. Add per-device revocation, rate limiting, and server-side monitoring before expanding access.

## Primary technical references

- OpenAI Responses API and official Node SDK documentation
- OpenAI platform data-control documentation
- Hono Node.js, Vercel, body-limit, and secure-headers documentation
