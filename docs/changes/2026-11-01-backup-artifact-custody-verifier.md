# Local GitHub artifact custody verification

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; default-off**. Branch `codex/backup-artifact-custody-verifier` starts at frozen candidate `efe81de8c61e52136b9a1df061c73c7e3c6bb2d3` and carries the ten exact uncommitted encryption-slice paths into a separate worktree. The original encryption checkout, dormant publication candidate and original working checkout are preserved. There is no branch publication guard for this successor: it must remain local until separately prepared and approved for publication.

## Prior review and scope

Independent read-only review of the [encrypted custody slice](2026-11-01-backup-custody-encryption.md) found no actionable security/correctness findings. That review inspected source, tests, the CLI, workflow holds and shared private-file/process helpers; it did not substitute for a hosted run. Its retained handoff, same-UID filesystem assumptions, uncertain-output preservation and separation between consumer acknowledgement and custody acceptance remain applicable.

This is the second code slice in the [selected public-repository custody design](2026-11-01-backup-custody-design.md). It implements a bounded, read-only GitHub evidence reader, restricted archive handling, local decryption, a private receipt and adaptation into the existing download plan. It adds no uploader, CLI, workflow wiring, dependency, schema, storage client, credentials or memory authority. The existing two false workflow holds and disabled/unbound testing configuration are unchanged from the encryption slice. All validation uses synthetic API responses and disposable keys; no real artifact is requested.

## Contracts and provenance

The [evidence reader](../../Core/scripts/lib/backup-artifact-evidence.mjs) defaults off and requires an explicitly injected transport. It never discovers an ambient token or uses global `fetch`. The caller must supply independently reviewed repository/owner IDs, source commit, producer image digest, workflow ID, initiating/rerunning actors, run/attempt, exact job ID/name, successful capture/upload step names, explicit artifact ID, recipient, instance and a narrow set of storage redirect hosts. These assertions are not inferred from the artifact itself. An approval object is validated, copied and frozen before asynchronous work.

GitHub requests are fixed read-only REST paths for repository identity, the exact run attempt, its jobs, run artifacts, the selected artifact and the archive redirect. Successful evidence requires the intended repository and head repository, owner, `main`, manual `workflow_dispatch`, exact source/workflow/attempt/actors, terminal run/job success, successful capture and upload steps, unique artifact name/ID association, causal timestamps and unexpired metadata. Lists must be complete within one bounded page; this reader refuses pagination instead of silently accepting incomplete duplicate checks. Metadata alone is insufficient: the decrypted producer must independently match the selected run and attempt.

GitHub's artifact object does not provide an authenticated standalone attempt field. The verifier combines the [exact run-attempt endpoint](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run-attempt), [attempt-specific job evidence](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt), artifact association/creation interval and decrypted producer. Job `run_attempt` is additionally checked when present. The expected future upload step is supplied by approval in synthetic fixtures; the currently held workflow has no uploader and cannot satisfy this acceptance contract as-is.

The entire transfer has a cancellation/deadline bound. JSON is limited to 256 KiB per response; an artifact archive is limited to 64 KiB. Only the fixed GitHub API receives the explicitly supplied bearer token. A single manual HTTPS redirect may lead to an explicitly approved storage host; no token, cookies or other GitHub request headers are forwarded. Additional redirects, unexpected status, missing digest, expiry, partial/oversized bodies and archive SHA-256 mismatch fail closed. Signed URLs, raw HTTP errors and response content are not emitted in diagnostics. GitHub documents the temporary archive redirect and digest metadata in its [artifact REST contract](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact).

## Archive and private-file boundary

The [archive validator](../../Core/scripts/lib/backup-artifact-archive.mjs) performs no filesystem extraction. It accepts one classic ZIP entry named exactly `recovery.json.age`, stored or deflated, bounded to 16 KiB after expansion and bearing the unarmored age header. It cross-checks local/central/end records, offsets, sizes, names, CRC and optional coherent data descriptors. It refuses extra entries, unsafe names/links/types, ZIP64, unsupported flags/methods, extra fields/comments, trailing/prepended bytes and decompression ambiguity. This deliberately narrow ZIP compatibility must be qualified against the eventually pinned upload action during a hosted synthetic drill.

The [private operator library](../../Core/scripts/lib/backup-artifact-custody.mjs) requires an empty canonical, owned `0700` output directory outside the checkout before transport. Its separately selected identity file must be canonical, owned `0600`, single-link, outside the output directory and at most 4 KiB, containing one native age identity. SSH/plugin/encrypted identities and ambient key discovery are unsupported. Tests generate disposable identities; no existing recovery key is used or changed.

The operator exclusively creates `recovery.json.age`, invokes fixed `/usr/local/bin/age` through the existing process-group supervisor with a restricted environment and 60-second command bound, then admits only a regular, single-link plaintext `recovery.json` of at most 4 KiB. Private files are synced, read back and tracked by inode, bytes and hash. Directory and identity-file checks are repeated after transfer/decryption. This assumes an exclusively controlled same-UID host; it is not a defense against a hostile process sharing that UID.

The unchanged recovery/producer validators enforce exact canonical JSON with its final newline. The producer, source, image, run and attempt must match the reviewed approval; the instance and recipient fingerprint must match; the capture start must fit the accepted job/artifact interval. Age decryption authenticates ciphertext integrity for the supplied identity; GitHub evidence and independently reviewed source provide the separate producer-provenance argument.

The private `custody-receipt.json` records the approved/observed repository, owner, actors, source/image, workflow/run/attempt/job/artifact identities, expiry, ciphertext metadata and unchanged recovery anchors. `evidence.verifiedAt` records completion of archive verification; `readbackAt` separately records decrypted-handoff readback. A backwards clock or expiry prevents later plan acceptance. Image identity is an independently reviewed assertion matched against the decrypted producer; this verifier does not inspect a registry or provide independent container-image attestation. Three values remain distinct:

