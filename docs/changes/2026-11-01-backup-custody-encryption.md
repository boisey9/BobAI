# Local encrypted recovery-handoff preparation

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; default-off**. Branch `codex/backup-custody-encryption`, based on frozen dormant candidate `efe81de8c61e52136b9a1df061c73c7e3c6bb2d3`. The owner selected the existing public repository with an age-encrypted GitHub artifact for local implementation. That selection does not authorize a push, upload, workflow activation, visibility change or new credentials.

## Scope and reused implementation

This is the first code slice in the [selected custody design](2026-11-01-backup-custody-design.md): private directory wiring, exact handoff encryption and public-output isolation. The independent GitHub custody reader and actual uploader remain subsequent work. There is no new backup format, memory authority, database operation or storage transport.

The original `codex/backup-restore-operation` checkout and the frozen publication worktree are preserved. This separate worktree includes the reviewed custody design and its GitHub Free clarification; the original design checkout also remains unchanged. The new branch has no additional Vercel publication guard and must remain local unless separately prepared for publication. Existing Core/Web guards, Production backup workflow and disabled/null testing binding retain their baseline bytes.

The implementation reuses:

- [Testing context/binding/tool checks](../../Core/scripts/lib/backup-testing-runner.mjs), including manual main-only execution, exact reviewed source/image and testing-only capture scope.
- [Private adapter and retained handoff](../../Core/scripts/lib/backup-workflow.mjs), including the bounded capture supervisor, separate capture/ledger credentials and exact successful local retention.
- [Recovery and producer validators](../../Core/scripts/lib/backup-recovery-handoff.mjs), [bounded private-file reads](../../Core/scripts/lib/backup-download-input.mjs) and the [owned process-group supervisor](../../Core/scripts/lib/backup-restore-operation.mjs). Importing that supervisor does not invoke a restore or create a database client.

## Behavior and data boundary

The held [testing workflow](../../.github/workflows/backups-testing.yml) creates three distinct, canonical private directories: adapter inputs, retained handoff and ciphertext. They are sibling directories outside the checkout, owned by the execution UID with mode `0700`. The workflow masks the generated paths before exposing them to subsequent steps within the same job, following GitHub's [masked same-job output guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job). Actual hosted rendering/debug-log behavior still needs acceptance; this slice has not run on GitHub.

The [custody wrapper](../../Core/scripts/lib/backup-testing-custody.mjs) snapshots only selected environment values before awaiting work, clones/freezes the validated binding and validates the directory topology before capture. It suppresses the adapter's rich start/final/error records. The existing generic adapter CLI remains unchanged for private operator use.

Only a successful, schema-valid `backup.verified` outcome with retention disabled can reach [encryption](../../Core/scripts/lib/backup-custody-encryption.mjs). The helper selects the exact `<validated-uuid>.recovery.json` file, reads at most 4 KiB and verifies its byte count, SHA-256, canonical serialization/final newline, producer, instance and approved recipient fingerprint. It does not scan for the newest file or select trust anchors from untrusted backup-store content.

The helper copies those verified bytes into owned private staging, invokes fixed `/usr/local/bin/age` with only the approved public recipient and a restricted environment, and bounds command execution to 60 seconds. The existing testing preflight checks the pinned age version/image. The helper admits at most 16 KiB of resulting ciphertext, creates `recovery.json.age` exclusively in the ciphertext directory, then syncs and verifies it. The consumer-facing descriptor contains only the exact artifact name, private ciphertext path, ciphertext hash and byte count. The artifact name binds the run and attempt; it does not contain the backup UUID.

Public success is `backup.custody_prepared` with the artifact name and ciphertext digest/length. It does not contain the backup UUID, plaintext handoff/receipt hash, archive size, private path, credentials or raw child output. Public failures use fixed stage/error codes. The CLI never serializes the private descriptor. Preparation does not mean upload or accepted custody.

There is no installed uploader, artifact action, runtime-configurable callback, artifact ZIP, retention setting or API call in this slice. A programmatically injected synthetic consumer receives only a frozen ciphertext descriptor and cancellation signal after another bounded exact-file check. Its acknowledgement is bounded by cancellation and a 60-second deadline, observed even if late, and never promoted into independent custody acceptance. Real action selection/pinning and its effective authority require separate review before wiring and activation.

## Failure, cleanup and recovery

Preparation requires empty owned directories. Each issued encryption preparation permits one attempt. Existing ciphertext refuses rather than being overwritten or re-encrypted; a lost capture, consumer or public-output acknowledgement never triggers automatic recapture or another randomized age encryption. Retained ciphertext remains available for exact-run reconciliation.

