# BobAI iOS Bootstrap

**Timestamp:** 2026-08-15  
**Task:** Bootstrap the first native BobAI iPhone client

## Business reason

Create a small, safe first version of BobAI that can run on the iPhone SE and prove the core device experience: talk, transcribe, converse, and hear a response. The AI backend is intentionally deferred so the device experience can be validated independently.

## Files reviewed

- `README.md`
- `Memory/Role.md`
- Repository root and `Memory/` structure

## Files modified

- `README.md`

## Files added

- `.gitignore`
- `project.yml`
- `BobAI/App/BobAIApp.swift`
- `BobAI/Models/ConversationMessage.swift`
- `BobAI/Services/BobService.swift`
- `BobAI/Services/SpeechRecognizer.swift`
- `BobAI/Services/SpeechSynthesizer.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `BobAI/Views/HomeView.swift`
- `BobAI/Views/MessageBubble.swift`
- `scripts/bootstrap.sh`
- `implementation.md`
- `docs/2026-08-15-ios-bootstrap.md`

## Summary of changes

- Added a native SwiftUI application shell targeting iOS 17+.
- Added push-to-talk speech recognition using Apple's Speech and AVFoundation frameworks.
- Added system text-to-speech for Bob responses.
- Added a local mock Bob service behind a protocol to keep UI and future backend integration separated.
- Added an XcodeGen project definition so the Xcode project can be generated consistently instead of hand-editing project files.
- Added a bootstrap script and Xcode-focused `.gitignore`.

## Security considerations

- No provider API keys or secrets are present in the app.
- Sensitive backend credentials must never be embedded in the iOS client.
- Microphone and speech access are permission-gated by iOS and only started when the user taps the microphone control.
- The future Bob Core API will require authenticated requests and server-side secret management.

## UX / product considerations

- Voice is push-to-talk rather than always-listening for the first milestone. This is easier to understand, more private, and less battery intensive.
- Typed input remains available when speech permission is declined or unavailable.
- The interface exposes clear Ready, Listening, Thinking, and Text only states.
- Bob speaks responses aloud to make the device useful without constant screen attention.

## Testing / validation performed

- Repository structure and existing role instructions were inspected before changes.
- Source boundaries were reviewed for a single-direction dependency flow: View → ViewModel → Services/Models.
- Permission usage strings are declared in the generated app configuration.
- The bootstrap process is deterministic through `project.yml`.

Physical-device compilation and runtime validation are still required on the user's Mac because code signing, Xcode SDKs, microphone hardware, and iPhone trust state are local to that machine.

## Remaining risks / next steps

1. Generate the Xcode project locally and compile on Xcode 26.3.
2. Resolve any compiler/device-specific issues found during the first build.
3. Run the app on the iPhone SE and test microphone permissions, transcription, and audio playback.
4. Design Bob Core authentication and API contract.
5. Replace `MockBobService` with a secure Bob Core client.
6. Add local conversation persistence only after the privacy model is agreed.
