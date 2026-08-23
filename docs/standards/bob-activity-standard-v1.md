# Bob Activity Standard v1

## Purpose

Bob Activity Monitor is an operational audit and observability surface. It shows what Bob and connected interfaces actually did without exposing private chain-of-thought, raw prompts, credentials, or unnecessary personal data.

## What should appear

Examples of useful activity:

- shared project context retrieved;
- memory created or removed;
- task created, changed, blocked, completed, or cancelled;
- decision recorded, superseded, or revoked;
- tool or integration action started/completed/failed;
- pull request or deployment completed/failed;
- database migration completed/failed;
- interface connected/disconnected;
- security or permission denial that is useful to the owner.

## What must never appear

- private model reasoning or chain-of-thought;
- raw conversation transcripts by default;
- full prompts/task text when a boolean or category is sufficient;
- bearer tokens, provider keys, database URLs, passwords, private keys;
- sensitive memory content;
- payment, identity, or credential material rejected by Bob memory policy.

## Activity event shape

The durable event model contains:

- `project` — stable Bob project identity when applicable;
- `eventType` — machine-stable category such as `context.retrieved`;
- `summary` — short owner-readable description;
- `source` — interface/tool such as `codex`, `bobai`, `chatgpt`, `github`, `vercel`;
- `details` — small structured non-sensitive metadata;
- `createdAt` — timestamp.

Avoid storing implementation/database identifiers in client-facing activity unless necessary for support.

## Failure rule

Operational activity logging is observability, not the requested business operation. A failure to record a non-critical activity event must not make a successful context retrieval or user action fail. Security/audit events that are legally or operationally required can use a stronger fail-closed policy later.

## Activity Monitor v1

The first monitor is read-only and supports:

- recent events across all Bob projects;
- optional project filtering;
- source/event labels;
- timestamps;
- refresh;
- safe empty/error states.

BobAI initially opens the monitor for project `bobai`; the API supports global activity so a multi-project control center can follow.

## Future activity capabilities

- project selector and health cards;
- task/decision state transitions;
- integration status;
- deployment/build/runtime/functional release gates;
- filters by source, status, tool, and date;
- correlation/request IDs exposed only when useful for diagnostics;
- alerting for failed or blocked high-priority work;
- per-client credentials and authorization audit.

## Privacy principle

The monitor answers **what happened, where, when, source, and outcome**. It does not answer "show me Bob's hidden reasoning." Reasoning remains private; outcomes and auditable actions are visible.
