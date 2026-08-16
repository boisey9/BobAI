# Bob Core Visual Identity

Date: 2026-08-16
Branch: `agent/bob-core-visual-identity`

## Objective

Give BobAI a recognizable visual identity centered on the Bob Core: a dark, electric-blue/cyan energy core that doubles as the primary voice interaction control.

## Product behavior

The Bob Core is now the main voice control on the home screen.

- Idle: slow breathing glow and gentle orbit.
- Listening: brighter, faster pulsing rings while the live transcript is shown.
- Thinking: faster rotating orbit and processing label.
- Speaking: strong outward pulse while Bob's synthesized voice is active.
- Complete: reserved state for short action-complete acknowledgement animations.

Tapping the Core starts or stops listening. Starting a new listening session while Bob is speaking stops the current synthesized speech first.

## Files changed

- `BobAI/Views/BobCoreView.swift` — new reusable animated Core component and state model.
- `BobAI/Views/HomeView.swift` — replaces the previous microphone card with the Bob Core and updates the visual language.
- `BobAI/ViewModels/ConversationViewModel.swift` — exposes Bob speaking state to the UI.
- `BobAI/Services/SpeechSynthesizer.swift` — reports speech start/finish/cancel events and supports explicit stop.

## App icon direction

The approved icon direction is a near-black rounded-square field with concentric electric-blue/cyan energy rings and a luminous `B` at the center. The app's in-product Bob Core intentionally shares the same visual vocabulary so the icon feels like the same object that wakes up when the user talks to Bob.

A production 1024 x 1024 PNG should be exported from the approved source artwork and placed in the Xcode AppIcon asset catalog. The binary image itself is intentionally not embedded through the GitHub text-file connector in this change.

## Security and privacy

No authentication, Bob Core API, provider credential, Keychain, networking, or microphone permission behavior was weakened. Voice remains explicit push-to-talk.

## Validation required locally

1. Regenerate/open the Xcode project.
2. Build on the simulator and physical iPhone.
3. Verify Idle -> Listening -> Thinking -> Speaking transitions.
4. Verify tapping the Core while Bob is speaking stops speech and begins listening.
5. Confirm live transcript layout remains readable for long phrases.
6. Confirm Reduce Motion behavior is acceptable; add an accessibility-specific reduced animation path if needed.
7. Export and install the final 1024 x 1024 app icon asset.
