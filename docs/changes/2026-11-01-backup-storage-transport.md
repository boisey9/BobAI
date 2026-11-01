# Bounded backup storage transport

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; no operational activation.** Branch `codex/backup-storage-transport`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`. Earlier unpublished adapter, integrity, testing-runner, dashboard, client and recovery work is preserved.

## Objective and verified gap

Complete the direct SDK/deadline task from the [testing-runner record](2026-11-01-backup-testing-runner.md). Extract the existing S3 transport without moving client work before the exporter's plan/target checks. Establish one deadline through response headers, retries, error parsing and successful download EOF. Keep the scheduled workflow and disabled testing candidate unchanged.

The existing CLI supplied a 60-second abort signal to `send()`, then consumed a successful GET body separately. Installed SDK source confirms the Node handler resolves at headers and clears its handler timers then. Its schema deserializer also buffers error/XML bodies before returning them, using an unbounded collector. The former exact-byte helper neither owned a cancellation signal nor ensured cleanup when argument validation failed before entering its `finally` block.

This uses the existing locked `@aws-sdk/client-s3` **3.1127.0** and its installed Smithy implementation; no dependency or lockfile changed. Relevant inspected modules are `@smithy/node-http-handler/dist-cjs/index.js` and `@smithy/core/dist-cjs/submodules/{client,schema,protocols,retry}/index.js`. AWS documents the distinction between [streamed and buffered S3 responses](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html). Installed source and actual SDK tests establish this slice's specific behavior; a future dependency update must repeat that acceptance.

## Implementation and invariants

The [storage adapter](../../Core/scripts/lib/backup-storage.mjs) is dynamically imported by the [exporter](../../Core/scripts/backup-database.mjs) only after the existing enabled plan, private input files, exact targets and storage pair validate. Its factory creates no client or request. Each actual operation owns a separate S3 client, abort controller and timer, preserving explicit endpoint/region/bucket, path-style addressing, static credentials and at most **three total SDK attempts**. Retry mode is explicitly standard. No ambient credential discovery, session-token support, new endpoint or CLI timeout override is introduced.

The existing `put`, `get`, `list` and `remove` interface remains. Keys must match the reviewed instance and existing dated backup-object pattern; receipt/archive/manifest content types and sizes are checked before sending. GET sizes must be exact, positive and within the applicable 64 KiB receipt, 21 MiB encrypted-manifest or 100 MiB archive bound. Listing uses the exact instance prefix and requests at most 1,000 objects per page; the transport enforces its response-byte cap, not an independent returned-object-count limit. Deletion remains at most 1,000 approved-pattern keys per call. Both list and remove refuse when plan retention is false. These local restrictions do not establish hosted IAM or bucket ownership.

Every operation has one **60,000 ms total budget**, starting before client construction and lasting through complete response consumption and final validation. It is not renewed per attempt or chunk. The library accepts a shorter budget and a request handler only for local tests; neither is selected through the CLI or runner environment.

The same low-priority `deserialize` middleware executes with the default Node handler and the injected test handler. It sits inside the SDK's normal schema deserializer, checks cancellation before each request attempt, tracks each raw body before parsing/checksum wrapping, and destroys a late body before refusing a result. All non-GET and HTTP error bodies are buffered under a **2 MiB cap before SDK parsing**, including direct byte-array responses that bypass the SDK collector. Successful GETs remain streamed until their bounded reader completes.

The [shared stream reader](../../Core/scripts/lib/backup-storage-stream.mjs) retains the old `readBoundedBackupObject` import through the job module and adds the generic bounded byte-reader used for error/metadata bodies. It accepts byte arrays and byte streams, enforces exact length when required, and waits for **EOF**. Receiving the expected bytes without EOF is insufficient. A growable bounded buffer avoids an unbounded tiny-chunk array; periodic event-loop yields allow a deadline to interrupt an endless empty or microtask-driven stream.

Cancellation races the current read without waiting indefinitely for an iterator that ignores destruction or stalls in `return()`. Losing promises are observed, only one active cancellation waiter is retained, and body cleanup runs on invalid metadata, successful completion, overflow, short reads, stream errors and cancellation. Current and late raw/checksum-wrapped response bodies are tracked. Per-operation production clients prevent one operation's cleanup from closing another operation's socket.

SDK errors can carry private response text even when their message appears safe. The adapter creates a new fixed-code error and does not forward the SDK object, cause, response or external abort reason. The [exporter supervisor](../../Core/scripts/lib/backup-exporter-process.mjs) now preserves the seven additional owned storage codes with the run UUID; arbitrary SDK codes remain filtered. The CLI's existing safe records and capture-before-ledger/storage ordering remain intact.

## Timeout, retry and recovery limits

The SDK's internal retry wait uses an ordinary timer. The adapter's caller receives the bounded timeout/cancellation result, but one already scheduled, bounded SDK wait can settle later. In this installed version, token refresh can itself wait and account for a Retry-After hint. The shared request guard then refuses before another handler/wire call. Tests observe beyond known waits rather than stopping at the outer rejection. No claim is made that every SDK internal timer disappears synchronously.

An interrupted PUT/delete may have committed remotely before acknowledgement. Timeout, client destruction and a safe failure record do not prove rollback. Preserve the original UUID and inspect the exact ledger/object set under the existing [failure-reconciliation procedure](2026-10-30-backup-activation-recovery-packet.md#failure-reconciliation-and-rollback). The adapter adds no resumable protocol, new upload authority, automatic application-level retry or automatic deletion. A partially consumed successful GET body is not retried as a new download.

The exporter still uses the existing process supervisor for external termination. Its bounded process-group cleanup and ephemeral-runner requirement remain relevant to host loss, SIGKILL and ambiguous jobs. `storage.destroy()` cancels active storage operations and prevents reuse; it does not revoke credentials or erase stored objects.

## Validation and independent review

Final checks passed under Node24:

| Check | Result |
| --- | --- |
| Full Core suite | **1,357 passed, zero failed, 123 gated skips**; two workers and a 30-second test-only allowance. Report: `/private/tmp/bob-storage-transport-47h9k9nm-vitest.json`. |
| Focused stream / actual-SDK / supervisor suites | **59 / 51 / 42 passed**, also included in the full suite. The supervisor suite includes seven new real-child cases preserving the precise safe failure and matching UUID. |
| Required additional checks | Core typecheck, eight owned-child lifecycle checks and three import dry runs passed, along with script syntax, 88 relative links/anchors, whitespace and all 13 scoped paths. The eight source/test hashes match after final validation. |

The 123 gated database/hosted cases remain skipped; none was relabeled as live acceptance. Source hashes for the eight implementation/test paths are retained at `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-storage-transport-47h9k9nm/source-manifest.json`.

Transport tests use the installed SDK's actual serialization, signing, retry, schema and checksum middleware with an injected request handler, synthetic static values and `.invalid` endpoints. The handler opens no socket. Acceptance covers exact bucket/key/body/content type, missing/malformed/wrong content length, actual byte bounds, checksum success/failure, 403 denial, three retryable 503 attempts, error/XML overflow/stalls, headers followed by body stalls, expected bytes without EOF, late responses, pre/mid-operation cancellation, cancellation/timeout during retry wait, simultaneous-operation isolation and closure/refusal.

Independent review identified two integration/testing findings: the supervisor initially hid the new safe transport codes, and the first cancellation assertion ended before the SDK retry wait could finish. Both were corrected and independently re-reviewed. Documentation review also corrected the distinction between a requested list-page size and an enforced response count, and the installed SDK's actual retry-wait mechanism. No remaining actionable source or documentation findings remain. Full-suite execution belongs to the parent; independent reviewers did not claim to have rerun it.

Scope is eight source/test paths: the new transport and stream helpers and their two suites; the exporter CLI; the job's compatible reader re-export; and the supervisor plus its test suite. Five documentation paths are this record, the implementation index, recovery/release runbooks and the testing-runner successor note. Earlier dirty files outside these updates are preserved. Package/lock files, both workflow candidates/binding, migrations, Core/Web Vercel guards and Web source are unchanged by this slice.

No PostgreSQL, Docker, real storage or Production backup was needed for this transport slice. The preceding 17-case PostgreSQL17/18 downloaded-bundle restore evidence remains dated in its own record; it is not counted as a new database run or hosted S3 acceptance here. The workflow/binding still ship disabled and unbound. No real upload, remote deletion, credential access/change, permission change, deployment, migration, publication or BobCore state write occurred.

## Remaining gate and next task

Local successor: the [runner image record](2026-11-01-backup-runner-image.md) covers the pinned local image, independent qualifier review and Linux process-topology correction. This does not establish registry publication, testing authority or hosted acceptance.

**Next activation-preparation task:** build and independently qualify the immutable Node24/npm/PostgreSQL/age runner image, recording provenance, exact digest/tool versions, runtime UID/temp paths and the locked dependency identity; then complete the owner-reviewed testing source/restore/storage binding and authority packet. The existing source holds must remain false until that candidate and its exact published SHA have separate approval. Do not infer authorization to publish an image, configure secrets, change grants or upload a synthetic artifact from this local transport work.

Real hosted testing must verify the intended account/bucket/prefix, TLS, capture/ledger role denials, authenticated upload/readback/download, same-bundle restore and storage revocation under explicit operating authorization. Existing source labels and local signatures do not prove those external properties. Keep retention off for initial acceptance.

Release still requires independent current-key/off-device restoration, recurring protection and failure reporting, complete hosted RPO/RTO, owner/client lifecycle acceptance, effective Core/Web configuration and a pinned rollback candidate. The owner confirms a current offline key copy exists but has no separate recovery destination. The installed ChatGPT plugin and working context reads remain separate accepted milestones. Acer/Jarvis remains deferred.

## Pending local checkpoint

Fresh BobCore context at `2026-11-01T16:04:13.093Z`, revision `0519576b9f8dc97a739169f8963242c230a7d05acef511b2bb6c4a8b05e2a8cc`, returned BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI` and surface `codex`. All five sources were available; events/memories were truncated and `partial=true`. Tasks remain dated September9 and the handoff October23. No decision, permission or current implementation state was inferred from those stale descriptions.

The local implementation and validation checkpoint remains unsynchronized. Later authorized writes require fresh binding/scope/version verification, retained operation IDs, receipts and relevant readback. Local code, publication, deployment and operational acceptance remain separate.
