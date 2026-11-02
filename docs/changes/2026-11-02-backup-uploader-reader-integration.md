# Disabled uploader and reader integration packet

Date: 2026-11-02 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **reviewable design packet; uploader/reader integration is not installed or activated**. The owner requested publication of the latest reviewed work to GitHub main and a Vercel release. Those application/source operations are separate from backup activation. This packet introduces no upload action into an executable workflow, no reader CLI, no transport credential, no destination, no schedule and no database operation.

The [artifact custody verifier](2026-11-01-backup-artifact-custody-verifier.md) was rereviewed against its retained 17-path validation receipt with no hash mismatch or actionable finding. The [encryption implementation](2026-11-01-backup-custody-encryption.md), existing private download plan and shared restore operation remain the integration foundation. Both literal `false` job holds in [the testing workflow](../../.github/workflows/backups-testing.yml) and the [disabled/null binding](../../Core/scripts/backup-testing-binding.json) stay unchanged.

## Action selection and verified source

The proposed uploader is **`actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9`**, corresponding to **v7.0.2**. Read-only official GitHub API retrieval on November 2 verified that both `refs/tags/v7.0.2` and the then-current `v7` tag point to that commit; the latest release record was published October 7, 2026. The integration must use the immutable SHA, never the moving major tag. [Release record](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).

The pinned [action contract](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/action.yml) uses Node 24. Its lockfile resolves `@actions/artifact` 6.3.1, `archiver` 7.0.1, `zip-stream` 6.0.1 and `compress-commons` 6.0.2. The bundled upload path builds a ZIP through `archiver.create('zip', ...)` with the requested zlib level, and does not force ZIP64. This source inspection supports the proposed small one-file profile; it is not a successful archive compatibility test or a complete dependency security audit. [Pinned lockfile](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/package-lock.json), [executed bundle](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/dist/upload/index.js).

Two reviewed details matter to BobCore:

- `archive: false` would use the filename as artifact name and bypass the ZIP envelope. This design requires explicit `archive: true` to preserve the run/attempt artifact name and current reader contract.
- The action's file search follows symbolic links. Its glob is not BobCore's private-file security boundary. The future bridge must admit exactly the previously verified regular ciphertext file, then recheck canonical path, owner, mode, link count, bytes/hash and directory membership immediately before handing control to the action. No untrusted process may share that runner UID. [Pinned search implementation](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/src/shared/search.ts).

## Proposed uploader contract — inert example

This YAML is a proposal inside documentation, not an installed step. Its `custody` output producer does not exist yet. Keep the source hold even when the bridge and action are implemented for local qualification; activation requires a separate reviewed revision and hosted-drill approval.

```yaml
- name: Upload encrypted recovery handoff
  id: custody_upload
  if: ${{ false && success() && steps.custody.outputs.verified == 'true' }}
  uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  with:
    name: ${{ steps.custody.outputs.artifact_name }}
    path: ${{ steps.custody.outputs.ciphertext_path }}
    if-no-files-found: error
    retention-days: 7
    compression-level: 0
    overwrite: false
    include-hidden-files: false
    archive: true
```

Seven days is the bounded proposed retention for the single synthetic drill, not an approved recurring backup retention policy or an asserted effective GitHub setting. Review the actual repository limit and accept the observed artifact `expires_at` before the drill. The action must refuse a conflicting artifact; no delete-and-replace or automatic upload retry is permitted. A failed/lost acknowledgement requires read-only reconciliation of that exact run/attempt/artifact before further action. Any later authorized retry must reuse retained ciphertext bytes; never recapture or re-encrypt just to retry custody.

The future bridge must reuse the private descriptor returned by `executeTestingBackupCustody`; the current CLI intentionally emits only its bounded public result. The bridge is a narrow programmatic output adapter, not a second capture implementation. Its outputs must be emitted only after successful capture, exact handoff encryption and final readback:

