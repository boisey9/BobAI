# Bob database recovery runbook

This runbook covers a complete encrypted disaster backup. A company project export is a separate, credential-excluding format. The operational target is a snapshot no older than 24 hours and a usable recovered service within two hours. A successful synthetic restore alone does not prove either service target.

## State and custody

The private bucket is `bob-encrypted-backups` on personal Neon branch `br-rapid-hall-aykwycjn`. The initial pre-release artifact is `personal/2026-09-07/pre-continuity.dump.age`; it predates the versioned manifest format and has separate local drill evidence. The application runner produces a `.dump.age`, `.manifest.age` and `.receipt.json` set for each UUID. Never mix sets.

The owner's recovery directory is `~/.local/share/bob/recovery`, mode 0700. The age identity is a mode-0600 file outside Git, Vercel and GitHub. Its public recipient may be copied to the runner. Make a separate owner-controlled offline copy of the identity and verify that copy can decrypt before considering custody accepted. Do not place the private identity in environment variables, CI secrets, object storage or chat.

Keep access to the source-control, hosting and Neon accounts independent of Bob sign-in. Restoring the database does not restore Vercel secrets, DNS, GitHub permissions, APNs keys or future OAuth registrations; those require the owner's secure inventory and replacement credentials.

## Configure and verify the nightly job

Production Core uses a dedicated runtime role; the database owner credential stays with the operator. Neon child branches inherit role passwords. Immediately rotate the owner password on each newly created staging/recovery branch and refresh its private operator file before running fixtures. Never assume a different hostname means a different password. PostgreSQL pool diagnostics must use the safe event/code adapter and never serialize driver error objects.

1. Review/apply migration 005 in staging, then production after release review. Migration 006 is the separate Core rate-limit ledger.
2. From `Core/`, provision a dedicated database credential. Supply a direct connection in a private file outside the repository; the command refuses existing role names and existing output files:

   ```sh
   node scripts/provision-backup-role.mjs \
     --admin-url-file=/private/operator/source-database-url \
     --role=bob_backup_personal \
     --output=/private/operator/backup-database-url
   ```

   The new role reads public tables/sequences and writes only the backup ledger. It cannot change tasks, create roles/databases or bypass row security. Future migrations must run as the same schema owner for default grants to apply; recheck backup permission after schema-owner changes. If COMMIT acknowledgement is lost, retain the private output, inspect the named role and reconcile before retrying; the tool preserves that credential copy.
3. In Neon Branch → Credentials, create a dedicated application storage credential with `storage:write` (includes read). Record its access-key ID and S3 secret only in the protected GitHub environment. The connected operator's MCP tools are not an application credential. Neon beta credential expiry is not enforced; revocation must be explicit. [Neon storage authentication](https://neon.com/docs/storage/authentication).
4. Create GitHub environment `bob-personal-backups` and restrict deployment branches to main. Store `BOB_BACKUP_DATABASE_URL`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as environment secrets. Set environment variables `BOB_BACKUP_OWNER_ID`, `BOB_BACKUP_RECIPIENT` (public), and `AWS_ENDPOINT_URL_S3`. Use the private bucket's HTTPS endpoint and path-style S3.
5. Set repository variable `BOB_BACKUP_SCHEDULE_ENABLED=true` only after the environment is ready. Manually dispatch **Bob encrypted backup** on main, confirm `backup.verified`, and check both `verified_at` and `retention_checked_at` for its UUID. The runner never receives the private age identity.
6. Download that complete artifact set and pass the restoration procedure below. Enable Core `BOB_CORE_BACKUP_MONITORING_ENABLED=true` only once configuration and a verified job exist. Confirm that a simulated failed/stale record appears degraded in staging. Scheduler failures must also be visible in GitHub Actions; Bob's proactive failure notifications remain a later delivery gate.
7. Observe the first scheduled run. The schedule is 07:17 UTC (02:17/03:17 Toronto), once nightly across DST. GitHub schedule timing is best effort; read snapshot freshness rather than assuming a scheduled run occurred.

