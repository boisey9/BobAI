# BobAI Implementation Log

## 2026-08-15 — Native iOS bootstrap

### Session summary

Initialized the first production-oriented BobAI client architecture for iPhone. The goal of this milestone is to validate the physical interaction model before connecting an external AI backend.

### Decisions made

- Use native SwiftUI for the iPhone application.
- Target iOS 17+ so the current iPhone SE can run the app without updating.
- Use push-to-talk rather than continuous background listening for v1.
- Use Apple's Speech framework for speech-to-text and AVSpeechSynthesizer for spoken responses.
- Keep AI reasoning, memory, tools, credentials, and privileged operations out of the client and place them in a future Bob Core backend.
- Use `BobServiceProtocol` so the local mock can later be replaced without rewriting the UI.
- Use XcodeGen (`project.yml`) as the project source of truth.
- Keep generated Xcode project files out of source control for now.

### Files changed

- Updated `README.md`
- Added `.gitignore`
- Added `project.yml`
- Added native source code under `BobAI/`
- Added `scripts/bootstrap.sh`
- Added `docs/2026-08-15-ios-bootstrap.md`
- Added `implementation.md`

### Features completed

- Initial BobAI SwiftUI interface
- Conversation message model
- Typed message entry
- Push-to-talk control
- Speech permission flow
- On-device speech transcription
- Spoken responses
- Local mock Bob response service
- Project bootstrap tooling

### Bugs fixed

None; this is the initial application bootstrap.

### Open questions

- Where Bob Core will be hosted.
- Authentication method between personal devices and Bob Core.
- Memory retention/encryption policy.
- Whether later versions should support an optional wake word or remain explicit push-to-talk.

### Next recommended tasks

1. Generate and compile the Xcode project locally.
2. Run the first build on the iPhone SE.
3. Fix any local compile/signing/device errors.
4. Define the Bob Core API and authentication model.
5. Implement the real network service behind `BobServiceProtocol`.

### Risks and dependencies

- Local Xcode/device signing cannot be validated from the repository connector.
- Speech recognition availability can vary by locale/network state.
- Background listening is intentionally not implemented because it has privacy, battery, and iOS lifecycle implications.
- No secrets should ever be committed to this repository or shipped in the iOS app.

---

## 2026-08-15 — Black screen launch fix

### Session summary

Investigated the first runtime test after BobAI compiled and launched in the iOS simulator but rendered a fully black screen.

### Decisions made

- Keep the existing SwiftUI root architecture; `BobAIApp` and `HomeView` contain a valid visible hierarchy.
- Treat `project.yml` as the authoritative fix location rather than hand-editing the generated `.xcodeproj`.
- Explicitly generate iOS scene-manifest and launch-screen metadata for the SwiftUI `App` lifecycle.

### Files changed

- Updated `project.yml`
- Updated `implementation.md`
- Added `docs/2026-08-15-black-screen-launch-fix.md`

### Features completed

No new end-user features; this change stabilizes application startup.

### Bugs fixed

- Added `INFOPLIST_KEY_UIApplicationSceneManifest_Generation: YES`.
- Added `INFOPLIST_KEY_UILaunchScreen_Generation: YES`.
- Addressed the likely lifecycle configuration gap causing a launched process to show no SwiftUI scene.

### Open questions

- Confirm whether the regenerated project renders BobAI correctly in the iOS 26.3 simulator.
- Confirm physical iPhone SE behavior after simulator validation.

### Next recommended tasks

1. Pull the updated `feature/bootstrap-ios` branch.
2. Regenerate the Xcode project with `./scripts/bootstrap.sh`.
3. Clean the build folder if necessary.
4. Run in the simulator and confirm the BobAI UI appears.
5. If still black, inspect the Xcode debug console for scene/process startup messages.
6. Once launch is stable, validate microphone, transcription, typed messaging, and speech playback.

### Risks and dependencies

- The repository connector cannot execute Xcode or boot Apple's simulator, so the final runtime confirmation remains local.
- If scene metadata is not the only cause, Xcode console output will be required for the next diagnosis.
- No security-sensitive behavior was changed.

---

## 2026-08-15 — Launch exit diagnosis

### Session summary

The second simulator test confirmed that BobAI now compiles and installs, but the simulator remains on or returns to the Home Screen instead of presenting the application. The startup path was simplified to remove privacy authorization from application launch and the Xcode scheme was made explicit about which executable to run.

### Decisions made

