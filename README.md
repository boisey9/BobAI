# BobAI

BobAI is a personal AI platform with a native iPhone interface first, followed by a shared backend (Bob Core) and additional device clients such as a smartwatch.

## Milestone 1 — iPhone shell

The first native iOS build provides:

- SwiftUI conversation interface
- Push-to-talk microphone capture
- Apple Speech framework transcription
- Spoken Bob responses using system text-to-speech
- A local mock Bob service so the full UI flow can be tested before a backend exists
- A clean service boundary for the future Bob Core API

No AI API keys, tokens, or credentials are stored in the iPhone application.

## Requirements

- macOS with Xcode 26.3 installed
- iPhone running iOS 17 or later
- XcodeGen for deterministic project generation

If Homebrew is installed, XcodeGen can be installed with:

```bash
brew install xcodegen
```

## First run

```bash
git clone https://github.com/boisey9/BobAI.git
cd BobAI
./scripts/bootstrap.sh
```

Xcode will open the generated project. In **BobAI → Signing & Capabilities**, select your Apple Developer team, connect the iPhone, select it as the run destination, and press **Run**.

On first launch, BobAI will ask for microphone and speech-recognition permission. Voice input is optional; typed conversation still works if permission is declined.

## Architecture direction

```text
Watch / iPhone / Mac
        |
        v
     Bob Core
   /    |     \
Memory Tools  Reasoning
```

The iPhone app is intentionally a client. Bob Core will eventually own reasoning, memory, tool execution, authentication, and sensitive credentials.

## Security rule

Never commit secrets to this repository. Client applications must not contain provider API keys or backend administrative credentials.

## Current status

Milestone 1 is bootstrapped on `feature/bootstrap-ios`. The current Bob response service is intentionally mocked until Bob Core is introduced.
