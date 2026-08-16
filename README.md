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

The iPhone application handles voice, display, and device interaction. Bob Core owns model access, server-side secrets, reasoning, and later persistent memory and tools.

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

### Bob Core v0.1

The `Core/` service now provides:

- Public health endpoint
- Authenticated status endpoint
- Authenticated AI chat endpoint
- OpenAI Responses API integration
- Stateless multi-turn context supplied by the client
- Device bearer-token authentication
- Request validation and body-size limits
- Secure HTTP headers and redacted structured logs
- Explicit model-request storage opt-out
- Unit tests and GitHub Actions validation

Persistent memory and external tools are intentionally deferred until the secure conversation path is proven end to end.

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
│   ├── src/
│   ├── tests/
│   └── scripts/
├── Memory/                # Project role and future curated memory
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

Add your server-side values to `Core/.env`, then:

```bash
npm run check
npm run dev
```

See [`Core/README.md`](Core/README.md) for the API contract, security model, and Vercel deployment instructions.

## Connecting the iPhone to Bob Core

After Bob Core is deployed over HTTPS:

1. Open BobAI on the iPhone.
2. Tap the gear icon.
3. Enter the Bob Core deployment URL.
4. Enter the same device token configured on the server.
5. Tap **Save & Test Connection**.

The OpenAI API key is never entered into or stored by the iPhone app.

## Security rules

- Never commit API keys, device tokens, `.env` files, signing certificates, or provisioning profiles.
- Provider credentials belong only on Bob Core.
- The iPhone stores its Bob Core device token in the iOS Keychain.
- Use HTTPS for every non-local Bob Core connection.
- Rotate the device token if a device or build artifact is compromised.
- Add persistent memory only after its encryption, retention, deletion, and access model are defined.
