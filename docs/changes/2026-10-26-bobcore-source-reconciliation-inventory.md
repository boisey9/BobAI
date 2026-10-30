# BobCore saved-source reconciliation inventory

Date: 2026-10-26 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **the remaining differences in the pinned 110-file runtime payload are accounted for locally**. This inventory closes the source-disposition task for that saved payload. It does not establish current deployed parity, complete repository equivalence, independent approval, or release acceptance.

## Evidence and comparison boundaries

- Original verified GitHub baseline: `36552fc430b06b91ee1e47acef124e4ea36987c0`, available in the local Git object database. No fetch or fresh GitHub query was performed for this slice.
- Saved release source: `/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/source/`.
- Manifest: adjacent `MANIFEST.json`, created `2026-10-23T13:25:14.647936+00:00`, SHA-256 `7f07e021df38a48b1ccf1cacf679c51cf5d87eb3c05259d61eb41178de4ed2c1`. All **110 source entries (46 Core, 64 Web)** were checked against their full manifest hashes again on October 26. The manifest describes local preparation and contains false submission/build/promotion/activation flags; it is not deployment-acceptance evidence.
- Current comparison: reviewed local task/context/project commit `2f49117d9bbf6d9905f6a571ad3cbe54e0995505` plus the checkpoint-import working diff on `codex/reconcile-web-checkpoint-import`.
- Deployment identities and dated operational acceptance remain separate historical evidence in the [Phase 0 record](2026-10-26-bobcore-hybrid-phase-0.md). No current Production source download, Vercel/Neon inspection, or live authenticated acceptance was performed here.

The original comparison with GitHub was **52 identical, 38 different and 20 absent**. After the local reconciliation slices, this saved payload compares as follows:

| Current disposition | Files | Meaning |
| --- | ---: | --- |
| Exact | 78 | Current bytes match the saved source hash. |
| Different | 29 | Intentional repository integration or reviewed corrections, explained below. |
| Omitted | 3 | Retired staging diagnostics intentionally not restored. |
| Total | 110 | Every saved runtime-source entry has a disposition. |

This is a deployment-payload comparison, not a replacement specification. All **24 governed-workflow files** under `Core/src/workflow/` outside this payload remain byte-identical to the pinned GitHub baseline. Existing workflow mounts, feature gates, private runtime, OIDC dependencies, shared-source build setup, and navigation were preserved. Source reconciliation does not authorize turning those features on.

## Reviewed differences and omissions

The source, its current use and the related tests were inspected. No remaining row is an unknown or silently discarded source delta.