- Do not request microphone or Speech authorization at application startup.
- Request voice permissions only when the user taps the microphone control.
- Keep typed messaging available without voice permissions.
- Add lightweight DEBUG lifecycle traces before making deeper architectural changes.
- Explicitly set `BobAI` as the run executable in `project.yml`.

### Files changed

- Updated `BobAI/App/BobAIApp.swift`
- Updated `BobAI/Views/HomeView.swift`
- Updated `BobAI/ViewModels/ConversationViewModel.swift`
- Updated `project.yml`
- Added `docs/2026-08-15-launch-exit-diagnosis.md`
- Updated `implementation.md`

### Features completed

- User-initiated voice permission flow.
- Debug lifecycle logging for app initialization and root view appearance.
- Explicit XcodeGen run executable configuration.

### Bugs fixed

- Removed the startup dependency on microphone and Speech authorization.
- Removed a privacy prompt sequence that could prevent normal startup before the UI was visible.
- Removed ambiguity from the generated scheme's run executable selection.

### Open questions

- Whether the simulator now opens the BobAI UI automatically after regeneration.
- If it still exits, whether `[BobAI] App initialized` and `[BobAI] HomeView appeared` are present in the Xcode debug console.
- Whether the generated Info.plist contains the required Speech and microphone usage descriptions at runtime.

### Next recommended tasks

1. Pull the updated branch.
2. Regenerate the Xcode project.
3. Run the simulator build.
4. Confirm typed messaging works before tapping the microphone.
5. If launch still exits, capture the debug console and fix from the concrete runtime error.
6. Validate voice permissions after normal startup is confirmed.
7. Move to physical iPhone SE testing only after simulator startup is stable.

### Risks and dependencies

- Apple requires `NSSpeechRecognitionUsageDescription` before requesting Speech authorization and `NSMicrophoneUsageDescription` before microphone access; missing runtime keys can terminate the app.
- Runtime process logs remain local to Xcode and are the next required diagnostic if this mitigation does not resolve launch.
- No secrets, credentials, or privileged access were added.

---

## 2026-08-15 — Simulator launch validated

### Session summary

Confirmed successful BobAI startup in the iPhone 16e simulator on iOS 26.3 after the launch-path fixes. The SwiftUI interface rendered correctly and the typed conversation loop successfully returned a response from `MockBobService`.

### Decisions made

- Treat simulator startup and typed messaging as validated for Milestone 1.
- Keep the pull request in draft until voice input and physical iPhone SE deployment are also validated.
- Proceed next with microphone permission, speech transcription, and spoken-response testing before connecting Bob Core.

### Files reviewed

- `BobAI/App/BobAIApp.swift`
- `BobAI/Views/HomeView.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `project.yml`

### Files modified

- Updated `implementation.md`

### Features validated

- App installation and launch in iOS simulator.
- SwiftUI root view rendering.
- Ready-state UI.
- Typed message submission.
- Message bubble rendering.
- Mock Bob response path.

### Bugs fixed / validation outcome

- Previous black-screen / immediate-exit launch issue is resolved in the simulator.
- The delayed voice-permission flow and explicit run executable are compatible with normal application startup.

### Security considerations

- No credentials or secrets were added.
- Voice permissions remain user initiated rather than requested at launch.

### UX / product considerations

- The current interface is usable for the first interaction test and clearly exposes Bob status, conversation, voice input, and typed input.
- The mock-service message correctly communicates that Bob Core is not connected yet.

### Testing performed

- User confirmed successful app loading in the iPhone 16e simulator on iOS 26.3.
- User submitted the typed message `good day` and received the expected mock response.

### Remaining risks / next steps

1. Tap the microphone and validate the microphone and Speech permission prompts.
2. Speak a short phrase and confirm live transcription appears.
3. Stop listening and confirm the captured text enters the composer.
4. Send the captured phrase and confirm Bob's spoken response plays.
5. Deploy the same branch to the physical iPhone SE on iOS 17.6.1.
6. After simulator and physical-device voice validation, decide whether to merge PR #1 and begin Bob Core integration.

---

## 2026-08-15 — Simulator voice input validated

### Session summary

Validated the BobAI push-to-talk voice input path in the iPhone 16e simulator. Spoken input successfully became the user message `Hi Bob`, entered the normal conversation flow, and received the expected response from `MockBobService`.

### Decisions made

- Treat simulator microphone/speech transcription as validated.
- Keep text-to-speech playback unconfirmed until audible output is explicitly verified.
- Keep PR #1 in draft until the physical iPhone SE passes the same interaction tests.

### Files reviewed

- `BobAI/Services/SpeechRecognizer.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `BobAI/Views/HomeView.swift`
- `implementation.md`

### Files changed

