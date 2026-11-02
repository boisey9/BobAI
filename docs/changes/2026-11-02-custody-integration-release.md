# Latest custody and dashboard integration for main

Date: 2026-11-02 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status at candidate qualification: **reviewed and validated for authorized publication; Vercel cutover remains blocked by recovery prerequisites**. The owner requested review of the artifact verifier, preparation of the still-disabled uploader/reader integration packet, publication to GitHub main and deployment to Vercel. Publication/deployment approval is supplied; older approval-only holds are historical. No backup execution, artifact upload, migration, new credentials, permission change or protection change is authorized by the application release.

## Selected source

Branch `codex/backup-custody-integration-release` starts at the frozen dormant candidate `efe81de8c61e52136b9a1df061c73c7e3c6bb2d3`, whose parent is current main `9536d6c24de090f4c4c2716cead64811107da3ab`. The integration copies the exact 17-path encrypted-custody/verifier successor, then selectively adds the approved dashboard and client documentation from the original checkout. It does not overwrite the successor's workflow, testing CLI or testing-runner tests with the original checkout's older versions. Original working, encryption, verifier and frozen publication worktrees remain preserved. The unrelated daily-UX worktree is outside this release.

The added application slice is six Web presentation files and three tests: `Web/app/globals.css`, `Web/app/page.tsx`, `Web/components/control-center-v2.tsx`, `Web/components/status-card.tsx`, `Web/components/system-readiness.tsx`, `Web/lib/dashboard-health.ts`, `Core/tests/web-context-presentation.test.mjs`, `Core/tests/dashboard-health.test.ts` and `Core/tests/dashboard-readiness-presentation.test.mjs`. These are byte-identical to the approved [dashboard slice](2026-10-31-dashboard-readiness-separation.md). Core connectivity, process-scoped inference observations and operational readiness remain separate; actual backup warnings remain visible.

Current client docs and October31 snapshot evidence are included, with current recovery/release/index references reconciled. The [uploader/reader packet](2026-11-02-backup-uploader-reader-integration.md) is documentation only. Both Core/Web Vercel configs add `codex/backup-custody-integration-release: false` beside their existing `main: false` guard; this permits controlled publication without an automatic deployment. Both backup-testing jobs retain literal false source holds, the testing binding remains disabled/null, and the Production backup workflow is unchanged.

## Review and qualification

Independent review of the predecessor verifier checked all17 retained receipt hashes, source/tests and disabled boundaries: no actionable findings. Integration source selection was independently audited against the original checkout, identifying the dashboard/client omissions before composition. No actual recovery key or artifact entered the publication candidate; tests use synthetic fixtures/disposable identities.

Final composed local checks on Node24.22.1: **2,330 Core tests passed, zero failed, 123 gated tests skipped**; Core/Web typechecking, Web webpack production build, eight lifecycle checks and three bootstrap import dry runs passed. Gated database/hosted checks remained disabled. These results qualify this source composition; historical PostgreSQL/Linux-image drills are not claimed as newly repeated. No dependency versions changed.

Local selection/test evidence is retained under `/private/var/folders/x3/vz226_ss78l5vmt45gmn_wxr0000gn/T/bob-custody-release-z5wnfuil/`, including exact selected-file hashes, full test JSON and build logs. The public source inventory and Git commit/PR provide publication identity; local filesystem evidence is not an operational acceptance record.

## GitHub publication path

Fresh read-only GitHub inspection found main at `9536d6c`, protected and unlocked. PR approval count is zero; code-owner/latest-push approval are off, administrator enforcement is on, force-push/deletion are off and no required status checks are configured. Respect the PR requirement: publish this guarded branch, open the integration PR, inspect Core/Web CI, then merge the exact reviewed head under the owner's request. Do not weaken protections, force-push main or enable automatic Vercel deployment. This record describes the qualified candidate before publication; the final GitHub PR/merge receipt establishes the actual publication outcome.

## Vercel preflight and remaining release blockers

The connector returned inconsistent team-scoped project/alias lookups. Existing CLI read-only calls verified team `team_VsUU9KUd8se5OrGvNQAGmUnJ`, Web project `prj_j7CZ6MgNYfOFS9N16wBoQOIxVvF1` (`bob-control-center-erikboisvert9`, root `Web/`, Next.js, Node24.x), and the canonical pair:

| Canonical alias | Verified serving deployment |
| --- | --- |
| `bob-core.vercel.app` | `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk` |
| `bob-control-center-erikboisvert9.vercel.app` | `dpl_CAkTAgNhXyySzQcqYqSxqt2Ny7PM` |

The owner reconfirmed **no separate recovery destination** on November2. The latest documented complete snapshot remains `2026-10-31T17:40:28.057Z`; its 24-hour threshold expired November1 at17:40Z. Neither local verifier fixtures nor a repository push refresh that artifact or establish independent restoration. Canonical-to-candidate effective configuration parity, especially password/session/OAuth policy, remains unproven; ordinary Preview and staged Production are not independent isolated environments.

The [existing controlled release gate](2026-10-30-backup-activation-recovery-packet.md) requires recovery/isolation and configuration acceptance before staged Production builds, then a verified compatible pair and pinned rollback before promotion. The current deployment request supplies authority but does not supply missing recovery evidence. Therefore no Vercel deployment, staged Production build or alias promotion is performed in this qualification. The precise next release task is to select the off-device destination, complete a fresh authorized encrypted capture/independent restore, and verify effective configuration/rollback parity. Backup activation remains a separate task even after application release.

## Continuity

Fresh BobCore read at `2026-11-02T12:22:22.548Z`, revision `66a5a09f810e626ea625f78b90876ad0eca8545201bf2362acf846cf43110b79`, matched BobAI UUID `10000000-0000-4000-8000-000000000001`, repository and Codex surface. All five sources were available; context remained partial with older task/handoff records and truncated events/memories. This technical record retains the outcome pending separately authorized BobCore synchronization; no active decision or operational completion is invented.
