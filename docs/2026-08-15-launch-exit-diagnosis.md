# BobAI Launch Exit Diagnosis

**Timestamp:** 2026-08-15  
**Task:** Diagnose successful simulator build/install that returns to the iOS Home Screen instead of showing BobAI

## Business reason

The BobAI target now compiles and installs successfully, but the simulator returns to the Home Screen instead of presenting the application UI. The objective is to make application startup deterministic before adding Bob Core networking or additional features.

## Files reviewed

- `BobAI/App/BobAIApp.swift`
- `BobAI/Views/HomeView.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `BobAI/Services/SpeechRecognizer.swift`
- `project.yml`
- `implementation.md`

## Files modified

- `BobAI/App/BobAIApp.swift`
- `BobAI/Views/HomeView.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `project.yml`
- `implementation.md`

## Summary of changes

- Removed automatic microphone and Speech authorization requests from the root view startup path.
- Voice authorization is now requested only after the user explicitly taps the microphone control.
- Added lightweight DEBUG launch traces for `BobAIApp` initialization and `HomeView` appearance.
- Made `BobAI` the explicit executable for the generated Xcode scheme and kept automatic launching enabled.

## Security considerations

- Delaying permission prompts improves privacy because BobAI no longer asks for microphone or speech access before the user chooses the voice feature.
- No credentials, API keys, tokens, or additional entitlements were introduced.
- The existing usage-description keys remain in the generated Info.plist configuration.

## UX / product considerations

- The app should open immediately into the conversation UI without blocking on privacy dialogs.
- Microphone and speech prompts now have clear user intent because they occur after tapping `Tap to talk`.
- Typed messaging remains available before any voice permission is granted.

## Testing / validation performed

- Confirmed from the provided simulator screenshot that the BobAI application is installed on the iOS 26.3 simulator.
- Reviewed the root SwiftUI lifecycle and startup task.
- Confirmed the initial startup path previously called speech and microphone authorization immediately.
- Reviewed current Apple Speech guidance, which recommends requesting Speech authorization when the feature is about to be used rather than at unrelated startup.
- Reviewed XcodeGen scheme behavior and made the runnable application target explicit.

Physical runtime validation remains required on the user's Mac because simulator process logs are not available through the repository connector.

## Remaining risks / next steps

1. Pull the latest `feature/bootstrap-ios` branch.
2. Regenerate `BobAI.xcodeproj` with `./scripts/bootstrap.sh`.
3. Run BobAI in the simulator.
4. If the UI appears, validate typed input before testing voice permissions.
5. If the process still exits, capture the Xcode debug console. The new `[BobAI] App initialized` and `[BobAI] HomeView appeared` traces will identify how far startup gets.
6. Validate the physical iPhone SE after simulator launch is stable.
