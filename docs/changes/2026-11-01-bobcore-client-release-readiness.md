# BobCore client and release readiness

Date: 2026-11-01 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **existing Codex bearer read verified; ChatGPT BobCore plugin installation and scoped OAuth consent confirmed; ChatGPT client-reported context read passed. No new deployment or project-state write acceptance.** Local branch: `codex/dashboard-readiness`; HEAD remains `9536d6c24de090f4c4c2716cead64811107da3ab`. The dashboard and readiness documentation remain local and unpublished.

Same-day follow-up: a direct structured plugin read below corroborates the ChatGPT result. The successor [backup workflow adapter](2026-11-01-backup-workflow-adapter.md) is now implemented, validated and independently reviewed on local branch `codex/backup-workflow-adapter`, preserving this client slice. Its next local task is same-snapshot supplemental integrity evidence; the original adapter-next statements below record the earlier client milestone. No publication, deployment or recurring-backup activation followed.

## Objective and authorized boundary

The owner wants BobCore operational with client access from **Codex and ChatGPT**, evaluated independently. Existing Vercel Core/Web and Neon remain the hosted infrastructure. Acer/Jarvis work remains deferred.

The owner explicitly approved one new access operation: install the Production **BobCore** personal plugin in ChatGPT and complete OAuth consent for **BobAI only**, surface **`chatgpt`**, with `mcp:context:read`, `mcp:sync`, `handoffs:write`, `mcp:event:write`, `mcp:task:write`, `mcp:decision:propose` and `offline_access`. Personal-plugin installation refers to the owner's ChatGPT installation; it does not grant access to BobCore's Personal project.

That approval allows the new OAuth grant and its associated authorization records. It does not authorize project-state test writes, artifact uploads, deployments, migrations, replacement of existing credentials, expanded Codex access or unrelated permission changes. Existing credentials/configuration and deployment guards were preserved. Retired Bob Core staging remained uninstalled and was not used or changed. No task, decision-proposal, event or handoff test write was performed in this work.

## Verified source and Codex connection

The repository mapping, MCP contract, account-linking implementation, interface standard and current local configuration metadata were reviewed. The implementation remains at merged PR #49 commit `9536d6c`; uncommitted dashboard/documentation changes do not establish published or deployed behavior.

