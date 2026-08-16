# BobAI Black Screen Launch Fix

**Timestamp:** 2026-08-15  
**Task:** Resolve black screen when launching BobAI from Xcode

## Business reason

The initial BobAI iOS bootstrap compiled and launched in the simulator, but the application displayed only a black screen. The first milestone cannot be validated until the SwiftUI root scene reliably attaches and renders.

## Files reviewed

- `BobAI/App/BobAIApp.swift`
- `BobAI/Views/HomeView.swift`
- `BobAI/ViewModels/ConversationViewModel.swift`
- `BobAI/Services/SpeechRecognizer.swift`
- `BobAI/Views/MessageBubble.swift`
- `project.yml`
- `scripts/bootstrap.sh`
- `implementation.md`

## Files modified

- `project.yml`
- `implementation.md`

## Files added

- `docs/2026-08-15-black-screen-launch-fix.md`

## Summary of changes

The generated Info.plist configuration did not explicitly request generation of the iOS application scene manifest or launch-screen metadata. BobAI uses the SwiftUI `App` lifecycle and creates its UI through a `WindowGroup`, so the project configuration now explicitly enables:

- `INFOPLIST_KEY_UIApplicationSceneManifest_Generation: YES`
- `INFOPLIST_KEY_UILaunchScreen_Generation: YES`

After pulling this change, `BobAI.xcodeproj` must be regenerated because `project.yml` is the source of truth.

## Security considerations

- No authentication, secrets, credentials, permissions, or network behavior were changed.
- Microphone and speech-recognition permission strings remain unchanged.
- The fix only changes generated application lifecycle metadata.

## UX / product considerations

- The application must display the BobAI interface immediately after launch rather than presenting an unexplained black screen.
- Launch-screen generation provides a predictable startup transition while SwiftUI initializes.

## Testing / validation performed

- The SwiftUI `@main` entry point was verified to create `HomeView()` inside a `WindowGroup`.
- `HomeView` was reviewed and contains visible text, controls, and a gradient, confirming that a fully black render is not an intentional UI state.
- The generated Info.plist settings in `project.yml` were identified as the lifecycle configuration gap.
- Repository configuration was patched on `feature/bootstrap-ios`.

Physical simulator/device validation is still required after regenerating the Xcode project.

## Remaining risks / next steps

1. Pull the latest `feature/bootstrap-ios` branch.
2. Regenerate `BobAI.xcodeproj` with `./scripts/bootstrap.sh`.
3. In Xcode, use **Product → Clean Build Folder** if the old generated project/build cache is still open.
4. Run BobAI again in the simulator.
5. If the screen remains black, capture the Xcode debug console immediately after launch; the next likely investigation is scene/process startup rather than the SwiftUI layout itself.