| Digest | Exact bytes covered |
| --- | --- |
| Artifact archive SHA-256 | Raw ZIP response, compared with GitHub metadata before parsing |
| Ciphertext SHA-256 | The single extracted `recovery.json.age` entry |
| Handoff SHA-256 | Exact decrypted canonical JSON, including final newline |

There is no public CLI output. Returned paths, receipt and handoff anchors are private operator data and must not be printed into public Actions logs. The receipt is local evidence, not a signature or a new authority. Synthetic fixtures exercise the verifier's behavior; they do not authenticate a real GitHub run.

## Download-plan adaptation and failures

`createArtifactDownloadPlan` accepts only a handle issued by the current process after verification. It rejects a reconstructed receipt/forged handle, modified files, changed paths/inodes, expired evidence and reused plan attempts. It requires separate storage-account/target review and an empty, disjoint download destination, supplies `github-artifact:<id>` as the existing plan's custody reference, creates `download-plan.json` exclusively and invokes the existing `prepareBackupDownload` readback. It does not contact a backup store or restore data. Loading saved receipts across processes is deliberately not implemented.

All errors use fixed diagnostic codes. No failure retries the transfer, capture, encryption or decryption automatically. Existing output and partial/uncertain files remain for owner reconciliation; no recursive cleanup or overwrite occurs. Cancellation and failed/unconfirmed child shutdown cannot produce an accepted receipt/plan. A receipt written before later readback/cancellation failure is not proof that the operation returned an accepted handle. Normal success deliberately retains private plaintext and receipt for the operator; removal is a separate owner action, with no immediate-erasure promise.

## Validation and remaining gates

Final validation used Node **24.22.1**, the existing locked dependencies and installed age **1.3.1**. No tool or dependency was installed.

| Check | Result |
| --- | --- |
| Full Core suite after final hardening | **2,287 passed, zero failed; 123 gated tests skipped** (2,410 total). Database/hosted gates stayed disabled. |
| New verifier coverage | **154 evidence/transport + 124 archive + 71 private custody/composition tests**, all passing and included above. |
| Ancillary checks | Core typecheck, **eight lifecycle checks** and **three import dry runs** passed. |
| Source/documentation checks | Six new modules/tests passed syntax checks; tracked/untracked whitespace checks, **66 local links and four anchors** passed. |
| Preservation | All ten original encryption paths remain unchanged in their checkout; nine carried files remain byte-identical here, with only the current index updated. The dormant candidate remains clean at `efe81de8…`; Vercel configuration, testing binding and Production backup workflow retain baseline bytes. |
| Independent review | Prior encryption slice, new archive, evidence/operator source and documentation reviewed; no outstanding actionable findings. |

A composed test uses a disposable native age identity, actual local encryption, synthetic GitHub metadata/redirect/archive responses, the real archive parser, default process-group decryption supervisor, private receipt and existing `prepareBackupDownload`. It verifies exact bytes, three distinct digests, private modes and no backup-store access. This is not proof of hosted age **1.3.2**, Linux image compatibility or owner-held key custody.

Review corrected missing identity-encoding negotiation, a late response-body cleanup gap and a diagnostic sanitizer that could retain injected messages/fields. Regression tests cover stalled/late transfer behavior, hostile exception getters/proxies, preserved uncertain output and cancellation. The operator claims a plan attempt before awaiting I/O; concurrent consumers cannot both begin it. Separate archive-verification/readback times and clock-rollback refusals are also tested.

The final machine-readable result is `/private/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-artifact-custody-verifier-lfi49yxv/core-vitest.json`; adjacent `validation.json` records file hashes, scope/preservation and ancillary results. The original 10-path encryption baseline is recorded in `baseline.json`. Temporary dependency links and the owned Vitest cache were removed after validation. These receipts are local, not hosted acceptance.

No live GitHub API, hosted artifact, backup store, current recovery key, Docker restore or Production service was used in this slice. Real API run/job fields, archive sizes/digests/timestamps, redirect host and pinned-action ZIP compatibility remain explicit hosted qualification requirements.

The next implementation task is a separately reviewed, still-disabled upload/reader integration packet: pin the chosen upload action, constrain its input to the single ciphertext file, bind exact successful job/step/run-attempt evidence, review artifact retention/public metadata and reader authority, and define the one hosted synthetic acceptance run. Do not activate by flipping flags. The existing frozen source-publication candidate remains a separate approval; this successor is not included in it.

Hosted tool/image acceptance, effective permissions, real archive compatibility, exact-run upload/readback after runner disposal, current-key off-device restoration, recurring protection, measured RPO/RTO, hosted client lifecycle and Vercel release acceptance remain open. The owner has confirmed an offline current-key copy but has not selected a separate recovery destination. Acer/Jarvis remains deferred.

## Pending local checkpoint

Fresh BobCore retrieval at `2026-11-02T00:12:49.089Z` (November 1 in America/Toronto), revision `95ae28e0ebe1033a38089cb181732f3469cbb93f2a1c4d4bf99e21eefca0e9c5`, matched project `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI` and surface `codex`. All five sources were available, but `partial:true`, events/memories were truncated and tasks/handoffs retained older dates. Active decisions, tasks, handoff, recent events and approved relevant memories were read without treating historical records as current implementation evidence.

The implementation, validation and blockers remain in this local record. No BobCore state write or synchronization, push, PR, merge, upload, workflow activation, deployment, migration, visibility, permission or credential change is performed.
