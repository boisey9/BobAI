# Control Center proxy-aware origin guard fix

Date: 2026-08-26

## Objective

Restore owner POST actions from the production Bob Control Center on iPhone/Safari after the Bob Core decision-save SQL path was verified healthy.

## Observed behavior

The owner could load the Control Center, see the pending Codex decision proposal, and remain authenticated, but pressing **Approve decision** did not complete the proposal.

The earlier nullable-note PostgreSQL issue was fixed and deployed, yet the owner retest still failed.

## Isolation

The live Bob Core database approval SQL was executed inside a rollback-only transaction using the pending proposal `9bcbabfd-f464-4825-857f-e6db1aa0f782`.

That probe successfully:

- selected the pending decision-review task;
- constructed the active decision;
- completed the review task;
- constructed the `decision.approved` event;
- returned the expected decision ID;
- rolled all changes back, leaving the real proposal open.

This proves the current Bob Core storage path is valid and moves the remaining failure boundary ahead of Neon/Postgres.

## Root cause candidate

The Web POST routes compared the browser `Origin` header directly with `request.nextUrl.origin`.

Behind Vercel or another trusted proxy, the internal Next.js request URL can differ from the browser-visible host even when the request is genuinely same-origin. Safari/proxy combinations are particularly sensitive to forwarded-host/origin mismatches.

The result is a false CSRF rejection before Bob Core receives the approval request.

## Fix

Add a shared proxy-aware same-origin validator that:

- parses the browser `Origin` header;
- accepts only HTTP(S) origins;
- compares the origin host against the trusted incoming `Host` and `X-Forwarded-Host` values;
- continues to reject unrelated cross-origin requests;
- preserves the signed owner session and SameSite Strict cookie boundary.

Apply the helper to both:

- decision approval/rejection POST routes;
- interface credential enable/revoke POST routes.

The decision-action redirect also returns to `#approvals` so the result is visible immediately on mobile.

## Security

This does not remove same-origin validation. It changes which request metadata is trusted for the comparison so the check remains correct behind the production proxy.

The browser still never receives a Bob Core credential, and Bob Core independently enforces `decision:review` or `credentials:manage` scopes.

## Validation

Before merge:

- Web TypeScript and production build must pass;
- Vercel preview must be green;
- no change may weaken session, scope, or project-binding controls.

Final functional acceptance remains an authenticated owner action from the production iPhone Control Center.

## Rollback

Revert the Web origin-helper and route changes. Bob Core data and the pending proposal remain unchanged.
