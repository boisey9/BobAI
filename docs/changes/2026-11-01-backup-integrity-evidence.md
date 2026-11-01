# Same-snapshot encrypted backup integrity evidence

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; operational activation remains off.** Local branch `codex/backup-integrity-evidence`, HEAD `9536d6c24de090f4c4c2716cead64811107da3ab`. Earlier uncommitted adapter, dashboard, client and recovery changes remain preserved and unpublished.

## Objective and scope

Close the supplemental integrity gap identified in the [activation packet](2026-10-30-backup-activation-recovery-packet.md) and [workflow adapter](2026-11-01-backup-workflow-adapter.md), using the October 31 manual drill as design evidence. Integrate full logical row-content fingerprints and constraint/nullability evidence into the guarded exporter and restore verifier. Preserve the held read-only capture snapshot and separate ledger authority.

This is local source and synthetic acceptance work. No Production capture, restore, database mutation, artifact upload, schedule activation, deployment, migration, live credential/permission change, source publication or BobCore write is performed. Synthetic PostgreSQL fixtures and temporary test encryption identities are owned disposable test resources; they do not exercise the owner's current recovery key or off-device custody. Acer/Jarvis remain deferred.

## Bundle and snapshot contract

New captures retain **three objects**: encrypted archive, encrypted manifest and public receipt. Manifest and receipt versions advance to **2**. The mandatory integrity block is inside the encrypted manifest rather than a fourth object, preserving existing object keys, ledger columns and retention boundaries.

The [bundle helper](../../Core/scripts/lib/backup.mjs) exports one snapshot from the caller's held transaction. Counts and [integrity capture](../../Core/scripts/lib/backup-integrity.mjs) use that same client; `pg_dump` imports that exact exported snapshot. The existing preflight maintains table locks, reviewed catalog/project/source checks, and the final catalog check before closing capture. No new database connection is opened for fingerprints or constraints.

Manifest v2 binds run ID, instance, time, supported PostgreSQL version, exported snapshot, encrypted-archive hash, recipient fingerprint, table counts, existing coverage evidence and the mandatory integrity block. Receipt v2 binds the archive and encrypted-manifest hashes and carries only the integrity format/algorithm descriptor. Per-table digests, constraint definitions and snapshot identity are not copied into the public receipt or activity output.

The job requires v2 receipts and validates the complete local artifact set before opening the ledger. Missing/changed files, malformed descriptors, wrong identities, unexpected public receipt fields and recipient mismatches refuse before ledger/storage work. Ciphertext is checked again during upload and storage readback. Retention remains disabled in the workflow adapter.

The receipt is unsigned. Encryption authentication and hash bindings establish artifact consistency, not independent producer provenance: possession of the public age recipient alone is sufficient to produce a different encrypted bundle. Recovery must select a trusted complete artifact set through the separately reviewed custody procedure.

## Integrity format and limits

The mandatory integrity block has exact keys `version`, `algorithm`, `tables`, `constraints`, and `notNull`. Version is `1`; algorithm is `sha256-jsonb-row-multiset-v1`.

- Each table has schema/name, exact row count and a SHA-256 fingerprint. PostgreSQL hashes each logical JSONB row; only fixed-size row hashes cross the client boundary. Hashes sort with `COLLATE "C"` and are combined with unambiguous newline framing. Duplicate rows remain significant, physical row order does not, and empty tables have deterministic evidence.
- Constraints include every captured user-schema `pg_constraint` record, including unused-domain constraints, with stable object identity, definition, validation/enforcement/deferral/inheritance flags and stable parent identity. OIDs are not compared. Unvalidated, unenforced, unsupported or malformed records refuse capture.
- `notNull` separately records table-column and user-domain nullability, including empty tables and unused domains. This covers PostgreSQL 17 metadata outside `pg_constraint` as well as PostgreSQL 18 records. Domain CHECK and NOT NULL constraints are accepted where represented in the catalog.

Capture requires an existing **REPEATABLE READ READ ONLY** transaction on PostgreSQL 17 or18. A non-hold cursor rejects an absent transaction block even when session defaults resemble the required mode. Canonical local settings cover catalog-only search path, UTC, date/interval formatting, floats, bytea, monetary locale and string escaping. The helper never begins or commits a transaction; cursors close on success and failure. Raw driver errors become fixed safe codes.

