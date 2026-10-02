# Portable PostgreSQL and synthetic testing preparation

Separate selected-tree successor to accepted51 actual-auth checkpoint; accepted sources/six receipts untouched. No .git copied into this preparation directory; no branch/commit/staging/publication inferred. Original incoming BobAI untouched.

## Local change

The test-only PostgreSQL helper accepts an explicit absolute BOB_LOCAL_WORKFLOW_PG_BIN directory, retaining the prior macOS default for compatibility. No hosted URI fallback. New CLI runner requires an explicitly installed PostgreSQL17/18 binary directory, checks installed utilities, creates a fresh private synthetic cluster/socket, disables TCP, enables fsync and rejects inherited PG/app credentials. It executes the real43-case PostgreSQL suite with zero skips required, records outcomes, stops its owned cluster and preserves fixture/receipt files rather than deleting them. No dependencies installed. Current libraries and application/policy/runtime sources unchanged.

Preparation manifest lists hashed migrations and auth/workflow targets, required relations, role/trust boundaries, backup/recovery and non-destructive rollback requirements. Every live target/policy value is null; activation, setup, publication, scheduling and cleanup remain false. This is a plan, not a deployment tool or authorization token.

## Actual evidence

PostgreSQL17.11/macOS:43/43 pass, no skips; real transaction/crash/restart/dump/restore tests ran in the newly owned socket-only cluster. Core typecheck and runner syntax pass. Three actual subprocess negative checks reject relative paths, hosted execution and extra connection arguments before creating clusters. Cluster stopped and synthetic artifacts retained. PostgreSQL18/Linux CI and portable browser orchestration are not yet tested. Prior197 Core/25 actual-auth browser receipts are preserved evidence for accepted51, not new reruns on this preparation tree.

## Newly identified backup prerequisite

Existing backup inventory enumerates non-system schemas and pg_dump covers them, but backup-role provisioner grants only public schema/table/sequence access. New bob_workflow tables FORCE RLS with owner/project settings; plain SELECT grants alone do not establish complete snapshot authority. Need a reviewed scoped recovery snapshot strategy and role permissions, not broad superuser/BYPASSRLS silently added. PostgreSQL pg_dump defaults row_security=off and fails if its role cannot bypass RLS: https://www.postgresql.org/docs/17/app-pgdump.html ; https://www.postgresql.org/docs/17/ddl-rowsecurity.html . No live backup role altered and no new backup authority assumed.

Restore currently revokes existing sessions/OAuth grants/tokens. New workflow grants/proof store require explicit recovered-authority acceptance and policy/pending-record reconciliation before exposing a recovered instance. Local43 dump/restore proves tested records survive; it does not prove encrypted operational runner permissions, key custody or full service recovery.

Owner baseline/issuer/time-limit/retention/recovery/budget recommendations remain separate pending decisions. Native/calendar/email/drafts/events unchanged. Next local step: portable browser/CI harness and staged evidence-ingestion contracts with missing-policy denial; independent review this bounded test-runner delta before publication. No hosted guard changes or new owner authority.
