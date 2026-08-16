# Bob Core Visual Identity

Date: 2026-08-16
Status: implemented and release-validated

## Objective

Give BobAI a recognizable visual identity centered on the Bob Core: a dark, electric-blue/cyan energy core that doubles as the primary voice interaction control.

## Product behavior

The Bob Core is the main voice control on the home screen.

- Idle: slow breathing glow and gentle orbit.
- Listening: brighter, faster pulsing rings while the live transcript is shown.
- Thinking: faster rotating orbit and processing label; interaction is disabled until the request completes.
- Speaking: strong outward pulse while Bob's synthesized voice is active.
- Complete: a short acknowledgement state after spoken output finishes.

Tapping the Core starts or stops listening. Starting a new listening session while Bob is speaking stops the current synthesized speech first. Apple Reduce Motion is respected by removing repeating rotation and scale animation while preserving state labels and visual status.

## Production assets

The approved visual direction is installed as real Xcode resources:

- `BobAI/Resources/Assets.xcassets/AppIcon.appiconset/BobAI-AppIcon-1024.png`
- `BobAI/Resources/Assets.xcassets/BobCoreLaunch.imageset/`
- `BobAI/Resources/LaunchScreen.storyboard`

The app icon is an opaque 1024 x 1024 PNG selected through `ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon`. The launch storyboard uses the matching Bob Core artwork on the same near-black color field as the app.

Editable source artwork remains under `docs/design/`.

## Files changed

- `BobAI/Views/BobCoreView.swift`
- `BobAI/Views/HomeView.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `BobAI/Services/SpeechSynthesizer.swift`
- `BobAI/Services/SpeechRecognizer.swift`
- `BobAI/Services/BobCoreClient.swift`
- `BobAI/Views/CoreSettingsView.swift`
- `BobAI/Resources/Assets.xcassets/`
- `BobAI/Resources/LaunchScreen.storyboard`
- `project.yml`
- `.github/workflows/ios.yml`
- `scripts/validate_release_assets.py`

## Validation

The repository validates the following on a macOS GitHub Actions runner:

1. Production PNG dimensions, opacity, manifests, and project settings.
2. XcodeGen project generation.
3. Debug simulator compilation.
4. Compiled AppIcon and launch storyboard resources.
5. Simulator installation, launch, process survival, and screenshot capture.
6. Release configuration compilation with code signing disabled.

Physical-device signing remains intentionally local to the owner's Apple account, but the same sources and resources are compiled by CI before merge.

## Security and privacy

No authentication, Bob Core API, provider credential, Keychain, networking, or microphone permission behavior was weakened. Voice remains explicit push-to-talk. The microphone permission request uses the current API for the iOS 17 deployment target.