- Added `docs/2026-08-15-simulator-voice-validation.md`
- Updated `implementation.md`

### Features validated

- User-initiated microphone/Speech permission path.
- Push-to-talk interaction.
- Speech-to-text capture into the conversation flow.
- Voice-originated user message rendering.
- Mock Bob response after voice-originated input.
- Return to Ready state after the interaction.

### Security considerations

- No always-listening behavior is enabled.
- Microphone and Speech access remain explicit and user initiated.
- No secrets, provider credentials, or backend tokens were added.

### UX / product considerations

- Voice and typed input correctly converge on the same conversation flow.
- Push-to-talk remains the right v1 behavior because it is clear, private, and predictable.

### Testing / validation performed

- User provided a simulator screenshot showing the voice-originated `Hi Bob` message and expected Bob response.
- The simulator remained stable after the voice interaction.
- User subsequently confirmed that the spoken response was audible.
- User confirmed successful physical iPhone provisioning and deployment after switching to a fresh Personal Team.

### Remaining risks / next steps

1. Validate the same voice interaction on the physical iPhone.
2. Merge the iOS bootstrap after final physical-device interaction validation.
3. Begin Bob Core API/authentication implementation.

---

## 2026-08-15 — Bob Core v0.1 MVP bootstrap

### Session summary

Created the first Bob Core backend and connected the iPhone architecture to it on the stacked branch `feature/bob-core-mvp`. This milestone establishes a secure, stateless, end-to-end AI conversation path while preserving Demo mode until a deployment URL and device token are configured.

### Decisions made

- Build Bob Core in TypeScript using Hono so the same API can run locally on Node.js and deploy to Vercel.
- Use the official OpenAI Node SDK and Responses API.
- Set `store: false` on model requests.
- Keep the OpenAI API key on the server only.
- Use a long bearer-token credential for the single-owner MVP and store that token in the iOS Keychain.
- Require HTTPS in the iPhone configuration.
- Keep conversation history stateless and client-supplied for v0.1.
- Defer persistent memory, tools, rate limiting, and per-device revocation until the base conversation path is validated.
- Keep Bob Core work in a stacked draft PR based on `feature/bootstrap-ios` so the validated iOS foundation remains independently reviewable.

### Files reviewed

- `Memory/Role.md`
- Existing iOS app architecture under `BobAI/`
- `README.md`
- `.gitignore`
- `project.yml`
- `implementation.md`
- Draft PR #1 and `feature/bootstrap-ios`

### Files changed

- Added `.github/workflows/bob-core.yml`
- Added the `Core/` backend, tests, configuration, and documentation
- Added `BobAI/Services/KeychainStore.swift`
- Added `BobAI/Services/BobCoreConfiguration.swift`
- Added `BobAI/Services/BobCoreClient.swift`
- Added `BobAI/Views/CoreSettingsView.swift`
- Updated `BobAI/App/BobAIApp.swift`
- Updated `BobAI/Services/BobService.swift`
- Updated `BobAI/ViewModels/ConversationViewModel.swift`
- Updated `BobAI/Views/HomeView.swift`
- Updated `.gitignore`
- Updated `README.md`
- Added `docs/2026-08-15-bob-core-mvp.md`
- Updated `implementation.md`

### Features completed

- Public `GET /health` endpoint.
- Authenticated `GET /v1/status` endpoint.
- Authenticated `POST /v1/chat` endpoint.
- OpenAI Responses API provider behind an abstraction.
- Bob-specific server instructions optimized for spoken responses.
- Request validation, size limits, secure headers, request IDs, no-store responses, and redacted structured logging.
- Unit tests using a fake AI provider.
- GitHub Actions type-check/test workflow.
- iPhone Bob Core settings screen.
- HTTPS-only server validation.
- Device-token storage in the iOS Keychain.
- Ephemeral URL session for Bob Core calls.
- Real/Demo service routing with visible status and no silent fallback from remote errors.

### Security considerations

- No API key or device token was committed.
- The phone stores only the device token, not the provider credential.
- The device token uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- Bob Core does not log prompts, responses, authorization headers, or secret values.
- API input is limited to 20 messages, 4,000 characters per message, and a 32 KB request body.
- Static bearer authentication is acceptable only for the current single-owner MVP; broader use requires revocable per-device credentials.
- Persistent memory remains blocked until encryption, retention, deletion, and authorization policies are defined.

### UX / product considerations

- The app remains functional in explicit Demo mode before Bob Core is configured.
- A settings screen can save and test the connection without spending a model request.
- Existing tokens are never displayed back to the user.
- Once configured, remote failures are shown instead of silently returning mock content.
- The status pill changes from `Demo` to `Core` when credentials are available.

