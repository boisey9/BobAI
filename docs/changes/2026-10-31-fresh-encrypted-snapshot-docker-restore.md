# Fresh encrypted snapshot and isolated Docker restore

Date: 2026-10-31 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **dashboard re-review passed; fresh encrypted Production capture and isolated Docker integrity/Core continuity acceptance passed. Full recovery and Vercel release gates remain open.** Local branch: `codex/dashboard-readiness`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`. Changes remain uncommitted and unpublished.

## Scope and review

The owner authorized review of the dashboard fix, a fresh encrypted snapshot and an isolated Docker restore, with Production read-only and no uploads, deployments, migrations or credential changes. The operation used existing operator access and the existing local age identity; it did not provision credentials, change grants, run the scheduled exporter, write the Production backup ledger or synchronize BobCore state. Acer/Jarvis remain deferred.

An independent re-review of the [dashboard separation](2026-10-31-dashboard-readiness-separation.md) found no remaining findings. Its nine code/test paths retain distinct connectivity, process-local inference and operational summaries, accessible grouping and visible backup warnings. The prior 912-test Core check, Web types/build and synthetic desktop/mobile acceptance remain applicable; no dashboard code changed in this successor task, so those suites were not unnecessarily repeated.

The October28 manual operators were reviewed against the current bundle helper before reuse. Their source was copied into a new private temporary directory; the old artifacts were preserved. Review corrections added source owner/schema guards, expected table inventory, ACCESS SHARE locks, authenticated supplemental hash binding and bounded child cleanup. A second review identified a cleanup preservation edge case; it was corrected before the Docker drill. Cleanup now requires a recorded creation attempt for this run, excludes every initial container ID, and verifies exact container identity/image/labels/isolation before removal. Final targeted review found no remaining blocker.

Owner-password recovery was deliberately omitted under this request's no-credential-change restriction. Only the disposable destination received copied-access quarantine and synthetic task writes. No live credential or owner password changed, and no temporary owner-password file was created. The October28 owner-login/recovery result remains historical evidence, not a fresh acceptance claim.

## Verified source and capture

Fresh Neon metadata matched Production project `noisy-boat-43840462`, branch `br-rapid-hall-aykwycjn` (`main`), endpoint `ep-spring-haze-ay3tn3yp` and its exact direct hostname. The branch remains `protected=false`. The capture independently checked database `neondb`, existing operator role `neondb_owner`, BobAI UUID `10000000-0000-4000-8000-000000000001`, owner `rick` and repository `boisey9/BobAI`.

The operator opened `REPEATABLE READ READ ONLY`, verified effective read-only state, and accepted exactly the reviewed 24 ordinary public tables with complete visibility, no RLS, no unsupported relation kinds or large objects, and only `plpgsql`. ACCESS SHARE locks allow normal application writes while protecting the existing table definitions. Schema fingerprint `f0cbb98d72eeed06a0cf87da8c3f4472be6c6213d9007e84e17e4011d3667d45` matched the reviewed baseline and was checked again before closing the transaction. This digest represents the helper's schema shape, not a complete role/ACL audit.

Counts, exported `pg_dump` snapshot, per-table content fingerprints and constraint inventory came from the same held snapshot. The current helper forces its independent PostgreSQL export connection read-only, verifies TLS, excludes credentials from arguments, bounds lock wait to ten seconds and export/encryption to five minutes, and limits the encrypted archive to 100 MiB. The source transaction had separate statement/lock/idle bounds. This is an authorized manual operator capture; it does not validate the proposed restricted unattended capture role.

| Artifact evidence | Value |
| --- | --- |
| Backup UUID | `64abcffe-1590-4b6d-9611-caaf454926e2` |
| Snapshot start | `2026-10-31T17:40:28.057Z` / 13:40:28 Toronto (EDT) |
| Capture completed | `2026-10-31T17:40:34.214Z` |
| Encrypted archive size | 297,511 bytes |
| Archive SHA-256 | `8a9e994754ccfcfb08190b78fb0d7810f6198fb9fb38870b3c46fa6fcd101e8f` |
| Encrypted manifest SHA-256 | `82a558940723a64a72660e42a21b3d356cb00199c20bdad8829f293e09a6ea5c` |
| Encrypted supplemental manifest SHA-256 | `06490169f1c6c9ee42e37301b8bbf0cc51772b1895e7ad360ba1b48138ae2aab` |
| Production ledger rows in this snapshot | **0**; no row was written by this operation |

The protected artifact directory is `~/.local/share/bob/recovery/hosted-20261031-64abcffe-1590-4b6d-9611-caaf454926e2/`, mode `0700`, with private files mode `0600`. It contains `backup.dump.age`, `backup.manifest.age`, `receipt.json`, `verification.manifest.age`, capture/restore/runtime/drill/cleanup evidence and the reviewed nonsecret operator source under `operator-evidence/`. Files and hashes were read back after the run. This is a whole-database backup, including other project and authentication data; the BobAI identity guard does not make it a project-filtered export.

Supplemental manifest version 2 binds run UUID, source/project/owner/repository/endpoint, schema digest, snapshot time, source revision and encrypted archive/standard-manifest hashes. Its own ciphertext hash is recorded in the local receipt. The restore authenticates both manifests and checks their bindings before restoring. The local receipt is not an independent signature. This supplemental procedure is still an operator extension; the integrated three-object scheduled runner has not acquired this capability or been activated.

## Actual isolated acceptance

The existing Docker Desktop engine was started for this run. The previously cached PostgreSQL 18.6 image was pinned to `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66` with `--pull=never`; no tool or image was installed. The exact new container was `bobcore-restore-20261031-64abcffe`, ID `3d927b336d95267bd6ccbcbb2957bea059d893040f11ae932cf9dd956ef4a894`.

The destination used network `none`, no published ports, no persistent mounts, a read-only root filesystem, memory-backed database/socket/temp storage, no restart policy, and CPU/memory/PID limits. PostgreSQL listened only on container loopback. The operator checked the empty destination and actual database/role/server identity before mutation.

| Acceptance | Observed result |
| --- | --- |
| Authentic decryption and artifact binding | Passed with the existing local age identity; independent offline copy was not used |
| Corruption rejection | A modified disposable ciphertext copy failed authentication while the destination remained empty |
| Data restoration | All **24** table counts and full content fingerprints matched |
| Relationships/schema constraints | All **236** constraint definitions matched; **25** foreign keys validated |
| Nonempty destination | Second restore refused; content fingerprints remained unchanged |
| Copied-access quarantine | Restored interface hashes removed, project grants revoked, OAuth clients/resources disabled, sessions/tokens/consents/challenges cleared |
| Business preservation after quarantine | All nine unaffected business/ledger table fingerprints remained identical |
| Restored Core context | Correct project UUID; all context sources available; six approved memories returned within project/global scope |
| Atomic task behavior | Three simultaneous identical creates yielded one task and one new outcome; identical retry/readback reused it; conflicting payload was denied |
| Task version/project guards | Update and replay passed; stale version and wrong expected project UUID were denied |
| Owner-login/password recovery | **Not executed** in this run; no new owner-authentication acceptance |

Actual repository Core stores/services ran against the isolated PostgreSQL database using a transport bound to the inspected Docker container. The transport rejected external fetch and other database hosts. No provider inference or public application listener was used. Synthetic task writes were confined to the disposable database and were never sent to hosted BobCore.

Database restore command time was **0.655 seconds**; database integrity/refusal/quarantine checks including container initialization took **14.813 seconds**. The full automated restore/Core/cleanup segment ran from `17:40:52.836Z` to `17:41:14.917Z`, **22.080 seconds**. These are local drill timings, not complete hosted-service RTO. Snapshot freshness passed the 24-hour target at this execution; this does not establish continuous RPO compliance or measure production data loss during a recovery incident.

The owned container and plaintext/corruption files were removed. Initial unrelated container/volume inventories and their nonrunning state matched after cleanup. No password outputs existed. Docker was stopped again after confirming no containers were running. Encrypted artifacts and safe evidence remain outside Git; no physical-erasure claim is made about OS caches or Docker VM memory.

## Remaining release gates and next task

This run closes the stale-local-artifact and fresh local restore gaps for this snapshot. It leaves the [testing-first packet](2026-10-30-backup-activation-recovery-packet.md) and broader recovery gates open:

1. **Independent custody:** the owner confirms a current offline key copy exists, but that independent copy has not decrypted this bundle. The complete new artifact set has not been transferred to and restored from an owner-controlled off-device location. Upload/transfer was outside this authorization.
2. **Recurring protection:** the captured Production ledger is empty; no capture/ledger role, workflow adapter, storage transport, retention, schedule or monitoring configuration was activated. October30 observations of disabled/skipped schedules and six-hour Neon history remain dated observations, not newly queried settings. The intentionally restricted old backup role is unchanged.
3. **Hosted recovery and access:** fresh owner/passkey recovery, complete OAuth/client behavior, effective role acceptance, complete service recovery and measured hosted RPO/RTO remain unproven.
4. **Release identity/configuration:** effective Core/Web candidate configuration still needs comparison with the canonical serving builds, preserving provider, database roles, authentication origin/flags and rollback bindings. October30 canonical deployment identities are historical until refreshed; the newer staged Web password-retirement candidate must not be selected merely because it is latest-created. Generic Preview is not an approved isolated environment.
5. **Source and synchronization:** the dashboard is still uncommitted/unpublished. Release must bind to an immutable reviewed source. BobCore shared-state synchronization remains pending; this run wrote no event, task or handoff.

**Exact next release-readiness task:** verify independent recovery custody for bundle `64abcffe-1590-4b6d-9611-caaf454926e2` through an owner-controlled off-device restore using the independent current key copy, then refresh canonical Core/Web configuration and rollback parity for an immutable release candidate. Artifact transfer/access must be separately authorized; never send the private identity through chat, Git, CI, Vercel or object storage. A Vercel deployment remains a separate authorized step after the recovery/configuration gates pass. The next recurring-backup code slice remains the packet's default-off private-file workflow adapter; this local drill does not activate that work.

## Local validation and pending checkpoint

No Core runtime, backup library, schema, migration, package, workflow, Vercel configuration or deployment guard changed in this task. Documentation updates are this record, the recovery runbook, release gates and implementation index. Earlier dashboard and October30 documentation changes are preserved. Operator syntax, exact source hashes, independent static review and real restore/runtime checks passed. Final validation passed `git diff --check`, conflict-marker scanning, 59 local links/anchors across these four documents, branch identity and protected source/configuration scope checks. An independent comparison of the documentation with all five safe run receipts found no substantive findings; pending validation wording was then finalized. No new runtime code was introduced, and the unchanged dashboard suites were not rerun.

BobCore retrieval at `2026-10-31T17:35:08.518Z` returned matching `bobai` UUID/repository and `codex`, revision `2480260b70dd7aadb4f9e6a2fb257534a1c52c652c052018fbbb0bad836814a2`. All five sources were available; `partial=true`, events/memories truncated, latest tasks September9 and handoff October23. Explicit environment/credential binding remains unverified. No remote synchronization was attempted.

Pending local outcome: dashboard re-review has no remaining findings; fresh bundle `64abcffe-1590-4b6d-9611-caaf454926e2` passed local encrypted capture, 24-table integrity, 236 constraints/25 foreign keys, copied-access quarantine, Core context/task continuity and cleanup. Independent-copy/off-device recovery, recurring protection, owner/hosted acceptance and release-configuration parity remain open. Production stayed read-only; no uploads, deployments, migrations, live credential/permission changes or publication occurred.
