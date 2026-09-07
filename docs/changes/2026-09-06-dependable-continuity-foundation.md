# Dependable continuity foundation

Branch: `codex/daily-continuity`, based on main `51d836c82f0a00b31ee74ba6b4753cc3bfad9c74`. Status: implementation under review; no production migration, deployment, owner credential rotation, or full-plan completion is claimed.

Review: [PR #41](https://github.com/boisey9/BobAI/pull/41). The real PostgreSQL acceptance now also kills a synthetic child with SIGKILL after commit and proves that a replacement client's retry returns the committed response without another task/audit/receipt.

## Problem and behavior

Task-specific search previously displaced baseline project memory, owner-wide retrieval filtering occurred too late, separate mutation/audit writes could duplicate work after failures, title-based tasks lacked stable reconciliation versions, and chat did not consistently consume the shared project context.

The change moves privacy/workspace/approval filtering into memory SQL, always reserves a bounded baseline, introduces Personal without software-import metadata, and makes REST/MCP/Web/iPhone chat use the shared context assembly. Clients verify the new capability before sending workspace content. Source timestamps/partial indicators and separate handoffs make context completeness visible.

Simulator review also found an old “BobAI is online” greeting in unconfigured demo mode. The greeting now describes demo mode or a selected workspace awaiting verification, without claiming a successful Core connection.

Operation receipts now commit with their task/proposal/handoff and audit in one PostgreSQL transaction. Identical requests replay the saved result; changed reuse fails. Task IDs and versions support compare-and-set updates and return current state on conflicts. Existing MCP title compatibility remains, with ambiguous matches rejected and no silent duplicate deletion.

The next-stage owner-auth foundation adds Better Auth 1.7.3 passkeys, one-owner enforcement, database-backed revocable sessions, an offline bootstrap/recovery command and browser controls behind an explicit feature flag. The owner email is supplied through deployment configuration. Existing server-only Core credentials and approval CSRF protections remain. Provider deadlines/retries and dependency checks replace the unconditional readiness response; provider observations are explicitly process-local and stale after five minutes. Scheduling remains reported as unconfigured.

## Validation and limits

See [release gates](../release-gates.md) for detailed PostgreSQL/browser evidence and outstanding physical-device, OAuth, backup, deployment and pilot gates. Local checks include Core typecheck/tests/import dry-runs, Web typecheck/build, actual isolated PostgreSQL concurrency/replay/rollback/privacy, Better Auth session/enrollment/revocation, and browser virtual-passkey/workspace checks. Full Xcode is unavailable on the local machine; macOS CI and a physical device remain required.

The isolated acceptance branch is `br-crimson-truth-ayza0tdz` in the existing personal Neon project. Fixtures use synthetic owners. The connection is kept in a private temporary file, never committed or printed. Production task reconciliation uses scoped Bob Core operations; production schema/data and credential changes are not part of those test migrations.

## Reconciliation and remaining work

Codex's existing dedicated connection was accepted from live read/write evidence. The shared-context acceptance task remains in progress. FOMOflow's bootstrap merge/dry-run checklist was corrected from verified repository evidence, with live import/provision/isolation left pending. The older credential decision remains a pending owner-reviewed proposal. Stages 2–5 are separate persistent Bob Core tasks.

The broader daily product is not yet shipped. OAuth/PKCE, device pairing, backup/restore, Core usage/limits, Today/task UI/offline outbox/EventKit/memory review, QStash/APNs/integrations/playbook, two-week pilot, and company migration still require implementation and their respective release gates.

## Deployment and rollback

Apply reviewed migrations before new Core reads task versions/receipts. Keep Better Auth disabled until its schema, canonical origin, bootstrap and recovery are accepted. This feature branch disables automatic Vercel Git deployment until isolated staging configuration is verified; other branches retain current behavior. See [deployment and recovery](../deployment.md). Additive tables/columns should remain during application rollback. Compatibility credentials must not be retired until replacement acceptance is complete.