Retention is enforced by the job after a verified new upload. It lists only its instance prefix and deletes recognized artifact names older than thirty full days, preserving the current set and unknown objects. Neon currently stores lifecycle configuration without enforcing expiration; do not rely on an S3 lifecycle rule for cleanup. [Neon S3 compatibility](https://neon.com/docs/storage/s3-compatibility). This is application-visible retention, not an immutable-storage guarantee.

The job retries storage requests at most three times with a 60-second request deadline. PostgreSQL export is bounded to five minutes and 100 MiB; a larger database requires a reviewed capacity change. A failed export/upload/read-back does not replace the last verified backup. A retention failure remains visible independently of a verified new archive.

## Restore into an isolated destination

1. Record the incident start, selected backup UUID/snapshot time, source and destination instance IDs, and the last known successful operation time. Do not record content or credentials. Download all three files from private storage into a protected operator directory.
2. Create an isolated PostgreSQL 18 branch and an **empty** database using `TEMPLATE template0`. Do not attach a public Bob deployment yet. Save its direct URL in a new mode-0600 file outside the repository. Keep the source database and deployment available for rollback.
3. Install PostgreSQL 18 client tools and age from official packages. From `Core/` run:

   ```sh
   node scripts/restore-database.mjs \
     --archive=/private/operator/backup.dump.age \
     --manifest=/private/operator/backup.manifest.age \
     --receipt=/private/operator/receipt.json \
     --identity=/private/offline/personal.agekey \
     --destination-url-file=/private/operator/restore-database-url \
     --confirm-empty-destination
   ```

   Optional binary paths are `BOB_PG_RESTORE_BIN` and `BOB_AGE_BIN`. The URL and password are not passed on the command line. Decryption uses a private temporary directory, removed on normal completion/failure. After a machine crash, remove only the identified abandoned restore directory after assessing the incident.
4. Require `restore.verified`, exact table-count agreement and valid foreign keys. Authentication of age ciphertext protects the archive and manifest; the public receipt alone is not proof of integrity. The tool refuses any existing user table/view/sequence. It never drops an existing destination.
5. Provision fresh deployment secrets and scoped interface credentials. Copied project grants, owner sessions and authentication challenges are revoked by the tool. The selected backup's archived running ledger row is normalized after authenticated restoration; destination retention remains unverified until a fresh job runs. Future OAuth/device registrations must have explicit restore revocation added when their schemas ship. Never expose the restored instance with copied primary or provider secrets.
6. Apply reviewed migrations newer than the artifact, then deploy the corresponding reviewed Core/Web release to protected recovery origins. Auth origins must be deliberate: passkeys are origin-bound, so use the canonical owner origin only during controlled cutover or bootstrap a recovery ceremony on the isolated origin.
7. Exercise context/baseline isolation, create/retry/update a synthetic task, owner sign-in and session revocation, a synthetic owner approval and provider-failure capture behavior. Use operator owner recovery if passkeys are lost; see [deployment](deployment.md). Clear test fixtures through their scoped lifecycle rather than deleting unrelated records.
8. Compare the accepted snapshot time to the last successful source operation to calculate data loss. Measure until all required runtime workflows and owner access pass to calculate restoration time. If either target is missed, keep the gate open and document the cause.
9. Perform a controlled origin/client cutover. Keep the old deployment and database for rollback until reconciliation is accepted. Reconfigure the nightly backup role/storage destination, execute and restore a fresh backup from the recovered service, then revoke obsolete credentials.

## Repeatable acceptance

`check-backup-postgres.mjs` is confined to the named isolated recovery branch and its independently verified exact endpoint; connection-override query parameters are rejected. Install locked dependencies in both Core and Web before this fixture. Supply `BOB_TEST_BRANCH_ID`, `BOB_TEST_ADMIN_URL_FILE`, `BOB_TEST_RECOVERY_IDENTITY_FILE`, `BOB_TEST_RECIPIENT_FILE` and optional PostgreSQL/age binary paths, then run `node --import tsx scripts/check-backup-postgres.mjs`. It creates and removes only its own empty fixture databases and temporary backup role. Never point it at production.

The drill checks concurrent snapshot consistency, encrypted manifest/table counts, corruption rejection before mutation, preserved nonempty destinations, copied-session/grant revocation, restored task receipt replay/versioned update cross-instance credential limits, and offline restored-owner login/revocation. It is repeatable code evidence; a downloaded scheduled artifact and complete service/owner recovery remain required for the operational exit gate.