Bounds are 10,000 tables, 10 million rows per table, 100 million total rows, 100,000 constraint records, 100,000 nullability records, 100 KiB per definition and 16 MiB total integrity evidence. Row hashes fetch in batches of 1,000; catalog evidence fetches in bounded batches. Manifest plaintext is limited to 20 MiB and ciphertext to 21 MiB. Existing 100 MiB archive and capture statement/export deadlines remain unchanged. These conservative limits may refuse a legitimate larger database; capacity increases require separate review.

This verifies logical row content and the described constraint/nullability metadata. It is not a complete schema, ACL, extension, function, physical-file or arbitrary custom-type compatibility audit. The existing coverage schema digest remains a separate check. PostgreSQL's [constraint catalog](https://www.postgresql.org/docs/18/catalog-pg-constraint.html), [binary SHA functions](https://www.postgresql.org/docs/18/functions-binarystring.html) and [domain implementation](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/commands/typecmds.c) informed the version-specific handling.

## Restore and compatibility

The [restore CLI](../../Core/scripts/restore-database.mjs) validates receipt/artifact sizes and hashes, authenticates decryption, validates the complete manifest and checks the same supported PostgreSQL major before `pg_restore`. Missing v2 integrity never falls back to counts-only verification. Empty-destination inspection now treats `pgx` as a user schema; only the literal `pg_` prefix is excluded.

After restoration, the [verification helper](../../Core/scripts/lib/backup-restore-verification.mjs) opens a bounded read-only repeatable-read transaction and compares table membership/counts, content digests, constraints and nullability. Comparison finishes and the read transaction closes before existing ledger correction or copied-access quarantine. A mismatch leaves the destination unaccepted; it must remain isolated. Successful comparison does not authorize exposing a recovered service.

Source/destination table inventory order and JSON property order are canonicalized. Matching PostgreSQL major is required for v2; cross-major serialization or catalog equivalence is not claimed.

Version1 archives remain recoverable with explicit `--allow-legacy-counts-only`. Their result is labeled `legacy-counts-only`; the flag does not weaken v2 validation. The October 31 supplemental operator artifact is not automatically consumed by that legacy path. Its stronger manual evidence and hash-bound restore procedure retain their own dated record. Old restore tools reject v2 and must not be used for new bundles.

## Validation and review

Final validation passed. Independent source/security/documentation re-review has no remaining findings. Review corrected PostgreSQL 18 domain NOT NULL handling, added required PostgreSQL 17/18 nullability evidence, corrected inventory ordering and enforced the restore plaintext bound before parsing. A real restore exposed JSON property-order dependence; fixed field construction and a regression test now cover that transport difference. No production validation rule was relaxed.

| Final acceptance | Result and evidence |
| --- | --- |
| Complete Core suite, Node 24 | **1,133 passed, zero failed, 123 gated skips**; two workers and a 30-second test-only default allowance. Report and hashes of all 13 source/test files: `/private/tmp/bob-integrity-final-1lc5hdrk/`. |
| Integrity/bundle/restore/job/boundary suites | **188 passed**, included in the full suite. |
| Process-supervisor regression | **35 passed**, included in the full suite; separate focused report under `/private/tmp/bob-exporter-diagnosis-dk36dyeh/`. |
| Actual PostgreSQL 17.11 | **17 passed, zero skipped**, `/private/tmp/bob-backup-coverage-run-5H6izI/`. |
| Actual PostgreSQL 18.6 | **17 passed, zero skipped**, `/private/tmp/bob-backup-coverage-run-NHKE9G/`; cached image `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66`. |
| Other required checks | Core typecheck, eight owned-child lifecycle tests, three import dry runs, script/test syntax, whitespace, local links/anchors and protected-file scope passed. |

The full suite skips its 17 database cases by default; they were executed separately on both supported majors. The other 106 gated database/hosted cases remain unexecuted in this slice. Earlier failed runs are diagnostic evidence, not accepted runs: the inventory-property issue and transient process-probe issue were corrected, Docker fixture time allowances were increased without changing assertions, and the final full run used reduced concurrency plus an explicit test-only import allowance. Production deadlines remain unchanged.

Full regression also exposed a transient macOS process-group probe failure in the earlier adapter. A bounded diagnostic recorded successful termination signals followed by signal-zero `EPERM`, then child close and eventual `ESRCH` for every owned group. Apple's [XNU group-signaling implementation](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/kern/kern_sig.c) supports this interpretation: an existing group can have no eligible members during the zombie transition. This evidence is more specific than the earlier sandbox-only attribution; it also reproduced in a permitted run.