### Testing / validation performed

- Inspected the current branch and relevant files before making changes.
- Parsed all new and modified Swift files successfully with the Swift 6.2 frontend.
- Added backend unit tests for health, authentication, validation, and successful provider responses.
- The first GitHub Actions run installed dependencies and passed TypeScript checking, then exposed an authentication error-path defect.
- Replaced the framework error customization with explicit structured authentication handling.
- Final GitHub Actions run `31917480823` completed successfully.
- TypeScript checking passed and all five backend unit tests passed.
- Repository changes were isolated on `feature/bob-core-mvp` rather than committed directly to `main`.

### Bugs fixed

- Replaced the hard-coded mock-only service boundary with a configurable Bob Core router.
- Prevented provider credentials from entering the iPhone app design.
- Prevented silent mock fallback when a configured backend fails.
- Fixed missing-token authentication returning HTTP 500 instead of structured HTTP 401.
- Added structured rejection for malformed and invalid bearer credentials.

### Open questions

- Final Vercel project and deployment URL.
- Initial OpenAI model selection and operating-cost limits.
- Whether the first production authentication upgrade should use per-device API tokens or signed short-lived sessions.
- Memory v0.1 encryption, retention, deletion, and retrieval policies.

### Next recommended tasks

1. Deploy `Core/` to Vercel.
2. Add the server-side environment variables in Vercel.
3. Generate a device token and configure the same token in Vercel and BobAI Settings.
4. Pull `feature/bob-core-mvp`, regenerate the Xcode project, and run it on the iPhone.
5. Validate `/health`, `/v1/status`, and one real spoken conversation.
6. Merge PR #1 first, then retarget/merge the Bob Core PR into `main` after validation.
7. Design Memory v0.1 only after the secure conversation path is stable.

### Risks and dependencies

- The physical iPhone build and live HTTPS connection require local validation.
- A free Apple Personal Team build still expires and must be reinstalled periodically.
- Rate limiting and per-device revocation are not part of v0.1.
- Model availability and cost remain environment-controlled deployment decisions.

---

## 2026-08-15 — Bob Core authentication CI stabilization

### Session summary

Resolved the first backend CI finding. The authentication middleware's custom framework error payload produced HTTP 500 for a missing token even though valid-token requests worked. Bob Core now owns the complete authentication response path directly.

### Decisions made

- Return explicit JSON 401 responses from Bob Core for missing, malformed, and invalid bearer credentials.
- Hash both credential values and compare the fixed-length hashes using constant work rather than comparing plain token strings.
- Add direct tests for both missing and invalid credentials.

### Files changed

- Updated `Core/src/app.ts`
- Updated `Core/src/security/token.ts`
- Updated `Core/tests/app.test.ts`
- Added `docs/2026-08-15-bob-core-auth-ci-fix.md`
- Updated `implementation.md`

### Validation performed

- Dependency installation passed on Node.js 24.
- TypeScript checking passed.
- Five of five backend unit tests passed.
- GitHub Actions run `31917480823` completed successfully.

### Next recommended tasks

1. Deploy Bob Core to Vercel.
2. Validate the authenticated status endpoint from the physical iPhone.
3. Test the first real OpenAI-backed spoken conversation.

---

## 2026-08-15 — Vercel Hono entrypoint routing fix

### Session summary

Investigated production HTTP 404 responses from `bob-core.vercel.app` after the iPhone successfully saved Bob Core settings. GitHub confirmed the Bob Core merge deployed successfully to Vercel, so the failure was narrowed to Vercel Hono entrypoint detection/routing rather than compilation, authentication, or iPhone networking.

### Decisions made

- Match Vercel's documented Hono detection pattern explicitly at `Core/index.ts`.
- Keep the existing Bob Core implementation under `Core/src/` and mount it at `/` from the production entrypoint.
- Add an entrypoint-level regression test for `/health` before merging the fix.
- Preserve all existing authentication and secret-management behavior unchanged.

### Files reviewed

- `Core/index.ts`
- `Core/src/index.ts`
- `Core/src/app.ts`
- `Core/tsconfig.json`
- `Core/tests/app.test.ts`
- Vercel Hono deployment documentation
- GitHub Vercel deployment status for the Bob Core merge commit

### Files changed

- Updated `Core/index.ts`
- Added `Core/tests/vercel-entrypoint.test.ts`
- Added `docs/2026-08-15-vercel-hono-entrypoint-fix.md`
- Updated `implementation.md`

