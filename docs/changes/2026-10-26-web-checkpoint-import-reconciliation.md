# Owner-reviewed Web checkpoint-import reconciliation

Date: 2026-10-26 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented and tested locally; review diff, not deployed or operationally accepted**. Branch: `codex/reconcile-web-checkpoint-import`. Parent: `2f49117d9bbf6d9905f6a571ad3cbe54e0995505` (`Reconcile Web tasks context and projects with Core task APIs`). No push, PR, merge, deployment, migration execution, credential change, live import, or Production write occurred.

## Preflight and predecessor review

Read `AGENTS.md`, `.bob/project.yml`, and the project, interface and activity standards. The owner requested review of the task/context/project slice, followed by the owner-reviewed checkpoint importer and the remaining saved-source inventory. BobCore remains authoritative for shared state; repository source remains implementation evidence.

Fresh tool discovery exposes only the retired staging connector. The owner explicitly retired that connection. It was not called or treated as BobCore, and no authentication was bypassed. Current BobCore authority, project/environment identity, revision, timestamps, source availability and active task versions could not be verified. Local work proceeds under the owner's explicit instructions and verified source; the checkpoint below remains pending and not uploaded.

The preceding 34-file slice was rechecked for owner/project isolation, task reads and private projections, approval-task denial, compatible UUID assertions, version conflicts, retained retries, receipt readback, source availability and workflow navigation. **All 76 targeted tests passed** across its three regression files, continuity and interface-credential suites. No actionable defect was found in that bounded self-review. Its change record was updated and the reviewed slice preserved as local commit `2f49117` before this successor branch was created. This is the implementing agent's review, not independent approval.

## Source selection and preserved architecture

All **110 saved runtime source files** were reverified against the October 23 release manifest. The [complete source inventory](2026-10-26-bobcore-source-reconciliation-inventory.md) records the immutable GitHub baseline, local parent, manifest identity, every current hash and every intentional difference. The saved payload now compares as **78 exact, 29 different, three omitted**. All **24 repository governed-workflow files** outside the payload remain byte-identical to the pinned GitHub baseline.

The saved `/import` page and `/api/checkpoint-import` route are restored exactly. The saved importer and owner component are selectively reconciled with stronger shared validation and recovery checks. Existing Core handoff service/receipts, owner authentication/session/CSRF proofs, Core client configuration, account page, and Web styles are reused. The account link preserves the guarded `/work` versus dashboard entry. There is no new memory authority or Core endpoint/schema in this slice.

Vercel remains the primary Web/Command Center and Core host; Neon retains authoritative memory/project state. The Acer is still a future compute node. This saved portable-file workflow is deliberately pinned to Production Core and `VERCEL_ENV=production`; it rejects Preview/local/staging connections. Source preparation and synthetic tests do not enable a real import or make copying privileged Production credentials to a local Web installation acceptable. A future testing/general-purpose import contract needs explicit environment and identity design.

## Review, authorization and import behavior

The owner opens `/import` through the existing account page, selects a prepared JSON file, reviews the proposed checkpoints beside current context, then explicitly checks the confirmation box and submits. Selecting a file makes no network request. Review sends the selected content to the authenticated Web server and reads Core context; it creates no handoff. Existing Core reads can record normal `context.retrieved` audit events, so review is not represented as a completely side-effect-free operation.

The shared contract accepts one to four unique destinations from the saved fixed BobAI, FOMOflow, RFQ and Personal project identities. Each must match its key, stored UUID and name exactly. These identifiers are destination assertions, not grants or newly verified registrations. Personal still requires its separately authorized scope; project-bound credentials cannot use the file to cross into another project. No real Personal data was accessed in this task.

Files are bounded to 56 KiB. The server bounds streamed request bodies at 65,536 bytes, rejects invalid UTF-8, requires JSON and the exact review/commit envelope, validates bounded outcome/unresolved/next-action fields, and rejects duplicate projects or operation IDs. Browser and server share the same bundle, review and receipt contract. Unknown server fields are excluded from browser receipt projections.

Both review and commit require a current owner session, same-origin POST and the current session's CSRF token. Server helpers require the pinned Core URL and Production environment before reading, signing or writing. The existing HMAC helper binds the review to the owner, Core URL, server-only credential and exact payload; it does not grant access. Another session for the same owner needs its new CSRF token. Changed owner, credential or signing material invalidates the proof. No credential value reaches the browser.

Context validation checks `bob-core` authority, requested project and `web` surface, active project identity, revision and source metadata. Generated time and required decisions/tasks/handoffs check times must be at most five minutes old and at most 30 seconds ahead. Missing or unavailable required sources prevent review. Bounded results remain usable only with visible truncation/partial warnings; the UI never presents their absence as proof that no records exist.

