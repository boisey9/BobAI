# Current encrypted backup and isolated Docker restore

Date: 2026-10-28 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **a current local encrypted backup, complete database restoration, copied-access quarantine, owner recovery and selected Core continuity checks passed. Recurring protection and full hosted-service recovery remain open.** Local branch: `codex/bobcore-hosted-readiness`; application source: `7817de4712c5c1b44e772aaeb2893f6a8beb679a`.

This succeeds the [hosted readiness assessment](2026-10-28-hosted-bobcore-readiness.md). Its earlier statement that no backup/restore had been executed applies to that assessment, before the owner approved this next task.

## Authorized scope and preserved boundaries

The owner directed the next recovery task to proceed and suggested that the current backup might be in Docker. Acer and Jarvis remain deferred. Existing Vercel Core/Web, Neon state, cloud-provider selection and source branches were preserved.

This task read Production through existing authenticated access, exported an encrypted snapshot, and restored it into a disposable local database. Source sessions and the independent export connection were constrained to read-only operation. No Production schema, row, role, permission, credential, deployment or configuration was changed. There was no upload, scheduler activation, push, PR, merge or BobCore synchronization write. The Production backup ledger was not updated.

Restored schema/data, copied-access revocation, temporary owner recovery passwords and synthetic task operations affected only the isolated Docker copy. These are explicitly separate from Production credentials and state. No existing container, volume, image or backup was overwritten. No software or container image was downloaded or installed.

## Fresh authority and discovery