| Path | Disposition and rationale |
| --- | --- |
| `Core/index.ts` | **different** — Preserve the repository fetch/security wrapper and governed startup integration; do not restore the retired preview-configuration diagnostic. |
| `Core/package-lock.json` | **different** — Retain the repository OIDC dependency tree: 24 added package entries; no existing package version changes or removals versus the saved lock. |
| `Core/package.json` | **different** — Retain @vercel/oidc 3.8.10 and the eight owned-child lifecycle checks in the repository check command. |
| `Core/src/app.ts` | **different** — Preserve the optional governed router and its separate authorization boundary before legacy routing. |
| `Core/src/context/routes.ts` | **different** — Retain the reviewed compatible expected-project UUID assertions on task writes and existing optional-body handling. |
| `Core/src/context/service.ts` | **different** — Retain task UUID assertions and compatibility with older task receipt fingerprints; preserve existing handoff behavior. |
| `Core/src/index.ts` | **different** — Preserve the private governed runtime and explicit default-off/protected startup, then the existing OAuth/interface gateways. |
| `Core/src/mcp/server.ts` | **different** — Only an extra blank line remains against the saved payload; no outstanding semantic delta. |
| `Core/src/operations/staging-target.ts` | **omitted** — Omit the retired September 15 staging target diagnostic and its pinned Neon/Preview assumptions. |
| `Core/src/runtime.ts` | **different** — Retain the governed hosted mount alongside the reconciled owner project-creation and provider/runtime behavior. |
| `Core/src/security/interface-credential.ts` | **different** — Preserve HEAD task-read authorization alongside GET; retain existing owner and scope guards. |
| `Web/app/account/page.tsx` | **different** — Keep the governed /work entry gate while adding the selected checkpoint-import link. |
| `Web/app/api/health/configuration/route.ts` | **omitted** — Omit the route that exposes the retired staging diagnostic result. |
| `Web/app/api/projects/route.ts` | **different** — Retain fixed public owner-session failures around the reconciled owner-only project contract. |
| `Web/app/api/session/route.ts` | **different** — Preserve workflow-entry destination validation and private authentication errors. |
| `Web/app/api/tasks/route.ts` | **different** — Retain private session failures and duplicate project/cursor query rejection. |
| `Web/app/login/page.tsx` | **different** — Preserve guarded destination selection and the existing OAuth consent continuation priority. |
| `Web/app/page.tsx` | **different** — Preserve governed workspace entry and private dashboard errors around the reconciled context view. |
| `Web/components/control-center-v2.tsx` | **different** — Label the bounded empty proposal result as No proposals returned, without claiming a complete pending-work count. |
| `Web/components/owner-checkpoint-import.tsx` | **different** — Use the shared strict contract, current-source review, expiry checks, explicit confirmation and verified receipt/recovery states. |
| `Web/components/owner-login.tsx` | **different** — Preserve the validated owner/workflow destination through login and passkey flows. |
| `Web/components/task-manager.tsx` | **different** — Retain bounded pending-state validation, exact retry recovery and synchronous input-value capture. |
| `Web/lib/bob-core.ts` | **different** — Retain reviewed identity/projection/receipt/privacy guards and add pinned checkpoint client helpers using the shared origin contract. |
| `Web/lib/checkpoint-import.ts` | **different** — Add strict request/identity/freshness/completeness/expiry/receipt validation to the saved review and append-only handoff flow. |
| `Web/lib/owner-auth.ts` | **different** — Preserve the guarded local real-auth test driver and hosted-profile-bound database pool; no authentication configuration was activated. |
| `Web/lib/staging-target.ts` | **omitted** — Omit the retired staging environment/old model diagnostic; it is not a reusable live project authority. |
| `Web/lib/task-api.ts` | **different** — Retain stream byte limits, invalid UTF-8 rejection, fixed public errors and current-session failure containment. |
| `Web/lib/types.ts` | **different** — Retain the canonical stored context project UUID required by the reviewed identity guards. |
| `Web/next.config.ts` | **different** — Retain repository-root tracing/Turbopack configuration and .js-to-TypeScript aliasing for shared governed code. |
| `Web/package-lock.json` | **different** — Retain the repository OIDC dependency tree: 24 added package entries; no existing package version changes or removals versus the saved lock. |
| `Web/package.json` | **different** — Retain @vercel/oidc 3.8.10 and the reviewed webpack build command. |
| `Web/vercel.json` | **different** — Retain the existing Core dependency install required by shared workflow source; deployment configuration is unchanged by this slice. |

## Important source outside this payload

The restored migration `Core/migrations/008_oauth_checkpoint_scope.sql` retains SHA-256 `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e`. Its absence from the pinned GitHub tree and the dated applied-state evidence are recorded in the [identity/checkpoint reconciliation](2026-10-26-core-context-checkpoint-reconciliation.md). It was not executed again. All migration files are unchanged against the reviewed task/context/project parent.

The new `Web/lib/checkpoint-import-contract.ts` shares the browser/server file, review and receipt contract. It is deliberately outside the saved payload, as are the new regression suites and change records. Earlier task/project contracts and repository-only workflow source also remain outside the 110-file comparison. Their absence from the payload is not evidence that they should be deleted.

Dependency lock review found 24 added package entries in each current lock for the retained OIDC dependency tree, without changes to existing package versions or removals. No dependency installation, lockfile update or deployment-configuration change belongs to this slice.

## Verification and remaining release gates

Follow-up verification on 2026-10-26 before hybrid contracts confirmed every ledger row against the full saved/current hashes, the 78 exact / 29 different / three omitted totals, and all 24 unchanged governed-workflow files. Checkpoint/owner-session/OAuth/provider review passed 83 targeted tests. No unclassified source delta or actionable defect was found in this bounded self-review. This does not refresh Production or GitHub evidence.

The [checkpoint-import change record](2026-10-26-web-checkpoint-import-reconciliation.md) contains exact changed paths, the 41 focused tests, full local checks, synthetic browser acceptance and the pending BobAI checkpoint. The previous task/context/project slice was rechecked with 76 passing targeted tests and preserved as local commit `2f49117` before this successor branch was created.

The source inventory has no unclassified remainder within the pinned snapshot. Independent review and authorized isolated runtime acceptance remain necessary. PostgreSQL concurrency/roles, actual owner passkey/OAuth operation, current deployed source identity and configuration, and real checkpoint imports are not proven by local tests. The available connector remains retired staging; no current authoritative BobCore context or synchronization was obtained.

