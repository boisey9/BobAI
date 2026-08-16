# Bob Core

Bob Core is the private backend for BobAI. The iPhone handles voice, display, and device interaction; Bob Core owns model access, server-side secrets, Bob's instructions, and later memory and tools.

The inference provider is replaceable. Bob's identity and behavior live above the provider in Bob Core, so changing from OpenAI to Z.AI/GLM does not turn the assistant into a generic vendor-branded chatbot. It is still Bob, while the underlying engine is reported honestly when asked.

## Current MVP

- `GET /health` — public service health
- `GET /v1/status` — authenticated provider/model configuration check
- `POST /v1/chat` — authenticated AI conversation
- Z.AI GLM through its OpenAI-compatible Chat Completions API
- Optional OpenAI Responses API fallback with `store: false`
- Bearer-token device authentication
- Request validation, body limits, secure headers, request IDs, and redacted logging
- Stateless conversation history supplied by the client
- Unit tests that do not require live provider credentials

Persistent memory and tools are intentionally not part of v0.1.

## Recommended provider: free Z.AI GLM

Z.AI currently lists `glm-4.7-flash` as a free text model. Free service is still subject to provider availability and usage limits.

General API endpoint:

```text
https://api.z.ai/api/paas/v4
```

Do not use the separate Coding Plan endpoint for the BobAI mobile assistant unless the account is specifically using that plan.

## Local setup

Requirements:

- Node.js 22 or newer
- A Z.AI API key
- A randomly generated Bob Core device token

```bash
cd Core
npm install
cp .env.example .env
npm run generate:token
```

Put the generated token and Z.AI key in `Core/.env`:

```dotenv
AI_PROVIDER=zai
ZAI_API_KEY=your-zai-api-key
ZAI_MODEL=glm-4.7-flash
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
BOB_CORE_DEVICE_TOKEN=your-generated-device-token
BOB_CORE_MAX_OUTPUT_TOKENS=700
NODE_ENV=development
```

Run validation and start the service:

```bash
npm run check
npm run dev
```

Test health:

```bash
curl http://localhost:8787/health
```

Test authenticated status:

```bash
curl http://localhost:8787/v1/status \
  -H "Authorization: Bearer $BOB_CORE_DEVICE_TOKEN"
```

## Vercel deployment

Create a Vercel project from this repository and set:

```text
Root Directory: Core
Framework Preset: Hono
```

Add these Production environment variables in Vercel:

```dotenv
AI_PROVIDER=zai
ZAI_API_KEY=your-zai-api-key
ZAI_MODEL=glm-4.7-flash
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
BOB_CORE_DEVICE_TOKEN=your-existing-device-token
BOB_CORE_MAX_OUTPUT_TOKENS=700
NODE_ENV=production
```

The existing iPhone configuration does not change. After Vercel redeploys, `Save & Test Connection` should report `glm-4.7-flash`, and new conversations will use GLM through the same Bob Core URL and device token.

## Optional OpenAI fallback

To switch back without changing the iPhone app:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-project-key
OPENAI_MODEL=gpt-5-mini
```

Bob Core also accepts the generic overrides `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` for either provider.

## API contract

`POST /v1/chat`

```json
{
  "conversationId": "optional-uuid",
  "messages": [
    {
      "role": "user",
      "content": "Hello Bob"
    }
  ]
}
```

Successful response:

```json
{
  "conversationId": "uuid",
  "message": {
    "role": "assistant",
    "content": "Hello!"
  },
  "model": "glm-4.7-flash",
  "requestId": "uuid"
}
```

## Security rules

- Never put a provider API key in the iPhone application.
- Never commit `.env`, device tokens, provisioning files, or signing material.
- Use a unique random device token of at least 32 characters.
- Use HTTPS outside local development.
- Rotate the device token if a phone or build artifact is compromised.
- Bob Core does not log prompts, responses, authorization headers, or secret values.
- Free provider tiers are not automatically appropriate for sensitive company or family information; review the provider's current data-use terms before adding persistent memory.
