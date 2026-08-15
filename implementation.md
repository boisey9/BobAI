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
