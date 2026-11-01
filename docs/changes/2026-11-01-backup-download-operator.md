# Default-off recovery download operator

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally.** Branch `codex/backup-download-operator`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`, preserving all earlier unpublished work. This is the next implementation slice identified by the [recovery handoff](2026-11-01-backup-recovery-handoff.md) and [testing authority packet](2026-11-01-backup-testing-authority-packet.md). No source or image publication, remote download/upload, deployment, database operation or credential/permission change is included.

## Result and authority boundary

The existing downloader could verify an encrypted bundle supplied by a caller, but no operating command bound its trusted handoff, storage target, credentials and destination. The new [CLI](../../Core/scripts/download-backup.mjs) and [operator](../../Core/scripts/lib/backup-download-operator.mjs) supply that composition, default-off. They use the existing handoff, receipt, downloader and bounded SDK transport contracts.

`--check` validates local evidence only. `--download` additionally reads a private static credential pair and fetches exactly the three objects for the selected UUID. No primary/provider/database credential, private recovery identity, decryption, restoration, upload, listing, storage deletion, migration or automatic discovery is accepted. Source and destination state remain separate from BobCore memory and project authority.

The plan's handoff fingerprint must come from the independently reviewed capture/custody path. The operator never learns its trusted receipt hash from the object store. A supplied hash, review timestamp, custody reference, account identifier or producer field is an assertion, not proof of its authority. Effective Get-only permissions, account ownership and independent custody still require separate operational acceptance.

## Private plan and exact byte binding

The [input helper](../../Core/scripts/lib/backup-download-input.mjs) requires an explicit enabled version-1 plan with exactly these top-level fields:

| Field | Required contents |
| --- | --- |
| `version`, `enabled` | `1` and `true`; missing/false enablement stops before other input files are read. No enabled plan is shipped. |
| `storage` | Exact reviewed HTTPS endpoint, bucket and region, using the shared existing target validator. No URL credentials, query or fragment. |
| `handoff` | Independently supplied SHA-256 and length of the retained file, expected UUID/instance, and exact producer fields from the handoff contract. |
| `review` | Canonical UTC review time, opaque storage-account identifier and custody-reference identifier. These do not authenticate the named authority. |
| `destination` | Exact existing canonical private output directory. |

Plan, handoff and credential files must be canonical paths outside the repository, owned regular files with exact `0600` mode and one link. The reader uses no-follow/nonblocking opens, bounded raw-byte reads, two content hashes and pre/post inode, pathname and metadata checks. Maximum sizes are 16 KiB for the plan, 4 KiB for the handoff and 20 KiB for credentials. Invalid UTF-8 or malformed JSON is rejected.

The retained handoff includes a final newline in its acknowledged hash. The new reader preserves it: no trimming, reformatting or reconstruction occurs before hash/length comparison. The parsed `{version:1,recovery,producer}` must then match canonical serialization, the expected UUID/instance and the plan's producer. It reuses the [versioned handoff validators](../../Core/scripts/lib/backup-recovery-handoff.mjs).

The destination must be empty, outside the repository, canonical, owned and mode `0700`. Input files cannot be inside it. Preparation binds its device/inode; the operator rechecks it before credentials, before transport creation and at download. Validated values are cloned so later caller mutations cannot retarget the operation. The same-user filesystem boundary remains trusted; pathname checks do not provide atomic protection from a hostile process using the same local account.

Credentials are a separate private JSON object containing only `accessKeyId` and `secretAccessKey`. There is no ambient credential discovery or session-token fallback. The operator uses no credential values during `--check`, and neither inputs nor errors are echoed into diagnostics.

## Get-only transport and execution

The [storage adapter](../../Core/scripts/lib/backup-storage.mjs) adds `createBackupDownloadStorage` without fabricating a capture/database plan. It shares the existing per-operation SDK implementation with capture. Its frozen interface exposes only `get` and `destroy`; all other operations are unavailable. It accepts exactly `objectKeys(instance,id,startedAt)`, binds receipt and manifest lengths to the trusted handoff, and bounds the archive to 100 MiB. Effective server-side permissions remain a separately verified requirement even though this client cannot issue writes.

The existing transport retains static signing, three total attempts within one 60-second operation budget, a deadline spanning headers and error parsing, byte limits on raw error/metadata bodies, complete-body EOF checks, cancellation and client/body cleanup. The operator and CLI impose a four-minute deadline. This includes start and final-output acknowledgements: cancellation races a stalled acknowledgement rather than waiting indefinitely. Losing delivery promises are observed; they cannot trigger new credential or remote work after cancellation.

After local preparation, a small `backup.download_started` record identifies the selected UUID and handoff hash. The downloader fetches and verifies the receipt, archive and encrypted manifest, creates only its three exclusive private output files, closes transport inside its protected cleanup boundary and verifies the files before success. Successful output is `backup.download_verified` with the UUID, archive size and handoff/receipt hashes. Paths, credentials and full producer records are omitted. `backup.download_checked` explicitly reports `networkAccessed:false`; it is not a hosted acceptance result.

On corruption, interrupted transfer or failed finalization, cleanup removes only files whose exclusive creation and inode identity belong to this invocation. Unknown or substituted files are preserved. If file cleanup and transport shutdown both fail, file cleanup uncertainty remains primary and a safe secondary flag records shutdown failure. A simultaneous cancellation cannot mask unconfirmed shutdown.

Once download and shutdown have completed, a lost final output acknowledgement preserves the completed files and original UUID. Do not rerun capture, overwrite the destination or delete those files automatically. A repeated download into the same nonempty directory refuses before a new request. Reconcile the completed files against the independently retained handoff/receipt before using them. This command does not implement an automatic resume or a separate completed-directory verification mode.

## Future operator invocation

These commands describe the reviewed interface for a **separately authorized** operator session. The paths are placeholders; no real files, credentials, endpoint or target were configured or used in this slice.

```sh
node Core/scripts/download-backup.mjs --check \
  --plan-file=/private/operator/reviewed-download-plan.json \
  --handoff-file=/private/operator/reviewed-recovery-handoff.json