### Bugs fixed

- Removed the indirect-only root app re-export that could evade Vercel's Hono framework detector.
- Added a recognized entrypoint that directly imports `hono`, default-exports a Hono app, and mounts all Bob Core routes at `/`.

### Security considerations

- No API keys, device tokens, or credentials changed.
- `/v1/*` remains protected by the existing bearer authentication middleware.
- The fix affects framework detection and routing only.

### UX / product considerations

- BobAI can continue using the base URL `https://bob-core.vercel.app`.
- The iPhone client will continue to append `/v1/status` and `/v1/chat` itself.

### Testing / validation performed

- Confirmed GitHub reported a successful Vercel deployment for the previous Bob Core merge commit.
- Verified existing routes are defined in `Core/src/app.ts`.
- Compared the prior entrypoint with Vercel's documented Hono entrypoint pattern.
- Added a regression test that imports the exact root production entrypoint and requests `/health`.
- GitHub Actions must pass TypeScript checking and the expanded backend test suite before merge.

### Next recommended tasks

1. Wait for CI to validate the fix.
2. Merge the fix after CI passes.
3. Confirm Vercel automatically redeploys `main`.
4. Verify `https://bob-core.vercel.app/health` returns HTTP 200 JSON.
5. Re-run **Save & Test Connection** on the iPhone.
6. If a platform-level 404 remains, confirm Vercel **Root Directory = Core** and **Framework Preset = Hono**.


---

## 2026-08-15 — Z.AI GLM provider integration

### Session summary

Added Z.AI as a provider-independent Bob Core inference option and selected the free `glm-4.7-flash` model for the first no-cost deployment path. The iPhone connection, device authentication, voice interface, and Bob Core API contract remain unchanged.

### Decisions made

- Keep Bob as the stable assistant identity above replaceable model providers.
- Be honest that changing providers does not literally transfer the hosted ChatGPT session or account-level memory.
- Use Z.AI's general OpenAI-compatible endpoint and `glm-4.7-flash`.
- Preserve OpenAI as an optional fallback.
- Keep provider credentials and selection on Bob Core only.
- Keep persistent memory and tools out of scope until their privacy and authorization policies are defined.

### Files changed

- Added `Core/src/ai/zai-provider.ts`
- Added `Core/src/ai/provider-factory.ts`
- Updated provider configuration, startup, API status, diagnostics, Bob instructions, documentation, and tests
- Updated `BobAI/Views/CoreSettingsView.swift`
- Added `docs/2026-08-15-zai-glm-provider.md`
- Updated `implementation.md`

### Features completed

- Configurable `openai` and `zai` providers
- Z.AI Chat Completions through the existing OpenAI Node SDK
- Default Z.AI endpoint `https://api.z.ai/api/paas/v4`
- Default free model `glm-4.7-flash`
- Provider/model reporting and provider-specific sanitized diagnostics
- Bob identity continuity instructions across model providers
- Backward compatibility with existing OpenAI environment variables

### Security considerations

- No provider API key or Bob Core device token was committed.
- Provider keys remain server-side only.
- Existing device authentication, input limits, secure headers, and no-secret logging remain unchanged.
- Provider data-use terms must be reviewed before sensitive data or persistent memory is introduced.

### Validation

- Added configuration, provider factory, constructor, diagnostic, API status, and Vercel entrypoint tests.
- GitHub Actions must pass TypeScript checking and the complete backend test suite before merge.

### Next recommended tasks

1. Merge after CI passes.
2. Create a private Z.AI API key.
3. Configure the Z.AI Production variables in Vercel.
4. Redeploy Bob Core.
5. Re-run **Save & Test Connection** on the existing iPhone configuration.
6. Validate typed and spoken GLM responses.
7. Review provider data-use terms before Memory v0.1.


---

## 2026-08-16 — Memory v0.1 production migration and release validation

### Session summary

Completed the first provider-independent persistent memory implementation for Bob Core and applied its approved schema migration to the dedicated BobAI Memory Neon database. Memory remains explicit-by-default and is available to both Z.AI/GLM and OpenAI without making either provider the owner of Bob's continuity.

### Decisions made

- Store approved memories in Bob Core rather than in a model provider.
- Do not automatically persist ordinary conversation transcripts.
- Support explicit remember, recall, and forget commands plus authenticated memory APIs.
- Treat retrieved memories as untrusted factual context, never as system instructions.
- Use soft deletion, full-text retrieval, duplicate prevention, and an audit-event table.
- Reject credentials, authentication material, payment-card numbers, government identifiers, and database connection strings.
- Keep application-level field encryption as a future hardening milestone; high-risk secrets must not be stored.
- Require a private server-side database connection and leave the iPhone configuration unchanged.

