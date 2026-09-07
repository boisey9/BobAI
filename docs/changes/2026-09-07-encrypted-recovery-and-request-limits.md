# Encrypted recovery and credential request limits

Branch: `codex/recovery-access`, from main `1e51a5a`. Status: [PR #42](https://github.com/boisey9/BobAI/pull/42) merged September 7 as `7fd2135`. Migrations 005/006 and Core/Web are deployed; production request limits are active. Nightly backup activation remains separate.

## Problem and resulting behavior

The released continuity service could preserve a retried write but had no repeatable encrypted database recovery procedure, nightly backup job, or shared limit on credential traffic. This change adds these operations while retaining the existing authentication migration gates.

`backup-database.mjs` holds a repeatable-read exported PostgreSQL snapshot, captures table counts and streams a custom-format dump directly into age encryption. A separately encrypted manifest binds the table inventory, archive hash, snapshot time and public-key fingerprint. Only operational identifiers and ciphertext hashes appear in its receipt. Uploads use private S3-compatible storage, bounded requests and ciphertext download verification. Successful verification is recorded separately from retention housekeeping. The job deletes only recognized artifacts for its instance older than thirty full days, after verifying the new backup.

`restore-database.mjs` requires an explicit empty destination and private operator credential/key files outside the repository. It verifies hashes, authenticates/decrypts, restores in one PostgreSQL transaction, compares snapshot table counts and validates foreign keys. Copied interface grants, owner sessions and authentication challenges are revoked before the tool reports success. Runtime access uses replacement credentials. Nonempty destinations are never dropped or overwritten.

Migration 005 records backup attempts, verification and retention outcomes. Readiness reports missing, failed, stuck and older-than-24-hour snapshots honestly. Migration 006 adds one atomic minute bucket per owner, credential hash and operation class. The gateway applies separate AI and ordinary-operation limits after authentication/authorization and before execution, including primary credentials. HTTP 429 includes Retry-After; a failed capacity check returns 503 without submitting the operation. Neither ledger stores request content or bearer tokens.

The nightly GitHub workflow uses the PostgreSQL 18 container, Node 22, pinned actions and age. It runs from main only, uses the `bob-personal-backups` environment, and remains disabled until `BOB_BACKUP_SCHEDULE_ENABLED=true`. The runner receives the public encryption recipient only. Daily Bob briefs/reminders remain a separate QStash implementation.

## Validation

- Core TypeScript, 127 tests across 27 files and all three import dry-runs passed.
- `check-backup-postgres.mjs` creates two empty databases on the isolated recovery branch and removes only those databases afterward. It applies migrations, exports while a concurrent write commits, restores all 16 table counts, checks authenticated corruption rejection, refuses a nonempty target without mutation, revokes copied sessions/grants, and exercises task receipt replay plus a versioned completion.
- The same drill uses two independent limiters for twelve concurrent calls and admits exactly four; credential/class isolation and next-window reset pass. Restore took six seconds; the final synthetic fixture/restore/runtime check took eighteen seconds. A dedicated backup role exported successfully and wrote backup status while an attempted task update failed with PostgreSQL permission denial.
- An earlier production pre-release encrypted artifact was independently uploaded privately, downloaded and restored with six original table counts and foreign keys matching. A new reusable backup runner has not yet executed with an application-owned S3 credential.

## Protected staging

Commit `a0a2b41` is deployed as Core preview `dpl_DwZtB5Z87xCpPSM2j1u7Du8WNeTF` against isolated branch `br-green-resonance-ayvz8l7o`; migrations 005/006 are applied there. Branch-specific credentials are independent of production. Core/Web CI passed. Deployed acceptance passed process/database health, a missing-backup degraded state, context revisions, concurrent request enforcement with Retry-After, independent credential/AI capacity, project denial of Personal, and task capture/replay/versioned completion. No provider call was needed for the capacity test.

## Activation and remaining gates

See the [recovery runbook](../recovery.md). Apply 005/006 in isolated staging before enabling the corresponding flags. Provision a dedicated database backup role and storage credential, configure a main-only GitHub environment, execute a manual workflow and restore its downloaded artifact before enabling nightly scheduling/monitoring. Provider usage accounting and spending alerts remain separate work.

The application-owned storage credential is not configured. Operator MCP presigned access is separate from a credential available to the deployed backup job.

Real owner passkeys, complete owner-login/approval recovery, scheduled retention, notification of failed/stale backups, and full RPO/RTO evidence remain open. Do not call this a completed Stage 2 or daily pilot. Additive schema can remain during an application rollback; leave flags disabled until accepted.

## Review and owner-recovery follow-up

Both automated P2 findings were addressed. Restoration now normalizes the selected artifact's snapshot-era running ledger entry after successful decryption/count verification; destination retention stays explicitly unverified until a new backup job checks it. The destructive drill binds its branch guard to the exact isolated endpoint verified through Neon's compute API and rejects connection override parameters.

Owner setup/recovery artifacts now reject repository paths through dot-prefixed children and symlinked parents, use exclusive private files and synchronize contents before database mutation. An uncertain commit retains its only private credential copy for operator reconciliation. Added filesystem tests cover these boundaries. The real PostgreSQL drill also restores a synthetic owner, runs offline credential recovery, signs in with the private generated password, and proves another recovery invalidates that session. The final extended drill passed with 16 tables restored in seven seconds and all fixture/recovery/runtime checks completed in thirty seconds.

## Production release and configuration

Final `be18b07` Core/Web CI passed. Both review threads were resolved after the extended PostgreSQL drill. PR #42 merged at 14:32:14 UTC. Production Core `bob-core-oqnigv6s9-erikboisvert9-5389s-projects.vercel.app` and Web `bob-control-center-erikboisvert9-hsz9gclfh.vercel.app` are READY on merge `7fd2135`; public health checks passed. Codex retrieved six approved baseline memories with a context revision, and the production PostgreSQL ledger confirms credential request accounting is active.

The dedicated `bob_backup_personal` database role is provisioned. GitHub environment `bob-personal-backups` permits main only. The owner explicitly approved uploading its database credential; that secret and public encryption/owner/storage-endpoint configuration are now stored there. Scheduling remains disabled. The owner completed Neon sign-in personally; creation and storage of the final storage-only credential is pending action-time approval.
