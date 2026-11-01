# Locally retained capture-to-recovery handoff

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally.** Branch `codex/backup-recovery-handoff`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`, preserving earlier unpublished work. This implements the next code task identified by the [testing authority packet](2026-11-01-backup-testing-authority-packet.md). Nothing is published or activated.

## Problem and resulting behavior

The downloader requires seven trusted values from the capture producer, but the operational job previously returned only a run UUID, archive size and retention status. Its encrypted local bundle was deleted on exit. Synthetic download tests could retain verification values in memory; that did not establish an operating handoff after the capture process exited.

The job now returns a versioned recovery object derived from the exact verified upload bytes. The process supervisor validates its shape and identity. The workflow requires a separate private retention destination before starting capture, then writes, syncs and reads back a bounded recovery record after exporter completion and input cleanup. **A successful workflow outcome now requires a locally retained handoff.** The final outcome reports that file's digest and size, not its contents.

This is local persistence and readback. It is not independent authenticated custody, an off-device copy, a hosted artifact upload or atomic commitment of object storage and recovery custody. Those remain explicit acceptance gates.

## Contract and data boundaries

The [job](../../Core/scripts/lib/backup-job.mjs) emits `recovery: {version:1,expected:{...}}` with exactly these fields:

| Field | Producer evidence |
| --- | --- |
| `id`, `instance`, `startedAt` | The same run identity, canonical UTC start time and instance used for the verified bundle. |
| `recipientFingerprint` | Fingerprint of the configured public recipient, checked against the bundle receipt. |
| `receiptSha256`, `receiptBytes` | Hash and length of the exact serialized receipt buffer uploaded and read back. No reconstruction from a differently formatted local file. |
| `manifestBytes` | Length of the exact encrypted-manifest buffer whose upload and readback succeeded. |

The existing receipt and encrypted manifest remain version 2; their formats and three storage object keys are unchanged. There is no fourth object, new database table, migration or memory authority. The job rejects noncanonical start times and empty manifests and resolves successfully only after ledger closure.

The [handoff helper](../../Core/scripts/lib/backup-recovery-handoff.mjs) reuses the [downloader's anchor validator](../../Core/scripts/lib/backup-download.mjs). The retained record is exactly `{version:1,recovery,producer}`. Producer fields are repository, source commit, fixed testing workflow reference, GitHub run ID/attempt as bounded decimal strings, and the exact approved GHCR image reference. Local Docker IDs, mutable image tags and zero/unbound digests are refused. These are nonsecret assertions; field validation alone does not authenticate GitHub, a registry or the source database.

The [testing runner](../../Core/scripts/lib/backup-testing-runner.mjs) constructs those fields from its already checked repository/workflow/source/image context and separately validates run identity. The generic private-plan path uses owner-supplied assertions and cannot claim authenticated hosted provenance. Neither path includes credentials, database URLs, private keys, raw rows, plaintext manifests or application prompts in the recovery record.

## Required local retention and failure behavior

Preparation checks an existing canonical, user-owned directory with mode `0700`, outside the repository and disjoint from the runner temporary root in both directions. It writes nothing. Its immutable preparation object binds directory identity and a cloned producer record; forged or copied preparation objects are refused.

The [supervisor](../../Core/scripts/lib/backup-exporter-process.mjs) requires the complete recovery object. UUID and timestamp must match `backup.started`; instance and recipient fingerprint must match the validated plan. Missing fields, duplicate or conflicting records, invalid lengths/hashes, unexpected fields and oversized output are refused. The existing output limits, shutdown deadline and process-group disappearance requirement remain in force.

The [workflow](../../Core/scripts/lib/backup-workflow.mjs) retains only after successful child exit, confirmed process cleanup and removal of owned private inputs. The [exporter CLI](../../Core/scripts/backup-database.mjs) also delays its terminal record until storage shutdown and bundle cleanup finish and awaits the output write. Cleanup/output errors produce safe failures with the original UUID; raw stream errors are contained.

Both outer CLI wrappers await their final output too. Cancellation before or during that acknowledgement produces a nonzero outcome and preserves the retained record and UUID. Success bytes may already have reached an observer before cancellation or a lost acknowledgement; the final process result is required, and no automatic recapture follows.

Retention uses a fixed `<run-uuid>.recovery.json` filename, canonical JSON plus a newline, a 4 KiB bound and exclusive mode-`0600` creation. It syncs the file and containing directory, verifies exact bytes and file identity, and checks directory identity again before returning `{version:1,sha256,bytes}`. Reads use no-follow and nonblocking flags; unsafe symlinks, hard links, FIFOs, modes, ownership or substitutions are refused. Both open handles receive close attempts even if one close fails.

An existing safe byte-identical file supports readback without rewriting or replacing it. A conflicting, partial or unsafe file is preserved and refused. Cancellation, a failed sync, a lost close/write acknowledgement or an uncertain retention result may leave a record. The caller reports failure with the original run UUID and must reconcile that exact record; it must not automatically overwrite it or launch another capture. A new exporter invocation generates a new UUID and is not a retry of the previous capture.

Filesystem checks assume an exclusively controlled same-user directory. They are not an atomic defense against a hostile process with the same local account. File/directory sync does not prove physical-media durability, independent custody or survival of runner disposal. A crash after remote verification but before local handoff persistence can leave a verified ledger/object set without independently retained anchors. The UUID supports investigation; it cannot reconstruct independent trust from the object store itself.

## Default-off operator inputs

The generic workflow adapter requires `BOB_BACKUP_RECOVERY_PLAN_FILE`, a bounded private file outside the repository, unless the reviewed caller supplies the equivalent recovery object directly. Its exact shape is `{version:1,enabled:true,directory,producer}`. The directory must already satisfy the rules above. No enabled plan or destination is created here. The file path and producer configuration do not reach the exporter child.

The testing runner requires `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` and an explicitly selected `BOB_BACKUP_TESTING_RECOVERY_DIRECTORY`. The latter is deliberately absent from the dormant workflow; it remains an unresolved hosted binding. It must not be placed beneath the existing temporary root or treated as persistent merely because the VM wrote it. The approved custody/retrieval path must be implemented and accepted before a hosted run can claim independent retention.

Both literal workflow holds remain false; `backup-testing-binding.json` remains disabled with null bindings. No YAML, production schedule, package/lockfile, image recipe, Vercel guard, credential, permission or database configuration changes are included. The older [37-path inventory](2026-11-01-backup-testing-source-inventory.json) remains a dated pre-handoff review artifact, not a hash inventory of this successor. Regenerate and qualify the exact composed candidate after the download-operator work before publication.

## Validation and independent review

Final full Core validation passed **1,554 tests, zero failures and 123 gated skips**, using the existing cached Node 24.0.0 on the Mac. Type checking, eight owned-child lifecycle checks and all three bootstrap import dry runs also passed. Report: `/private/tmp/bob-recovery-handoff-wn2gbibq-final-vitest.json`. The 71 handoff-helper tests, 59 job/CLI cases and the updated supervisor/workflow/testing-runner/download cases are included in the full total, not additional counts.

Independent source review covered the complete integration and the helper separately. Review found one final-output cancellation race: a signal during a pending final write could otherwise leave exit status zero. Signal checks before/after acknowledgement and in both CLI exit assignments corrected it; three deferred-write signal cases and one pre-cancelled case cover the finding. Targeted re-review confirmed the correction with no remaining actionable findings. The final full test run includes that correction.

Whitespace/conflict checks, 104 relative links and five anchors passed. The pre-edit 507-file hash baseline confirms exactly 19 scoped paths: nine script/library files, five tests and five documentation files. The other 491 existing files are byte-identical. Source hashes and scope evidence are retained under `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-recovery-handoff-wn2gbibq/`; this temporary evidence is not independent recovery custody. Packages/lockfile, production schedule and both Vercel guards match HEAD; dormant testing YAML/binding and image inputs match the pre-edit baseline.

Tests use synthetic data, temporary files, injected storage/database behavior and actual owned Node child processes. They do not contact Production, invoke real object storage, perform a new encrypted Production capture, start Docker or establish a new real-database restore result. Linux container qualification and real database fixtures were not rerun for this slice; hosted filesystem, provenance, custody and restore acceptance remain open.

The acceptance cases include exact uploaded-byte binding, readback and ledger-close failure, strict protocol identity/size/field rejection, preparation before capture, file/directory sync, safe identical retry, partial/conflicting/unsafe record refusal, cancelled/lost acknowledgements, descriptor cleanup and safe UUID-preserving errors. The integrated synthetic flow supervises a child, retains its handoff, removes original files, then supplies the downloader only with values parsed from that retained file. Synthetic ciphertext bytes in this test exercise the handoff/download boundary; they are not a new encryption/decryption or restore drill.

## Remaining work and exact next task

Further November 1 successor: the [shared restore operation](2026-11-01-backup-restore-operation.md) now qualifies the operating logic and public copied-access quarantine through the local PostgreSQL fixture and pinned Linux tests. The original next-task statements below retain their evidence dates. Hosted transport, authority/custody and independent owner recovery remain open.

Successor: the [default-off recovery download operator](2026-11-01-backup-download-operator.md) implements the local command described below. Its own validation and authority limits apply; this record's original next-task statement remains dated handoff-slice context. The [encrypted-chain successor](2026-11-01-backup-recovery-chain.md) now qualifies the local data-restore composition and its 44-path runtime replay. The operating restore command/quarantine, hosted custody/transport and off-device recovery remain separate acceptance work.

**Next implementation: a default-off Get-only recovery download operator.** It must bind an independently reviewed retained handoff and its authenticated custody/provenance, exact storage account/bucket/prefix, Get-only credentials and a private empty destination; compose the existing bounded downloader/storage adapter; and handle cancellation, conflict, output and cleanup without treating the downloaded receipt as its own independent trust source. Reuse the current libraries. Qualify the selected restore connection path afterward; the existing restore CLI uses Neon WebSocket transport and is not a generic offline Docker command.

Still open: owner-approved testing source/restore/storage and recovery-custody destinations, exact dormant/activation source commits, image publication/readback and registry access, hosted authority-denial checks, one complete hosted synthetic drill, independent current-key/off-device Production recovery, recurring protection, full-service RPO/RTO, client lifecycle acceptance and effective Vercel release/rollback configuration. The owner has confirmed an offline current-key copy but has no separate recovery destination. No new key or destination was requested or created. Acer/Jarvis remains deferred.

BobCore context at `2026-11-01T17:18:20.668Z`, revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`, matched BobAI UUID `10000000-0000-4000-8000-000000000001`, `boisey9/BobAI` and `codex`. All five sources were available, with bounded/truncated events and memories and `partial:true`; tasks and handoffs remain dated. The approved plugin's earlier authenticated reads remain accepted separately. This implementation/validation outcome is a pending local checkpoint; no BobCore task, event or handoff was written.