### Files changed

- Added Memory v0.1 modules under `Core/src/memory/`
- Added `Core/src/memory/migration.sql`
- Updated provider interfaces and OpenAI/Z.AI provider context handling
- Updated Bob Core configuration, startup, API routes, prompts, and contracts
- Added memory policy, command, service, storage, API, configuration, and provider-context tests
- Updated `Core/.env.example`, `Core/README.md`, and `README.md`
- Added `docs/2026-08-16-memory-v0.1-production-migration.md`
- Updated `implementation.md`

### Features completed

- Explicit chat commands for remember, recall, and forget
- Authenticated list, create, and delete memory endpoints
- Provider-independent automatic retrieval for ordinary chat
- Neon Postgres memory and audit stores
- Personal, project, preference, and fact scopes
- Normal and sensitive classifications
- Soft deletion and auditable memory mutations
- Full-text search and per-owner duplicate prevention
- Memory status reporting through `/v1/status`
- Graceful operation with memory disabled when no database is configured

### Security and privacy

- No provider key, Bob Core device token, or database credential was committed.
- The iPhone continues to store only the Bob Core device token in Keychain.
- Raw conversations are not automatically stored.
- Memory content is excluded from Bob Core logs.
- Retrieved memories cannot override Bob Core system instructions.
- Common secret and financial-identity formats are rejected before storage.
- Memory v0.1 does not yet encrypt individual fields at the application layer.

### Database migration

- Migration approval was received from the project owner.
- The reviewed migration was applied to the main branch of the dedicated Neon project.
- The temporary migration branch was deleted after completion.
- Verification confirmed both memory tables exist with zero initial memories and zero initial audit events.

### Validation performed

- Temporary-branch schema and behavior validation passed.
- Insert, full-text search, audit-event creation, and soft-delete tests passed.
- TypeScript checking passed.
- The complete backend unit and integration suite passed.
- GitHub Actions run `31945301691` completed successfully on the final branch head.
- PR #7 is ready for merge after the production migration approval.

### Remaining operational step

Add the private pooled Neon connection string and Memory v0.1 feature settings to Bob Core's Vercel Production environment, redeploy, and run the cross-restart acceptance test from the iPhone.

---

## 2026-08-16 — Voice interaction, Z.AI resilience, and release-audit completion

### Session summary

Completed a release-style audit after physical iPhone testing exposed silent speech playback, manual voice-send behavior, keyboard focus problems, generic Z.AI failures, and an inaccurate provider response that described Bob as text-only. The fixes preserve the approved Bob Core visual identity while making the interaction path practical on a real phone.

### Decisions made

- Use an explicit iOS voice-prompt playback audio session for Bob's spoken replies.
- Keep explicit push-to-talk, then auto-send after a short period without transcript changes.
- Allow a second Core tap to send immediately.
- Manage keyboard focus directly and provide multiple dismissal paths.
- Tell the model truthfully that the iPhone client reads successful replies aloud.
- Surface sanitized provider error codes and Bob Core request IDs in the app.
- Fall back between the free GLM 4.7 Flash and GLM 4.5 Flash models only for retryable provider failures.
- Test one real provider reply from Bob Core settings instead of treating health/status as sufficient.
- Keep raw history migration separate from concise approved memory and executable skills.

### Files changed

- Updated `BobAI/Services/SpeechSynthesizer.swift`
- Updated `BobAI/Services/SpeechRecognizer.swift`
- Updated `BobAI/Services/BobCoreClient.swift`
- Updated `BobAI/ViewModels/ConversationViewModel.swift`
- Updated `BobAI/Views/HomeView.swift`
- Updated `BobAI/Views/BobCoreView.swift`
- Updated `BobAI/Views/CoreSettingsView.swift`
- Updated `Core/src/prompts/bob.ts`
- Updated `Core/src/ai/provider-error.ts`
- Updated `Core/src/ai/zai-provider.ts`
- Added and expanded Bob prompt, provider-error, and Z.AI fallback tests
- Added permanent Bob Core and iOS release validation workflows
- Added reproducible production app-icon and launch-screen assets
- Added `docs/2026-08-16-voice-provider-and-continuity-plan.md`

### Features completed

