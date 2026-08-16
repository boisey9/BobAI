# 2026-08-16 — Bob Core visual identity

## Session summary

Introduced the Bob Core visual identity into the native iOS app without changing the Bob Core backend contract. The previous microphone card is replaced by a reusable animated Core whose appearance follows the actual conversation state.

## Decisions made

- Keep explicit push-to-talk for v1.
- Make the Bob Core itself the primary voice control.
- Derive visual states from the existing SpeechRecognizer, request-processing, and AVSpeechSynthesizer lifecycle rather than inventing a parallel state machine.
- Preserve the existing Bob Core API, authentication, Keychain, provider configuration, and conversation flow.
- Track real speech synthesis start/finish/cancel events so the UI can accurately show Speaking.
- Store the production icon direction as a repository vector source while the final 1024 x 1024 binary export remains a local Xcode asset step.

## Files changed

- Added `BobAI/Views/BobCoreView.swift`.
- Updated `BobAI/Views/HomeView.swift`.
- Updated `BobAI/ViewModels/ConversationViewModel.swift`.
- Updated `BobAI/Services/SpeechSynthesizer.swift`.
- Added `docs/2026-08-16-bob-core-visual-identity.md`.
- Added `docs/design/BobAI-AppIcon.svg`.
- Added this implementation log entry.

## Validation status

Repository-level inspection is complete. Xcode compilation, simulator animation behavior, physical-device voice behavior, and final icon installation require local validation on the Mac/iPhone because the GitHub connector cannot run Xcode.

## Next recommended tasks

1. Pull the branch and regenerate the Xcode project if needed.
2. Build/run on simulator.
3. Validate Idle -> Listening -> Thinking -> Speaking transitions.
4. Validate interruption: tap Core while Bob speaks, then confirm Bob stops and listens.
5. Export `docs/design/BobAI-AppIcon.svg` or the approved artwork to a 1024 x 1024 PNG and install it in the AppIcon asset catalog.
6. Add a Reduce Motion path after visual testing if the current animation is too active for accessibility preferences.