node Core/scripts/download-backup.mjs --download \
  --plan-file=/private/operator/reviewed-download-plan.json \
  --handoff-file=/private/operator/reviewed-recovery-handoff.json \
  --credentials-file=/private/operator/get-only-storage-credentials.json
```

Exactly one mode is required. Unknown/positional options and a credentials argument in check mode are refused. The private plan must be enabled explicitly; ordinary command invocation, existing environment variables or the old backup schedule cannot activate it. A passing check does not prove the credential works, permissions are Get-only, the account is correct, objects exist, the ciphertext decrypts or a restored service is usable.

## Validation and independent review

Final full Core validation passed **1,776 tests, zero failures and 123 gated skips**, using the existing cached Node 24.0.0 on the Mac. Type checking, eight owned-child lifecycle checks and all three bootstrap import dry runs passed. The final report is `/private/tmp/bob-download-operator-4oej5c02-vitest.json`. Focused test totals are included in that full result, not additional passes. The tests use real private temporary files, actual CLI check/refusal paths, and the locked SDK's serializers/signing/response handling with an injected in-memory request handler. No socket, live object storage, database or Docker operation is part of this validation.

The synthetic end-to-end case verifies the independent handoff file, fetches exactly the three bound keys, closes transport and verifies ciphertext bytes on disk. It does not create genuine encrypted database artifacts or establish decryption/restoration. Additional cases cover newline-sensitive hashes, wrong identity/provenance, unsafe/replaced inputs and destinations, exact credential scope, check-mode effect exclusion, corrupt objects, cancellation, timeout, finalization failure and lost output acknowledgement.

Independent reviews found and corrected failure-priority and acknowledgement gaps: failed local cleanup must not be hidden by shutdown failure; failed shutdown must not be hidden by cancellation; start/final/argument-error output must observe the cancellation deadline. Regression tests cover each boundary. Targeted independent re-review confirmed the corrections with no remaining actionable findings. A separate documentation review corrected historical gap wording in the current summaries and clarified deadline versus byte-limit claims.

Whitespace/conflict checks, 117 relative links and five anchors passed. The pre-edit 510-file hash baseline confirms exactly 18 scoped paths: seven script/library files, five tests and six documentation files. The other 498 existing files are byte-identical. Source hashes and validation evidence are retained locally under `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-download-operator-4oej5c02/`; this temporary evidence is not independent recovery storage. Packages/lockfile, production schedule and Core/Web guards match HEAD; dormant testing YAML/binding and image inputs match the pre-edit baseline. No runtime database fixture or Linux container qualification was rerun in this slice.

## Next milestone and remaining gates

Further November 1 successor: the [shared restore operation](2026-11-01-backup-restore-operation.md) now qualifies the operating logic and public copied-access quarantine through the local PostgreSQL fixture and pinned Linux tests. The original next-task statements below retain their evidence dates. Hosted transport, authority/custody and independent owner recovery remain open.

November 1 successor: the [local encrypted chain and scoped replay](2026-11-01-backup-recovery-chain.md) now qualify actual capture, retained handoff, this operator/SDK and downloaded-only data restoration on PostgreSQL 17/18. Its new 44-path inventory is replayed and locally tested. The copied-access quarantine requested below remains incomplete: it is inline in the distinct Neon restore command and was not copied into the fixture. Qualifying that existing operating logic is now the next local task. The original milestone below remains dated operator-slice context.

**Exact next task: qualify the complete isolated synthetic capture-to-restore flow using the retained handoff and this operator, then regenerate the scoped publication inventory.** Extend the existing PostgreSQL fixture rather than add a second recovery system. Use actual encrypted capture artifacts, remove originals, download through the new operator, restore the downloaded set, verify v2 contents/constraints/nullability and copied-access quarantine, and preserve failure/nonempty-target checks. Record PostgreSQL/tool/source identities and the selected connection transport. Local fixture success must remain separate from hosted Neon transport and independent owner recovery.

The older [source inventory](2026-11-01-backup-testing-source-inventory.json) is a dated predecessor and no longer describes all successor hashes. The exact composed dormant candidate must be replayed, reviewed and qualified before any publication proposal. Both source holds, disabled/null testing binding, package/lock files, image inputs, production schedule and Core/Web deployment guards remain unchanged.

Hosted source/restore/storage and handoff-custody targets remain unbound. Registry/source publication, credentials/permissions, one hosted synthetic drill, independent current-key/off-device recovery, recurring protection, complete RPO/RTO, client lifecycle and effective Vercel configuration/rollback acceptance remain open. The owner-confirmed offline key exists; no separate recovery destination exists yet. Acer/Jarvis remains deferred. Local operator implementation does not authorize a download, upload, deployment, migration or state write.

BobCore context at `2026-11-01T17:32:59.450Z`, revision `66a5a09f810e626ea625f78b90876ad0eca8545201bf2362acf846cf43110b79`, matched BobAI UUID `10000000-0000-4000-8000-000000000001`, repository and `codex` surface. All five sources were available; events/memories were truncated and `partial:true`, with dated tasks/handoffs. The approved plugin's earlier authenticated reads remain a separate milestone. This outcome remains a pending local checkpoint; no BobCore task/event/handoff was written.
