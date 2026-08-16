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

The iPhone application handles voice, display, and device interaction. Bob Core owns provider access, server-side secrets, Bob's identity and instructions, reasoning, approved persistent memory, and later tools.

The underlying model is replaceable. Bob remains the assistant layer above the provider, and approved memory remains in Bob Core rather than belonging to Z.AI, OpenAI, or any other inference engine.

## Current status

### BobAI iPhone client

Validated capabilities:

- Native SwiftUI interface
- Typed conversation
- Push-to-talk microphone input
- Apple Speech transcription
- Spoken responses
- Simulator launch and interaction
- Physical iPhone deployment

### Bob Core

The `Core/` service provides:

- Public health endpoint
- Authenticated provider, model, and memory status
- Authenticated AI chat
- Explicit `remember`, `recall`, and `forget` commands
- Authenticated memory list/create/delete API
- Neon Postgres storage, search, soft deletion, and mutation audit
- Provider-independent retrieval of relevant approved memory
- Z.AI `glm-4.7-flash` support through its OpenAI-compatible API
- Optional OpenAI Responses API fallback
- Device bearer-token authentication
- Request validation, body-size limits, secure HTTP headers, and redacted logs
- Unit tests and GitHub Actions validation

External tools remain a later milestone.

## Memory v0.1 behavior

Memory is explicit-by-default. Bob does not save ordinary conversation automatically.

```text
Bob, remember that I prefer to be called Rick.
What do you remember about my name?
Bob, forget: I prefer to be called Rick.
```

High-risk secrets and credentials are rejected. Relevant memories classified as normal may be supplied to the active model. Sensitive memories are not automatically included in model requests and require explicit recall/API access.

## Repository structure

```text
BobAI/
├── BobAI/                 # Native iPhone application
│   ├── App/
│   ├── Models/
│   ├── Services/
│   ├── ViewModels/
│   └── Views/
├── Core/                  # Bob Core TypeScript backend
│   ├── migrations/        # Reviewed database migrations
│   ├── src/
│   │   └── memory/        # Provider-independent memory service
│   ├── tests/
│   └── scripts/
├── Memory/                # Project role and curated project context
├── docs/                  # Change documentation
├── project.yml            # XcodeGen source of truth
└── implementation.md      # Master implementation log
```

## iPhone development

Requirements:

- macOS with Xcode 26.3
- iPhone running iOS 17 or later
- XcodeGen

```bash
brew install xcodegen
git clone https://github.com/boisey9/BobAI.git
cd BobAI
./scripts/bootstrap.sh
```

Select your Apple development team and device in Xcode, then run the app.

## Bob Core development

```bash
cd Core
npm install
cp .env.example .env
npm run generate:token
```

Apply the reviewed Memory v0.1 migration to the private database, add the server-side environment values, then:

```bash
npm run check
npm run dev
```

See [`Core/README.md`](Core/README.md) for provider, memory, API, privacy, and deployment instructions.

## Connecting the iPhone to Bob Core

After Bob Core is deployed over HTTPS:

1. Open BobAI on the iPhone.
2. Tap the gear icon.
3. Enter the Bob Core deployment URL.
4. Enter the same device token configured on the server.
5. Tap **Save & Test Connection**.

Provider and database credentials are never entered into or stored by the iPhone app. Switching model providers does not require changing the phone's Bob Core URL or device token.

## Security rules

- Never commit API keys, database URLs, device tokens, `.env` files, signing certificates, or provisioning profiles.
- Provider and database credentials belong only on Bob Core.
- The iPhone stores its Bob Core device token in the iOS Keychain.
- Use HTTPS for every non-local Bob Core connection.
- Rotate the device token if a device or build artifact is compromised.
- Bob Core does not log message or memory content.
- Memory v0.1 does not yet add application-level field encryption; do not store credentials or other high-risk secrets.
- Review hosted-provider data-use terms before allowing sensitive information to reach a model.
