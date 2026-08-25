# Bob Control Center v2

Date: 2026-08-24  
Production acceptance: 2026-08-25

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

The dashboard groups operational control into:

1. system overview;
2. owner command center;
3. release gates;
4. approval inbox;
5. connected interfaces and permission scopes;
6. project state;
7. operational activity.

All views are responsive for desktop, tablet, and phone.

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

## Production rollout and correction

PR #21 merged the V2 Core and Web implementation. The Web application deployed successfully, but the first Bob Core production deployment remained on the previous release because Core type checking failed in the new administration mount.

The visible symptom was isolated to the administration request:

```text
Control Center administration: The Bob Core device token is invalid.
```

Status, Memory, and Shared Context still loaded because the prior Core version already supported those routes. The new `/v1/control-center` path was not yet active, so the structured web credential fell through to the primary device-token check.

PR #22 corrected the Core type assertions and production entrypoint test. The complete Core suite then passed and both Vercel production deployments succeeded.

No credential rotation or environment-variable change was required.

## Owner acceptance evidence

Authenticated iPhone screenshots supplied by the owner confirmed:

- the prior administration error banner disappeared;
- Bob Core was online;
- Memory was online;
- Shared Context v0.2 loaded;
- the BobAI project summary loaded from Bob Core;
- pending approvals displayed as zero;
- two structured credentials were visible and enabled;
- four legacy compatibility hashes were reported without being exposed;
- GitHub Copilot displayed its project-bound scopes;
- revoke controls rendered;
- the owner approval inbox rendered;
- the responsive mobile layout remained usable and visually consistent.

Bob Core recorded:

```text
functional.acceptance.passed
control_center.v2.accepted
```

The project task for Control Center v2 was marked done, and the owner-approval-boundary decision was recorded as active.

## Final release gates

```text
Build       Passed
Runtime     Passed
Functional  Passed
```

The dashboard may show the prior Functional attention state until the next server refresh retrieves the newly recorded acceptance event.

## Current follow-up items

- Complete the standalone GitHub Copilot MCP client handshake and two-way task test.
- Provision dedicated structured credentials for BobAI, Codex, and ChatGPT.
- Register another Bob project to exercise multi-project switching and isolation.
- Add owner-approved memory proposals.
- Remove legacy read hashes after a stable migration window.

## Rollback

The change is additive and does not require a schema migration. Roll back the Vercel deployments to the prior `main` commit. Existing status, context, activity, memory, MCP, iPhone, and Control Center v1 data remain unchanged.
