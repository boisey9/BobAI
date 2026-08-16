from pathlib import Path

LOG_PATH = Path("implementation.md")
HEADING = (
    "## 2026-08-16 — Voice interaction, Z.AI resilience, "
    "and release-audit completion"
)

ENTRY = r"""
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
""".strip()

current = LOG_PATH.read_text(encoding="utf-8")
if HEADING not in current:
    LOG_PATH.write_text(
        current.rstrip() + "\n\n---\n\n" + ENTRY + "\n",
        encoding="utf-8",
    )
    print("Appended release-audit entry to implementation.md")
else:
    print("Release-audit entry already exists; no duplicate added")