Only owned staging files are removed, and only after the process supervisor has established shutdown. Unknown/replaced files and uncertain process state prevent success and preserve private evidence. The retained original handoff is deliberately separate from staging cleanup; it remains private until runner disposal or separately approved handling. These pathname checks assume a trusted machine with exclusive same-UID control, not protection against a hostile process using that UID.

The existing capture supervisor allows at most 12 minutes; encryption and the optional synthetic consumer each add at most one minute before bounded process shutdown. Bootstrap/tool checks and dependency setup also consume the held 15-minute job budget, so the host deadline can interrupt execution or cleanup earlier. These per-phase bounds do not guarantee completion or cleanup before host termination. Hosted runner disposal, real log privacy, storage retention, independent download/decryption and off-device recovery are not proven by local completion. No immediate-erasure claim is made about storage media or backups.

## Validation and review

Final validation uses synthetic files, disposable test keys and the already installed age binary; no current recovery key, real backup, database, remote storage or live workflow is used. Dependency versions remain locked and unchanged.

| Check | Result |
| --- | --- |
| Full Core suite, clean environment and Node 24.22.1 | **1,938 passed, zero failed; 123 gated tests skipped**. The skipped database/hosted gates were not enabled. |
| New focused coverage | **59 encryption + 47 composition tests passed**, included in the full run. |
| Required ancillary checks | Core typecheck, **eight lifecycle checks** and **three import dry runs** passed. |
| Actual synthetic directory step | Installed Ruby parsed the YAML; shell syntax and execution passed with three distinct canonical owned `0700` directories, all masked before same-job output use. Owned fixture directories were removed. |
| Independent review | Source/security review has no remaining actionable findings. Documentation review corrections distinguish the frozen baseline from completed local wiring and outstanding hosted acceptance. |

The composed test uses the real testing wrapper, existing adapter's private input materialization/cleanup, retained handoff, default encryption helper and independent decryption of the exact bytes. Only hosted preparation/tool checks and the capture executor are injected. The locally installed age is **1.3.1**; this is not acceptance of the pinned hosted image's age **1.3.2**. No Docker/Linux-image requalification or hosted test was performed in this slice.

Independent review found and resolved an indefinitely stalled synthetic consumer and unmasked private paths in workflow metadata. Regression coverage now proves cancellation/deadline handling with late rejection observed and path masking before output publication. Integration tests also caught and corrected incomplete capture-result validation and capture-error classification before the final full pass. No validation or default-off requirement was relaxed.

The machine-readable full result is retained locally at `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-custody-encryption-rnei6wh5/core-vitest.json`; the adjacent `validation.json` records final file hashes, documentation/syntax checks and frozen-candidate preservation. These local receipts are not hosted acceptance records.

The new encryption suite covers directory/file ownership and topology, exact handoff binding, output size and file refusal, real synthetic age roundtrip, cancellation and cleanup/retry boundaries. The composition suite covers phase ordering, binding/environment mutation isolation, invalid capture refusal, public-output sentinels, ciphertext revalidation, stalled/late acknowledgement and no automatic retries. Existing testing-runner checks retain disabled-before-effects and both source holds.

## Remaining work and pending local checkpoint

The exact next implementation slice is the bounded read-only GitHub custody verifier described in the selected design: authenticate the intended repository/run/attempt/artifact association, verify the bounded archive and ciphertext digest, decrypt locally and feed the existing private download plan. Use synthetic API fixtures until a separately authorized hosted drill. This slice does not pre-authorize real API downloads or credentials.

Source publication for the separate frozen candidate is still pending. Image publication/pull identity, an approved synthetic source/restore/storage environment, effective permissions, actual encrypted artifact upload/readback, retention, recurring protection, owner-held off-device restore, hosted client lifecycle and Vercel release gates remain open. Acer/Jarvis remains deferred.

Fresh Codex context at `2026-11-01T20:33:50.568Z`, revision `95ae28e0ebe1033a38089cb181732f3469cbb93f2a1c4d4bf99e21eefca0e9c5`, matched BobAI UUID `10000000-0000-4000-8000-000000000001`, repository and Codex surface. All five sources were available; context remains partial, events/memories truncated, and tasks/handoffs retain older dates. Outcomes stay in this local record under the current scope. No BobCore state write, synchronization claim, push, PR, merge, deployment, migration, upload, visibility, credential or permission change occurs.