The supervisor correction treats only a **liveness probe** `EPERM` as unknown and retries within its existing deadlines. Only later `ESRCH` proves absence. Persistent uncertainty, denied actual termination signals and other errors remain failures; cancellation cannot mask them. No timeout, privilege or success requirement is relaxed. Deterministic probe-denial tests and actual owned-child tests validate this boundary. The test fixture now uses the actual one-second production shutdown grace rather than its former 50 ms window.

Synthetic tests cover same-client/snapshot ordering, three-object binding, private evidence, missing/tampered artifacts, strict versions/legacy opt-in, duplicates and bounded cursor batches, metadata drift, safe errors and rollback. The actual PostgreSQL fixture retains 17 cases and exercises real encryption/export/decryption/restore with concurrent writes, 1,001 rich duplicate rows, empty tables, domain constraints, dropped NOT NULL rules, same-count content edits, `pgx` refusal and repair/readback. Docker fixture startup has a separate test-only time allowance; production query/export/shutdown bounds remain unchanged.

Owned fixture cleanup passed: native clusters stopped, fixture sockets/plaintext/archive/test-key directories removed and the Docker container removed after its isolation check. The sole unrelated RFQ container remained created/unstarted. Docker Desktop's bounded stop command timed out, then its exact reported processes and local socket disappeared; its initial stopped state was independently confirmed. The diagnostic run's 29 owned process groups all returned `ESRCH`. No image or tool was installed, no port exposed and no Production resource accessed by these tests.

There is no diff under `.github/`, `.codex/`, `Core/migrations/` or either Core/Web Vercel deployment guard. Earlier Web/dashboard acceptance retains its own evidence date; this slice does not change Web runtime files.

Implementation scope is six scripts: `Core/scripts/lib/backup-integrity.mjs`, `backup-restore-verification.mjs`, `backup.mjs`, `backup-job.mjs`, `backup-exporter-process.mjs`, and `Core/scripts/restore-database.mjs`. Seven test files cover integrity capture, bundle binding, restore verification, actual PostgreSQL coverage, job ordering, legacy boundaries and exporter supervision. This record, the adapter successor note, recovery/release runbooks and implementation index are the five documentation paths. Earlier dirty files retain their own separate change records.

## Remaining gates and next task

Same-day successor: the [disabled testing-runner and download slice](2026-11-01-backup-testing-runner.md) now implements the local preparation described below; final local validation and independent review pass (1,240 Core tests, 123 gated skips; 17 cases on each PostgreSQL major). Toolchain image construction/provenance and hosted bindings remain unverified, so it does not establish an accepted pinned runner or hosted transport. Its exact next task is direct AWS SDK transport and complete-body deadline/cancellation acceptance.

**Next backup implementation task:** prepare and independently review pinned ephemeral testing-runner wiring for the existing private-file adapter, including artifact transport/download/restore acceptance and failure reconciliation. Keep all flags off. An owner-approved isolated source/restore/storage destination and exact authority bindings are prerequisites to executing hosted transport; placeholder plan labels do not establish isolation.

Operational gates remain independent: off-device artifact custody and restoration with the owner's independent current-key copy; accepted recurring protection and failure reporting; effective capture/ledger/storage authority; owner/client lifecycle acceptance; full hosted recovery and measured RPO/RTO; immutable release source, effective Core/Web configuration and rollback parity. The owner still has no separate recovery destination. The installed ChatGPT plugin and working context reads do not close these gates.

## Pending local checkpoint

Fresh Codex preflight at `2026-11-01T14:57:31.277Z` returned BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, surface `codex`, revision `0519576b9f8dc97a739169f8963242c230a7d05acef511b2bb6c4a8b05e2a8cc`. All five sources were available; events/memories were truncated and `partial=true`. Tasks remain dated September 9 and the handoff October 23; the newer grant audit event does not synchronize local implementation.

Outcome: encrypted manifest/receipt v2, same-snapshot logical content/constraint/nullability verification and the bounded process-probe correction are implemented, independently reviewed and locally validated. Full Core passed 1,133 tests; actual synthetic PostgreSQL acceptance passed 17 cases on each of 17.11 and 18.6. The next backup task and operational gates remain as listed above. No event, task or handoff was written. Any later synchronization requires current identity/scope/version verification, explicit authorization, retained operation IDs, receipts and readback. Local code, publication, deployment and operational acceptance remain separate.
