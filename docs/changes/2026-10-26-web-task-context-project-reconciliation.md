# Web task, context and project reconciliation

Date: 2026-10-26 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented and tested locally; independent review and live acceptance pending**. Branch: `codex/reconcile-web-task-context`. Base: reviewed Web authentication/session/consent commit `fccbf791fc01e939ff1516a773f9f85cbfc1cd63`, following provider/runtime `2cb86dd`, identity/checkpoints `681ad29`, and [Hybrid Phase 0](2026-10-26-bobcore-hybrid-phase-0.md). This slice is an uncommitted review diff on the local branch.

The owner requested review of the authentication/session/consent slice, then Web task/context/project reconciliation and remaining Core task APIs. The implementing agent rechecked private error handling, session/proof separation, optional checkpoint consent, grant revocation and preserved navigation. No actionable defect was found in that bounded self-review. **82 targeted tests passed** before preserving that predecessor locally as `fccbf79`. Independent review remains separate.

No push, PR, merge, deployment, migration, credential change, cloud-provider change, app listener, or Production mutation was performed. All task/project creations in this validation use synthetic in-memory fixtures. Vercel remains the primary Web host, BobCore remains the coordinator, and Neon remains the authoritative durable store. This work does not establish an Acer heartbeat, Ollama inference, or any other hybrid runtime milestone.

## Authority and source evidence

The [project mapping](../../.bob/project.yml), [agent guidance](../../AGENTS.md), and project/interface/activity standards apply. Fresh tool discovery still exposes only the retired Bob Core staging tools. They were not called. A correctly scoped BobCore response is unavailable: project UUID/environment, authenticated surface, revision, timestamps, source availability and truncation cannot be freshly verified. Current task IDs and expected versions are unknown. The pending checkpoint below is **local and not uploaded**.

