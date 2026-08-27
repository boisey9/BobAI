# Control Center decision save fix

Date: 2026-08-26

## Objective

Restore owner approval/rejection of Bob Core decision proposals from Bob Control Center when the optional owner note is left blank.

## Reported behavior

A valid pending decision proposal could be displayed in the Owner Approval Inbox, but submitting the decision without an owner note could fail to save.

## Root cause

The Control Center approval SQL passes the optional `note` value into PostgreSQL `jsonb_build_object`. When the note is absent, the Neon prepared statement sends a null parameter with no concrete PostgreSQL type. PostgreSQL cannot infer the type for a variadic `jsonb_build_object` argument and rejects the statement with `could not determine data type of parameter $1`.

The production database contract was reproduced safely with a prepared statement probe; no Bob Core project state was changed during the probe.

## Fix

Explicitly cast every nullable owner-note interpolation to `text` in both approval and rejection SQL paths:

- decision metadata `note`;
- review-task metadata `resolutionNote` on approval;
- review-task metadata `resolutionNote` on rejection.

This preserves the optional-note UX. Owners are not forced to enter synthetic text just to approve or reject a proposal.

## Security and authority

No authorization boundary changes. Decision proposals still require the `decision:review` scope, remain project-bound, and become active only after an authenticated owner approval. External interfaces still cannot activate decisions directly.

## Validation

- Reproduced the untyped-null PostgreSQL failure with a safe prepared-statement probe.
- Verified the explicit `NULL::text` form is accepted by PostgreSQL.
- Bob Core TypeScript and Vitest workflow required before merge.
- Vercel Bob Core preview required before merge.
- Production owner acceptance: approve or reject a pending proposal with the owner-note field blank.

## Rollback

Revert the single Bob Core commit. No schema or data migration is involved.
