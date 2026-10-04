# Private first-release project workflow — initial local slice

## Objective and scope

Owner authorization September30 19:55UTC asks for phased implementation starting with the core project workflow and an early owner-reviewed prototype. This slice proposes the experience **Project → Capture/resume → Specification → Evidence → Owner approval**, preserving Bob's existing identity. It does not assume an accepted visual preference or a final first-release feature cut.

Isolated branch `codex/bobcore-project-workflow-prototype`, based on current main `78bf3d066977262d6c4b6142634e34a3707832f3`, lives in the task workspace. The original BobAI dirty checkout and its calendar/project/native work are untouched; no broad overlay or reset/stash/clean is used. Existing Core/Web dependency installations are linked for local verification only; those links are excluded from the review delta. No commit/push, external artifact sharing, deployment, live records, settings, migrations, grants or backup activation occurs.

The separate event-only commit `71c8715` was initiated under direct “proceed” authorization and completed as the subsequent audit request arrived, before audit source inspection. It is not an audit commit or part of this prototype branch, and remains unpushed.

## Concrete work sequence

1. **S1, this slice:** local desktop/mobile screen prototype, honest state/recovery fixtures, and an unwired candidate-acceptance evaluator. Bring the screens to the owner before expanding the UI. Decide whether the project/work-packet arrangement is the right starting point and confirm navigation/capture/spec/review expectations.
2. **S2, after reviewed contracts:** durable scoped work-packet/spec/candidate/evidence/approval records and atomic transition/operation receipts. Establish trusted authority, immutable evidence, predecessor rules, expiry/invalidation and regression baseline. Exercise forged/stale/wrong-project/replayed inputs, concurrent retries, crash/restart and restoration in an isolated database. No runtime advancement until these dependencies are real.
3. **S3:** implement the accepted project history and memory-review lifecycle, priorities/parking and scoped export/attachments in small slices. Resolve retention/export/deletion boundaries before affected behavior. Reuse existing task receipts and source filtering.
4. **S4:** accept real owner/client scope and recovery in the selected candidate/environment; preserve existing compatibility access until replacement is verified. Any new grant or credential remains separately authorized.
5. **S5:** prepare the exact backup/operator activation and full service recovery drill; execute only with the specific storage/live-data approval. The false scheduled-backup flag is not changed here.
6. **S6:** clean product branch checks, candidate-bound desktop/native/client acceptance, deployment/rollback evidence and owner release decision. Calendar/events/extra integrations stay separate unless included.

## UI implementation and behavior

New local route `/prototype/project-workflow` reuses existing `BobMark`, global theme tokens and typography. It does not replace the existing dashboard or task/calendar UI. Project context and goal remain visible; project work, history/memory and owner review are primary navigation. Capture, one current work packet, acceptance criteria, evidence and approval are together. Priorities/parking are proposed labels, not a mapping to current task-storage priorities. Candidate/source diagnostics are collapsed and secondary.

Synthetic fixtures cover ready, loading, empty, source unavailable, offline pending and changed-candidate states. Captures are project-scoped in React memory only and reset on reload; pending capture retries simulate one receipt without another item. Editing acceptance criteria invalidates demo verification and disables approval. Approve/request changes are explicitly simulated; neither stores a real approval nor permits deployment. History and evidence are fixture displays, not proof of durable history, schema acceptance or trusted issuer custody.

A prototype-path-only `Web/proxy.ts` denies before rendering, backed by the page guard. The route requires ephemeral `BOB_WORKFLOW_PROTOTYPE_ENABLED=true` and refuses when `VERCEL` is present. It is off by default and cannot be enabled by a request parameter. No credentials, API requests, localStorage, browser auth, business source records or live Core connection are used. This local switch does not alter persistent security settings or authorize publication. Backend acceptance is not called from this screen.

## Experimental backend contract

`Core/src/workflow/acceptance-contract.ts` strictly validates a request containing only project/candidate/approval IDs. Authenticated principal and authority adapters are separate trusted dependencies, never client body fields. Candidate fingerprints bind owner/project, specification, source, configuration, regression and policy. The evaluator requires authoritative owner authorization, an accepted specification, accepted predecessors, an accepted regression baseline, every required non-ambiguous current passing check from a trusted issuer, and a non-revoked/non-expired/unconsumed matching approval from the authorized actor. Candidate/authorization are rechecked at the end; unavailable/malformed authority fails closed.

