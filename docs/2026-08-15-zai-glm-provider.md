# Z.AI GLM Provider Integration

**Timestamp:** 2026-08-15  
**Task:** Add a no-cost Z.AI/GLM inference option to Bob Core while preserving Bob's identity and existing iPhone connection.

## Objective

Replace the paid OpenAI dependency for ordinary BobAI conversations with Z.AI's free `glm-4.7-flash` model, without changing the BobAI iPhone URL, device token, voice flow, or the Bob assistant layer.

## Important continuity boundary

The underlying model provider is not the whole assistant. Bob's consistent identity is implemented in Bob Core through:

- Bob-specific system instructions
- The Bob Core API contract
- Device authentication
- Conversation context
- Future curated memory and tools

Switching to GLM does not literally transfer the hosted ChatGPT session or OpenAI account memory. It preserves the Bob behavior layer and creates a provider-independent foundation so future model changes do not require rebuilding the assistant.

## Files reviewed

- `Core/src/config.ts`
- `Core/src/index.ts`
- `Core/src/server.ts`
- `Core/src/app.ts`
- `Core/src/ai/openai-provider.ts`
- `Core/src/ai/provider.ts`
- `Core/src/ai/provider-error.ts`
- `Core/src/prompts/bob.ts`
- `Core/.env.example`
- `Core/README.md`
- Existing backend tests
- `BobAI/Views/CoreSettingsView.swift`
- `README.md`
- `implementation.md`

## Files added

- `Core/src/ai/zai-provider.ts`
- `Core/src/ai/provider-factory.ts`
- `Core/tests/config.test.ts`
- `Core/tests/provider-factory.test.ts`
- `docs/2026-08-15-zai-glm-provider.md`

## Files modified

- `Core/src/config.ts`
- `Core/src/index.ts`
- `Core/src/server.ts`
- `Core/src/app.ts`
- `Core/src/ai/openai-provider.ts`
- `Core/src/ai/provider-error.ts`
- `Core/src/prompts/bob.ts`
- `Core/.env.example`
- `Core/README.md`
- `Core/tests/app.test.ts`
- `Core/tests/openai-provider-import.test.ts`
- `Core/tests/provider-error.test.ts`
- `Core/tests/vercel-entrypoint.test.ts`
- `BobAI/Views/CoreSettingsView.swift`
- `README.md`
- `implementation.md`

## Implementation details

### Provider-neutral configuration

Bob Core now supports:

- `AI_PROVIDER=openai|zai`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_BASE_URL`

Provider-specific variables remain available for clearer deployment configuration:

- `ZAI_API_KEY`
- `ZAI_MODEL`
- `ZAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Existing OpenAI deployments remain compatible. If `ZAI_API_KEY` is present and no provider is explicitly selected, Bob Core selects Z.AI automatically.

### Z.AI provider

The Z.AI implementation uses the official OpenAI Node SDK against Z.AI's documented OpenAI-compatible endpoint:

```text
https://api.z.ai/api/paas/v4
```

It calls Chat Completions with:

```text
model: glm-4.7-flash
```

Bob's instructions are supplied as the system message, followed by the same user/assistant conversation context already sent by the iPhone.

### Provider factory

A provider factory selects the correct implementation at startup. The iPhone continues to call the same `/v1/status` and `/v1/chat` endpoints, so no connection migration is required.

### Bob identity

The system instructions now explicitly separate Bob's assistant identity from the replaceable inference engine. Bob must remain honest if asked about the underlying provider and must not claim to be the exact same hosted ChatGPT session.

## Vercel production configuration

Use these Production environment variables:

```dotenv
AI_PROVIDER=zai
ZAI_API_KEY=<private Z.AI API key>
ZAI_MODEL=glm-4.7-flash
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
BOB_CORE_DEVICE_TOKEN=<existing Bob Core device token>
BOB_CORE_MAX_OUTPUT_TOKENS=700
NODE_ENV=production
```

The existing OpenAI variables may be removed after the GLM deployment is validated, or retained as a controlled fallback.

## Security considerations

- No provider API key is stored on the iPhone.
- No provider API key or device token is committed.
- The existing Bob Core bearer authentication is unchanged.
- Bob Core continues to avoid logging prompts, responses, authorization headers, and secret values.
- Provider error logging remains sanitized.
- A free hosted provider should not be assumed suitable for sensitive company or family information without reviewing its current data-use and retention terms.
- Persistent memory remains deferred until encryption, retention, deletion, and authorization policies are defined.

## Validation added

- Z.AI default model and endpoint configuration tests
- Automatic Z.AI provider-selection test
- Existing OpenAI environment compatibility test
- Missing-provider-key validation test
- Provider-factory selection tests
- OpenAI and Z.AI constructor tests
- Z.AI-specific safe error-message tests
- Vercel entrypoint status test using the Z.AI configuration
- Existing Bob Core API and security tests retained

## Remaining operational steps

1. Let GitHub Actions complete TypeScript checking and all backend tests.
2. Merge only after CI succeeds.
3. Create a Z.AI account and API key.
4. Add the Z.AI Production variables in Vercel.
5. Redeploy Bob Core.
6. Open BobAI settings and run **Save & Test Connection** using the existing URL and device token.
7. Confirm the status reports `glm-4.7-flash`.
8. Test one typed and one spoken conversation.
9. Review Z.AI data-use terms before adding persistent memory or sensitive project documents.

## Primary references

- Z.AI API endpoint and bearer authentication documentation
- Z.AI Chat Completions API reference
- Z.AI GLM-4.7 model documentation
- Z.AI pricing page listing `GLM-4.7-Flash` as free
