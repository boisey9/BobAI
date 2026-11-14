# Control Center daily UX, system state and connections — November 11, 2026

## Status and source selection

Implemented locally on `codex/control-center-ui-integration`, in the isolated checkout `workflow-validation/control-center-ui-integration`, based on published main commit `c8a164992e232013a5771a80e24e7614d58fbc7f` (PR #50). No push, PR, deployment, migration, credential/permission change, backup activation or Acer operation is included. The subsequent [release-preparation review](2026-11-11-control-center-ui-release-preparation.md) adds a matching feature-branch deployment guard, route-level authorization regressions and a short-window sidebar correction.

The existing daily-use UX was selectively integrated from the frozen `codex/control-center-daily-ux` checkout: **only the Web/Core-test delta from `a48dfc9` to `8c2f732`**. Its older readiness baseline and implementation index were not copied over the newer published source. Existing dirty backup/recovery and private-manufacturing worktrees remain separate and preserved. This candidate does not integrate the unpublished uploader/reader or local-pilot successors.

BobCore preflight returned BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, surface `codex`, generated `2026-11-11T19:20:54.008Z`, revision `0519576b9f8dc97a739169f8963242c230a7d05acef511b2bb6c4a8b05e2a8cc`. All five sources were available, but context was partial; events/memories were truncated and tasks/handoffs retained older records. That result is continuity evidence, not acceptance of every interface, environment or release. Retired staging was not used. The local-only instruction excludes synchronization writes.

## Visible behavior

- More compact typography, spacing and sidebar; responsive navigation includes **System state** and **Connections** and follows the visible section.
- Daily summary links open the selected task/filter in its project. Compact capture, optional details, task selection, search, priority/due-date/update sorting and Active/Due today/Overdue/Upcoming/Blocked/Completed/All records views reuse existing task contracts. Filtering describes loaded records rather than claiming an exhaustive database search.
- Existing stable operation IDs, retained uncertain requests, safe retry, task-version checks, source/project binding and independent task readback remain in the normal task workflow. Approval items remain in the approval workflow.
- Header, sidebar text and sidebar indicator use the same Core connectivity result. Model observation and operational readiness are independent. A failed or untested inference observation no longer labels a healthy Core connection as degraded.
- Backup and scheduler warnings remain visible. Last verified backup and last successful restore have separate labels. The current Core status contract does not return those two event timestamps, so this UI explicitly reports them as unavailable; a monitoring check timestamp is not presented as a backup or restore date.
- A data-location strip identifies the configured Core destination, reported memory storage and available Web source commit. File storage is **Inventory not reported** because this source has no verified file-store inventory. Configured location is not a data-residency audit or a live inference-routing guarantee.

## Connections and read-only Core projection

The selected project's connections show static credentials and OAuth project grants together. Each interface distinguishes **access permission**, **last returned activity**, and **successful client acceptance**. The API does not supply a durable client-test result, so acceptance remains **Not recorded in this view**. Activity or an approved OAuth grant never substitutes for such a test. Missing bounded activity/access records do not prove disconnection.

`Core/src/control-center/connections.ts` adds a safe, bounded read projection from the existing `bob_oauth_project_grants` table. It selects only grant ID, surface, scopes and creation/revocation dates, binds both owner and selected project through query parameters, and limits the response to 100 grants with a truncation flag. It does not expose tokens, client secrets, codes, refresh material or private client metadata. The existing authenticated administration endpoint invokes it only for the primary owner boundary or an owner-wide Web credential with `control-center:owner`; a project-bound read credential receives an unavailable projection. Existing gateway header sanitization and route authorization remain in force.

This is additive to the existing administration response. An older Core, denied table read, missing table or malformed response produces **unavailable**, never a misleading zero. No database grant or migration is added to make the projection work. Any deployed permission incompatibility must be reviewed separately. Existing owner credential controls remain in a collapsed advanced section; this work does not create, revoke or change real access.

## Local browser review

Preview URL while the local server is running: `http://127.0.0.1:3448/review`.

The review uses the actual dashboard components and two explicitly synthetic projects, with no live Core/database/model/client connection. The scenario picker covers connected with inference untested, observed inference success, failed inference, partial/stale context and unavailable Core. The banner stays explicit that these are examples, not Production observations.

The review page and its task API are default-off and restricted to development, explicit `BOB_UI_REVIEW_ENABLED=true`, a loopback Host and a process without the listed Core/database/provider/auth credentials. An early request gate returns HTTP 404 in Vercel/Production or when review is disabled; the page/API repeat their own checks. Normal owner routes retain authentication. The preview does not issue owner sessions, bypass owner authentication, or provide real owner mutations. Links to owner workflows and owner-action forms are intercepted with a clear explanation.

Synthetic task writes use only in-memory, project-separated state, same-origin validation, a per-project synthetic binding, version checks, stable operation receipts and bounded task/receipt counts. Mutation notices say **Saved in local preview only**. State is disposable and resets on process restart; none is synchronized to BobCore. The synthetic API has no database, auth, Core client or provider dependency.

The preview was started from a clean environment using existing installed dependencies, Node 24, telemetry disabled and binding only `127.0.0.1:3448`. Temporary dependency links point to existing local installations; no dependency versions or lockfiles changed. Review artifacts are local and excluded under `workflow-validation/output/playwright/`.

## Validation and review

The full Core check passed **2,350 tests**, with **123 intentionally gated skips**, plus **eight lifecycle checks** and **three import dry runs**. A subsequent **64-test focused regression check** covers the final projection, connection, review-API, dashboard-health and daily-workspace source, including an additional inactive-project case. Core type checking passes. Web type checking and production compilation pass. These counts are separate runs, not additive independent coverage.

Whitespace/diff review and actual Chrome interactions supplement the automated checks. No hosted/database gated suite was enabled. Final local production-mode smoke checks returned **404** for `/review` and `/api/review/tasks` even with the review flag set; the normal dashboard retained its owner-login redirect. Development smoke checks returned **200** for the loopback review and **404** for a foreign Host or real project key.

Browser acceptance performed with synthetic content:

- Desktop 1440 × 1000 and phone-sized 390 × 844; no horizontal document overflow.
- Synthetic task creation, edit/readback, Active/Completed/Blocked filters and search.
- Project switching retains the project in task navigation and shows independent project data.
- Inference failure leaves Core connectivity connected; unavailable Core changes header/sidebar consistently.
- Partial OAuth availability is labelled unavailable rather than zero grants.
- Owner connection links are blocked by the review boundary; no access change was submitted.
- System-state, connections, task and mobile screenshots were visually inspected.

Earlier integration checks exposed test fixtures calling the newly project-aware import page without Next page props; those calls now supply `searchParams`, preserving the authenticated page's behavior. Browser testing exposed a local origin comparison against Next's normalized request URL; the synthetic API now compares the origin (or same-origin referrer when Origin is absent) with its separately loopback-validated Host. Foreign origins, absent origin/referrer, wrong bindings and operation/version conflicts have regression coverage.

Production-mode smoke testing exposed a streamed not-found page with an HTTP 200 response. The early request gate was added so disabled review paths return HTTP 404 before rendering; normal owner-route authentication is unchanged.

Playwright screenshot caret hiding caused development hydration diagnostics on later navigation in the same browser. The diff was restricted to injected `caret-color: transparent` attributes; a fresh browser then completed all five scenarios and a synthetic save with no application errors or hydration warnings. The only startup resource error was the existing favicon 404. The missing favicon request is not a Core or application data failure. No real database/hosted gated suites are activated by these UI checks.

## Remaining acceptance and next action

This is a local review candidate. It does not establish live Codex/ChatGPT acceptance, a deployed OAuth summary, current file-storage inventory, recurring backups, an independent restore, or a Vercel release. The previous release/recovery gates remain in effect; Acer is explicitly deferred.

Next: owner reviews the local System state/Connections/task flow, then selectively qualify this exact UI source with the existing hosted release candidate. Before a later authorized release, verify actual owner access, optional grant-read compatibility, Core/Web version compatibility and real source/deployment mapping. Persisted client-test evidence and structured backup/restore timestamps require separate reviewed contracts; the UI currently reports those gaps honestly.

## Pending local BobCore checkpoint

Outcome: integrated the bounded existing daily UX with the published baseline; added honest system-state/data-location and scoped static/OAuth connection views plus a default-off synthetic local review.

Unresolved: owner UX acceptance, live connection/API permission compatibility, deployment, structured recovery/client-test evidence and existing recovery/release gates. Acer work excluded.

Next actions: review the running local browser; retain the exact source/diff and validation evidence; synchronize a concise checkpoint only when external writes are authorized and project/environment identity is verified. No synchronization write or operational milestone is claimed.