- Audible spoken-response playback routing through the iOS voice-prompt session
- Voice auto-send after a short pause
- Immediate voice send by tapping the Core again
- Keyboard Done control, focus dismissal, tap dismissal, and interactive scroll dismissal
- Accurate iPhone voice-capability instructions for Bob
- Z.AI business-code diagnostics and safe request identifiers
- Free-model fallback for retryable Z.AI failures
- Live provider probe from Bob Core settings
- Debug and Release iOS builds, compiled-resource verification, simulator launch/survival smoke test, and screenshot artifact in CI
- Deterministic Bob Core dependency installation and complete backend validation

### Security and privacy

- No provider key, database URL, device token, signing material, or personal data was committed.
- Error messages expose only sanitized codes and request identifiers.
- Audio transcription and playback remain explicit device interactions.
- Raw conversation history is not automatically promoted to persistent memory.
- Skills require explicit schemas, permissions, and audit records rather than being treated as model memory.

### Validation

- Bob Core TypeScript checking and the complete automated test suite passed.
- iOS Debug compilation passed.
- Production app-icon and launch-screen resources compiled and were verified in the built app.
- The simulator installed and launched BobAI, the process remained alive, and the resulting UI screenshot was inspected.
- The iOS Release configuration compiled successfully.
- Physical iPhone playback, microphone timing, and live-provider behavior remain the final acceptance test after installing the merged build.

### Next milestone

Build Bob Continuity Import v0.2: ingest a user-provided ChatGPT export into a reviewable search archive, promote only approved concise items into Neon memory, preserve provenance, and implement external capabilities through a permissioned Bob Core skill registry.

---

## 2026-08-23 — Bob Core v0.2 Shared Context foundation

### Timestamp

2026-08-23 03:35 EDT

### Session summary

Implemented the first Shared Context foundation so Bob Core can become the authoritative provider-independent project-state layer used by BobAI, Codex, ChatGPT, and later surfaces. The implementation keeps concise approved memory separate from structured project state and adds one authenticated context package instead of relying on each client to rebuild Bob independently.

### Decisions made

- Keep Bob Core as the sole authority for shared project state; clients and model providers remain replaceable surfaces/engines.
- Keep Memory v0.1 intact and introduce first-class Project, Decision, Task, and Project Event records beside it.
- Use a stable owner-scoped `projectKey` to bind memories and future adapters to the correct project.
- Treat project decisions/tasks as structured state rather than attempting to infer authority from raw conversation history.
- Return structured Shared Context from `GET /v1/context` instead of an opaque prompt blob.
- Keep sensitive memories excluded from automatic Shared Context.
- Require project-scoped memories to carry `projectKey`.
- Change active-memory duplicate identity from owner + content to owner + content + project so identical facts/rules can safely exist in separate projects.
- Keep Shared Context disabled by default until migration 002 is deliberately applied and enabled.
- Defer MCP transport, mutation tools, Codex adapter, and ChatGPT adapter until the shared read contract is stable.

### Files changed

- Added `Core/migrations/002_shared_context_v0_2.sql`
- Added `Core/src/context/types.ts`
- Added `Core/src/context/neon-store.ts`
- Added `Core/src/context/in-memory-store.ts`
- Added `Core/src/context/service.ts`
- Added `Core/src/context/factory.ts`
- Added `Core/tests/context-service.test.ts`
- Added `Core/tests/context-api.test.ts`
- Updated `Core/src/config.ts`
- Updated `Core/src/contracts.ts`
- Updated `Core/src/app.ts`
- Updated `Core/src/index.ts`
- Updated `Core/src/server.ts`
- Updated `Core/src/memory/service.ts`
- Updated `Core/src/memory/neon-store.ts`
- Updated `Core/src/memory/in-memory-store.ts`
- Updated `Core/tests/test-config.ts`
- Updated `Core/tests/config.test.ts`
- Updated `Core/tests/memory-service.test.ts`
- Updated `Core/.env.example`
- Updated `Core/README.md`
- Added `docs/2026-08-23-bob-core-shared-context-v0.2.md`
- Updated `implementation.md`

### Features completed

- Provider-independent project registry schema
- Structured active project decisions
- Structured project tasks with status and priority
- Recent project event model
- Neon Shared Context reader
- In-memory Shared Context store for deterministic tests
- Shared Context service with bounded context assembly
- Authenticated `GET /v1/context`
- Request surface support for `bobai`, `codex`, `chatgpt`, and `other`
- Optional approved-memory `projectKey` and tags
- Cross-project memory isolation
- Project-aware memory duplicate handling
- Shared Context status reporting through `/v1/status`
- Explicit `BOB_CORE_SHARED_CONTEXT_ENABLED` rollout guard

### Bugs fixed