The owner-identified [Prepare BobCore readiness](codex://threads/01a1507c-319e-7789-b2d7-d0bd4dc4e01a?hostId=durable) remains the historical operational handoff described in the predecessor. Its reported promotion and owner passkey/task/chat acceptance do not prove this local candidate. Production Codex acceptance and commissioning-password retirement remain unfinished in that reviewed record; live access was not changed or refreshed here.

All **110 saved runtime source files** (46 Core, 64 Web) were freshly SHA-256 checked against the October 23 [release manifest](/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/MANIFEST.json). Saved source root: `/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/source/`. This verifies the saved payload, not a new Production download. Historical differences from GitHub `36552fc` are not remaining-difference counts or a wholesale replacement specification.

| Source group reviewed | Reconciliation |
| --- | --- |
| Core context stores/types/service/routes | Select task list/detail contracts and approval-task protection; retain prior identity/checkpoint work and transactional receipts |
| Core credential gateway and MCP errors | Select task read authorization and approval error; protect HEAD reads too |
| Web task/project contracts, proxy routes and clients | Select saved interfaces; add bounded task body streaming, session-failure containment and diagnostic filtering |
| Web dashboard, project/context/activity/Today and credential views | Select honest source availability and bounded evidence displays; retain the repository's governed `/work` entry gate |
| Web task/project client components | Select connection-bound pending request recovery and receipt validation; bound retained task data and capture date/time input before deferred state updates |
| Existing Core owner-project creation, operation stores, authentication/session proofs and workflow integration | Reuse without replacing these implementations |
| Saved checkpoint-import and target-health code; dependency/build/deployment files | Inspect and defer; these are not prerequisites for task CRUD or project/context display |

## Behavior and security boundaries

### Core task APIs

`GET /v1/tasks` and `GET /v1/tasks/:id` now provide explicit, uncached task reads, separate from the bounded active-task context summary. Responses identify the canonical project UUID/key and check time. Lists include completed and cancelled tasks and paginate by creation time descending, then ID descending. Limits are 1–100; a cursor must identify a task in the same owner's active project. SQL compares stored timestamps directly so PostgreSQL microseconds are not lost in JavaScript conversion. Reads do not take task write locks.

Public task reads omit owner IDs and internal metadata. Approval tasks are marked `requiresApproval` and noneditable; cancelled tasks are noneditable. The gateway requires `context:read`, enforces project binding for GET and HEAD, excludes the legacy read credential, and preserves Personal restrictions. A genuine owner-wide Web credential remains the existing exception. Missing, foreign or archived resources do not become successful empty reads. No task operation invokes an AI provider.

Ordinary REST and MCP task updates reject decision-review tasks with `task_requires_approval`, before version checks or mutation. The owner approval workflow remains responsible for decision activation. Existing task status/version rules and operation receipts are retained.

### Project identity and retry compatibility

Saved Web task writes verified a UUID during preflight but sent only the project key to Core. This slice adds optional `expectedProjectId` to existing task create/update contracts. Web derives it from the authenticated Core read; browser payloads cannot supply it. Core checks it before receipt lookup and executes against that resolved project ID using the existing project-locked operation transaction. A changed mapping is rejected instead of redirecting the write.

The UUID is an assertion, not task content. Task fingerprints exclude this new optional field after the identity check because receipts are already owner/project-scoped. A pre-existing request without the guard can recover the same receipt when the correct guard is added; a wrong UUID still fails. Handoff fingerprints and all other operation kinds remain unchanged. Regression tests cover both task creation and update compatibility, concurrent identical requests, version conflicts, stale receipts, and wrong identity.

### Web task and project workflows

The existing Web app gains owner-session task list/detail routes and CSRF-protected task create/edit/complete routes. Task responses are validated and projected before reaching the browser. Connection proofs bind owner identity, Core URL/credential, project key and UUID; they supplement live authorization and CSRF. The current task version is reread before editing. A confirmed historical operation receipt is followed by a separate fresh task read before the task becomes editable again.

The project creation page uses the previously reconciled owner-only Core contract. It validates the Personal anchor and connection proof, sends a stable operation ID and expected anchor UUID, verifies the exact project receipt, and links to the new workspace. Creating a project does not enroll interfaces, import a repository, grant Personal access, or broaden another credential.

Unconfirmed requests retain the exact operation ID and payload in this tab's `sessionStorage`. Reloading or signing back into the same connection can recover the receipt. Changed connections lock editing; foreign pending contents are not loaded or transmitted. A previously attempted request stays retained after a rejected retry because its earlier outcome can remain unknown. A definitive first-attempt rejection may be corrected. Duplicate clicks are guarded. Missing/unavailable storage prevents sending.

This transient browser state contains task/project content; it is neither encrypted operational storage nor approved memory. Closing a tab or clearing storage can lose recovery details. Session storage is not a backup, does not grant authorization, and has no promised timed expiry. The Phase 0 one-hour encrypted worker buffer is a separate future design.

Task request bodies are bounded while streaming at 16,384 bytes and project bodies at 24,576 bytes, including missing Content-Length. Invalid UTF-8, JSON lookalike media types and invalid authority fields are rejected. Web task queries reject duplicate project/cursor parameters. Owner-session failures and Core errors produce fixed public diagnostics; unrecognized error codes and unsafe request IDs are not forwarded.

Due dates use explicit local date/time fields and the browser's displayed timezone. Invalid calendar dates, partial values, daylight-saving gaps and ambiguous repeated times are rejected for new/changed dates. Unchanged values preserve the original stored instant, including seconds, fractions and either occurrence of a repeated local time. These dates do not schedule reminders.

### Context and existing dashboard

Web checks context authority, requested project/surface, canonical project UUID, active status, generated timestamp and top-level collections before displaying it. Foreign activity and mismatched administration workspaces are rejected. Dependency exceptions are not echoed into dashboard messages. Missing source metadata remains unverified; unavailable data is not shown as an empty successful result.

The existing dashboard now displays context revision, per-source freshness/truncation, active decisions, approved memory and recent handoffs. Today suggestions and counts describe returned records only, exclude approval items, and omit tasks whose approval classification cannot be verified. Proposals stay separate from active decisions. Activity uses allowlisted detail fields and distinct element IDs for repeated records. The interface inventory shows every returned credential for a surface rather than choosing only one.

Recorded release activity and a healthy status endpoint do not establish build/runtime/functional acceptance. The dashboard explicitly labels release acceptance unverified. The governed-workspace entry gate and all existing workflow source/feature gates remain intact.

## Changed-file inventory

Exactly **34 files** belong to this slice: seven Core source files, 20 Web source/style files, three regression files and four documentation files.

| Area | Paths |
| --- | --- |
| Core stores/contracts | [types](../../Core/src/context/types.ts), [in-memory store](../../Core/src/context/in-memory-store.ts), [Neon store](../../Core/src/context/neon-store.ts) |
| Core behavior/boundaries | [service](../../Core/src/context/service.ts), [routes](../../Core/src/context/routes.ts), [credential gateway](../../Core/src/security/interface-credential.ts), [MCP errors](../../Core/src/mcp/server.ts) |
| Web contracts/client | [types](../../Web/lib/types.ts), [Core client](../../Web/lib/bob-core.ts), [task contract](../../Web/lib/task-contract.ts), [task API helpers](../../Web/lib/task-api.ts), [due date](../../Web/lib/task-due-date.ts), [project contract](../../Web/lib/project-contract.ts) |
| Web routes/pages | [task collection](../../Web/app/api/tasks/route.ts), [task detail](../../Web/app/api/tasks/[taskId]/route.ts), [projects](../../Web/app/api/projects/route.ts), [new project](../../Web/app/projects/new/page.tsx), [dashboard](../../Web/app/page.tsx) |
| Web components | [task manager](../../Web/components/task-manager.tsx), [project creator](../../Web/components/project-creator.tsx), [source status](../../Web/components/context-source-status.tsx), [Today](../../Web/components/today-summary.tsx), [project state](../../Web/components/project-state.tsx), [activity](../../Web/components/activity-timeline.tsx), [owner controls](../../Web/components/control-center-v2.tsx) |
| Styles | [global styles](../../Web/app/globals.css), [owner-control styles](../../Web/components/control-center-v2.module.css) |
| Regression coverage | [Core task reads/guards](../../Core/tests/task-read-reconciliation.test.mjs), [Web/Core task/project integration](../../Core/tests/web-task-project.test.mjs), [context presentation/input contracts](../../Core/tests/web-context-presentation.test.mjs) |
| Documentation | This record, [Core README](../../Core/README.md), [Web README](../../Web/README.md), [implementation index](../../implementation.md) |

## Validation and limits

Validation uses Node `24.19.0`, installed locked dependencies and synthetic content. The initial Core task API regression run failed 15 cases and passed four before reconciliation. The focused final suite passes **58 tests**: 21 Core task checks, 29 Web/Core integration checks and eight presentation/input checks. These exercise real Hono gateways, Core services and Next route handlers over in-memory stores and intercepted transports, not a real database or live credentials.

Full Core `npm run check` passes **661 tests** across **55 files**, plus all eight lifecycle tests and three bootstrap import dry runs. **106 tests across six files remain skipped** because database/hosted fixtures were not enabled. Core type checking passes. Web `npm run check` passes type checking and the Next.js `16.3.2` webpack build, including the new project/task routes. Both full checks ran with a clean child-process environment, no database inputs or enabled database/hosted fixtures. No `.env` files exist apart from the tracked examples.

The actual React task/project components were bundled into a temporary browser harness using installed dependencies. All page/API requests were intercepted on a synthetic origin; no app listener, real session, hosted endpoint or database was used. The Playwright CLI package was unavailable in the local cache, so the installed Playwright browser library ran the same ad hoc check without an installation. Chromium required permission to use its local macOS process channel. Browser results passed:

- Multi-character title/details/date/time input; invalid calendar input sends no mutation.
- Existing ambiguous due time preserves its exact ISO instant when unchanged.
- Edit, completion, fresh version-conflict state and approval-only navigation.
- Lost-response task save, reload, identical retry and fresh readback after a historical receipt.
- Changed connection clears stale state and locks editing.
- Project address generation, uncertain creation, reload/retry, exact receipt and workspace link.
- A 390-pixel mobile viewport without horizontal overflow; screenshot inspected; no page errors.

These tests do not prove PostgreSQL concurrency/roles, network timeout behavior in deployment, passkey/OAuth acceptance or real owner-session recovery. Those need separately authorized isolated runtime acceptance. No skipped gate is represented as passing.

Final validation: all 34 changed paths are included in the inventory above; whitespace/conflict-marker and local Markdown link/fence checks pass. The generated `next-env.d.ts` was restored to its original bytes. No actionable defect remains from the implementing agent's bounded self-review; independent review remains pending. Browser harness files and build/test logs are temporary local evidence, not release artifacts or committed source.

## Preserved, deferred and next task

Follow-up review on 2026-10-26 before checkpoint-import reconciliation: the implementing agent rechecked owner/project boundaries, pagination and private projections, approval-task denial, version conflicts, compatible UUID assertions, retained retries and fresh receipt readback, context availability, and preserved workflow navigation. No actionable defect was found in this bounded self-review. All **76 targeted tests** passed across the three slice regression files, continuity and interface-credential suites. The reviewed slice is preserved on its local branch before the successor begins; independent review and live acceptance remain separate.

All Core provider/runtime/workflow source, Web authentication/session/consent source, migrations, dependency manifests/locks, deployment settings and credential/project configuration remain unchanged against `fccbf79`. Migration 008 retains SHA-256 `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e`; it was not executed. The build-generated `next-env.d.ts` is excluded from the intended diff.

**Recommended next implementation task: reconcile the owner-reviewed Web checkpoint-import flow and close the remaining saved-source inventory**, on a separate proposed local branch `codex/reconcile-web-checkpoint-import`. Review the saved checkpoint contract, consent/review proof, Core client, preview/submit route and component as one bounded owner workflow. Prove project/connection/payload binding, explicit review before write, identical replay/conflicting operation IDs, partial-source handling and privacy. Preserve existing workflow gates, and document intentional differences in retired staging diagnostics and repository build/runtime integration. Do not activate imports, grants or release settings. This is recommended follow-up, not performed or approved by this record.

After source reconciliation and review, the approved Hybrid Phase 0 sequence continues with disabled hybrid contracts and manual routing policy, device enrollment/revocation/heartbeat, durable jobs, and the Ollama acceptance flow. Jarvis, automatic routing and advanced dashboard capabilities remain later milestones.

Blockers and limitations: no verified callable BobCore connection; independent review and isolated database/session acceptance pending; historical Production Codex/password-retirement gates unresolved; current backup artifact and complete isolated restore readiness unproven; Acer hardware/Ollama/service/suspend/reconnect acceptance unverified. Recovery verification must precede risky schema/access/cutover changes. Read-only source reconciliation and local documentation do not depend on that recovery gate.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-26. Project: `bobai` / `boisey9/BobAI`. Intended surface: `codex`. Stable operation ID: `cae3d679-3596-4280-b83a-8393696272aa`. Current task ID/version unavailable.

Outcome: reviewed the Web authentication/session/consent slice with 82 targeted tests and preserved it as local commit `fccbf79`. Prepared task/context/project reconciliation and remaining Core task APIs on `codex/reconcile-web-task-context`. Added explicit task reads, approval protection, compatible UUID write guards, owner task/project recovery and honest context-source displays. Preserved existing coordinator/database/hosting authority and workflow gates.

Evidence: all 110 saved source files match the manifest; 58 focused tests and 661 full Core tests pass, plus eight lifecycle checks and three import dry runs; 106 database/hosted cases remain skipped. Web types/build and synthetic browser task/project recovery/mobile checks pass. The 34-file diff passes scope, whitespace and documentation checks. Changes are local and reviewable; no remote publication, Production write, deployment, migration, credential or provider change occurred.

Unresolved: verified BobCore synchronization, independent/live acceptance, separate checkpoint-import reconciliation, operational access/recovery gates and Acer readiness. Next: review this slice and the recommended bounded checkpoint-import follow-up. When the proper connection is available and checkpoint writes are authorized, retrieve fresh context, validate authority/project/environment/surface/revision/timestamps/source completeness, resolve task/version if relevant, inspect prior receipts, submit the concise checkpoint and verify readback. Reuse the operation ID only for identical submitted content. This record is not an uploaded checkpoint, active decision or hybrid acceptance result.
