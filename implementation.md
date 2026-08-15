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
