# BobCore client connection and acceptance

Updated November 1, 2026 (Toronto). Scope: **Codex and ChatGPT**, accepted independently. BobCore remains the authority for approved context and project state; clients do not create a second memory authority. This guide distinguishes source/configuration evidence from installation, authentication and confirmed synchronization. The dated live results and remaining gates are recorded in the [November 1 readiness record](changes/2026-11-01-bobcore-client-release-readiness.md).

## Choose the actual connection path

| Path | Authentication and authority | Acceptance boundary |
| --- | --- | --- |
| Repository Codex MCP at `/mcp/sync` | Dedicated project/surface-bound static credential referenced by `BOB_CORE_CODEX_TOKEN` | Verify the actual credential's binding/scopes and the client's exposed tools. A configuration file alone does not prove initialization or a successful request. |
| Native Codex OAuth at `/mcp/linked` | Supported OAuth flow, owner consent and live project grant | Verify native client enablement, account linking, the approved `codex` surface and real client requests. |
| Installed Codex or ChatGPT app/plugin connection | Inspect that connection's actual endpoint and supported authentication | Installation and a familiar connection name do not prove Production, project identity or scope. Accept its authenticated tools separately from the TOML paths. |

The canonical endpoint definitions are in [Core MCP](../Core/MCP.md). `/mcp/context` remains permanently read-only; `/mcp` remains separately privileged. Do not use a primary device credential or Codex static bearer token to bypass an OAuth client flow. The retired Bob Core staging connection is not an authorized fallback.

## Dated local configuration observations

November 1 inspection read only configuration metadata; no token, authentication-store or private-key values were exposed.

| Configuration | Observed setup | Limitation |
| --- | --- | --- |
| [Repository `.codex/config.toml`](../.codex/config.toml) | `bob-core` points to `https://bob-core.vercel.app/mcp/sync`, `required=true`; allows context, event, task-create/update and decision-proposal tools | The allowlist omits `bob_record_handoff`. This is not evidence that Core lacks the tool or that the credential has its scope. Credential availability and effective client initialization remain separate checks. |
| Owner's global `~/.codex/config.toml` | `bobcore_bobai` points to `https://bob-core.vercel.app/mcp/linked`; requests `offline_access`, `mcp:context:read`, `mcp:sync`, `handoffs:write`; allows context/handoff tools; `required=false`, **`enabled=false`** | A disabled native entry is not an accepted native OAuth connection. It does not establish the state of another installed app/plugin. |

