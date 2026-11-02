# Local encrypted recovery chain and scoped source replay

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; no publication or hosted activation.** Branch `codex/backup-recovery-chain`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`, preserves all earlier unpublished work. This follows the [download operator](2026-11-01-backup-download-operator.md) and [retained handoff](2026-11-01-backup-recovery-handoff.md). The change extends one existing synthetic PostgreSQL test and refreshes the documentation and source inventory. Runtime implementations, dependencies, workflow holds, testing bindings, migration sources, image inputs and deployment configuration are unchanged by this slice.

## What is now qualified

The existing [17-case PostgreSQL fixture](../../Core/tests/backup-coverage-postgres.test.mjs) now composes real encrypted capture, the retained handoff, the Get-only download operator and downloaded-only restoration. It uses the existing [isolated runner](../../Core/scripts/run-isolated-backup-coverage.mjs), installed PostgreSQL 17 and the exact previously cached PostgreSQL 18 image. No tools or images were installed or pulled.

1. `runBackupJob` captures a held read-only snapshot, produces the actual three encrypted objects, and closes capture before using the separate synthetic ledger role. Concurrent writes and a later table remain outside the snapshot; attempted DDL on a held table is blocked.
2. The job's recovery result is persisted through `prepareBackupRecoveryHandoff` and `retainBackupRecoveryHandoff`. Capture and retention are separate sibling directories. Exact bytes, hash, length, private mode and identical retry/readback are checked; retry preserves the retained inode and modification time.
3. All original archive, encrypted-manifest and receipt files are removed and their absence is asserted. The trust anchors used for recovery come from the retained handoff, never from the object store's copy of its receipt.
4. Actual private plan and synthetic credential files feed `runBackupDownloadOperator`, which constructs the real locked SDK through `createBackupDownloadStorage`. Its injected in-memory HTTP handler serves the three objects without opening a network connection. Local check mode constructs no client. Download requests exactly receipt, archive and manifest; corrupt and cancelled downloads clean their owned files and bodies. A second invocation refuses the completed destination before new transport activity.
5. Actual age decryption and `pg_restore` use only downloaded copies. The empty/same-major destination checks, 25-table count/content comparison and captured constraint/nullability verification pass. The pre-existing richer integrity case still covers 1,001 duplicate/rich rows, empty tables, domain constraints, dropped NOT NULL rules and same-count data edits.

Producer commit/image/run fields, storage account, custody reference and credentials are explicitly synthetic fixture assertions. They do not authenticate a GitHub run, registry artifact, remote storage account or independent custodian. The real SDK path is exercised, but network/TLS and provider IAM are not. The fixture calls composition functions rather than launching the complete hosted workflow or the enabled download CLI as a separate process; earlier operator CLI checks retain their own scope.

## Restore acceptance boundary

November 1 successor: the [shared restore operation](2026-11-01-backup-restore-operation.md) now exercises the CLI's operating logic and public copied-access quarantine through the actual synthetic fixture, with transaction/failure/cleanup tests and pinned Linux acceptance. Its [47-path inventory](2026-11-01-backup-restore-source-inventory.json) supersedes this slice's 44-path replay for current review. The limitations below describe this earlier chain slice; hosted transport, independent custody and owner recovery remain open.

This chain qualifies the existing restore integrity helpers with actual local PostgreSQL and `pg_restore`. **It does not qualify the complete `restore-database.mjs` operating command or copied-access quarantine.** That command uses Neon's WebSocket `Pool`, while the fixture uses a local `psql` bridge. Its access-revocation SQL is inline, and the fixture has placeholder authentication tables rather than the full restored authentication schema. Copying that SQL into a test would not prove that the operating command executes it safely.

The previous operator record proposed quarantine as part of its next milestone. That part remains incomplete and is explicitly carried forward below. No runtime adapter or duplicate quarantine implementation was added to make the fixture appear complete. The older October 31 real-snapshot recovery evidence remains dated and is not renewed by this synthetic drill.

## Validation and source identity

| Check | Result and evidence |
| --- | --- |
| Working-tree PostgreSQL 17.11 | **17 passed, zero failed/skipped**, `/private/tmp/bob-backup-coverage-run-el2acE/`; 13.936-second test interval. |
| Isolated-replay PostgreSQL 18.6 | **17 passed, zero failed/skipped**, `/private/tmp/bob-backup-coverage-run-beb94W/`; 65.874-second test interval. |
| Isolated-replay Core suite | **1,733 passed, zero failed, 123 gated skips**. The 17 backup cases were separately executed above; other hosted/database suites remain gated. |
| Isolated-replay supporting checks | Type checking, **eight** process lifecycle checks and **three** import dry runs passed. |
| Independent code review | No remaining material findings in fixture composition or replay design. The restore-command/quarantine limitation above was explicitly reviewed. |
| Inventory review | All 44 overlay hashes and all **453** other baseline file hashes independently match; no unexpected replay source files. |
| Documentation/scope checks | Exactly **nine** paths in this slice; **509** prior files preserved byte-for-byte, no deletions. Whitespace checks and **135** local links / **five** anchors pass. |

The replay starts from a local `git archive` of the immutable baseline and overlays exactly the **44 paths** in the new [source inventory](2026-11-01-backup-recovery-source-inventory.json). It adds seven handoff/operator paths to the historical [37-path inventory](2026-11-01-backup-testing-source-inventory.json) and refreshes all candidate hashes. The old inventory is preserved as dated evidence. All 44 hashes match both the working tree and replay. Baseline source outside that set stays byte-identical, including Web; unrelated dashboard, client and UX changes are excluded.

The replay reuses the existing Core/Web dependency directories through local symlinks. Both package files and lockfiles match the baseline, with no local/workspace package links. No dependency installation or clean-room dependency claim is made. Vitest runs from the replay's Core directory, using its own unchanged configuration and baseline Web source. This explains the smaller total than the larger working tree's earlier 1,776 tests. The PostgreSQL 18 invocation uses the runner inside the replay, so it qualifies the selected source rather than accidentally testing the original checkout.

Host tools are Node `v24.0.0`, age/age-keygen `v1.3.1` and PostgreSQL `17.11 (Homebrew)`; executable realpaths and SHA-256 hashes are retained in `host-tools.json`. PostgreSQL 18 uses cached image `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66`, `linux/amd64`. That database fixture image is separate from the previously qualified backup-runner toolchain. This slice does not rerun the newer modules inside that runner image or claim hosted Linux workflow acceptance.

The replay, pre-edit 516-file baseline, exact hashes, reports and cleanup receipts are under `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-recovery-chain-uk53gxyx/`. These temporary local diagnostics are not independently retained recovery artifacts. Test durations are not service RTO measurements.

Both owned clusters stopped; synthetic archive, decrypted dump, test identity, input credentials and fixture sockets were removed. The PostgreSQL 18 container was network-disabled, read-only, had no published ports or host mounts, and was removed after its ID/image/label/isolation check. The unrelated RFQ container remained created/unstarted. Docker Desktop was initially stopped and is returned to that state. Cleanup readback and documentation checks are recorded in the local validation receipt.

## Remaining gates and exact next task

**Next local implementation task: qualify the existing restore operation, including verification-before-quarantine and failure recovery, against the synthetic PostgreSQL 18 fixture.** Reuse the operating command's logic through a minimal testable boundary; do not copy its SQL into a parallel implementation. Exercise representative project credential metadata, OAuth grants/clients/tokens, owner sessions/verification records and ledger state. Prove full integrity verification precedes intentional mutations, copied access is disabled, failures do not produce a successful restore receipt, nonempty/wrong-target attempts are refused, and retry/partial-outcome handling is explicit. A local transport seam must remain unavailable as an environment-selected hosted credential bypass. Review the exact resulting source before refreshing the replay inventory.

The selected Neon WebSocket transport still needs a separately authorized isolated hosted drill; a local connection seam cannot establish that acceptance. Owner-approved synthetic source/restore/storage targets, effective grants and denial tests, authenticated independent handoff custody, source/image publication and readback, registry pull access, final activation SHA and one bounded hosted drill remain open in the [authority packet](2026-11-01-backup-testing-authority-packet.md).

The current branch is local and unpublished. Core/Web retain their existing branch-specific deployment guards; `main` remains explicitly disabled. Those files do not disable every future branch by wildcard. Any later publication proposal must review the actual publication branch's deployment behavior before pushing. This packet grants no publication or deployment authority. The source inventory covers runtime/test/toolchain paths, not a complete proposed commit: supporting documentation needs its own reviewed diff. Candidate commit, activation commit and published registry reference remain null; publication and activation holds remain true.

Production recovery still needs an owner-controlled off-device destination and artifact restoration using the attested independent current key, recurring protection/retention/failure reporting, owner-access recovery and measured full-service RPO/RTO. No separate recovery destination exists yet. The latest documented real snapshot is October 31 UUID `64abcffe-1590-4b6d-9611-caaf454926e2`; no new Production capture or artifact transfer occurred. Vercel configuration/rollback parity and release acceptance remain separate. Acer/Jarvis remains deferred.

The approved Production ChatGPT plugin installation and earlier authenticated Codex/ChatGPT reads remain accepted at their recorded dates. This local drill adds no plugin write receipt/readback, identical-operation retry, refresh/revocation or cross-client lifecycle acceptance. It does not establish complete two-way operational acceptance.

## Pending local checkpoint

Codex context at `2026-11-01T17:48:48.538Z`, revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`, matched BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI` and surface `codex`. All five sources were available, with `partial:true` and truncated events/memories. Tasks and handoffs retain older dates. No BobCore task, event, decision or handoff was written.

Outcome: the local encrypted capture/handoff/operator/download/data-restore path and exact runtime-source replay pass; the operating restore command and quarantine gate remain open. No push, PR, merge, upload, real object-store download, hosted database action, deployment, migration, credential/permission change, workflow activation or Production write occurred. Local qualification, publication, hosted operation and owner acceptance remain separate.