- Fixed owner-wide memory duplicate behavior that would have caused identical text in two projects to resolve to the first project's memory record.
- Prevented project-scoped memories without an explicit project key from being accepted by the memory API.
- Prevented project-scoped memories from another project from entering the requested Shared Context package.

### Security considerations

- No production database mutation was performed in this implementation session.
- Existing `/v1/*` bearer-token authentication protects Shared Context.
- Shared Context payloads are not logged.
- Sensitive memories remain excluded from automatic retrieval.
- Existing secret/high-risk memory rejection remains unchanged.
- Feature enablement defaults to false to protect production from code/schema rollout ordering mistakes.
- Provider/database credentials remain server-side only.

### Validation performed

- Reviewed current Bob Core/memory architecture before making changes.
- Added Shared Context service, API, configuration, and memory regression tests.
- GitHub Actions run `32626358277` completed successfully on PR #11.
- Locked dependency installation passed.
- TypeScript checking passed.
- The complete Vitest suite passed through `npm run check`.
- PR #11 remains a draft and is mergeable.

### Open questions

- Exact initial baseline decisions/tasks/events to seed for the `bobai` project after migration.
- Whether the first MCP transport should expose read-only tools first or ship read/write tools with explicit confirmation boundaries in one milestone.
- Whether future project rules should live entirely in structured decisions or gain a dedicated rule/policy table after MCP usage is observed.

### Next recommended tasks

1. Review and deliberately apply `Core/migrations/002_shared_context_v0_2.sql` to the private BobAI Neon database.
2. Register the initial `bobai` project and its baseline structured state.
3. Enable `BOB_CORE_SHARED_CONTEXT_ENABLED=true` only after schema/state verification.
4. Run a live authenticated `/v1/context?project=bobai&surface=bobai` acceptance test.
5. Add Bob Core MCP transport over the same Shared Context service.
6. Expose `bob_get_context` first, then memory/project/decision/task/event tools.
7. Add the Codex `AGENTS.md` integration and perform the first cross-surface continuity test.
8. Connect ChatGPT to the same Bob Core MCP tools after Codex validation.

### Risks and dependencies

- Migration 002 has not yet been applied to production by this branch.
- Shared Context currently reads structured project state; mutation APIs/MCP tools are intentionally deferred.
- The current single-owner bearer token remains acceptable for the private MVP but future multi-device/write-tool use should move toward revocable per-device credentials and finer-grained permissions.
- Application-level field encryption for stored memory remains a separate hardening milestone.

---

## 2026-08-23 — Bob Core MCP and Codex shared-context preflight

### Session summary

Added the first authenticated, read-only Bob Core MCP transport and project-scoped Codex preflight so Codex can retrieve the same Shared Context used by BobAI before substantial work.

### Decisions made

- Use MCP TypeScript Server v2 and Streamable HTTP at `/mcp`.
- Reuse `SharedContextService` rather than creating Codex-specific state.
- Expose only `bob_get_context` in the first phase.
- Keep the bearer token out of Git and require `BOB_CORE_DEVICE_TOKEN` from the Codex environment.
- Keep MCP writes disabled until the read path is accepted end to end.
- Align Bob Core service/package/MCP versioning to `0.2.0`.

### Files changed

- Updated Core dependencies/lockfile and runtime composition.
- Added `Core/src/mcp/`, MCP tests, root `AGENTS.md`, `.codex/config.toml`, and milestone documentation.
- Updated service-version validation and this master implementation log.

### Features completed

- Authenticated `/mcp` endpoint.
- Read-only `bob_get_context` tool with structured project context.
- Required Codex Bob Core preflight with environment-sourced bearer authentication.

### Validation performed

- Locked install, TypeScript checking, and the full Vitest suite including MCP auth/list/call/error tests passed before finalization.
- Final CI and Vercel preview validation are required after workflow restoration.

### Security considerations

- No bearer token, provider key, database URL, or other credential is committed.
- Sensitive memories remain excluded and project memory remains isolated by project key.
- MCP is read-only and omits internal database IDs/arbitrary metadata.

### Next recommended tasks

1. Restore the normal read-only CI workflow and run final validation.
2. Merge/deploy the MCP endpoint after green CI and Vercel preview.
3. Configure `BOB_CORE_DEVICE_TOKEN` in the authorized Codex environment.
4. Run the first real Codex `bob_get_context` preflight, then design audited write tools.
5. Connect ChatGPT to the same MCP contract after Codex validation.

### Risks and dependencies

- `required = true` intentionally blocks Codex startup when Bob Core or its credential is unavailable.
- The single-owner bearer token should evolve toward revocable per-client credentials before broader use.