The five-minute review proof binds the exact normalized bundle and the returned project/decision/task/handoff state, including required-source truncation flags. The UI displays the revision, source check times, active decisions, active tasks, recent handoffs and the precise new checkpoint. Unrelated operational events are excluded from the state digest; the displayed overall revision is evidence, not an atomic version lock. The stores already exclude `context.retrieved` events from the context package's recent-event list. That distinction was clarified during the successor's context tests; the review-proof behavior did not change. Unrelated source partial flags are disclosed but are not part of the checkpoint state assertion.

Commit checks every project's current context before the first write, then rechecks each immediately before writing, including expiry after awaited reads. Core receives the existing `recordHandoff` shape with the original operation ID and expected project UUID. The operation appends a checkpoint and its ordinary event; it does not activate a decision, update a task, create approved memory or replace existing state.

## Receipts, retries and recovery limits

The server verifies the returned handoff UUID, destination, exact outcome and arrays, and idempotency flag. It then reads current context. A fresh result requires matching visible readback. An identical retry can also recover an older operation receipt outside the four-handoff context window; it is labelled as receipt verification instead of current-context visibility. A receipt received before failed readback remains explicitly unconfirmed.

The browser preserves receipts from partially completed batches, locks the selected file after an attempt, and requires another context review before a deliberate retry with the same IDs and content. It never automatically retries or replaces an uncertain operation with a new ID. Conflicting IDs and changed project bindings stop continuation for manual reconciliation. Duplicate clicks are guarded; malformed responses cannot produce a success state. Completion requires a verified receipt for every requested checkpoint.

The selected file is held only in component memory; it is not copied into browser session storage. Reload recovery requires selecting the same unchanged original file, reviewing current context again, and using its original IDs. Losing or editing that file can prevent safe recovery. Closing the tab can discard displayed receipts. The file and browser state are neither a backup nor a new memory authority, and they do not implement the planned one-hour encrypted worker buffer.

**A multi-project batch is not atomic.** Earlier projects may commit while a later project fails. Existing Core operation receipts provide per-project idempotency. The last context read and handoff write are also separate operations: concurrent state can change between them. UUID enforcement occurs in Core, but the review proof is a bounded freshness check, not a transactional compare-and-write across all reviewed context. These limits must remain visible in release review.

## Changed-file inventory

Exactly **14 files** belong to this successor diff: seven Web source files, three test files and four documentation files. The preceding 34-file slice is already in the parent commit.

| Area | Paths |
| --- | --- |
| Shared and server contracts | [checkpoint contract](../../Web/lib/checkpoint-import-contract.ts), [import handler](../../Web/lib/checkpoint-import.ts), [Core client helpers](../../Web/lib/bob-core.ts) |
| Owner interface | [page](../../Web/app/import/page.tsx), [API route](../../Web/app/api/checkpoint-import/route.ts), [component](../../Web/components/owner-checkpoint-import.tsx), [account entry](../../Web/app/account/page.tsx) |
| Regression coverage | [contract/handler recovery](../../Core/tests/web-checkpoint-import.test.mjs), [real Web route/Core authorization](../../Core/tests/web-checkpoint-route.test.mjs), [existing provider timeout test synchronization](../../Core/tests/openai-provider-request.test.ts) |
| Documentation | This record, [complete source inventory](2026-10-26-bobcore-source-reconciliation-inventory.md), [Web README](../../Web/README.md), [implementation index](../../implementation.md) |

All Core runtime/provider/workflow source, authentication/session/consent source, migrations, dependency manifests/locks, deployment settings and credential/project configuration are unchanged against `2f49117`. Migration 008 retains SHA-256 `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e`; it was not executed. Build-generated `next-env.d.ts` is restored to its original bytes.

## Validation

Node `24.19.0` and existing installed locked dependencies were used. All fixtures contain synthetic content. Full checks ran with a clean child-process environment and no database inputs or enabled hosted/database fixtures.

- **41 focused tests pass:** 22 contract/handler cases and 19 real Next-route/Core integration cases. Against the saved importer baseline, 10 of the initial 22 cases failed; the reconciled source passes all 22. Coverage includes authority/surface/project identity, stale and unavailable sources, truncation changes, exact payload/proof binding, expiry during reads, streamed limits, owner/CSRF checks, revoked credentials, project and Personal isolation, changed UUID at write, conflicting IDs, concurrent identical commits, partial batches, lost responses and historical receipt recovery.
- **Core `npm run check` passes:** type checking, **702 tests across 57 files**, eight lifecycle tests and three bootstrap import dry runs. **106 tests across six files remain skipped** because database/hosted fixtures were not enabled. The initial full run exposed an existing fake-clock race in the OpenAI timeout test, reproduced in isolation. The test now waits until asynchronous route authentication has started the SDK request before advancing the clock. The isolated seven-test provider suite and full rerun pass; provider runtime source did not change.
- **Web `npm run check` passes:** type checking and Next.js `16.3.2` webpack build, including `/import` and `/api/checkpoint-import`.
- **Synthetic Chromium acceptance passes:** actual React component bundled with installed dependencies, real import handler and in-memory Core service. Every page/API request was intercepted on a synthetic origin; no app listener, real owner session, hosted request or database was used. Checks covered review without handoff creation, required confirmation, partial two-project recovery after reload using unchanged IDs, wrong-environment rejection, unavailable context, expired review, fatal conflicting IDs, a 390-pixel receipt layout without horizontal overflow, and no page errors. The mobile screenshot was visually inspected. Installed Playwright library was used after the previously established CLI-cache limitation; no package was installed.

