# Local immutable backup runner candidate

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **built, locally validated and independently reviewed; no publication or operational activation.** Branch `codex/backup-runner-image`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`. Prior unpublished backup, dashboard, client and recovery work is preserved. This follows the [bounded storage transport slice](2026-11-01-backup-storage-transport.md).

## Scope and implementation

The [Dockerfile](../../Core/containers/backup-runner/Dockerfile), [input manifest](../../Core/containers/backup-runner/toolchain.json) and [local procedure](../../Core/containers/backup-runner/README.md) define a Linux/amd64 backup toolchain. The image contains no BobAI source, application dependencies, database URLs, storage credentials or recovery identity. It is not published or selected by the disabled testing workflow.

The final stage starts from scratch and copies the complete pinned PostgreSQL Bookworm filesystem. This retains compatible PostgreSQL libraries and distribution wrappers while discarding the source image's volume, exposed port, service entrypoint/command and environment metadata. Server binaries and unused packages remain present; this is not a minimal client-only distribution or a vulnerability-clearance claim. It copies Node/npm and license material from the matching pinned full Node Bookworm image, plus age/age-keygen and their license from the checksum-verified official archive. No package manager runs in the toolchain recipe.

The first build correctly failed its CA-file check: both the PostgreSQL image and Node slim image lacked `/etc/ssl/certs/ca-certificates.crt`. The final recipe uses the full Node input and copies its public CA bundle and copyright notice. The bundle is pinned and separately inventoried; it is not an installed or automatically updated `ca-certificates` package in the final root filesystem. Presence and parsing are locally accepted; remote TLS validation and ongoing CA updates remain separate requirements.

The runtime user is explicitly `0:0`, because hosted checkout and runner mounts must be writable by the chosen job user. This does not establish non-root operation or hosted mount compatibility. The default command prints the Node version; the image has no service entrypoint, declared volume or exposed port. The stricter local qualifier drops capabilities and uses a read-only root, network isolation and only a bounded application `/tmp` tmpfs. Its isolation is distinct from a future GitHub job container's mounts and privileges.

The new [local-only CLI](../../Core/scripts/qualify-backup-runner-image.mjs) accepts an exact cached image ID and an explicitly selected canonical local Unix socket. Its [controller](../../Core/scripts/lib/backup-runner-image.mjs) validates the fixed manifest's qualification section, sanitizes the Docker environment, creates a private empty Docker configuration and refuses unsafe image metadata before creating a container. It preselects a unique name/label, inspects exact identity and isolation before execution, streams a self-contained program through stdin, checks the exited state and removes only its owned container. After uncertain creation it checks currently observable state by exact name, ID, image and ownership label. A delayed create or disconnected daemon can leave unknown state beyond that lookup; failed or uncertain runs require later reconciliation, not an exhaustive-cleanup claim. Cancellation does not skip cleanup; unknown removal or host loss must not be described as successful cleanup. No checkout, Docker socket or host directory is mounted.

The program verifies exact tool paths/versions, UID/GID, the CA bundle, shell `mktemp`/`realpath`, owned canonical `0700` directories, exclusive `0600` files, a disposable age identity, encryption/decryption equality, corruption rejection and temporary-file removal. It never emits the private identity or plaintext. CLI time/output and termination are bounded. Tests cover refusal paths, isolation/ownership mismatches, lost create responses, cancellation and safe errors. The qualifier does not call the backup adapter or any hosted endpoint.

## Provenance and identities

| Input | Verified pin |
| --- | --- |
| PostgreSQL `18.6-bookworm`, Linux/amd64 | `docker.io/library/postgres@sha256:41a369edc91d9bdd7a58be6bc71ea0f8f7a3f49e82818a9f0829021ea7840b7c` |
| Node `24.22.2-bookworm`, Linux/amd64 | `docker.io/library/node@sha256:8544b46b91d1a8c8bf8fc0d53ae9f276ed07d0ffa9098dc4a9c2f627363a13a0` |
| age `v1.3.2`, Linux/amd64 archive | SHA-256 `cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10`, 19,405,817 bytes |
| Existing Core lockfile | SHA-256 `e9555fcdcd3f761a7db798768f5e80bd9a4dd4d0a67e5dc8369853609102f2a4`; unchanged and not included in the toolchain image |
| Built local image | `sha256:29fc124322ec343fa443f6729cfdd927c858936aa5e719f635bc597528596216` |

The manifest also records each input's index and configuration digests. Anonymous public registry reads verified manifest/configuration bytes against their SHA-256 digests, and pulls returned the pinned platform digests. The age checksum matched the [official GitHub release metadata](https://api.github.com/repos/FiloSottile/age/releases/tags/v1.3.2). Publisher/Sigsum proof verification was not performed; the manifest retains `publisherProofVerified: false`. This is not an independent publisher-signature or bit-for-bit reproducible-build assertion.

Docker's local image ID, OCI configuration digest and registry manifest digest remain separate evidence. The local containerd image store can report a manifest-based local ID. A future GHCR reference must be obtained from separately authorized publication and readback; the local ID must not be substituted into the workflow's GHCR binding.

The build used an outside-repository, private context containing exactly the Dockerfile, `.dockerignore` and public age archive. The ignore file admits only those inputs. Build `RUN` steps used `--network=none`; public base acquisition happened separately with an empty Docker configuration and explicit local socket. No host tool was installed. Source/context hashes, build log, input registry records, image metadata, Debian package inventory, Node library resolution, executable/CA hashes and the qualification receipt are retained under `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-runner-image-jalpo3sc/`. This temporary evidence directory is not independent disaster-recovery storage. A [durable local qualification record](../../Core/containers/backup-runner/local-qualification.json) retains nonsecret receipt, source/context hashes, executable/CA hashes, package inventory and validation limits.

## Validation and review

| Check | Result |
| --- | --- |
| Exact image toolchain / synthetic encryption | Passed: Node `v24.22.2`, npm `11.19.1`, `pg_dump (PostgreSQL) 18.6 (Debian 18.6-1.pgdg12+2)`, age/age-keygen `v1.3.2`; UID/GID `0:0`; CA, private files, round trip, corrupted ciphertext refusal and owned cleanup. |
| New qualifier tests | 73 passed with mocked Docker. These are included in the full Core result; they do not substitute for the actual image check above. |
| Full Core suite on the Mac under Node24 | **1,430 passed, zero failed, 123 gated skips**. Report `/private/tmp/bob-runner-image-jalpo3sc-vitest.json`. |
| Repository checks | Core typecheck, eight owned-child lifecycle checks and all three import dry runs passed. |
| Linux dependency / process qualification | Locked `npm ci --ignore-scripts` installed 109 packages. Without init: 598 passed, two orphan-process tests failed, 18 gated skips. With init: all 42 supervisor tests passed, then the final complete backup suite passed **600 tests, zero failures, 18 gated skips**, including the corrected workflow source. |
| Final focused checks / independent review | **131 qualifier/runner tests passed** after the init correction. Image, controller, tests and the final two-file workflow correction independently reviewed with no actionable findings. Documentation wording corrected to distinguish observable reconciliation from unknown daemon state. |

The full Core run preceded the final YAML init option and its source assertion; the final 131 focused checks and 600-case Linux run cover that correction. No application or supervisor runtime behavior was changed. All owned containers were removed, the unrelated RFQ container remained `Created`, and Docker Desktop was returned to its original stopped state with the local socket absent. Whitespace, 96 relative links, nine retained source hashes and the 15-path slice were checked; all earlier source/configuration outside the two intended workflow/test updates remains preserved.

The cached older PostgreSQL image was confirmed to use Alpine/musl; it was not mixed with the Debian Node binary. Current Debian image acceptance is separate from the earlier PostgreSQL17/18 backup/restore fixture evidence. The toolchain qualifier does not start a PostgreSQL server or perform a new Production backup. An additional test image containing an explicit source allowlist and clean Linux dependencies is a disposable qualification artifact, not the proposed published toolchain.

The Linux run reproduced the review concern: the backup supervisor requires complete process-group disappearance, but the bare `tail` PID1 left orphaned grandchildren visible. Exactly two supervisor cases failed with `exporter_shutdown_failed`; all other 598 cases passed. The same image with Docker's existing init process passed all 42 supervisor cases. The local testing workflow now explicitly requests `container.options: --init`, and its source-contract test guards that requirement. Both literal activation holds remain false. This uses GitHub's supported [additional Docker options](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idcontaineroptions); actual hosted execution is still unaccepted. The standalone toolchain qualifier remains unchanged and deliberately does not claim process-lifecycle acceptance.

The separate Linux application tests use an executable private tmpfs because native test modules must load from it; this differs from the standalone qualifier's `noexec` tmpfs. No dependency or lockfile was changed. An initial Docker daemon interruption occurred before suite execution. After restart, its exited container (`OOMKilled=false`, exit137) and the earlier failed-build container were reconciled and removed by exact identity. The cause was not established; no unattended-run reliability claim follows from the subsequent successful tests.

## Remaining acceptance and next action

Successor: the [local testing authority/publication packet](2026-11-01-backup-testing-authority-packet.md) now prepares the next task described below. Its independent contract review identifies a missing producer-to-recovery anchor handoff and download operator; these must be completed before hosted testing. No active synthetic destination, published image digest or activation SHA has been bound. The original image-slice acceptance remains unchanged.

Both literal workflow `false` holds and `backup-testing-binding.json` remain unchanged, disabled and unbound; the only workflow adjustment is the explicit init option described above. Package/lock files, production schedule, Core/Web deployment guards, migrations and application runtime remain unchanged by this image slice. No image publication, source push/PR/merge, real storage upload, database operation, Production mutation, credential/grant/permission change, deployment or BobCore state write is part of this work.

**Exact next task: prepare the owner-reviewed testing binding and publication packet for this qualified candidate.** Identify the synthetic testing source, distinct restore destination, storage account/bucket/prefix, capture/ledger authorities and approved source SHA, and specify the registry publication/readback acceptance. Keep source holds false and do not publish or configure credentials without explicit authorization. Before hosted testing, separately approved publication must produce the actual GHCR digest; local qualification cannot fill it in. Local source labels do not prove external ownership. Initial testing must retain disabled retention and use synthetic content. Hosted acceptance must cover checkout/temp ownership, TLS, role denials, exact account/bucket/prefix, upload/readback/download, same-bundle restoration and revocation.

Release remains gated by independent current-key/off-device restoration, recurring backup/failure reporting, complete hosted RPO/RTO, owner/client lifecycle acceptance and effective release/rollback configuration. The owner confirms a current offline key copy but has no separate recovery destination. The installed ChatGPT plugin and successful context reads remain separate accepted milestones; they do not establish backup or Vercel release readiness. Acer/Jarvis remains deferred.

## Pending local checkpoint

Fresh BobCore context at `2026-11-01T16:28:13.107Z`, revision `66a5a09f810e626ea625f78b90876ad0eca8545201bf2362acf846cf43110b79`, returned BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI` and surface `codex`. All five sources were available; events/memories were truncated and `partial=true`. Tasks remain dated September9 and the handoff October23. This does not infer current implementation or permission state from older records.

The approved ChatGPT-bound plugin also passed a fresh read-only check at `2026-11-01T17:01:06.363Z`, revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`, with the same BobAI UUID/repository and surface `chatgpt`. All five sources were available and the bounded context remained partial with dated records. This confirms the exposed plugin read path; it does not establish writes, refresh/revocation lifecycle or a Codex-bound OAuth grant.

The local image/source/validation checkpoint remains unsynchronized. Later authorized writes require fresh binding/scope/version verification, retained operation IDs, receipts and relevant readback. No runtime milestone or authoritative synchronization is claimed from local tests.