This is **eligibility evaluation only**. No gateway, task status, database schema or live API wires it. It does not consume an approval, perform an effect, atomically advance a workflow or claim exactly-once durability. The eventual transaction must revalidate all authoritative inputs, use stable operation receipts and atomically consume/store the transition. Trusted approver/reviewer roles, check policies, evidence retention/custody, durable adapters, lease/fencing and Safe Mode still require the reviewed S2 contract. No worker-supplied boolean can establish those authorities.

## Verification and retained attempts

The isolated Core suite passes **165/165**, including **26 new acceptance-contract cases**. Core typecheck passes. Cases deny missing specifications/predecessors/baselines, wrong projects before authority reads, forged client assertions, missing/ambiguous evidence, wrong owner/project/candidate/issuer, failed/not-run/expired evidence, stale/revoked/consumed/mismatched approvals and candidate/authority changes. Fingerprint changes cover all behavior-changing inputs. These are contract tests, not database concurrency or real-owner acceptance.

The initial Web production webpack build passes without inherited credentials. Real loopback Chrome rendering uses the already installed vendor browser with a fresh test profile, external requests blocked, and no auth/session storage read. Six browser scenarios exercise desktop/mobile journey, demo approval, invalidation, project capture isolation, loading/empty/error and pending recovery. Final results and screenshots are retained in `review/`; screenshots are synthetic rendered output, not source-only claims or deployed acceptance.

Initial Core test authoring used a matrix that spread array rows incorrectly; it was corrected without weakening checks. Initial browser verification passed four cases and failed two exact-text assertions because the capture row combined its status and title. The title now has its own semantic element; the same isolation/one-item assertions remain. Empty-state capture focus is also checked after React mounts the capture field. Initial reports remain alongside final evidence. No production policy/assertion, timeout or existing test was relaxed.

## Owner review and next gate

Present desktop/mobile screenshots and the local journey before a broader rewrite. Confirm whether project selection, current work/spec/evidence and owner review provide the intended information architecture; then refine capture/history and presentation from actual feedback. The owner has not accepted these screens or the proposed priority labels. Full keyboard/screen-reader/VoiceOver/DynamicType and physical-device acceptance remain open.

Source identity: core branch/commit above; source files and final evidence hashes recorded in `review/final-receipt.json`. Incoming reference hashes verify the original files remain unchanged. Detailed release checklist remains `/Users/erikboisvert/Documents/Codex/2026-09-30/task-2/BobCore-private-v1-release-checklist-2026-09-30.md`.

Fresh preflight `2026-09-30T19:57:45.879Z` verifies bob-core/bobai/BobAI staging/**chatgpt**, partial context and truncated activity. The expected local Codex staging surface is not established. Explicit owner direction permits this bounded local slice using repository evidence; no cross-project or Production authority is inferred. Current environment provides no callable supported original-task reader, so work remains isolated and makes no fresh concurrency claim beyond preservation.

Local review URL: `http://127.0.0.1:3419/prototype/project-workflow`. The loopback-only process is retained for owner screen review; no network binding outside this Mac or persistent service is installed. Run from Web using existing dependencies: `env -i PATH=/usr/local/bin:/usr/bin:/bin NEXT_TELEMETRY_DISABLED=1 BOB_WORKFLOW_PROTOTYPE_ENABLED=true ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3419`. The build uses webpack because the existing dependency symlink lies outside the isolated root; default Turbopack is not independently validated.

The initial default-off route probe observed HTTP200 from the page-level notFound path. Next documents 200 for streamed not-found responses; the prototype now denies before rendering through a narrowly matched Proxy response, with both page and proxy environment checks. Official API references: https://nextjs.org/docs/app/api-reference/file-conventions/proxy and https://nextjs.org/docs/app/api-reference/file-conventions/not-found . Default-off and simulated-hosted refusal are separately tested on temporary loopback processes; they do not alter real Vercel settings.

Final local verification: Core165/165 (26 acceptance cases), Core/Web typechecks, emitted Core build and optimized Web webpack build pass. All6/6 real browser scenarios pass on the final guarded candidate, including390px/320px mobile no-overflow and empty-state focus. Both default-off and simulated Vercel probes return404. Final browser report is `review/browser-results-guard-final.json`; initial failed reports are retained. Desktop/mobile final images were inspected; no hosted or physical-native acceptance is claimed.