These checks do not prove PostgreSQL transaction isolation, actual Better Auth/passkey/OAuth sessions, hosted network failure behavior, or owner acceptance of a real import. The browser harness and logs are temporary local evidence, not release artifacts. The implementing agent's bounded source/React review found no remaining actionable defect; independent review remains pending.

Final diff validation covers the exact 14 paths, whitespace/conflict markers, local Markdown links/fences, saved manifest hashes and inventory counts, preserved workflow files, unchanged protected runtime/configuration/migration paths, and absence of non-example `.env` files. This is local validation only.

## Next task and blockers

Follow-up review on 2026-10-26 before hybrid contracts: rechecked file/context/proof validation, current owner and Core authorization, expiry after awaited reads, exact retry and conflict handling, partial receipts, and the browser confirmation/recovery boundaries. All **83 targeted tests** passed across checkpoint contract/route, owner-session, OAuth checkpoint and provider timeout suites. The 14-file scope, 110 saved hashes, 78/29/3 source disposition and 24 preserved workflow files were revalidated. No actionable defect was found in this bounded self-review; independent review and live acceptance remain separate. This reviewed slice is preserved locally before its successor begins.

**Recommended next implementation task, after review: disabled hybrid contracts and explicit manual routing policy**, proposed local branch `codex/bobcore-hybrid-contracts`. Define device/job DTOs and project/environment/capability bindings, route choices, context revision/policy attachment and no-silent-fallback behavior behind a default-off gate. Prove contract validation and denial behavior with synthetic tests; retain the current provider. Enrollment/heartbeat, durable jobs, Ollama inference and minimal existing-Web integration remain later slices. Jarvis execution, automatic routing, advanced dashboard features, voice and genuine local-only processing remain subsequent milestones.

Remaining blockers and limits: no verified callable BobCore connection or synchronized task/version; independent review and isolated database/session acceptance pending; current deployed parity not refreshed; historical Production Codex acceptance and password-retirement gates unresolved; verified backup and complete isolated restore readiness unproven; Acer hardware, Ollama capacity, service configuration and suspend/reconnect behavior unverified. Recovery readiness must precede risky schema/access/cutover changes. The first hybrid operational milestone remains authenticated Acer heartbeat followed by one successful BobCore-routed Ollama inference in a verified testing environment.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-26. Project: `bobai` / `boisey9/BobAI`. Intended surface: `codex`. Stable operation ID: `b3b606f7-8f0a-49d0-9ad3-5f950b8bf457`. Task ID/expected version unavailable.

Outcome: reviewed the task/context/project slice with 76 passing targeted tests and preserved it as local commit `2f49117`. Prepared owner-reviewed Web checkpoint-import reconciliation on `codex/reconcile-web-checkpoint-import`, reusing current owner authentication, Core handoffs and operation receipts. Added exact file/context/proof validation, explicit confirmation, partial-batch and identical-retry recovery. Accounted for every saved runtime-source difference while retaining governed-workflow integration and omitting retired staging diagnostics.

Evidence: 110/110 saved source hashes verified; current comparison 78 exact, 29 reviewed differences, three intentional omissions; 24 governed-workflow files preserved. All 41 checkpoint tests, 702 full Core tests, eight lifecycle checks, three import dry runs, Web types/build and synthetic browser recovery/mobile checks pass. 106 database/hosted tests remain skipped. A reproduced fake-clock race was fixed in an existing test without changing provider runtime. The 14-file diff is local and reviewable.

Unresolved: proper BobCore synchronization, independent review, real database/session/owner acceptance, operational recovery/access gates and Acer readiness. Next: review this slice, then prepare disabled hybrid contracts/manual routing policy. No live checkpoint was imported, no decision activated, no release gate closed and no hybrid runtime accepted. When a correctly scoped BobCore connection and checkpoint-write authorization are available, retrieve fresh context, verify authority/project/environment/surface/revision/timestamps/source completeness, resolve the task/version, inspect existing receipts, submit the concise checkpoint and verify readback. Reuse this operation ID only for identical submitted content. This local record is not evidence of synchronization.