| Output | Binding and handling |
| --- | --- |
| `verified` | Literal `true` only after the final ciphertext validation; absent on all failure/cancellation/uncertain-output paths |
| `artifact_name` | Exactly `bob-recovery-handoff-r<runId>-a<runAttempt>`, matching the descriptor and trusted workflow execution context |
| `ciphertext_path` | Exactly the canonical private ciphertext directory plus `/recovery.json.age`; masked before same-job output use; no wildcard, directory, newline or additional path |
| Ciphertext SHA-256 and length | Exact descriptor values retained as approved reconciliation metadata; must match the immediately re-read file |

Only ciphertext enters the action. Plaintext handoff, private receipt/download plan, temporary inputs, recovery identity, database URLs and storage credentials must be absent from its path and step environment. Backup credentials remain scoped to the capture step. The hosted artifact client has runtime artifact-service authority supplied by GitHub Actions; do not add a PAT, `actions:write`, `id-token:write` or new persistent permission merely to use the upload action. Confirm actual effective authority during the approved drill.

The pinned action reports artifact name, ID, ZIP size, archive digest and its ordinary GitHub artifact URL. Those are proposed public reconciliation metadata; they do not include the backup UUID or plaintext handoff hash. Private paths must remain masked, including failure/debug paths. Hosted log inspection is mandatory before acceptance; source inspection cannot prove GitHub's actual masking or guarantee that upstream errors never disclose additional diagnostics. [Pinned upload reporting](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/src/shared/upload-artifact.ts).

## Reader integration contract

The operator calls [verifyArtifactCustody](../../Core/scripts/lib/backup-artifact-custody.mjs) in an owner-controlled recovery process after the selected run attempt and capture/upload job have both completed successfully. The production application, Web dashboard and capture runner do not decrypt the handoff. Keep an explicit `enabled:false` default in any future adapter; require a reviewed private input before `enabled:true`, with no environment-only switch or automatic selection of latest artifacts.

The reader approval must independently bind:

1. Repository `boisey9/BobAI` / ID `1310270513`, owner `boisey9` / ID `6569974`, exact workflow ID and source commit, approved container image digest and manual `main` execution.
2. Exact run ID and attempt, initiating and rerunning actor IDs/logins, numeric job ID and observed job name. Use the API's observed name; do not assume the YAML job key is the displayed job name.
3. Exact successful capture-step name `Capture synthetic testing backup and prepare encrypted recovery handoff` and proposed upload-step name `Upload encrypted recovery handoff`. Names, order, timestamps and successful completion must agree with the reviewed source and job evidence.
4. Explicit artifact ID from reconciled action/API evidence, unique expected run/attempt name, nonexpired metadata, bounded ZIP size and required SHA-256 digest. The artifact ID/output alone is not an acceptance receipt.
5. Approved testing instance, public age recipient and exact permitted signed-storage host. Obtain the host through separately authorized inspection of this run's GitHub download redirect; do not derive permission from arbitrary artifact content or widen the host allowlist on mismatch.

Inject a reviewed read-only HTTPS transport with manual redirects, explicit identity encoding, bounded body reads and cancellation. API authority is supplied explicitly from existing approved secure storage; nothing is looked up from ambient environment variables. A future separately approved fine-grained reader should have the minimum Actions-read repository authority and no write scope. No bearer header or cookies may reach the signed-storage host, and signed URLs must not enter logs. The existing verifier does not follow pagination, retry a failed request, accept an alternative attempt, or fall back to a different archive format.

The identity stays in its existing owner-controlled canonical private file, outside checkout and output directories. No key is committed, uploaded, injected into CI/Vercel, transferred through chat, or provisioned by this packet. The private directory and native identity checks remain unchanged. The operator compares archive, ciphertext and plaintext hashes as distinct values, records archive verification and local readback times, and uses only the issued in-process handle to create the existing private download plan. A saved receipt cannot be reloaded as a verified handle; a process restart requires independent verification again. The verifier itself never contacts the backup store.

## Known compatibility and integration gaps

