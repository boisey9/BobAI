# Disabled testing runner and downloaded-bundle recovery

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; no hosted activation.** Branch `codex/backup-testing-runner`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`. Earlier uncommitted adapter, integrity, dashboard, client and recovery work remains preserved and unpublished.

## Objective and verified starting point

Prepare the next testing-first backup step after the [integrity slice](2026-11-01-backup-integrity-evidence.md), reusing the [private-file adapter](2026-11-01-backup-workflow-adapter.md). Keep Production, the scheduled workflow, Vercel guards and access settings unchanged. The approved ChatGPT connection is a separate milestone; this work grants no new access and performs no project-state synchronization.

The existing [production backup workflow](../../.github/workflows/backups.yml) still has its obsolete environment-only invocation, a moving PostgreSQL image and package installation. It is preserved. Switching its legacy variable on is not a supported activation path for the current exporter.

There is no reviewed portable image containing the required Node/npm, PostgreSQL and age tools. The cached PostgreSQL image used by local tests is an image ID, not a verified registry digest for a complete hosted runner. This slice implements **immutable-binding checks and dormant workflow wiring**, not an already built or accepted pinned toolchain. Its committed binding deliberately remains disabled and null.

The previous integrated database test uploaded real encrypted objects to an in-memory Map, but restored from the original capture files. That did not establish download-to-restore continuity. This slice removes those originals and restores only independently downloaded copies.

## Dormant workflow and authority boundary

The new [testing workflow](../../.github/workflows/backups-testing.yml) has only `workflow_dispatch` and two source-level `false` job conditions. No push, pull-request, reusable-workflow or schedule trigger is added. Changing a repository variable alone cannot enable it. Its `contents: read` token declaration is local candidate configuration; no repository permission or protection setting changed.

Preparation uses a fresh GitHub-hosted `ubuntu-24.04` VM, a full-commit-pinned checkout and no backup secrets. Checkout uses the triggering SHA and does not persist credentials. The [guard](../../Core/scripts/lib/backup-testing-runner.mjs) requires the exact BobAI repository, manual event, main ref, workflow path, Linux/x64 hosted runner and an explicitly approved source SHA matching `GITHUB_SHA`. Both jobs must see the same reviewed repository variables; do not place the approval SHA solely in the capture environment, where the preparation job cannot read it.

The nonsecret [binding](../../Core/scripts/backup-testing-binding.json) is checked before selecting a container image. Its current `enabled: false` refuses immediately. An eventual approved binding must contain:

| Binding | Required content and check |
| --- | --- |
| `runner` | `ghcr.io/boisey9/bob-backup-runner@sha256:<64 hex>`; exact Node24, npm, PostgreSQL dump and age versions; Core lockfile SHA-256. Zero/mutable/unbound pins refuse. The reviewed image must be anonymously pullable or require a separately reviewed access design. |
| `plan` | Complete existing enabled job/capture plan; `testing` environment; a synthetic BobAI project UUID different from Production; `testing-` instance prefix; exact source host/database/role/schema/project, separate ledger role, public recipient and storage endpoint/bucket/region. Retention must remain false. |
| `review` | Dated Neon project/branch and storage-account identifiers, plus a distinct restore host/database with the same PostgreSQL major. These are review records, not authenticated evidence by themselves. |

The second job selects only the validated digest image, checks the lockfile and exact installed tools, then performs locked dependency installation with lifecycle scripts disabled. Backup secrets are absent from preparation and dependency installation. A private `mktemp` directory, canonicalized under the runner's temporary area, belongs to the container user; it is passed through `BOB_BACKUP_TESTING_TEMP` into the existing adapter's `RUNNER_TEMP` validation. This avoids assuming that GitHub's original temp-directory owner matches the container UID.

Only the final execution step receives four **testing-specific** secrets: capture URL, ledger URL and the existing static storage pair. The plan comes from the committed reviewed binding, not an overridable secret JSON field. The [entry point](../../Core/scripts/run-backup-testing.mjs) repeats context, binding, lock and tool checks before invoking the existing adapter. No private age identity, provider/Core credential, inherited execution override or session-storage token is accepted into the exporter environment. The adapter retains its own strict target, role, file, process and cleanup checks. The image must supply `/usr/bin/pg_dump`, `/usr/local/bin/age`, `/usr/local/bin/npm`, Node24 and the basic shell/temp tools; image construction and actual UID/path acceptance remain unperformed.

Cancellation now prevents a successful preparation result, including cancellation during a tool probe or output append. The image output may already have been written if cancellation occurs during that append, but the job fails and capture requires successful preparation. Process-group supervision and ambiguous-run reconciliation remain owned by the existing adapter.

GitHub describes each standard hosted job as a [fresh VM](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/use-github-hosted-runners). Its managed host image still changes; `ubuntu-24.04` is not an immutable host snapshot. The proposed application toolchain is separately digest-bound. The workflow uses the existing repository's [verified checkout commit](https://raw.githubusercontent.com/actions/checkout/11d5960a326750d5838078e36cf38b85af677262/action.yml); current dependency/security review remains required before activation. The no-secret bootstrap uses the hosted VM's Node. No claim of a fully reproducible host or physical secure erasure is made.

There is no cache, CI artifact upload, retention, restore job, private key transfer or automatic retry. Catchable cleanup removes owned adapter/exporter inputs; the empty parent and any uncatchable residuals require disposal of the ephemeral runner. A reusable/self-hosted runner is refused. No hosted image, workflow, environment or secret was created by this task.

## Independent download contract

The new [download helper](../../Core/scripts/lib/backup-download.mjs) defaults to disabled and accepts an injected `storage.get(key, exactBytes)` interface. It constructs no client and has no CLI, credential discovery, listing, storage deletion, ledger write or decryption behavior.

Before transport it requires a canonical, owned, empty `0700` destination outside the checkout and these independently retained anchors: run UUID, instance, timestamp, recipient fingerprint, exact receipt SHA-256/byte count and encrypted-manifest byte count. The manifest length is required separately because receipt v2 stores its hash but not its size. The caller must preserve these values through an approved custody path; downloading a receipt and trusting its self-asserted identity is insufficient. An unsigned receipt and hashes do not independently authenticate its producer.

The helper derives exactly three keys, fetches and validates the anchored v2 receipt, then checks the exact archive and encrypted-manifest sizes/hashes. Legacy v1 is refused. Files have fixed names, exclusive no-follow creation and `0600` mode; their created inodes are recorded before writing. Final local verification rechecks identity, ownership, permissions, links, sizes and hashes. Nonblocking read-open rejects a substituted FIFO without waiting for a writer.

Failure removes only observed files created by that invocation. Foreign files, replacement inodes and the caller's directory are preserved; uncertain cleanup is a failure. These pathname operations are not an atomic defense against a hostile process using the same OS identity. The destination requires exclusive control on a trusted ephemeral machine. No deletion of ciphertext guarantees removal from backups or storage media.

`storage.get` must bound streaming before returning its buffer. This helper checks returned bytes but adds no transport timeout. The current inline AWS SDK adapter's request/body lifecycle still needs direct serialization, timeout, stalled-body and cancellation acceptance; the `send()` timeout alone is not recorded as proof of an end-to-end body deadline. Hosted TLS, account ownership, prefix permissions, expiry and revocation remain untested here.

## Validation and independent review

Final checks pass under Node24:

| Check | Result |
| --- | --- |
| Full Core suite | **1,240 passed, zero failed, 123 gated skips**, two workers and a 30-second test-only allowance. Report: `/private/tmp/bob-testing-runner-4i1vkv3s-vitest.json`. |
| New runner/download suites | **58 runner + 49 download tests**, included in the full run. |
| Actual PostgreSQL 17.11 | **17 passed, zero skipped**, final-source receipt `/private/tmp/bob-backup-coverage-run-nF3fIN/`. |
| Actual PostgreSQL 18.6 | **17 passed, zero skipped**, `/private/tmp/bob-backup-coverage-run-AvXJNH/`; exact cached image `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66`. |
| Other required checks | Core typecheck, eight owned-child lifecycle tests and three import dry runs pass. Script syntax, JSON/YAML and embedded-shell syntax, 93 relative links/anchors, whitespace and all 14 scoped paths pass; the eight source/configuration/test hashes still match after testing. |

The 17 database cases remain skipped by default in the full suite and were separately executed on both majors; the other 106 hosted/database gates were not enabled. New tests cover default-off/no-effects behavior, wrong workflow/ref/source/runner identity, unbound pins, production/retention refusal, lock/tool mismatches, cancellation and secret selection. Download tests cover trust anchors, exact key/size/hash binding, wrong identities and legacy formats, unsafe destinations, partial writes, cleanup ownership and FIFO substitution.

The real PostgreSQL fixture retains 17 cases per major. Its final case captures/encrypts real synthetic data, transfers the exact three objects through a local in-memory Map, retains trusted producer anchors and deletes all original bundle files. It rejects corrupt transport, downloads into a separate private directory, then uses those downloaded files for actual age decryption, PostgreSQL restoration, counts/content/constraints/nullability verification and nonempty-destination refusal. Download directories live under the fixture's existing cleanup-owned directory. The transport is deliberately in memory: this is local artifact-path acceptance, not real S3 or off-device recovery.

Independent source/security and documentation reviews have no remaining actionable findings. Review found and corrected cancelled-preflight success, blocking verification of a substituted FIFO and initially incomplete fixture cleanup. No production validation rule was relaxed. Reviewers inspected code and evidence boundaries; the parent ran the tests.

Fixture cleanup confirms owned clusters stopped, sockets and synthetic archive/key directories removed, and the Docker fixture container removed. The unrelated RFQ container stayed created/unstarted. Docker Desktop was initially stopped, was started only for the owned fixture, then its stop command completed successfully and its local socket disappeared. An initial sandboxed Desktop-status check could not retrieve status; it was not used as proof of cleanup.

The eight source/configuration/test paths are the new workflow, disabled binding, testing entry point/guard, download helper, their two unit suites and the existing PostgreSQL fixture. The change record, implementation index, recovery/release runbooks and two dated predecessor notes are the six documentation paths. Source hashes are retained at `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-testing-runner-4i1vkv3s/source-manifest.json`. Earlier dirty source, dashboard and client files are unchanged by this slice.

## Remaining gates and exact next task

Same-day successor: the [bounded storage transport](2026-11-01-backup-storage-transport.md) now implements the local SDK/deadline task below, with independent review and final local validation passing (1,357 Core tests, 123 gated skips; typecheck, lifecycle and import checks). The earlier transport limitation describes this record's original boundary. Image provenance/qualification, exact testing bindings and real hosted authority/transport remain open; neither workflow is enabled.

**Exact next local implementation task:** extract and independently test the existing AWS SDK storage transport with an injected SDK request handler, preserving its interface, then establish a bounded cancellation/deadline contract covering complete response-body consumption. Test exact bucket/key/body serialization, size/header mismatch, corruption, denied/interrupted/stalled responses and cleanup without opening sockets or using real credentials. Keep the workflow disabled. This closes a concrete pre-activation transport gap; it does not authorize an upload.

Before any hosted testing activation, separately review/build the immutable toolchain and its provenance, bind an owner-approved isolated synthetic source/restore/storage environment, verify capture/ledger/storage authority, and approve the exact published SHA/environment. Synthetic database identities and permission labels do not prove these external boundaries. Scope the storage principal to the approved testing prefix, without list/delete authority initially; test sibling-prefix denial and revocation under explicit authorization. Real download/restore should use an independent approved recovery path, with the owner's private identity kept outside CI.

Release still requires off-device recovery using the independent current key copy, recurring protection and failure reporting, full hosted RPO/RTO, canonical owner/client lifecycle acceptance, exact Core/Web effective configuration and rollback parity, and an authorized reviewed publication/deployment. The owner has confirmed a current offline key copy exists but has no separate recovery destination yet. Neither this runner nor the already installed ChatGPT plugin closes those gates. Acer/Jarvis remains deferred.

No push, PR, merge, deployment, migration, live credential/permission change, real artifact upload, Production mutation or BobCore state write occurred. The existing production workflow and Core/Web Vercel guards retain their prior bytes.

## Pending local checkpoint

Fresh Codex context at `2026-11-01T15:42:52.346Z`, revision `66a5a09f810e626ea625f78b90876ad0eca8545201bf2362acf846cf43110b79`, matches BobAI UUID `10000000-0000-4000-8000-000000000001`, repository and surface. All five sources are available; events/memories are truncated, `partial=true`, task records date September9 and the handoff October23. The November1 OAuth grant audit event is present. Older task descriptions do not establish current operational readiness.

A fresh installed-plugin read at `2026-11-01T16:00:15.059Z`, revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`, also returns the same BobAI UUID/repository with its correct **chatgpt** binding and all five sources available. It remains partial with dated records. This corroborates the earlier approved connection's context-read operation; it is not Codex OAuth acceptance, write/retry/readback or refresh/revocation acceptance. No new grant or permission change occurred.

Outcome and validation stay local under the owner's restriction. Future synchronization requires fresh project/environment/scope checks, retained operation IDs, current task versions, write receipts and relevant readback. No synchronization is claimed.
