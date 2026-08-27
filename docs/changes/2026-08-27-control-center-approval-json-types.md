# Control Center approval JSON parameter typing fix

Date: 2026-08-27

## Objective

Fix the remaining production `decision_review_unavailable` failure after PR #31 moved Control Center decision resolution to an explicit Neon transaction.

## Evidence

The owner successfully passed the browser/Web origin guard, and Bob Core returned a request-scoped decision-resolution error while the Codex proposal remained open. The proposal data was revalidated and is structurally correct.

The earlier rollback-only SQL exercise used literal SQL values. Production Bob Core uses parameterized Neon queries. PostgreSQL's variadic `jsonb_build_object` cannot always infer the type of an uncast prepared-statement parameter. PR #28 fixed the nullable owner note, but PR #31 still passed the dynamic calling interface ID into JSON builders without an explicit type.

## Change

- Explicitly cast every dynamic Control Center approval/rejection JSON parameter to text before it enters `jsonb_build_object`.
- Keep the optional owner note nullable.
- Keep the transactional resolver, task row lock, decision reuse, event deduplication, and safe database error-code handling from PR #31.
- Add a regression test confirming the replacement approval handler mounted first at the same Hono route takes precedence over the legacy handler.

## Security

No authentication or authorization boundary changes. The signed owner session, Fetch Metadata / same-origin validation, project-bound Control Center credential, `decision:review` scope, and owner-only decision activation boundary remain unchanged.

No SQL text, credentials, raw prompts, or private reasoning are exposed in runtime errors.

## Acceptance

1. Core TypeScript typecheck passes.
2. Complete Core Vitest suite passes.
3. Bob Core and Control Center Vercel previews are green.
4. Production owner approves the existing Codex proposal.
5. Verify exactly one active decision, a completed review task, and one `decision.approved` event.
