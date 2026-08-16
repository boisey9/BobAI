# Bob Core

Bob Core is the private backend for BobAI. The iPhone handles voice, display, and device interaction; Bob Core owns model access, server-side secrets, Bob's instructions, approved persistent memory, and later tools.

The inference provider is replaceable. Bob's identity, memory rules, and behavior live above the provider in Bob Core, so changing between Z.AI/GLM and OpenAI does not erase Bob's approved memory.

## Current capabilities

- `GET /health` — public service health
- `GET /v1/status` — authenticated provider, model, and memory status
- `POST /v1/chat` — authenticated AI conversation and explicit memory commands
- `GET /v1/memories` — authenticated list or search
- `POST /v1/memories` — authenticated explicit memory creation
- `DELETE /v1/memories/:memoryId` — authenticated soft deletion
- Z.AI GLM through its OpenAI-compatible Chat Completions API
- Optional OpenAI Responses API fallback with `store: false`
- Neon Postgres memory storage and mutation audit trail
- Bearer-token device authentication
- Request validation, body limits, secure headers, request IDs, and redacted logging

External tools are not yet part of Bob Core v0.1.

## Memory v0.1

Memory is deliberately conservative:

- Nothing is saved merely because it appeared in a conversation.
- Chat storage requires an explicit command beginning with `remember`.
- Passwords, API keys, access tokens, private keys, recovery phrases, payment-card numbers, government identifiers, and database credentials are rejected.
- Duplicate active memories are not created.
- Forgetting uses soft deletion and writes an audit event.
- Only relevant memories classified as `normal` are automatically supplied to an AI provider.
- Memories classified as `sensitive` remain available through explicit recall/API access but are not automatically sent to the model.
- Memory content is treated as untrusted factual data, never as instructions.

Example commands:

```text
Bob, remember that I prefer to be called Rick.
What do you remember?
What do you remember about my name?
Bob, forget: I prefer to be called Rick.
```

Memory v0.1 does not yet provide application-level field encryption. Do not store credentials or other high-risk secrets. The policy rejects common secret formats, but user judgment is still required.

## Recommended provider: Z.AI GLM

General API endpoint:

```text
https://api.z.ai/api/paas/v4
```

Default model:

```text
glm-4.7-flash
```

## Local setup

Requirements:

- Node.js 22 or newer
- A Z.AI API key or OpenAI API project key
- A private Postgres/Neon database with the Memory v0.1 migration applied
- A randomly generated Bob Core device token

```bash
cd Core
npm install
cp .env.example .env
npm run generate:token
```

Apply `migrations/001_memory_v0_1.sql` to the private database, then configure `Core/.env`:

```dotenv
AI_PROVIDER=zai
ZAI_API_KEY=your-zai-api-key
ZAI_MODEL=glm-4.7-flash
ZAI_BASE_URL=https://api.z.ai/api/paas/v4

DATABASE_URL=your-private-neon-connection-string
BOB_CORE_OWNER_ID=rick
BOB_CORE_MEMORY_ENABLED=true
BOB_CORE_MEMORY_RETRIEVAL_LIMIT=6

BOB_CORE_DEVICE_TOKEN=your-generated-device-token
BOB_CORE_MAX_OUTPUT_TOKENS=700
NODE_ENV=development
```

Run validation and start the service:

```bash
npm run check
npm run dev
```

Test health and authenticated status:

```bash
curl http://localhost:8787/health

curl http://localhost:8787/v1/status \
  -H "Authorization: Bearer $BOB_CORE_DEVICE_TOKEN"
```

## Vercel deployment

Set:

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

DATABASE_URL=your-private-neon-connection-string
BOB_CORE_OWNER_ID=rick
BOB_CORE_MEMORY_ENABLED=true
BOB_CORE_MEMORY_RETRIEVAL_LIMIT=6

BOB_CORE_DEVICE_TOKEN=your-existing-device-token
BOB_CORE_MAX_OUTPUT_TOKENS=700
NODE_ENV=production
```

The iPhone keeps the same Bob Core URL and device token. A provider or database connection string must never be entered into the phone app.

## Memory API

Create an approved memory:

```http
POST /v1/memories
Authorization: Bearer <device-token>
Content-Type: application/json
```

```json
{
  "content": "I prefer concise spoken answers.",
  "subject": "Response style",
  "scope": "preference",
  "sensitivity": "normal"
}
```

List or search:

```text
GET /v1/memories
GET /v1/memories?q=spoken&limit=10
```

Forget by identifier:

```text
DELETE /v1/memories/<memory-uuid>
```

All memory endpoints require the existing Bob Core device token.

## Optional OpenAI fallback

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-project-key
OPENAI_MODEL=gpt-5-mini
```

Memory remains in Bob Core and Neon when the inference provider changes.

## Security rules

- Never put provider or database credentials in the iPhone application.
- Never commit `.env`, device tokens, provisioning files, or signing material.
- Use HTTPS outside local development.
- Rotate the device token if a phone or build artifact is compromised.
- Bob Core does not log prompts, responses, memory content, authorization headers, or secret values.
- Review provider data-use terms before allowing sensitive information to reach a hosted model.
