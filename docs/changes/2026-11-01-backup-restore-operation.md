# Shared restore operation and copied-access quarantine

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, validated and independently reviewed locally; unpublished and inactive.** Branch `codex/backup-restore-operation`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`, preserves all earlier unpublished work. This closes the local operating-logic gap identified by the [encrypted recovery chain](2026-11-01-backup-recovery-chain.md). No hosted destination, grant, credential, schedule, image publication or deployment is activated.

## Shared behavior and corrected risks

The [existing CLI](../../Core/scripts/restore-database.mjs) is now a thin wrapper over [one restore operation](../../Core/scripts/lib/backup-restore-operation.mjs), also used by the real PostgreSQL fixture. Database and command adapters are injected only through the programmatic test boundary. The shipped CLI retains its Neon connection and existing flags/tool-path settings; no argument or environment variable selects a synthetic transport.

Review identified and corrected these material problems:

- **Destination divergence:** the locked Neon URL parser could accept a query `host` override while libpq used the URL hostname. The operation now validates and normalizes one destination for both paths, rejecting unexpected/duplicate parameters and connection-info injection through an encoded database name. It checks database, current role, session role and supported PostgreSQL major before restore and before quarantine. This is connection consistency, not independent hosted branch authorization.
- **Partial quarantine:** the old command committed ledger correction and individual revocations separately. Full restored-data verification now precedes one transaction containing quarantine, ledger correction and postcondition readback. A failure rolls back that transaction. The earlier `pg_restore` transaction remains a separate committed operation: failure does not imply that the destination is empty or safe to expose.
- **Incomplete OAuth handling:** both OAuth clients and resource registrations are disabled. Existing project credential paths, grants, tokens, consent, sessions and verification challenges are removed or revoked, with all-row readback and `row_security=off` so filtering causes refusal rather than a false zero-row result.
- **Premature completion:** success is returned only after connection and private temporary-file cleanup. Both cleanup operations are attempted independently. A COMMIT whose acknowledgement is lost remains explicitly uncertain even if a later rollback returns successfully. No automatic restore retry, target deletion or overwrite occurs.
- **Child and output lifecycle:** cancellation reaches the owned tool process group. Close and group disappearance must be confirmed before plaintext cleanup. Forced residual-descendant termination reports failure. Unconfirmed shutdown preserves the private recovery directory and reports its generated path. Terminal output acknowledgement observes cancellation, including the fallback diagnostic; a lost acknowledgement never repeats restoration.

Private inputs are canonical regular files; key and destination files must be owned, single-link, outside the repository with owner read/write and no group/other permission bits (`(mode & 0o777) === 0o600`). Ciphertext is bounded, checked against the receipt and staged into an owned `0700` directory before decryption, binding it to the bytes already verified. The operation does not protect against a hostile process with the same OS identity. It never changes the input credential files or logs their contents.

The destination profile accepts ASCII database/role identifiers matching `[A-Za-z_][A-Za-z0-9_-]{0,62}`, ordinary ASCII DNS names and canonical IPv4. DNS is lowercased before both connection paths and the pooler check. Encoded hosts, IPv6, trailing-dot aliases and numeric shorthand are refused. Only supported `sslmode`/`channel_binding` parameters are accepted; TLS normalizes to `verify-full`. These are intentional operating-profile restrictions, not a claim that all PostgreSQL connection-string forms are supported. Existing CLI flag names remain unchanged, but formerly accepted noncanonical/private-file or ambiguous connection inputs can now refuse.

## Quarantine scope and failure semantics

| State | Handling |
| --- | --- |
| Project interface credentials and legacy read hashes | Remove only `metadata.auth.interfaceCredentials` and `metadata.auth.readCredentialHashes`; retain other metadata. |
| OAuth grants | Fill absent revocation timestamps; preserve existing timestamps. |
| OAuth clients and resource registrations | Set `disabled=true`, including previously null values. |
| OAuth access/refresh tokens, consent, owner sessions and verification challenges | Clear the existing five tables in dependency-safe order. |
| Current backup ledger row | Correct a matching legacy running row and verify run/instance/keys/hash/size/status. A genuinely absent post-capture row remains absent; unrelated history is preserved. |
| Owner identity, account/password and passkey records | Preserve for separately authorized owner recovery. No claim that every primary credential is revoked. |
| Optional governed/private authority | Refuse known `bob_workflow`, `bob_owner_delegation` and `bob_private_checks` schemas, including domain-only manifest evidence, before restore; check the destination defensively too. Their separate recovery semantics are not implemented here. |

Failure records contain a bounded code and phase, a validated backup ID when available, and explicit `destinationMayContainRestoredData`, `commitUncertain` and `cleanupUncertain` flags. A retained generated temporary path identifies files requiring owner reconciliation. Database errors, URLs, keys, raw rows and tool stderr are excluded. A failed quarantine can leave the original copied credentials in the restored destination because the whole quarantine transaction rolls back; keep that destination isolated. An uncertain commit or lost output acknowledgement requires readback, not another run into a nonempty database. A later authorized recovery attempt must select a separately verified empty destination.

## Local acceptance

The existing [17-case PostgreSQL suite](../../Core/tests/backup-coverage-postgres.test.mjs) now uses the same operation as the CLI. Its final encrypted-chain case contains **36 synthetic tables**, including 11 representative owner/OAuth tables with the relevant types and dependency relationships. It reuses the existing OAuth fixture helper. No migration file is executed. A deliberately seeded legacy running-ledger row exercises correction; the fixture removes that source row after export so the current job can still register its run after capture normally.

The first four restores consume the downloaded first bundle after its original artifacts are deleted, using the retained handoff and actual Get-only operator. Actual age and `pg_restore` run through the fixture's existing owned connection. These restores exercise integrity failure, mid-quarantine failure, applied COMMIT with lost acknowledgement, and successful legacy-ledger recovery. A fifth restore separately consumes fresh local ciphertext from a second genuine encrypted capture directly; it does not exercise a second handoff/download chain. It uses the current post-capture registration convention: its current run is absent from the archive, while the prior run remains preserved. This second capture also includes the table created after the first snapshot, bringing its inventory to 37 tables. Assertions check rollback of all quarantine/ledger changes, current-run readback, copied-access revocation, unchanged business and retained owner records, refusal of nonempty retries and cleanup. Both the legacy running-row and current absent-row ledger branches therefore receive actual PostgreSQL acceptance. This is representative public-auth SQL acceptance, not full owner login, live OAuth lifecycle or complete hosted schema acceptance.

| Validation | Result |
| --- | --- |
| Operation refusal/order/failure tests | **89 passed** on host Node 24. |
| Real owned-process lifecycle | **10 passed**, including timeout, cancellation, descendants and signal-probe uncertainty. |
| Pinned Linux restore suites | **99 passed, zero failed/skipped**, included in the final complete backup-suite run below. |
| Final PostgreSQL 17 replay | **17 passed, zero failed/skipped**; `/private/tmp/bob-backup-coverage-run-oiVpdw/`, 30.500-second test interval. |
| Final PostgreSQL 18 replay | **17 passed, zero failed/skipped**; `/private/tmp/bob-backup-coverage-run-9gS6J9/`, 170.572-second test interval. |
| Final complete Core replay | **1,832 passed, zero failed, 123 gated skips**, plus types, eight lifecycle checks and three import dry runs. |
| Complete backup suites in pinned Linux image | **1,045 passed, zero failed, 18 skips**: 17 database cases run separately above; one non-root filesystem-denial case is skipped under container UID 0 and passes on the host. |
| Supporting checks and scope | Whitespace/diff checks pass; 153 local links and five anchors resolve. Exactly 14 paths changed in this slice, with 509 recorded files preserved and no deletions. All 47 selected hashes match the working source, isolated replay and Linux overlay; final evidence is recorded in `validation.json`. |

The first native run exposed missing UUID casts in the test-only `psql` bridge; the normal driver infers these wire parameter types. The bridge correction preserves production SQL. Two full replays hit the existing Vercel-entrypoint test's five-second deadline while database/Docker fixtures ran concurrently: respectively 1,827 and 1,831 tests passed with one failure in each run. Both diagnostic reports are retained. The final run uses two Vitest workers after the database runs finish and Docker stops; the entrypoint test, application source and timeout remain unchanged.

The new [47-path inventory](2026-11-01-backup-restore-source-inventory.json) retains the prior 44-path inventory as dated evidence and adds the operation and two focused test files. Exact selected source is replayed over the immutable baseline, with unrelated dashboard/client work excluded. Existing Core/Web dependencies are reused through symlinks; package and lockfile bytes remain unchanged. This is not a fresh dependency installation. The inventory is a runtime/test/toolchain patch manifest, not a complete proposed commit or publication approval.

Linux qualification uses the existing disposable test image `sha256:0ae697d7d029a1b58fda388bb4a291b1a806b9263095dc632b5d420baed6d73f`, based on the previously qualified toolchain. It verifies actual cached dependency hashes, overlays the selected source, and runs with init, no network, a read-only root, private executable tmpfs, no host mounts or published ports. The final complete backup-suite run includes all 99 current restore-operation/process tests. This qualifies the selected backup source on that Linux test toolchain; it does not execute the hosted workflow or publish an image. The disposable test image is excluded from publication. PostgreSQL 18 uses the separate cached database image `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66`. No image or tool was installed or pulled.

Final cleanup readback confirms both synthetic PostgreSQL clusters stopped, their archive/key/private operation directories and sockets removed, and both owned Docker containers removed. Native synthetic database diagnostic files remain in the owned temporary fixture directory. The unrelated pre-existing container remains created and unstarted with its identity, mounts and network unchanged. Docker is restored to its initial stopped state with its socket absent.

Evidence is retained under `/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-restore-operation-3qt7kopy/`, including the pre-edit 518-file baseline, immutable replay, diagnostics, source/isolation checks and final validation receipt. These local temporary records are not independent recovery custody, and synthetic test durations are not service RPO/RTO.

## Next task and remaining operational gates

**Next: finalize the dormant publication and hosted-testing approval packet for this exact candidate.** Review its supporting documentation and actual publication branch's deployment guards, then bind the source and toolchain identities proposed for approval. Keep source/image publication, testing-only provisioning, effective-authority tests, independent handoff custody and one hosted synthetic drill as explicit separate actions. No approval is inferred from local qualification. The [authority packet](2026-11-01-backup-testing-authority-packet.md) records the destination/custody choices still unbound.

The actual Neon WebSocket/libpq combination must still be tested against an independently authorized isolated hosted destination. This fixture changes only the injected transport; it does not verify remote TLS, effective IAM, branch ownership, real object storage or hosted workflow operation. Optional authority-schema recovery remains unsupported. Windows execution is not accepted by the owned-process runner.

Production still requires an off-device restoration with the independently held current key, recurring protection, owner-access recovery and measured full-service RPO/RTO. The owner has confirmed the current key copy but has no separate recovery destination. The October 31 Production snapshot remains dated; no new Production capture or transfer occurred. Existing plugin installation/read acceptance is separate from pending two-way write/retry/readback/refresh/revocation acceptance. Vercel release/rollback parity remains open, and Acer/Jarvis is deferred.

BobCore retrieval at `2026-11-01T18:02:10.982Z`, revision `ba34954ebe811da43d14a1c9201a893a5cfbf591e25a55f3cc92aa12d919dd32`, matched BobAI UUID `10000000-0000-4000-8000-000000000001`, repository and Codex surface. All five sources were available; events/memories were truncated and `partial:true`; task and handoff records remain older. This outcome is a **pending local checkpoint**. No BobCore state was written.

No push, PR, merge, upload, real object-store download, hosted database action, deployment, migration, existing credential/permission change or activation occurred. Testing holds/binding, Production schedule, image inputs and Core/Web deployment configuration remain unchanged. Existing `main` deployment guards remain disabled; future branch publication requires its own reviewed guard behavior.
