# Encrypted recovery and credential request limits

Branch: `codex/recovery-access`, from main `1e51a5a`. Status: implementation and isolated PostgreSQL acceptance passed; staging, review and operational activation are pending.

## Problem and resulting behavior

The released continuity service could preserve a retried write but had no repeatable encrypted database recovery procedure, nightly backup job, or shared limit on credential traffic. This change adds these operations while retaining the existing authentication migration gates.

`backup-database.mjs` holds a repeatable-read exported PostgreSQL snapshot, captures table counts and streams a custom-format dump directly into age encryption. A separately encrypted manifest binds the table inventory, archive hash, snapshot time and public-key fingerprint. Only operational identifiers and ciphertext hashes appear in its receipt. Uploads use private S3-compatible storage, bounded requests and ciphertext download verification. Successful verification is recorded separately from retention housekeeping. The job deletes only recognized artifacts for its instance older than thirty full days, after verifying the new backup.

`restore-database.mjs` requires an explicit empty destination and private operator credential/key files outside the repository. It verifies hashes, authenticates/decrypts, restores in one PostgreSQL transaction, compares snapshot table counts and validates foreign keys. Copied interface grants, owner sessions and authentication challenges are revoked before the tool reports success. Runtime access uses replacement credentials. Nonempty destinations are never dropped or overwritten.

Migration 005 records backup attempts, verification and retention outcomes. Readiness reports missing, failed, stuck and older-than-24-hour snapshots honestly. Migration 006 adds one atomic minute bucket per owner, credential hash and operation class. The gateway applies separate AI and ordinary-operation limits after authentication/authorization and before execution, including primary credentials. HTTP 429 includes Retry-After; a failed capacity check returns 503 without submitting the operation. Neither ledger stores request content or bearer tokens.

The nightly GitHub workflow uses the PostgreSQL 18 container, Node 22, pinned actions and age. It runs from main only, uses the `bob-personal-backups` environment, and remains disabled until `BOB_BACKUP_SCHEDULE_ENABLED=true`. The runner receives the public encryption recipient only. Daily Bob briefs/reminders remain a separate QStash implementation.

## Validation

- Core TypeScript, 124 tests across 26 files and all three import dry-runs passed.
- `check-backup-postgres.mjs` creates two empty databases on the isolated recovery branch and removes only those databases afterward. It applies migrations, exports while a concurrent write commits, restores all 16 table counts, checks authenticated corruption rejection, refuses a nonempty target without mutation, revokes copied sessions/grants, and exercises task receipt replay plus a versioned completion.
- The same drill uses two independent limiters for twelve concurrent calls and admits exactly four; credential/class isolation and next-window reset pass. Restore took six seconds; the final synthetic fixture/restore/runtime check took eighteen seconds. A dedicated backup role exported successfully and wrote backup status while an attempted task update failed with PostgreSQL permission denial.
- An earlier production pre-release encrypted artifact was independently uploaded privately, downloaded and restored with six original table counts and foreign keys matching. A new reusable backup runner has not yet executed with an application-owned S3 credential.

## Activation and remaining gates

See the [recovery runbook](../recovery.md). Apply 005/006 in isolated staging before enabling the corresponding flags. Provision a dedicated database backup role and storage credential, configure a main-only GitHub environment, execute a manual workflow and restore its downloaded artifact before enabling nightly scheduling/monitoring. Provider usage accounting and spending alerts remain separate work.

The application-owned storage credential is not configured. Operator MCP presigned access is separate from a credential available to the deployed backup job.

Real owner passkeys, complete owner-login/approval recovery, scheduled retention, notification of failed/stale backups, and full RPO/RTO evidence remain open. Do not call this a completed Stage 2 or daily pilot. Additive schema can remain during an application rollback; leave flags disabled until accepted.
