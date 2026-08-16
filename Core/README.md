# Bob Core

Bob Core is the private backend for BobAI. The iPhone app handles voice, display, and device interaction; Bob Core owns model access, server-side secrets, reasoning, and later memory and tools.

## Current MVP

- `GET /health` — public service health
- `GET /v1/status` — authenticated configuration check
- `POST /v1/chat` — authenticated AI conversation
- OpenAI Responses API integration
- Explicit `store: false` on model requests
- Bearer-token device authentication
- Request validation, body limits, secure headers, and redacted logging
- Stateless conversation history supplied by the client
- Unit tests that do not require an OpenAI key

Persistent memory and tools are intentionally not part of v0.1.

## Requirements

- Node.js 22 or newer
- An OpenAI API project key
- A randomly generated Bob Core device token

## Local setup

```bash
cd Core
npm install
cp .env.example .env
npm run generate:token
```

Put the generated token and your OpenAI project key in `Core/.env`:

```dotenv
OPENAI_API_KEY=your-project-key
OPENAI_MODEL=gpt-5-mini
BOB_CORE_DEVICE_TOKEN=your-generated-device-token
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

Create a Vercel project from this repository and set **Root Directory** to `Core`. Add these environment variables in Vercel rather than committing them:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `BOB_CORE_DEVICE_TOKEN`
- `BOB_CORE_MAX_OUTPUT_TOKENS`
- `NODE_ENV=production`

After deployment, enter the HTTPS deployment URL and the same device token in the BobAI iPhone app under **Bob Core Settings**.

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
  "model": "configured-model",
  "requestId": "uuid"
}
```

## Security rules

- Never put `OPENAI_API_KEY` in the iPhone application.
- Never commit `.env`, device tokens, provisioning files, or signing material.
- Use a unique random device token of at least 32 characters.
- Use HTTPS outside local development.
- Rotate the device token if a phone or build artifact is compromised.
- Bob Core does not log message contents or authorization headers.