| Evidence | November 1 observation | Acceptance limit |
| --- | --- | --- |
| Repository Codex configuration | [`.codex/config.toml`](../../.codex/config.toml) uses `/mcp/sync`, references `BOB_CORE_CODEX_TOKEN`, sets `required=true`, and allows five context/event/task/proposal tools | The allowlist omits checkpoints. Configuration does not grant server scopes. |
| Direct authenticated Codex read | Existing configured bearer successfully called canonical `https://bob-core.vercel.app/mcp/sync`; context generated at `2026-11-01T14:17:54.702Z` | Verifies this bearer/endpoint read, not native OAuth or a different app/plugin connection. |
| Returned identity | `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, surface `codex` | Matches the trusted project registration. Credential project/surface bindings cannot be changed by tool arguments. |
| Revision | `505bba917c6d792a5e6003dafe5752a8024489787ada497fc50b89d60a019e7e` | A context revision is not a source commit or deployment identity. |
| Sources/freshness | All five sources available; `partial=true`; events and memories truncated; newest returned tasks dated September 9 and handoff October 23 | Fresh retrieval does not make these older records a current account of the local work. |
| Observed tools | `bob_get_context`, `bob_record_event`, `bob_create_task`, `bob_update_task`, `bob_propose_decision` | Five tools observed; no `bob_record_handoff` on this connection. No write tool was exercised. |
| Native Codex OAuth configuration | Global `bobcore_bobai` entry targets `/mcp/linked`, allows context/handoff tools, and remains explicitly disabled | No native OAuth acceptance or configuration change. |

The direct read corroborates the canonical destination and returned BobAI/Codex identity. It does not establish two-way synchronization, all intended client scopes, or native Codex OAuth acceptance. Missing handoff exposure must be reconciled against the actual endpoint, credential scopes and client allowlist; it is not proof that the server lacks checkpoints and not authority to expand access.

## Serving Core/Web and OAuth discovery

The Vercel plugin tools returned 404 during inspection. The existing CLI, using the explicitly identified team, supplied the read-only project/alias corroboration. The connector failure was not treated as a service outage or a reason to bypass authentication.

| Serving evidence | Verified observation | Consequence |
| --- | --- | --- |
| Core canonical alias | `bob-core.vercel.app` maps to READY deployment `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk` | Same canonical deployment as October 30; no new release occurred. |
| Web canonical alias | `bob-control-center-erikboisvert9.vercel.app` maps to READY deployment `dpl_CAkTAgNhXyySzQcqYqSxqt2Ny7PM` | Same canonical deployment as October 30; do not substitute the latest-created candidate. |
| Public health | Core and Web health requests returned HTTP 200 | Process/HTTP evidence, not complete owner, inference or recovery acceptance. |
| Linked MCP challenge | Unauthenticated `/mcp/linked` returned HTTP 401 with the expected resource-discovery challenge | Expected protected-boundary behavior; not an authenticated client result. |
| OAuth metadata | Canonical Web issuer and Core resource matched; discovery described PKCE S256/CIMD and the six BobCore permissions plus offline access in the authorization metadata | Discovery/configuration evidence; actual client token and grant behavior need independent acceptance. |
| Environment inspection | Names, types and targets only; relevant variables were sensitive | Effective secret values and serving-to-candidate configuration parity were not established. No environment setting changed. |

Canonical availability does not mean GitHub `9536d6c` or the local dashboard correction is newly deployed. The [release gates](../release-gates.md) still require an immutable reviewed candidate, effective configuration comparison and preserved rollback/owner access before any separately authorized cutover.

## ChatGPT installation and consent

The authorized browser flow displayed and approved the intended **BobAI** project, **`chatgpt`** surface and the exact seven permissions listed above. It returned to ChatGPT Plugins, where **BobCore** was shown as installed. Its detail view displayed version **1.0.0** and **Try in chat**.

Plugin identifier: `plugin_asdk_app_6ae74b54d7ac8191bf5b46012ef554ae`.

The installed plugin's app detail exposed **six tools**: `bob_get_context`, `bob_create_task`, `bob_update_task`, `bob_record_event`, `bob_propose_decision` and `bob_record_handoff`. This confirms that checkpoint support exists on the approved OAuth path even though the current Codex bearer/tool inventory omits it.

A bounded read-only request was submitted through this installed plugin's **Try in chat** flow. The completed [ChatGPT acceptance conversation](https://chatgpt.com/c/6ae74d3f-729c-8329-af1b-879687fd85e5) reported `bob_get_context` success with project `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, trusted surface `chatgpt`, generated time **`2026-11-01T14:31:39.239Z`** and revision **`d7a26f39bf51cf26f50a461d0a14deb459c547c6ee465a3c8a2a46d9d9e9f709`**. All five sources were available; events/memories were truncated and `partial=true`. The conversation reported only the read tool was called. Initial response rendering failed, then loading the saved conversation recovered the result without reissuing consent or the request.

This is real-client installation/linking and client-reported read evidence, observed in the ChatGPT UI. The UI exposed a connection-verification activity summary and rendered response, not a raw independently retained MCP result envelope. No write receipt/readback, token-refresh, expiry, revocation or cross-client mutation acceptance is claimed. The Codex direct MCP response and this separately observed ChatGPT result are distinct evidence.

