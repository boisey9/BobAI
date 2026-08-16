# BobAI Voice, Provider Resilience, and Continuity Plan

Date: 2026-08-16
Branch: `fix/release-audit-completion`

## Objective

Resolve the physical-iPhone interaction defects found after the first Bob Core visual release and define a safe, provider-independent path for bringing useful ChatGPT history, approved memory, and future skills into Bob Core.

## User-reported defects

The physical iPhone test identified four concrete issues:

1. Bob's successful text reply was not reliably audible.
2. Voice transcription required a separate Send action.
3. The software keyboard did not dismiss predictably.
4. Z.AI failures collapsed into a generic provider error with no useful client-side diagnostic.

The model also incorrectly described itself as text-only even though the BobAI client owns text-to-speech playback.

## Voice playback correction

`SpeechSynthesizer` now owns an explicit iOS playback audio session:

- Category: playback
- Mode: spoken audio
- Full utterance volume
- Preferred installed voice matching the device language when available
- Session deactivation after finish or cancellation
- A visible application error if the playback session cannot start
- Protection against stale speech delegate callbacks

This design keeps voice generation on the iPhone and does not send audio to Bob Core.

## Hands-free request flow

The Core remains explicit push-to-talk rather than always listening.

1. Tap the Core once.
2. Speak naturally.
3. After approximately 1.6 seconds without transcript changes, BobAI stops listening and sends the captured text automatically.
4. Tapping the Core again while listening sends immediately.
5. Bob Core returns a reply and the iPhone reads it aloud.

Typed input remains available and uses the same conversation path.

## Keyboard behavior

The composer now uses explicit focus management. The keyboard dismisses when the user:

- Taps the Core
- Sends a typed message
- Taps or scrolls the conversation
- Taps the keyboard's Done control
- Enters listening or thinking state
- Opens Bob Core settings

## Bob identity correction

Bob Core instructions now state that the iPhone client reads successful replies aloud and supports microphone capture plus automatic sending. The model is explicitly instructed not to call itself text-only or tell the user to enable a separate Read Aloud feature.

## Z.AI resilience and diagnostics

Bob Core now:

- Extracts nested HTTP status, provider code, and request ID values safely
- Maps Z.AI authentication, account, quota, rate-limit, model, policy, permission, request, network, and high-traffic business codes
- Returns sanitized diagnostic codes to the iPhone
- Shows the safe error code and Bob Core request ID in the app
- Falls back between `glm-4.7-flash` and `glm-4.5-flash` for retryable model-busy, model-unavailable, rate-limited, service, connection, empty-response, and unexpected-response failures
- Does not hide authentication, permission, policy, or account-quota problems behind fallback attempts

Bob Core settings now performs one real live reply probe in addition to checking server status and authentication.

## Continuity: what can and cannot be moved

Bob Core can own continuity, but it cannot literally copy the hosted ChatGPT model, hidden system instructions, private reasoning state, account-level product memory, or proprietary built-in connectors.

The useful portable material is:

- User-visible conversation history
- Explicit personal preferences and facts approved by the user
- Project decisions, terminology, status, and implementation records
- Bob's public identity, tone, operating rules, and safety boundaries
- Documents and files the user chooses to retain
- Reimplemented skills connected through authorized APIs

## Proposed Bob Continuity Import v0.2

### 1. Export and stage

The user exports ChatGPT account data and provides the resulting archive privately. The import process reads user-visible conversation data only; it does not treat every historical statement as a permanent fact.

### 2. Classify

Each candidate is classified into one of four destinations:

- `history`: searchable archive, not automatically injected into prompts
- `memory`: concise, durable fact or preference requiring approval
- `project`: durable decision, glossary item, status, or reference
- `discard`: duplicate, obsolete, low-value, or unsafe content

### 3. Redact and deduplicate

Before approval, the importer rejects or removes credentials, tokens, private keys, payment-card data, government identifiers, database connection strings, and duplicate material.

### 4. Review and approve

No historical conversation is promoted to durable memory automatically. Bob presents review batches with source date, source conversation, proposed category, concise wording, and sensitivity level. The user approves, edits, or rejects each batch.

### 5. Store independently of the model

Approved memories stay in the private Neon database owned by Bob Core. Searchable history should use separate tables and retention rules so raw transcripts are not mixed with the concise memory injected into model requests.

### 6. Preserve provenance

Every imported item records:

- Source type
- Source conversation or file identifier
- Original timestamp
- Import timestamp
- Approval timestamp
- Sensitivity classification
- Superseded or deleted state

## Skills architecture

Skills are not copied from ChatGPT as model weights. They are implemented as explicit Bob Core tools with permissions, schemas, audit records, and user confirmation rules.

Recommended first skill registry:

1. Web research
2. GitHub repository and pull-request actions
3. Calendar read/create/update
4. Gmail search/read/draft/send
5. Contacts lookup
6. Files and project-document retrieval
7. Weather, navigation, and location-aware requests
8. Reminders and scheduled automations

Each skill requires:

- A named capability
- An input and output schema
- OAuth or server-side credentials
- Read/write permission separation
- Confirmation before consequential writes
- Redacted structured audit logging
- A safe failure path

## Security boundary

- Provider keys, database credentials, OAuth secrets, and service tokens remain server-side.
- The iPhone stores only its Bob Core device credential in Keychain.
- Raw imported history is not automatically sent to the model.
- Sensitive memories are not automatically included in ordinary provider context.
- All provider and tool output is treated as untrusted data.

## Validation

The release branch includes automated validation for:

- Bob Core TypeScript checking and tests
- Z.AI fallback and error classification
- Bob prompt/device-capability instructions
- iOS Debug and Release builds
- AppIcon and launch-screen resources
- Simulator installation, launch, process survival, and screenshot capture

Physical iPhone audio output and microphone timing still require a final real-device acceptance test after the validated build is installed.