The October 23/24 [operational record](changes/2026-10-26-core-context-checkpoint-reconciliation.md#authority-and-latest-handoff) reports Production OAuth activation but unfinished native Codex acceptance. That historical record and these local file observations are not a fresh inspection of serving configuration. Preserve working access while reconciling the intended client path. Do not silently enable the disabled entry, add allowlisted tools, widen grants or replace credentials.

## Current read acceptance — November 1

The [dated result](changes/2026-11-01-bobcore-client-release-readiness.md) records a direct authenticated Codex read from canonical `/mcp/sync`, plus installation of the owner-approved Production BobCore plugin and a separate ChatGPT client-reported read through `/mcp/linked`. Both returned the correct BobAI UUID/repository and their respective trusted surfaces. The ChatGPT plugin exposes six tools including checkpoints; the current Codex connection exposes five without checkpoints. The initial ChatGPT UI evidence was subsequently corroborated by a direct structured read through the newly exposed plugin, still bound to `chatgpt`; exposure inside Codex does not change that grant's surface. Neither result establishes new write/retry/readback, refresh/revocation or hosted recovery acceptance.

## Acceptance evidence for each client

| State | Required evidence | What it does not establish |
| --- | --- | --- |
| Configured | Exact endpoint, authentication method, client/tool configuration and intended project/surface | Installed, initialized, authenticated or authorized to write |
| Installed/available | The intended product exposes the expected connection and tool inventory | Correct authenticated destination, project binding or scope |
| Authenticated read | An actual client context response with verified destination/environment, project key/UUID/repository and trusted surface; inspect revision, generated time, source timestamps, availability, truncation and `partial` | Current record contents merely because retrieval is fresh; permission to perform a test write |
| Confirmed write receipt | An explicitly authorized bounded mutation succeeds under the intended client/scopes and a retained operation ID | Readback or identical-retry acceptance; active status for a decision proposal |
| Verified synchronization | Read back the intended outcome through an authorized read tool, and verify identical retry using the same operation ID and identical payload | Another client's acceptance, broader permissions, full recovery or hosted-release readiness |
| Lifecycle/isolation | Separately authorized evidence for project isolation, expired/underscoped access, refresh where supported, and revocation/relinking | Authority to revoke a working grant or change credentials during a read-only assessment |

For BobAI, resolve the trusted mapping from [`.bob/project.yml`](../.bob/project.yml). The reviewed registration is project key `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`. Request `bob_get_context` with that key, a concise verification task and the intended surface: `codex` for Codex or `chatgpt` for ChatGPT. Compare returned identity with the mapping and authenticated connection. Arguments cannot override a credential's project/surface binding; matching the project key alone is insufficient.

The owner consent screen selects one project and surface. The [current component](../Web/components/owner-connect.tsx) defaults recognized ChatGPT metadata clients to `chatgpt` and other clients to `other`; explicitly select `codex` for native Codex. Use each client's current supported linking flow. Do not infer or invent ChatGPT product menu steps from the repository's Web consent UI.

## Checkpoint and write verification

Core [registers checkpoints](../Core/src/mcp/server.ts) only when both `mcp:sync` and `handoffs:write` are present. The client must also expose `bob_record_handoff`. A missing tool can result from the endpoint, grant/token scopes, client allowlist or connection setup; do not treat absence as permission to expand any of them.

When a bounded checkpoint write is explicitly authorized:

1. Refresh the intended client's context and verify destination/environment and project/surface identity. Confirm the tool is exposed with its expected contract.
2. Prepare a concise outcome, unresolved items and next actions. Retain one unique `operationId` and copy `expectedProjectId` from the verified context. Exclude credentials, raw prompts, private reasoning and unrelated data.
3. Inspect the successful receipt. Retry an uncertain operation with the **same ID and identical payload**, including optional fields. A changed payload needs a new operation ID after reconciliation.
4. Read the handoff back through an authorized context read. Record confirmed receipt and confirmed readback separately. Bounded context can omit records; preserve the receipt and report that limitation rather than creating duplicates.
5. Use separate authorized checks for conflicting operation IDs, task `expectedVersion`, isolation and revocation. These are not implicit permission to create test tasks, revoke access or mutate Production. Decision proposals remain pending owner review.

Successful Codex verification does not accept ChatGPT, and the reverse also applies. Keep one evidence entry per actual connection with its client, endpoint/environment, project/surface, observed tool names/scopes, timestamp, receipt references and unresolved limitations. Record an untested capability as unverified rather than failed.

## Current operating limits

The November 1 owner approval permits one narrow access change: create/install the Production **BobCore** personal plugin in ChatGPT and complete OAuth linking for **BobAI only**, surface **`chatgpt`**, with `mcp:context:read`, `mcp:sync`, `handoffs:write`, `mcp:event:write`, `mcp:task:write`, `mcp:decision:propose` and `offline_access`. This does not authorize project-state test writes, uploads, deployments, migrations, replacing existing credentials, expanding Codex access or unrelated permission changes. Preserve local pending checkpoints while synchronization is unauthorized. Installation and a granted scope do not authorize exercising a write tool.

No separate off-device recovery destination has been selected. The [October 31 local restore](changes/2026-10-31-fresh-encrypted-snapshot-docker-restore.md) supplies bounded local evidence; it does not prove independent-key/off-device recovery. This remains a [release/recovery gate](release-gates.md), without preventing independent authorized documentation or client inspection. Client acceptance alone does not authorize deployment or close that gate.
