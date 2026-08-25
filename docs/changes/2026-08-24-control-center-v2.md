# Bob Control Center v2

Date: 2026-08-24

## Objective

Turn the owner dashboard into a practical command center for Bob Core projects, interfaces, permissions, approvals, release readiness, and operational activity without moving authority or credentials into the browser.

## Scope

This milestone adds:

- a project selector backed by Bob Core project state;
- Build, Runtime, and Functional release gates;
- an owner approval inbox for AI decision proposals;
- owner approval and rejection actions;
- a safe interface and credential inventory;
- enable/revoke controls for structured interface credentials;
- protection against self-revocation by the Control Center;
- privacy-safe activity and security posture summaries;
- a scoped Bob Core administration API used only by the server-side web application.

This milestone does not add:

- raw token display or retrieval;
- token generation or automatic rotation;
- direct memory approval/write controls;
- arbitrary active-decision mutation by AI interfaces;
- task deletion;
- private reasoning or raw-prompt monitoring.

## Architecture

```text
Owner browser
  -> HMAC-signed HTTP-only session
Next.js Control Center server
  -> project-bound structured web credential
Bob Core /v1/control-center
  -> safe administration views and owner actions
Neon/Postgres
```

Bob Core remains authoritative. The Next.js application never connects directly to Neon and never sends the Core credential to the browser.

## Bob Core administration API

### Read administration state

```text
GET /v1/control-center?project=<project-key>
```

Required interface scope:

```text
control-center:read
```

The response includes safe project summaries, pending decision review tasks, recent release-related events, structured interface credential IDs/surfaces/scopes/enabled states, and a count of legacy read credentials.

It never includes raw tokens or token hashes.

### Resolve a decision proposal

```text
POST /v1/control-center/approvals/:taskId
```

Required interface scope:

```text
decision:review
```

Approval creates or reuses an active Bob Core decision, marks the owner-review task complete, and records an operational event. Rejection marks the review task complete and records a rejection event without creating an active decision.

### Manage a structured interface credential

```text
POST /v1/control-center/credentials/:credentialId
```

Required interface scope:

```text
credentials:manage
```

The endpoint changes only the `enabled` state of a structured credential. It does not return or modify hashes. A scoped Control Center credential cannot disable itself.

## Security design

- Browser requests require the existing signed owner session.
- Owner POST routes reject cross-origin submissions.
- Bob Core independently checks credential scopes.
- The gateway strips spoofed internal identity headers and injects trusted interface identity after credential verification.
- The web credential is project-bound.
- Primary Bob Core credentials remain separately privileged.
- Decision proposals are not authoritative before owner approval.
- Activity contains concise outcomes, not private reasoning.
- Credential hashes are removed before administration data is returned.

## User experience

The dashboard now groups operational control into:

1. system overview;
2. owner command center;
3. release gates;
4. approval inbox;
5. connected interfaces and permission scopes;
6. project state;
7. operational activity.

All views remain responsive for desktop, tablet, and phone.

## Validation plan

### Build gate

- Bob Core locked dependency install;
- Bob Core TypeScript typecheck and Vitest suite;
- Web locked dependency install;
- Web TypeScript typecheck and Next.js production build;
- Vercel previews for Bob Core and Control Center.

### Runtime gate

- Bob Core health responds;
- Control Center `/api/health` responds;
- owner login remains valid;
- server-side Core calls return status, context, activity, and administration state.

### Functional gate

- project selector loads the registered project;
- no hash or raw token appears in HTML or API output;
- pending decision proposals appear;
- approve creates an active decision and completes the review task;
- reject completes the review task without creating a decision;
- structured credential enable/revoke works;
- the Control Center cannot revoke itself;
- actions appear in the privacy-safe activity timeline.

## Rollback

The change is additive and does not require a schema migration. Roll back the Vercel deployments to the prior `main` commit. Existing status, context, activity, memory, MCP, iPhone, and Control Center v1 data remain unchanged.
