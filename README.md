# BobAI

BobAI is a private personal-AI platform with one shared backend and multiple device interfaces.

```text
iPhone / future watch / Mac
            |
            v
         Bob Core
       /     |      \
 Reasoning  Memory  Tools
```

The iPhone application handles voice, display, and device interaction. Bob Core owns provider access, server-side secrets, Bob's identity/instructions, reasoning, persistent memory, and later external tools.

The underlying model is replaceable. Bob remains the assistant layer above the provider, so changing engines does not require rebuilding the phone app or abandoning the Bob experience.

## Current status

### BobAI iPhone client

Implemented and validated capabilities:

- Native SwiftUI interface
- Production BobAI AppIcon asset
- Bob Core launch screen
- Animated idle, listening, thinking, speaking, and completion states
- Reduce Motion support
- Typed conversation
- Push-to-talk microphone input
- Apple Speech transcription
- Spoken responses with lifecycle tracking
- Bob Core connection and memory-status validation
- Simulator compilation, launch smoke test, and screenshot CI
- Physical iPhone deployment workflow

### Bob Core v0.1

The `Core/` service provides:

- Public health endpoint
- Authenticated status endpoint
- Authenticated AI chat endpoint
- Free Z.AI `glm-4.7-flash` support through its OpenAI-compatible API
- Optional OpenAI Responses API fallback
- Device bearer-token authentication
- Request validation and body-size limits
- Secure HTTP headers and redacted structured logs
- Unit and integration tests with GitHub Actions validation

### Memory v0.1

Memory belongs to Bob Core rather than an AI provider.

- Explicit remember, recall, and forget commands
- Authenticated memory list, create, and delete API
- Private Neon Postgres storage
- Provider-independent retrieval context
- Personal, project, preference, and fact scopes
- Duplicate prevention, full-text search, soft deletion, and audit events
- High-risk credential and identity data rejection
- No automatic raw-conversation persistence

External tools remain a later milestone.

## Repository structure

```text
BobAI/
├── BobAI/                 # Native iPhone application
│   ├── App/
│   ├── Models/
│   ├── Resources/
│   ├── Services/
│   ├── ViewModels/
│   └── Views/
├── Core/                  # Bob Core TypeScript backend
│   ├── migrations/
│   ├── src/
│   ├── tests/
│   └── scripts/
├── Memory/                # Project role and curated project context
├── docs/                  # Design and implementation records
├── project.yml            # XcodeGen source of truth
└── implementation.md      # Master implementation log
```

## iPhone development

Requirements:

- macOS with a compatible Xcode release
- iPhone running iOS 17 or later
- XcodeGen

```bash
brew install xcodegen
git clone https://github.com/boisey9/BobAI.git
cd BobAI
./scripts/bootstrap.sh
```

Select your Apple development team and device in Xcode, then run the app.

Release assets can be validated without opening Xcode:

```bash
python3 scripts/validate_release_assets.py
```

## Bob Core development

```bash
cd Core
npm ci
cp .env.example .env
npm run generate:token
```

Add your server-side values to `Core/.env`, apply the reviewed memory migration, then:

```bash
npm run check
npm run dev
```

See [`Core/README.md`](Core/README.md) for provider configuration, memory behavior, the API contract, the security model, and Vercel deployment instructions.

## Connecting the iPhone to Bob Core

After Bob Core is deployed over HTTPS:

1. Open BobAI on the iPhone.
2. Tap the gear icon.
3. Enter the Bob Core deployment URL.
4. Enter the same device token configured on the server.
5. Tap **Save & Test Connection**.

The connection result reports the provider, model, and whether Memory v0.1 is active. Provider API keys and database credentials are never entered into or stored by the iPhone app.

## Security rules

- Never commit API keys, database URLs, device tokens, `.env` files, signing certificates, or provisioning profiles.
- Provider and database credentials belong only on Bob Core.
- The iPhone stores its Bob Core device token in the iOS Keychain.
- Use HTTPS for every non-local Bob Core connection.
- Rotate the device token if a device or build artifact is compromised.
- Bob Core does not automatically store ordinary conversation transcripts.
- Memory v0.1 rejects common credentials and high-risk identity formats; do not use it as a password vault.
- Review a hosted provider's data-use terms before sending sensitive information through a free tier.
