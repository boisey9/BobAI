# Control Center UI release preparation — November 11, 2026

## Outcome and scope

The daily-UX/system-state/connections integration is reviewed locally and prepared as a feature-branch candidate for `main`. Source preparation does not mean publication or Vercel acceptance. This task does not push, create a PR, merge, stage/promote a deployment, migrate a database, change credentials/permissions, activate backup workflows or operate Acer.

Branch: `codex/control-center-ui-integration`. Parent: freshly verified GitHub main `c8a164992e232013a5771a80e24e7614d58fbc7f` (PR #50). The candidate's local Git commit and the companion source inventory identify its final bytes. Do not build from a dirty backup/local-pilot checkout. The existing [UI integration record](2026-11-11-control-center-ui-integration.md) retains the bounded `a48dfc9..8c2f732` provenance and synthetic review behavior.

## Review findings and disposition

| Finding | Resolution and evidence |
| --- | --- |
| The UI feature branch lacked an automatic-deployment hold, although main was held. A future branch push could otherwise create an unintended deployment. | Both Core and Web add only `codex/control-center-ui-integration: false`. Existing `main: false`, all other holds, runtime flags, branch protections and CI remain intact. A regression checks both deployables. |
| A 1366 × 600 desktop window clipped lower sidebar controls, including Sign out. | The desktop sidebar now scrolls vertically. Actual Chrome acceptance scrolled the sidebar and verified Sign out's lower edge stayed inside the viewport. No sign-out action was submitted. |
| The new safe OAuth projection had helper tests but no regression covering the actual Core route through the credential gateway. | Eight route cases exercise owner-wide Web/primary reads, forged owner headers, project-bound/non-owner access, wrong-project/missing-scope/revoked access, missing projects, safe field projection and denied optional reads. They use synthetic query responses and no real database or inference. |
| Older deployed Core responses omit the optional OAuth projection. | A rendered compatibility regression verifies unavailable/unverified presentation instead of zero OAuth grants. No permission expansion is needed for fallback. |

The remaining source review covered task intent retention, identical retry/readback and version binding, selected-task navigation, project retention, server-only owner authentication, the read-only grant projection, safe activity fields, degraded/unknown states, responsive navigation and the default-off preview. No unresolved actionable source finding remains from this local review. This is not a claim of independent reviewer approval, live client acceptance or an accessibility certification.

## Fresh evidence ledger

| Evidence | Result and limit |
| --- | --- |
| BobCore retrieval, `2026-11-11T20:22:18.742Z` | BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI`, surface `codex`; revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`. All five sources available; partial context, truncated events/memories and older tasks/handoffs. Historical task text does not establish current release acceptance. No synchronization write. |
| GitHub branch/PR reads, November 11 | Main is still `c8a1649`, protected; no open PRs were returned. The branch response is not a complete protection audit. No protection setting was changed. |
| Canonical Core inspection, November 11 | `bob-core.vercel.app` resolves to READY Production deployment `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk`, created October 23. CLI metadata did not supply a Git source SHA. |
| Canonical Web inspection, November 11 | `bob-control-center-erikboisvert9.vercel.app` resolves to READY Production deployment `dpl_CAkTAgNhXyySzQcqYqSxqt2Ny7PM`, created October 23. CLI metadata did not supply a Git source SHA. |
| Vercel access limitation | The connected Vercel project search returned no projects. Existing authenticated CLI read-only inspection supplied the canonical results above; no connector or access configuration was changed. |
| Latest reviewed operational backup record | The preserved November 3 USB-copy record reports a complete encrypted 24-table snapshot at `2026-11-03T18:57:38.066Z`, verified USB copy and local-key authentication. Its 24-hour release-freshness threshold ended November 4 at 13:57:38 EST. That is dated documentary evidence, not a new backup/media/restore check. |
| Independent recovery/configuration acceptance | No newer independent restoration or effective canonical-to-candidate configuration acceptance was established by this task. These remain open, irrespective of UI/build success. |

## Qualified source and exclusions

Included: the selected daily-use Web UX; independent service/inference/recovery presentation; data-location/build labels; combined static/OAuth connection view; additive owner-only, project-bound grant read; development-only synthetic review; regression coverage; matching deployment guards; implementation/change records and release inventory.

Excluded: unpublished uploader/reader successor, backup activation, local-pilot/native PostgreSQL/Ollama changes, Jarvis/Acer, permanent project deletion/hierarchy, new document storage, new authentication policy, new credentials/grants, migrations and Production data. Existing backup code already published in main is preserved. Temporary dependency links, `.next`, browser artifacts, local logs, `.vercel`, environment files and private recovery material are not release source.

The Core projection reuses migration 007's existing table and fails closed to unavailable on absent/denied optional reads. Do not run migrations 004, 007 or 008 or modify database grants to force this UI into a passing state. The preview remains inaccessible on Vercel and in production mode, even when its development flag is set. No review flag is added to a deployment environment.

## Validation

Final Node 24.22.1 validation passes **2,361 Core tests**, zero failures and **123 intentionally gated skips**, plus **eight lifecycle checks**, **three import dry runs**, Core/Web type checking and the Web webpack production build. The new focused route/compatibility/configuration run passed 16 checks before the complete run. Earlier integration counts retain their dates. Database/hosted gated suites were not activated.

The exact selected Core/Web paths and SHA-256 hashes are retained in [the release source inventory](2026-11-11-control-center-ui-release-source.json). Git whitespace checks and the source-scope review pass; package manifests/lockfiles, migration directories, auth/provider modules, workflow activation holds and credentials are unchanged. Local dependency links and generated Next declarations are excluded.

The exact locally built production-mode candidate returned HTTP **404** for both review paths even with its development flag set, while the normal owner dashboard retained its login redirect and rendered no synthetic UI.

Browser review used synthetic content at 1366 × 768, 1366 × 600 and 390 × 844. It covered sidebar control reachability, inference failure with connected Core, unavailable Core, partial OAuth reads, task creation/readback, completed filtering, project switching and absence of horizontal overflow. Local screenshots remain under the ignored `workflow-validation/output/playwright/` directory. They are not Production or physical-iPhone acceptance.

## Publication packet for main

Prepared PR title: **Clarify Control Center system state and project connections**.

Prepared description:

> The Control Center conflated service connectivity with inference and operational readiness and omitted OAuth project grants from its connection overview. This change presents those observations separately, retains backup warnings, and combines safe static/OAuth access summaries without declaring client acceptance from activity. It also integrates the existing daily task/navigation UX and a default-off synthetic local review.
>
> The only new Core runtime behavior is an optional, owner-only grant summary bound to owner and selected project. Existing schemas/authentication/provider routing remain unchanged. Main and the feature branch keep automatic Vercel deployments disabled. No migration, credential, permission or backup activation is included.
>
> Validation: use the final results below and the source inventory. Production rollout remains subject to the retained recovery, effective-configuration and compatibility gates.

When publication is requested, push this exact guarded branch, open a PR to freshly verified main, and inspect both **Bob Core** (`.github/workflows/bob-core.yml`) and **Bob Control Center Web** (`.github/workflows/web.yml`) CI at the exact PR head. Resolve source drift through review; do not force-push main or change protections. Merge through the existing permitted PR workflow only when authorized and checks/review pass. A main merge publishes source; `main: false` deliberately prevents an automatic Vercel release. This task performs none of these external steps.

## Vercel release gate and rollout packet

The existing recovery gate is retained. Prior generic deployment approval does not make missing recovery evidence pass. Before any staged Production build or promotion:

1. Establish the owner-controlled independent recovery computer or separately approved recovery environment. The USB supplies off-device storage; its existence alone does not supply independent restoration. Do not repeatedly recapture while the destination is unavailable.
2. When the destination is ready, capture/verify a complete encrypted snapshot inside the 24-hour target, retain its off-device copy and restore with the separately held current key. Verify content, constraints, relationships, copied-access quarantine, owner recovery and measured recovery timing/RPO/RTO. Keep recurring backup activation separate.
3. Qualify the exact merged source in a clean checkout. Verify effective provider/model/reasoning settings, Shared Context, database role compatibility, canonical origins, owner password/passkey policy, sessions and OAuth without printing secrets or altering credentials. Preserve the working explicit overrides; do not substitute an unpromoted password-retirement build. Generic Preview may inherit Production resources and is not accepted isolation.
4. Run isolated compatibility acceptance for existing Web → candidate Core, then candidate Web → candidate Core, including an older Core response without OAuth summary and a denied optional grant read. Complete any required independent review and record its actual reviewer/evidence.
5. Reverify canonical rollback identities immediately before release. After the gates pass, stage exact-source Production builds without assigning canonical domains. Promote Core first; verify health, project identity, context reads and existing-Web compatibility. Promote Web next; verify owner access, selected-project retention, task/chat/checkpoint workflows, status/backup warnings and connections. Repeat authorized Codex and ChatGPT-bound reads without expanding project grants or performing unsolicited project-state writes.
6. Record exact commit, build/deployment IDs, effective configuration comparison and build/runtime/functional outcomes. A regression in context, authorization, provider behavior or compatibility triggers code/alias rollback. Do not perform an automatic database restore.

Pinned rollback references, freshly inspected but still to be reverified at cutover:

- Core: `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk`.
- Web: `dpl_CAkTAgNhXyySzQcqYqSxqt2Ny7PM`.

Actual next execution dependency: select/approve the independent restore destination and complete the fresh recovery drill. Source publication/CI and cutover remain separate steps; neither the UI nor the dormant recurring-backup implementation closes this gate. Acer is not needed for this hosted release task.

## Pending local continuity checkpoint

Outcome: reviewed the exact UI/main baseline, corrected the feature-branch deployment guard and short-window sidebar issue, extended owner-boundary/compatibility regressions, and prepared the publication/rollout/rollback packet.

Unresolved: external publication/CI/review, independent restore with a fresh artifact/current offline key, effective configuration and Core/Web compatibility acceptance, and live owner/client release checks. Missing client-test and backup/restore timestamps remain honestly labelled in the UI.

No external BobCore event/task/handoff, push, PR, merge, deployment, migration, credential/permission change, cloud upload or Acer operation is claimed. Synchronize this checkpoint only after separately authorized writes and verified project/environment identity.
