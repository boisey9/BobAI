# Control Center Session-Bound Owner Action Protection

Date: 2026-08-27

## Objective

Make Control Center owner actions reliable on Safari/Vercel without weakening the owner security boundary.

## Problem

Decision approval and credential-management forms were protected by browser/proxy origin heuristics. In the live iPhone/Safari/Vercel path, legitimate owner requests repeatedly returned:

```text
Invalid request origin.
```

The request was rejected by the Next.js Web layer before Bob Core received it. The Bob Core approval transaction and Neon write path were independently validated, so continuing to add Host, forwarded-host, or Fetch Metadata exceptions would make the security rule more complicated without making it deterministic.

## Decision

Owner mutation forms now use a session-bound signed CSRF token instead of relying on deployment-host heuristics.

The token is:

- derived server-side from the existing signed owner session token;
- HMAC-signed with `BOB_CONTROL_CENTER_SESSION_SECRET` and a dedicated owner-action purpose string;
- rendered only into authenticated owner forms;
- validated server-side before decision approval/rejection or credential enable/revoke calls;
- compared using constant-time equality;
- never used as a Bob Core credential and never stored in Bob Core or Neon.

## Security boundary

The owner mutation boundary remains layered:

1. valid signed owner session cookie;
2. `HttpOnly`, `Secure` in production, `SameSite=Strict` session cookie;
3. valid session-bound owner-action CSRF token;
4. server-side Control Center credential to Bob Core;
5. Bob Core interface authorization and project binding;
6. idempotent Bob Core/Neon transaction for decision state.

This is stronger and more deterministic than attempting to infer browser trust from Vercel-rewritten `Host`, `Origin`, or `Sec-Fetch-Site` behavior.

## Scope

Updated:

- `Web/lib/session.ts`
- `Web/app/page.tsx`
- `Web/components/control-center-v2.tsx`
- `Web/app/api/approvals/[taskId]/route.ts`
- `Web/app/api/credentials/[credentialId]/route.ts`
- `Web/README.md`

Removed:

- `Web/lib/request-origin.ts` — deployment-host/origin heuristics are no longer part of owner authorization.

No database schema, Bob Core credential, password, or environment-variable change is required.

## Functional acceptance

The change is not considered functionally accepted until the owner can use the existing pending Codex proposal in production to:

1. press **Approve decision** from the iPhone Control Center;
2. receive a successful redirect/notice rather than an origin/token error;
3. observe the pending review disappear;
4. verify one active Bob Core decision exists;
5. verify the review task is completed and one approval event is recorded.

Until that owner retest passes, the Control Center decision-approval functional gate remains open.
