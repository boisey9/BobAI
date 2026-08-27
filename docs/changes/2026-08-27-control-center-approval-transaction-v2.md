# Control Center approval transaction v2

Date: 2026-08-27

## Objective

Replace the brittle production decision-resolution SQL path with an explicit, idempotent Neon transaction while preserving Bob Core as the owner approval boundary.

## Production evidence

The browser POST now passes the Control Center origin guard and reaches Bob Core, but the owner receives `decision_review_unavailable` with a Bob Core request ID. The pending Codex proposal remains open and unchanged.

The same proposal was previously exercised through the intended PostgreSQL operations inside a rollback-only database test, proving that the stored proposal, decision schema, task schema, and event schema are valid. The remaining risk is the production serverless resolver implementation rather than the proposal data.

## Change

A dedicated replacement handler is mounted before the legacy Control Center approval route at the same URL:

```text
POST /v1/control-center/approvals/:taskId
```

The replacement handler:

- keeps `decision:review` authorization and project binding unchanged;
- validates the same owner action body and optional note;
- uses `sql.transaction([...])` from `@neondatabase/serverless`;
- locks the pending review task with `FOR UPDATE` before resolution;
- creates the active decision only when an equivalent active decision does not already exist;
- reuses an existing active decision with the same decision title when appropriate;
- marks the review task complete only after an active decision exists;
- records exactly one approval/rejection event for the review task;
- returns `409` if the proposal has already been resolved;
- logs only the request ID and safe PostgreSQL error code on unexpected database failure.

## Security

No browser credential handling changes are included. The signed owner session, same-origin guard, project-bound Control Center credential, Bob Core scope enforcement, and owner-only decision activation boundary remain unchanged.

No raw token, database URL, SQL text, private reasoning, or proposal-sensitive payload is written to runtime diagnostics.

## Rollback

Remove `mountBobControlCenterApprovalTransaction` from `Core/src/runtime.ts`. The pre-existing legacy approval handler remains registered behind it and therefore provides an immediate code rollback path.

## Acceptance

1. Core typecheck and Vitest suite pass.
2. Bob Core and Control Center Vercel previews are green.
3. Merge only after green validation.
4. Owner approves the existing pending Codex proposal in production.
5. Verify one active decision, completed review task, and one `decision.approved` event.