| Gap | Required evidence before hosted acceptance |
| --- | --- |
| Bridge/action absent | Locally implemented, reviewed bridge; exact descriptor-to-step output mapping; two existing job holds plus upload-step hold retained |
| Strict ZIP profile | Use the pinned action's bundled archive construction with synthetic ciphertext and no network; prove the parser accepts its actual output and still rejects links/extras/ZIP64/oversize/CRC or digest errors. Then independently verify a real hosted artifact from that action. No parser relaxation merely to make the drill pass. |
| Runtime image | Qualified Node 24 action support, hosted runner version and approved immutable image pull; local age 1.3.1 evidence does not qualify pinned hosted age 1.3.2 |
| GitHub API contract | Exact attempt/job names, timestamps, `size_in_bytes`, digest and storage redirect behavior corroborated against the selected real run. Artifact metadata has no independent signed attempt field. |
| Reader lifecycle | Private plan/approval loader and transport adapter still absent; prove no effects while disabled, safe signals, timeout/late-response cleanup and no accidental public printing |
| Credential/target binding | Approved active synthetic source, empty isolated restore destination, separate capture/ledger/storage roles and approved reader authority; current null binding cannot select any destination |
| Custody and durability | Effective retention/read access, runner disposal, independent download/decrypt/restore and explicit failure/recovery receipts; local synthetic success does not establish off-device recovery |

## One manual hosted synthetic drill

Before activation, review one immutable candidate containing the bridge and pinned action, its effective permissions, nonsecret testing binding, image digest, recipient fingerprint, storage account, retention/public-metadata policy and empty isolated recovery destination. Separately authorize any required provisioning or permission/credential change; this packet does none. Use synthetic data and a disposable testing identity, with the private identity held only by the recovery operator. Preserve Production and retired staging isolation.

Run once from reviewed `main` through manual dispatch. Verify the capture/encryption result and exact artifact ID/digest while keeping private paths masked. Retain a bounded operator record of run, attempt, actor, job and step identities. Wait for terminal successful run/job status and dispose of the owned hosted runner. Then independently read back the same artifact on the selected recovery machine, validate the exact API association/archive/decrypted handoff, and prepare the existing Get-only backup download plan. Under the separately approved drill, download the corresponding bundle and restore into the approved empty isolated destination using existing integrity, relationship, copied-access quarantine and owner-access recovery checks.

Required refusal/recovery evidence includes missing/conflicting artifact, lost upload acknowledgement, expired/deleted artifact, wrong actor/source/attempt/job, failed run after upload, wrong digest/recipient/producer, malformed or oversized archive, token leakage sentinel absence, stale private receipt, cancellation and changed files. None may cause automatic recapture, re-encryption, permissive parsing, backup-store contact before custody acceptance, restoration into a nonempty target, or resume of copied jobs/grants. Reconcile retained exact ciphertext and explicit IDs; record uncertain outcomes rather than claiming success.

Record the full interval and snapshot age for the approved RPO/RTO targets. Runner disposal and successful database restoration are separate observations. Current-key off-device recovery, recurring schedules/retention and Production operational acceptance remain separate milestones from this synthetic drill.

## Application release boundary and exact next implementation task

Publishing this disabled code/packet or deploying Core/Web does not upload a backup or activate the testing workflow. Keep the owner's existing Vercel/Neon architecture and cloud provider. The current application release still needs fresh recovery evidence and effective canonical Core/Web configuration/rollback parity; the last documented October 31 snapshot crossed its 24-hour freshness threshold on November 1, and the owner reconfirmed on November 2 that no separate recovery destination is available. The owner's deployment request resolves deployment permission, not those missing observations. See the [release packet](2026-10-30-backup-activation-recovery-packet.md) and [dated recovery evidence](2026-10-31-fresh-encrypted-snapshot-docker-restore.md).

**Exact next code slice:** implement the private descriptor-to-upload bridge and owner-operated reader adapter with the pinned action present behind an additional literal false step hold, then qualify the real bundled ZIP profile locally with synthetic data. Keep the existing two job holds and null binding unchanged. Follow with independent review and one separately authorized hosted synthetic drill; no schedule or Production backup activation is included.

This packet was prepared from read-only official action/source inspection and verified repository contracts. Only this Markdown file is authored by the packet task; executable workflow/configuration, credentials and remote artifacts are unchanged by this work. Its source review does not assert that the proposed action has run, any handoff has durable independent custody, or the Vercel release gates have passed.
