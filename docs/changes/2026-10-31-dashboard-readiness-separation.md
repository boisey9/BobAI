# Separate dashboard connectivity, inference and operational readiness

Date: 2026-10-31 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented and independently reviewed locally; not published or deployed.** Branch: `codex/dashboard-readiness`, based on `9536d6c24de090f4c4c2716cead64811107da3ab`. Existing uncommitted recovery documents were preserved.

## Problem and resulting behavior

The dashboard previously derived its Core card, header and sidebar from the combined `/v1/status` readiness result. That result requires every check to be `available`, while scheduled delivery currently reports `not_configured`. A successful Core/database/context connection therefore appeared degraded because of unrelated inference or operational setup.

The owner approved a local dashboard correction with real backup warnings retained. The new presentation uses the existing observations without changing the Core contract, probes, authentication or operational flags:

| Group | Evidence | Presentation |
| --- | --- | --- |
| Core connectivity | Process, database and Core context checks only | All available → **Connected**; known adverse checks → **Attention needed**; missing/unknown checks → **Unverified**; no Core response → **Unavailable** |
| Inference status | Responding process's provider observation | Distinguishes **Not checked**, **Observed success**, **Last attempt failed**, **Stale observation**, **Not configured** and **Unverified**. A success needs a valid reported timestamp. Configured model is shown separately. |
| Operational readiness | Backup monitoring and scheduled delivery | Missing evidence stays unverified; unconfigured, stale or failed checks retain attention. **Checks passing** means these reported checks pass, not that recovery or release acceptance is complete. |

For the owner's screenshot conditions, the three summaries now read **Connected / Not checked / Attention needed**. Backup monitoring remains visibly **not configured**, with a warning that backup protection is unverified here. Provider/backup failure details and reported check times are preserved, with timestamps displayed in Toronto time. Missing status or older responses without checks do not silently become healthy.

Selected-project memory, context counts and approvals remain in a separate labelled group. Core's service-context probe is not relabelled as evidence about the selected project's contents. The header, sidebar and implementation-evidence panel now describe connectivity explicitly. Neither a successful connection nor passing monitor checks is presented as release acceptance.

## Implementation and scope

- [Dashboard health helper](../../Web/lib/dashboard-health.ts): pure derivation of the three summaries; no requests, activation or state mutation, and no reliance on the legacy aggregate field.
- [System readiness component](../../Web/components/system-readiness.tsx): three cards with named check lists, explicit backup/recovery limits and process-scoped inference evidence.
- [Dashboard](../../Web/app/page.tsx), [status card](../../Web/components/status-card.tsx) and [implementation-evidence panel](../../Web/components/control-center-v2.tsx): reuse existing components and data requests; remove ambiguous combined-status labels.
- [Existing stylesheet](../../Web/app/globals.css): three-column desktop groups using the existing two/one-column breakpoints; wrap diagnostic details instead of truncating warnings.
- [Summary tests](../../Core/tests/dashboard-health.test.ts), [rendered readiness tests](../../Core/tests/dashboard-readiness-presentation.test.mjs) and the existing [context presentation test](../../Core/tests/web-context-presentation.test.mjs): cover separation, missing/unknown states, observed failures, valid evidence, visible backup warnings, escaped diagnostics and the renamed connectivity prop.

Core runtime/API, provider selection, scheduler, backup execution/monitoring, database schema, credentials, permissions and Vercel configuration remain unchanged. No package or dependency changes were needed. The temporary Next.js-generated `next-env.d.ts` change from the build was restored to its original contents.

## Validation and independent review

- **43 new focused checks**: 36 summary tests and seven rendered presentation cases. They exercise the screenshot state, aggregate/individual-check disagreement, missing responses/checks, provider failure/staleness/invalid timestamps, backup attention with other checks passing, and escaped diagnostic text.
- **Full Core `npm run check` on Node24 passes: 912 tests**, eight lifecycle checks and three bootstrap import dry runs. **123 database/hosted cases remain skipped**; no live database or provider fixture was enabled. The first run used `/tmp`, which is a symlink on this Mac, and two existing private-file fixtures correctly refused noncanonical paths. Rerunning with canonical `TMPDIR=/private/tmp` passed; no backup code or tests were changed to bypass that guard.
- **Web `npm run check` passes** type checking and the Next.js webpack build. A final type check also passed after the accessibility correction. Test/build subprocesses used a clean environment containing only executable and temporary paths.
- **Local Chromium component acceptance passes at 1440px and 390px**: three desktop columns, stacked mobile cards, no horizontal overflow or clipped details, accessible System readiness grouping, visible failed-backup details and missing-backup warnings. The actual React component and stylesheet were rendered with synthetic data, no app listener, real session, database or external request. The unavailable cached Playwright CLI was replaced by the already-installed browser library; no tools were installed. This is bounded component acceptance, not authenticated Production acceptance.
- An independent reviewer found one low-priority issue: labels on generic wrappers lacked accessible group roles. Both System readiness and Selected project status now have `role="group"`; targeted re-review confirmed the finding resolved. No remaining review findings.
- React review confirmed server-side derived presentation, no new effects/state/fetch waterfall or client serialization, existing owner authorization, stable list items, textual status labels and wrapped responsive diagnostics.

Browser artifacts for this local run are under `/private/tmp/bob-dashboard-AsexTr/output/playwright/` (`desktop.png`, `mobile.png`, `results.json`). They contain synthetic status data only and are not part of the source change. Final validation passed whitespace/conflict checks, 54 local links/anchors in this record and the implementation index, branch identity and source scope. Core runtime/migrations, workflows, packages and both Vercel guards remain byte-unchanged; the pre-existing recovery-document changes remain separate from this slice.

## Limits and pending local checkpoint

This is a presentation fix. The [recovery packet](2026-10-30-backup-activation-recovery-packet.md) remains applicable: current verified recovery evidence, independent-key/artifact acceptance, real backup authority/wiring and configuration-preserving release acceptance remain separate work. A green connectivity card does not resolve those gates. Refresh retrieves status; it does not run inference or create a backup. Provider observations remain process-local and Core retains its existing five-minute stale policy.

Fresh BobCore context at `2026-10-31T14:39:15.026Z` returned project `bobai`, UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, surface `codex`, revision `4a7760affda7f872f8816865136a13c381c78417638219726cdbc7301d3a5392`. All five sources were available; context remains partial, events/memories truncated and task/handoff records dated. Explicit environment binding remains unverified. User direction is local-only, so no event/task/handoff write was attempted.

Pending outcome: dashboard separation is locally implemented, tested and independently reviewed; real operational warnings remain visible. No commit, push, PR, merge, deployment, migration, credential/permission change, backup operation or synchronization occurred. The current hosted UI is unchanged until a separately authorized release satisfies the existing gates.