Verified backup artifacts and a successful complete isolated restoration remain prerequisites before risky Production schema/access changes or cutovers. Historical observations (six-hour Neon restore window, unprotected Production branch, empty inspected backup ledger and skipped scheduled runs) are not revalidated or resolved here. Production Codex acceptance and retirement of commissioning password access remain separate historical open gates.

**Recommended next implementation slice after review: disabled hybrid contracts and explicit manual routing policy**, proposed branch `codex/bobcore-hybrid-contracts`. Define project/environment-bound device and job DTOs, capability and authorization requirements, explicit cloud/local routes, Core context revision/policy attachment, and deterministic failure behavior behind a default-off gate. Add synthetic contract and denial tests; preserve the active provider. Do not enroll a device, activate routing, add execution privileges, or perform live inference in that slice. Device enrollment/revocation/heartbeat, durable jobs and Ollama remain the following independently testable slices. The first operational hybrid milestone remains authenticated Acer heartbeat followed by one successful BobCore-routed Ollama inference in a verified testing environment.

## Complete payload ledger

`Saved` is the first 12 hexadecimal characters of the full SHA-256 verified from the manifest. `Current` is the same prefix for the local source; `—` means intentionally absent. The disposition checks used full hashes, not prefixes. Recompute against the manifest and the recorded Git parent plus this working diff when reviewing. No secrets or environment values are included.

