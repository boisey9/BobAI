# Bob Core

Bob Core is the private backend for BobAI. The iPhone handles voice, display, and device interaction; Bob Core owns model access, server-side secrets, Bob's instructions, approved persistent memory, shared project state, and later tools.

The inference provider is replaceable. Bob's identity, memory rules, project context, and behavior live above the provider in Bob Core, so changing between Z.AI/GLM, OpenAI, or a later model does not erase Bob's approved continuity.

## Current capabilities

- `GET /health` — public service health
- `GET /v1/status` — authenticated provider, model, memory, and shared-context status
- `GET /v1/context` — authenticated Shared Context v0.2 package for a registered project
- `POST /v1/chat` — authenticated AI conversation and explicit memory commands
- `GET /v1/memories` — authenticated list or search
- `POST /v1/memories` — authenticated explicit memory creation
- `DELETE /v1/memories/:memoryId` — authenticated soft deletion
- Z.AI GLM through its OpenAI-compatible Chat Completions API
- Retryable fallback between `glm-4.7-flash` and `glm-4.5-flash`
- Optional OpenAI Responses API provider with `store: false`
- Sanitized provider error codes and request identifiers
- Neon Postgres memory storage and mutation audit trail
- Provider-independent project, decision, task, and event context models
- Bearer-token device authentication
- Request validation, body limits, secure headers, request IDs, and redacted logging

MCP transport and executable external tools are not yet part of this milestone.

## Memory v0.1

Memory is deliberately conservative:

- Nothing is saved merely because it appeared in a conversation.
- Chat storage requires an explicit command beginning with `remember`.
- Passwords, API keys, access tokens, private keys, recovery phrases, payment-card numbers, government identifiers, and database credentials are rejected.
- Duplicate active memories are not created within the same owner/project context.
- The same approved memory text may exist in separate projects without cross-project collision.
- Forgetting uses soft deletion and writes an audit event.
- Only relevant memories classified as `normal` are automatically supplied to an AI provider.
- Memories classified as `sensitive` remain available through explicit recall/API access but are not automatically sent to the model or Shared Context.
- Memory content is treated as untrusted factual data, never as instructions.
- Project-scoped memories require a `projectKey` when created through the API.

Example commands:

```text
Bob, remember that I prefer to be called Rick.
What do you remember?
What do you remember about my name?
Bob, forget: I prefer to be called Rick.
```

Memory v0.1 does not yet provide application-level field encryption. Do not store credentials or other high-risk secrets. The policy rejects common secret formats, but user judgment is still required.

## Shared Context v0.2

Shared Context is the provider-independent project-state layer that will be consumed by BobAI, Codex, ChatGPT, and later interfaces.

Its durable records are intentionally separate from ordinary memory:

- **Projects** identify a stable project key, name, repository, status, and metadata.
- **Decisions** capture active architectural/product decisions and why they were made.
- **Tasks** capture open, in-progress, and blocked project work with priority.
- **Events** capture recent implementation or project activity for continuity.
- **Memories** remain concise approved facts/preferences and may optionally carry a `projectKey`.

`GET /v1/context` assembles one bounded package containing the requested project, active decisions, active tasks, recent events, and relevant non-sensitive memories. It does not dump the full database or raw conversation history.

Project-scoped memories are included only when their `projectKey` matches the requested project. This prevents one project's memory from becoming another project's context.

Shared Context is opt-in at deployment time:

```dotenv
BOB_CORE_SHARED_CONTEXT_ENABLED=false
```

Keep it `false` until `migrations/002_shared_context_v0_2.sql` has been reviewed/applied and the initial project records have been registered.

## Recommended provider: Z.AI GLM

General API endpoint:

```text
https://api.z.ai/api/paas/v4
```

Primary model:

```text
glm-4.7-flash
```

When that model returns a retryable overload, rate, service, connection, or empty-response failure, Bob Core tries:

```text
glm-4.5-flash
```

Authentication, permission, policy, invalid-request, and exhausted-quota failures remain visible and are not hidden by fallback.

## Local setup

Requirements:

- Node.js 22 or newer
- A Z.AI API key or OpenAI API project key
- A private Postgres/Neon database with the approved migrations applied
- A randomly generated Bob Core device token

```bash
cd Core
npm ci
cp .env.example .env
npm run generate:token
```

Apply `migrations/001_memory_v0_1.sql` first. Review and apply `migrations/002_shared_context_v0_2.sql` before enabling Shared Context. The dependable-continuity branch additionally requires `003_durable_continuity.sql` before deploying its Core implementation. `004_owner_auth.sql` belongs in Web's configured auth database and remains separately feature-gated. See [deployment and recovery](../docs/deployment.md) and [release gates](../docs/release-gates.md).

Configure `Core/.env`:

```dotenv
AI_PROVIDER=zai
ZAI_API_KEY=your-zai-api-key
ZAI_MODEL=glm-4.7-flash
ZAI_BASE_URL=https://api.z.ai/api/paas/v4

DATABASE_URL=your-private-neon-connection-string
BOB_CORE_OWNER_ID=rick
BOB_CORE_MEMORY_ENABLED=true
BOB_CORE_MEMORY_RETRIEVAL_LIMIT=6
BOB_CORE_SHARED_CONTEXT_ENABLED=false

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
BOB_CORE_SHARED_CONTEXT_ENABLED=false

BOB_CORE_DEVICE_TOKEN=your-existing-device-token
BOB_CORE_MAX_OUTPUT_TOKENS=700
NODE_ENV=production
```

`Core/vercel.json` contains an ignored-build command. With `Core` as the Vercel Root Directory, commits that do not modify Bob Core are skipped instead of consuming backend preview deployments. A commit that changes any file under `Core/` still builds normally.

The iPhone keeps the same Bob Core URL and device token. A provider or database connection string must never be entered into the phone app.

## Memory API

Create an approved global memory:

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

Create an approved project memory:

```json
{
  "content": "Use a feature branch and PR before main.",
  "subject": "Branch policy",
  "scope": "project",
  "projectKey": "bobai",
  "tags": ["engineering", "git"]
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

## Shared Context API

After migration 002 is applied, the project is registered, and `BOB_CORE_SHARED_CONTEXT_ENABLED=true` is deployed:

```http
GET /v1/context?project=bobai&task=voice%20screen&surface=codex
Authorization: Bearer <device-token>
```

Supported surfaces are:

```text
bobai
codex
chatgpt
other
```

The response contains a structured `context` object with:

- Bob Core authority metadata
- the requested project
- active decisions
- active/open project tasks
- recent project events
- relevant non-sensitive approved memories
- the surface/task that requested the package

Unknown projects return `404 shared_context_project_not_found`. Disabled/unconfigured Shared Context returns `503 shared_context_not_configured`.

## Optional OpenAI provider

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-project-key
OPENAI_MODEL=gpt-5-mini
```

Memory and Shared Context remain in Bob Core and Neon when the inference provider changes.

## Security rules

- Never put provider or database credentials in the iPhone application.
- Never commit `.env`, device tokens, provisioning files, or signing material.
- Use HTTPS outside local development.
- Rotate the device token if a phone or build artifact is compromised.
- Bob Core does not log prompts, responses, memory content, Shared Context payload content, authorization headers, or secret values.
- Shared Context requires the same authenticated `/v1/*` boundary as memory and chat.
- Shared Context is disabled by default until its database migration is intentionally enabled.
- Sensitive memories are never automatically added to Shared Context.
- Review provider data-use terms before allowing sensitive information to reach a hosted model.