BobCore returned authority `bob-core` version `0.2`, project key `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, and requesting surface `codex`. Revision: `968249dd1bd9d79da3f663b7446864162f727248c3f6a0719a962dd455a9c0b7`; generated `2026-10-28T15:45:48.030Z`. All five sources were available; `partial=true`, with events and memories truncated. The latest task update remains September 9 and the latest handoff October 23. There is no explicit environment/credential-binding field. The retired staging connector was not used.

The related critical task remains `b22684f4-6041-46a0-9c9d-cda955a8d21a`, **Complete owner access, recovery and operational reliability**, observed version `7`, `in_progress`. Its older manual-backup evidence is consistent with the private files found below; it does not establish recurring protection.

| Inspected item | Verified finding |
| --- | --- |
| Local Docker | Docker Desktop was installed but its engine was stopped. After starting it, inventory showed one unrelated, unstarted RFQ container and one RFQ volume; no BobCore container or backup volume was present in this engine. Neither RFQ item was changed. |
| Earlier Docker notes | The October 20 packet describes an optional local fallback and unverified engine/runtime readiness. It does not establish a current database backup. |
| Existing private backups | `~/.local/share/bob/recovery/` contains a September 7 encrypted archive and a September 9 versioned bundle, ID `547a8509-d000-4ee1-9169-474b880ab76a`. The September 9 archive and encrypted manifest match their saved ciphertext hashes. Its dated evidence reports a ten-table restore; it predates current authentication state. |
| Existing tools | Host `pg_dump` and `pg_restore` are PostgreSQL `18.6`; `age` is installed. Cached Docker image `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66` is PostgreSQL `18.6`. |
| Source identity | Neon project `noisy-boat-43840462`, Production branch `br-rapid-hall-aykwycjn`, database `neondb`, endpoint `ep-spring-haze-ay3tn3yp.c-5.us-east-2.aws.neon.tech`; endpoint-to-branch mapping was refreshed through the existing connector. |
| Current source coverage | Exactly **24 ordinary public tables**, no user partitions/views/materialized views/foreign tables/sequences, no large objects, and only the `plpgsql` extension. No table has active or forced row-level security. These are observations of this snapshot, not assumptions for future backups. |
| Existing restricted backup role | `bob_backup_personal` can read ten tables and is denied all **14 authentication/OAuth tables**. Its stored connection still authenticates. A complete current backup cannot use that role unchanged. |

The 14 denials are deliberate: the saved October 23 `correction/restore-auth-isolation.sql` explicitly removes that role's access to the authentication tables while preserving restricted Web/Core access. Do not treat this as accidental privilege drift or repair it by granting broad access. A recurring backup needs an owner-reviewed authority design covering the sensitive tables without undoing authentication isolation.

## Backup artifact and source protections

The one-time export used the existing private operator credential, verified against the exact source host, database and owner role. No credential was printed, generated, rotated or copied into the repository. The private recovery identity and operator connection file were checked as mode `0600`; the existing public recipient was checked against the identity through `age-keygen -y` without disclosing the private key.

The operator reused [createEncryptedBundle and inventory helpers](../../Core/scripts/lib/backup.mjs). It required a `REPEATABLE READ READ ONLY` source transaction and enforced read-only defaults on the independent `pg_dump` connection. Identity, current catalog shape, complete read coverage, absence of filtered rows, and the BobAI UUID/repository were verified before export. Counts, the dump and supplementary content fingerprints use the same transaction snapshot. Future catalog changes cause this bounded operator to refuse execution; they are not silently omitted.

| Artifact field | Value |
| --- | --- |
| Backup ID | `0d4fe156-a6ee-4d3e-8e5b-0e015332fa93` |
| Recorded snapshot/export start | `2026-10-28T15:57:06.136Z` — 11:57:06 Toronto |
| Capture completed | `2026-10-28T15:57:12.476Z` |
| Protected directory | `~/.local/share/bob/recovery/hosted-20261028-0d4fe156-a6ee-4d3e-8e5b-0e015332fa93/`, mode `0700` |
| Standard bundle | `backup.dump.age`, `backup.manifest.age`, `receipt.json` |
| Supplementary verification | `verification.manifest.age` contains table-content SHA-256 fingerprints and constraint definitions; operational receipts contain no row content |
| Encrypted archive size | **295,763 bytes** |
| Archive SHA-256 | `c2961f50e7acb7bf70aa77c83e2e91dcf878aa4f9d248de5fc28385cfea38df8` |
| Encrypted manifest SHA-256 | `c8584da4b88af865b87f185ab2d2c61f3b384b899913928eb2bfe10133698b71` |
| Supplementary ciphertext SHA-256 | `76f42b3ed9becfa360964ced8c205dd0afe6a04e7fd45d461d14c793b25afff0` |
| Remote upload / Production ledger | Neither performed; this is a manual local artifact, not a scheduled verified run |

An initial operator preflight rejected the source URL's explicit `5432` port before connecting or creating an artifact. The guard was corrected to accept only omitted/default port `5432` for the already-verified endpoint. The successful export then completed once. The existing backup job was not run because it also writes the Production ledger, uploads and applies retention, and its restricted credential lacks current coverage.

## Isolated restoration and functional evidence

The temporary container was `bobcore-restore-20261028-0d4fe156`, ID `d27d8a101e7b159e51154d121a3b08f804b06f17caa40997c1eb69e02c01bfce`. Its immutable image ID, task labels, database `bob_restore`, local role `bob_restore_operator`, and version were checked before mutation. It used Docker network `none`, no published ports or persistent mounts, a read-only root filesystem, and temporary memory-backed PostgreSQL data/socket directories. PostgreSQL listened only on the container's loopback interface. No Core/Web server, provider client or public listener was started.

The encrypted archive and manifests authenticated before restoration. A private temporary plaintext archive was used for PostgreSQL input and removed afterward. The unchanged archived-Neon drill guard was not bypassed or retargeted. This local operator orchestrates the existing archive format and PostgreSQL tools; it is not a new deployed recovery service.

| Acceptance | Observed result |
| --- | --- |
| Empty-destination check | Passed before schema/data restoration; nothing existing was dropped |
| Ciphertext corruption | A modified disposable copy failed authenticated decryption; the empty destination remained unchanged |
| Complete data restoration | **24/24 table counts and SHA-256 content fingerprints matched** the same source snapshot |
| Schema relationships | **236 constraint definitions matched; all 25 foreign keys were valid** |
| Nonempty destination | A second restore was refused; all original restored fingerprints remained unchanged |
| Copied authority quarantine | Project interface hashes removed, OAuth project grants revoked, OAuth clients and resources disabled, copied access/refresh tokens, consents, owner sessions and verification challenges cleared |
| Preserved business state | All nine business/ledger tables outside the deliberately changed project/authentication records retained their original fingerprints after quarantine |
| Offline owner recovery | The existing [owner recovery CLI](../../Web/scripts/owner-access.ts) completed against the restored owner account; its temporary recovery password authenticated through the actual Web auth handler and returned a valid owner session |
| Recovery revocation | A second isolated recovery invalidated that session and the first temporary password; no Production password was read or changed |
| Shared Context | Actual Core service/store code returned the correct BobAI UUID, available context sources and **six approved baseline memories** with project-memory isolation |
| Concurrent task retries | Three identical creates committed one task/outcome; subsequent identical readback reused it; conflicting payload reuse was rejected |
| Version/project guards | Versioned update and identical retry passed; stale-version and wrong-project-UUID requests were rejected |
| Final isolation | Restored sessions were cleared again and copied grants/clients remained disabled; all synthetic tasks remained only in the disposable copy |

The in-process runtime test used an adapter bound to that exact container and dummy database hostname. It carried PostgreSQL bytes through owned `docker exec` pipes; external fetches were rejected. Initial buffered-pipe and operator-child shutdown attempts stalled. Unbuffered transport and bounded cleanup of the completed operator child resolved the harness issues. Operator completion text alone was not accepted as proof: password login, session readback and subsequent revocation had to pass. The final full runtime attempt passed in **16 seconds** at `2026-10-28T16:19:50.045Z`.

Database initialization, corruption/restore/integrity/refusal and quarantine checks took **30.008 seconds**, including **0.773 seconds** for `pg_restore`. The snapshot was about **6 minutes 39 seconds** old when database integrity checks completed. Elapsed local work from destination creation through successful runtime acceptance, including harness diagnosis, was about **16 minutes 35 seconds**. These measurements do **not** establish a complete hosted-service RTO, a recurring 24-hour RPO, physical passkey recovery, provider/chat acceptance, DNS/configuration recovery or a production cutover.

## Evidence preservation and cleanup

The encrypted directory retains `local-backup-evidence.json`, `restore-evidence.json`, `runtime-evidence.json`, `cleanup-evidence.json`, and a private `operator-evidence/` directory containing the nonsecret operator source, receipts and SHA-256 manifest. Superseded harness-failure records are retained there. The earlier `restore-evidence.json` correctly records owner runtime acceptance as pending at its creation; the later successful `runtime-evidence.json` completes that local check.

At `2026-10-28T16:21:27.001350Z`, the exact labeled disposable container was removed after rechecking its isolation. The original unrelated container remained unstarted and unchanged. No persistent database volume was created. Temporary plaintext, corrupted-probe output and generated owner recovery password files were removed; the encrypted backup and existing recovery key remain in their protected locations. No immediate-erasure claim is made about host/VM memory, system snapshots or backups.

After confirming no containers were running, Docker Desktop was stopped successfully, restoring its initial stopped state.

Application source, configuration, migrations, credentials and deployment files are unchanged. Repository edits only update the recovery/readiness documentation and index. The earlier 792-test/Core/Web results remain dated evidence; this task adds real restored-database/owner/Core acceptance and does not relabel the 106 skipped suites as executed.

## Remaining gate and exact next implementation task

The one-time local backup/restore prerequisite now has current evidence. **The full hosted recovery gate remains open** because:

1. The unattended backup role still excludes 14 sensitive tables by approved isolation policy. A broader owner credential must not be substituted into CI merely to make the job pass.
2. No fresh off-device upload/download verification or owner-controlled independent recovery-key copy has been verified. The owner confirmed an offline copy existed for Bob Staging, but not for the current BobCore. The older copy has not been fingerprint-matched and must not be counted, discarded or replaced on assumption. The current archive and key are on this Mac; no key was generated or rotated during this task.
3. No recurring schedule, fresh Production ledger verification, retention run or failure alert was activated. The earlier October 28 inventory still shows skipped scheduled runs, an empty ledger and only an old cloud object; this local task does not change that evidence.
4. Full service recovery still requires an accepted hosting/configuration/credential inventory, canonical owner access and physical passkey handling, provider/task/chat workflows, independent client reauthorization and measured complete RPO/RTO. Targets remain 24 hours and two hours respectively.

**Exact next implementation task: reconcile complete backup coverage with the Production authentication-isolation policy**, on a proposed local branch `codex/reconcile-backup-coverage`.

Review the earlier October 19 recovery-coverage/quarantine candidate as reusable source, then add a default-off, fail-closed coverage preflight and an explicit least-privilege design for backing up the current authentication tables. Test missing-table access, schema changes, RLS/filtered rows, complete snapshot export and empty-target restoration in isolation. Preserve the current Production role boundaries until the owner approves the exact authorization design. Do not create credentials, grant permissions, enable schedules, upload, publish or deploy as part of that local implementation task.

After that design and isolated validation, obtain the narrowly scoped operational authorization for the chosen backup principal/storage path, verify an off-device artifact by downloading and restoring it, verify independent key custody, then observe a scheduled run, retention and failure reporting. Only the remaining accepted service-recovery checks can close the hosted gate. Acer and Jarvis are not dependencies.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-28. Intended surface: `codex`. Project: `bobai`, UUID `10000000-0000-4000-8000-000000000001`. Stable operation ID: `8c912d5b-c742-44f1-be56-e729852aa93e`. Related task: `b22684f4-6041-46a0-9c9d-cda955a8d21a`, observed version `7`; obtain its current version before any later update.

Outcome: owner-approved next recovery task produced encrypted manual backup `0d4fe156-a6ee-4d3e-8e5b-0e015332fa93` from read-only Production access. Isolated PostgreSQL 18.6 Docker restoration matched all 24 table fingerprints, 236 constraints and 25 foreign keys; corruption/nonempty refusal, copied-access quarantine, actual owner recovery/login/revocation and Core memory/task concurrency/version/project checks passed. The disposable container and plaintext/recovery-password files were removed. Production data/access/configuration and existing Docker resources were preserved. No remote upload, ledger/synchronization write, schedule, publication or release occurred.

Unresolved: recurring backup authority excludes 14 auth/OAuth tables; current off-device artifact and independent key custody remain unverified. The owner reports an older Bob Staging offline key copy but no established current BobCore copy. Recurring protection, complete hosted RPO/RTO, source review/release and client acceptance remain open. Next: reconcile backup coverage with approved authentication isolation in a local, default-off implementation slice and arrange owner-controlled off-device custody. Do not close the broader critical task or blindly upload older checkpoints. Reuse this operation ID only for identical checkpoint content and verify a scoped receipt/readback before claiming synchronization.