| Runtime source path | Saved | Current | Disposition |
| --- | --- | --- | --- |
| `Core/index.ts` | `3f1440f9e207` | `18f0cf2b1e6e` | different |
| `Core/package-lock.json` | `239604ccd8e2` | `e9555fcdcd3f` | different |
| `Core/package.json` | `554ba0c95561` | `ff6c9588b94e` | different |
| `Core/scripts/lib/database-errors.d.mts` | `d4bba313114b` | `d4bba313114b` | exact |
| `Core/scripts/lib/database-errors.mjs` | `eaca0328c0de` | `eaca0328c0de` | exact |
| `Core/src/activity/mount.ts` | `03b862bbfe74` | `03b862bbfe74` | exact |
| `Core/src/ai/openai-provider.ts` | `83634dc6c643` | `83634dc6c643` | exact |
| `Core/src/ai/provider-error.ts` | `2bd9fbea2982` | `2bd9fbea2982` | exact |
| `Core/src/ai/provider-factory.ts` | `fad89e2c7027` | `fad89e2c7027` | exact |
| `Core/src/ai/provider.ts` | `8b14809c1f4c` | `8b14809c1f4c` | exact |
| `Core/src/ai/zai-provider.ts` | `994e14d149da` | `994e14d149da` | exact |
| `Core/src/app.ts` | `78226381ada9` | `0f5ac3097761` | different |
| `Core/src/config.ts` | `5947a0616807` | `5947a0616807` | exact |
| `Core/src/context/factory.ts` | `69f827a2b1c2` | `69f827a2b1c2` | exact |
| `Core/src/context/in-memory-store.ts` | `6e60acfdacd9` | `6e60acfdacd9` | exact |
| `Core/src/context/neon-store.ts` | `8a0ad70b2f4e` | `8a0ad70b2f4e` | exact |
| `Core/src/context/operations.ts` | `af30c5e5234b` | `af30c5e5234b` | exact |
| `Core/src/context/routes.ts` | `b390054de7cc` | `197a9d684de7` | different |
| `Core/src/context/service.ts` | `bceb1321e84f` | `94b4e462e6d7` | different |
| `Core/src/context/types.ts` | `8e6c6c67a538` | `8e6c6c67a538` | exact |
| `Core/src/contracts.ts` | `403f12f84aed` | `403f12f84aed` | exact |
| `Core/src/control-center/approval-transaction.ts` | `8e47911a1e25` | `8e47911a1e25` | exact |
| `Core/src/control-center/mount.ts` | `bfc7e188de26` | `bfc7e188de26` | exact |
| `Core/src/control-center/projects.ts` | `0061eed4101a` | `0061eed4101a` | exact |
| `Core/src/index.ts` | `318cd3d99976` | `a12ff5e11ad4` | different |
| `Core/src/mcp/mount.ts` | `9006facbea38` | `9006facbea38` | exact |
| `Core/src/mcp/server.ts` | `135b50083c06` | `739a01d8fcf9` | different |
| `Core/src/memory/commands.ts` | `e7144857c98e` | `e7144857c98e` | exact |
| `Core/src/memory/factory.ts` | `02537c8b85ad` | `02537c8b85ad` | exact |
| `Core/src/memory/in-memory-store.ts` | `143e8afa499d` | `143e8afa499d` | exact |
| `Core/src/memory/neon-store.ts` | `4d2ef9e69d91` | `4d2ef9e69d91` | exact |
| `Core/src/memory/policy.ts` | `ccc90c22bc0b` | `ccc90c22bc0b` | exact |
| `Core/src/memory/service.ts` | `afb16b6c82de` | `afb16b6c82de` | exact |
| `Core/src/memory/types.ts` | `495c63cc112c` | `495c63cc112c` | exact |
| `Core/src/operations/backup-readiness.ts` | `b046209a1e2c` | `b046209a1e2c` | exact |
| `Core/src/operations/readiness.ts` | `78f1a05e19f5` | `78f1a05e19f5` | exact |
| `Core/src/operations/staging-target.ts` | `b9c1a89553b7` | — | omitted |
| `Core/src/prompts/bob.ts` | `584f67b98e7e` | `584f67b98e7e` | exact |
| `Core/src/runtime.ts` | `5201d3028f2a` | `4f185aa31537` | different |
| `Core/src/security/interface-credential.ts` | `6ec6121d35c2` | `a7ee56dce978` | different |
| `Core/src/security/oauth.ts` | `f4854404605f` | `f4854404605f` | exact |
| `Core/src/security/rate-limit.ts` | `8bd0f04b9c38` | `8bd0f04b9c38` | exact |
| `Core/src/security/token.ts` | `6c4d210bffee` | `6c4d210bffee` | exact |
| `Core/src/server.ts` | `ea76ae781313` | `ea76ae781313` | exact |
| `Core/tsconfig.json` | `bda8a61febbb` | `bda8a61febbb` | exact |
| `Core/vercel.json` | `5e16c3401d6f` | `5e16c3401d6f` | exact |
| `Web/app/.well-known/[...path]/route.ts` | `f8b39315a2c6` | `f8b39315a2c6` | exact |
| `Web/app/account/page.tsx` | `442f223037b3` | `66098fe0b378` | different |
| `Web/app/api/approvals/[taskId]/route.ts` | `613fec7f2410` | `613fec7f2410` | exact |
| `Web/app/api/auth/[...all]/route.ts` | `a245786c2ba8` | `a245786c2ba8` | exact |
| `Web/app/api/chat/route.ts` | `bd4e05cb85cb` | `bd4e05cb85cb` | exact |
| `Web/app/api/checkpoint-import/route.ts` | `f631f6c49f01` | `f631f6c49f01` | exact |
| `Web/app/api/connections/[id]/route.ts` | `f25fc809cbb1` | `f25fc809cbb1` | exact |
| `Web/app/api/connections/consent/route.ts` | `a275bf41a116` | `a275bf41a116` | exact |
| `Web/app/api/credentials/[credentialId]/route.ts` | `49cb3d6a1217` | `49cb3d6a1217` | exact |
| `Web/app/api/health/configuration/route.ts` | `f9fb2c84f2fa` | — | omitted |
| `Web/app/api/health/route.ts` | `4d1f5d5b078a` | `4d1f5d5b078a` | exact |
| `Web/app/api/logout/route.ts` | `85e1d1ad9733` | `85e1d1ad9733` | exact |
| `Web/app/api/projects/route.ts` | `942a90356f95` | `fcec1261886c` | different |
| `Web/app/api/session/route.ts` | `99872706253f` | `81b6f73a64b6` | different |
| `Web/app/api/tasks/[taskId]/route.ts` | `8507a3842aa3` | `8507a3842aa3` | exact |
| `Web/app/api/tasks/route.ts` | `8f91a9679861` | `47e33986af5e` | different |
| `Web/app/chat/page.tsx` | `ce14a759c50e` | `ce14a759c50e` | exact |
| `Web/app/connect/page.tsx` | `b19848655c42` | `b19848655c42` | exact |
| `Web/app/error.tsx` | `a9347c7614ff` | `a9347c7614ff` | exact |
| `Web/app/globals.css` | `31e584ed34b4` | `31e584ed34b4` | exact |
| `Web/app/import/page.tsx` | `e9f6e7f7182e` | `e9f6e7f7182e` | exact |
| `Web/app/layout.tsx` | `f2d4b0439fea` | `f2d4b0439fea` | exact |
| `Web/app/loading.tsx` | `768738cb4d3a` | `768738cb4d3a` | exact |
| `Web/app/login/page.tsx` | `dee3667e41e6` | `736b1176f5a1` | different |
| `Web/app/page.tsx` | `6e10512d031e` | `8cf1c839b1ff` | different |
| `Web/app/projects/new/page.tsx` | `e0e3451bde63` | `e0e3451bde63` | exact |
| `Web/components/activity-timeline.tsx` | `2f373a8c897c` | `2f373a8c897c` | exact |
| `Web/components/bob-mark.tsx` | `ef4485849c94` | `ef4485849c94` | exact |
| `Web/components/context-source-status.tsx` | `33bc898cb45e` | `33bc898cb45e` | exact |
| `Web/components/control-center-v2.module.css` | `fbb374048c86` | `fbb374048c86` | exact |
| `Web/components/control-center-v2.tsx` | `b845c74286aa` | `0b6b4890b021` | different |
| `Web/components/owner-checkpoint-import.tsx` | `5d4616796aa8` | `dd27433fd530` | different |
| `Web/components/owner-connect.tsx` | `8af6a93f18be` | `8af6a93f18be` | exact |
| `Web/components/owner-login.tsx` | `1b724bba8d2d` | `758f4ce57575` | different |
| `Web/components/owner-security.tsx` | `eb336b6df109` | `eb336b6df109` | exact |
| `Web/components/project-connections.tsx` | `597fb0df9ad5` | `597fb0df9ad5` | exact |
| `Web/components/project-creator.tsx` | `8099a0266745` | `8099a0266745` | exact |
| `Web/components/project-state.tsx` | `a3f8340e66e1` | `a3f8340e66e1` | exact |
| `Web/components/status-card.tsx` | `49f69a6143a4` | `49f69a6143a4` | exact |
| `Web/components/task-manager.tsx` | `860b4fe73018` | `1dafc476c27d` | different |
| `Web/components/today-summary.tsx` | `fa0dcb9c1957` | `fa0dcb9c1957` | exact |
| `Web/components/workspace-chat.tsx` | `83b22bad36e9` | `83b22bad36e9` | exact |
| `Web/lib/auth-client.ts` | `7d8389cafe0e` | `7d8389cafe0e` | exact |
| `Web/lib/bob-core.ts` | `69b81a8a0929` | `159341e280b9` | different |
| `Web/lib/checkpoint-import.ts` | `fc883317ac56` | `9154797b03a9` | different |
| `Web/lib/database-errors.d.mts` | `d4bba313114b` | `d4bba313114b` | exact |
| `Web/lib/database-errors.mjs` | `eaca0328c0de` | `eaca0328c0de` | exact |
| `Web/lib/oauth-grants.ts` | `f30cb094f326` | `f30cb094f326` | exact |
| `Web/lib/oauth-provider.ts` | `b3cc8ba4225c` | `b3cc8ba4225c` | exact |
| `Web/lib/oauth-sessions.ts` | `bbf9272ade89` | `bbf9272ade89` | exact |
| `Web/lib/owner-auth.ts` | `4be7ac4f89a0` | `a6927f43c176` | different |
| `Web/lib/project-contract.ts` | `51595da43fcc` | `51595da43fcc` | exact |
| `Web/lib/session.ts` | `8e77fe9f5dca` | `8e77fe9f5dca` | exact |
| `Web/lib/staging-target.ts` | `eccd5ef694c5` | — | omitted |
| `Web/lib/task-api.ts` | `a253b0a4f056` | `62efb2eac14d` | different |
| `Web/lib/task-contract.ts` | `9a9636c13b3f` | `9a9636c13b3f` | exact |
| `Web/lib/task-due-date.ts` | `6dd1e07d180d` | `6dd1e07d180d` | exact |
| `Web/lib/types.ts` | `420be614fcde` | `ef4c48f1f43d` | different |
| `Web/next-env.d.ts` | `5aae30a10eb3` | `5aae30a10eb3` | exact |
| `Web/next.config.ts` | `2351c58008ef` | `04bfff1a0350` | different |
| `Web/package-lock.json` | `049ce4ac2514` | `dc246bac60b6` | different |
| `Web/package.json` | `a00126bd446d` | `3106f605df7d` | different |
| `Web/tsconfig.json` | `a8615e7a337f` | `a8615e7a337f` | exact |
| `Web/vercel.json` | `59dee2b94de5` | `ce21d3337954` | different |