Subsequent direct plugin read at **`2026-11-01T14:37:09.523Z`** returned a structured MCP result through the newly exposed BobCore plugin: matching BobAI UUID/repository, bound surface `chatgpt`, revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`, all five sources available, events/memories truncated and `partial=true`. This closes the raw-response inspection limitation above without reading or transferring its OAuth token. The same grant remains `chatgpt`-bound when the plugin is exposed in Codex; it is not a new native `codex` grant. Codex project work continues using the existing correctly bound Codex connection. No plugin write tool was called.

The approved grant can expose write tools, but scope availability does not authorize test mutations. Existing Codex/native configuration and existing credentials were not widened or replaced. No staging connector was used.

## Recovery evidence and limits

The three ciphertext files for [October 31 bundle `64abcffe-1590-4b6d-9611-caaf454926e2`](2026-10-31-fresh-encrypted-snapshot-docker-restore.md) were rehashed on November 1 and matched their recorded archive, standard-manifest and supplemental-manifest hashes. This is local artifact integrity evidence; the snapshot time remains **`2026-10-31T17:40:28.057Z`**. Rehashing does not refresh the snapshot, rerun restoration or establish recurring backups. The 24-hour snapshot-age threshold is crossed after `2026-11-01T17:40:28.057Z` without a newer accepted snapshot.

The owner has **no selected separate off-device recovery destination**. The independent current recovery-key copy is owner-confirmed, but it has not been used for an independent-copy/off-device restoration of this bundle. No artifact was uploaded or transferred during this work. The October 31 local restore and cleanup results remain dated evidence; full hosted recovery, recurring protection and operational RPO/RTO remain open.

## Documentation corrections and review

This task prepares or updates:

- [Core MCP](../../Core/MCP.md): actual `/mcp/sync` Codex configuration, `/mcp/linked` authority, tool-exposure limits and separate native/plugin acceptance.
- [Account linking](../account-linking.md): dated activation evidence, explicit Codex/ChatGPT surface selection and guarded provisioning/migration/rollback instructions.
- [Interface standard](../standards/bob-interface-standard-v1.md): static versus OAuth identity and the linked boundary.
- [Client acceptance guide](../bobcore-client-acceptance.md): configured, installed, authenticated, write-receipt, readback and lifecycle evidence, with the approved new ChatGPT grant exception.
- This change record, [implementation index](../../implementation.md) and [release gates](../release-gates.md).

Independent review of the initial correction and final seven-document slice found no remaining findings after incorporating the narrow grant approval. Validation passed **86 local links/anchors**, `git diff --check` and conflict-marker scanning; the two index links added to finalize this record also resolve. The branch/HEAD and unchanged runtime/configuration/deployment-guard scope were checked. No runtime test suite was rerun for this documentation-only slice; earlier dashboard/recovery acceptance retains its own evidence date. This November 1 slice changes documentation, not runtime, schema, deployment settings or Codex configuration. Earlier dashboard/recovery work in the checkout is preserved and retains its own validation records.

## Exact next steps and remaining gates

1. **Read acceptance completed:** preserve the separate Codex direct response and ChatGPT client-reported result above. The new ChatGPT plugin is usable for BobAI-only approved context; its grant does not imply permission for every future write.
2. **Local record completed:** independent review, documentation/link/whitespace checks and implementation/release index updates passed. The branch remains unpublished and no deployment is claimed.
3. **Keep write/lifecycle acceptance separate:** any checkpoint/event/task test, identical retry/readback, revocation/relinking or native Codex enablement requires the applicable explicit authorization and verified scope. Retain stable operation IDs and distinguish receipts from readback. Do not activate a decision proposal.
4. **Close independent recovery custody:** select an owner-controlled off-device destination and obtain the bounded transfer/restore authorization. Verify the complete artifact set with the independent current key copy. Never send the private identity through chat, Git, CI, Vercel or object storage.
5. **Prepare a release only after its gates:** refresh snapshot freshness, effective Core/Web configuration and rollback parity, owner/client acceptance and immutable source binding. Publication and deployment remain separately authorized operations; installation does not deploy Core/Web or disable their guards.
6. **Recurring backup implementation remains separate:** the next code slice is the default-off private-file workflow adapter in the [activation/recovery packet](2026-10-30-backup-activation-recovery-packet.md). Real roles, storage transport, supplemental integrity handling, schedule/retention activation and failure reporting still need their own acceptance.

## Pending local BobAI checkpoint

Outcome: existing canonical Codex bearer read returned matching BobAI/Codex identity and five scoped tools. Canonical Core/Web remain available on their prior READY deployments. The owner-approved BobAI-only ChatGPT plugin installation and OAuth consent completed; its client-reported context read passed with matching BobAI/ChatGPT identity and all five sources available, with bounded truncation. Local recovery ciphertext hashes match the October 31 bundle, with no off-device destination selected. Setup/acceptance documentation was corrected locally.

Unresolved: fresh write/retry/readback and lifecycle acceptance; disabled native Codex OAuth; old/truncated BobCore records; independent recovery custody, recurring protection and full hosted recovery; effective candidate configuration/rollback parity and authorized release.

Next action: choose the off-device recovery destination, then authorize the bounded independent restore; prepare the default-off backup workflow adapter locally while release gates remain open. This checkpoint has **not** been synchronized to BobCore. Any later authorized event/task/handoff requires fresh identity/scope/version verification, a retained operation ID, a successful receipt and appropriate readback. The new OAuth consent is access setup, not a project-state completion checkpoint.
