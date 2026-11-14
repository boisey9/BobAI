# Control Center UI publication and CI — November 14, 2026

## Published scope

The owner requested the next step after the reviewed release packet. The guarded `codex/control-center-ui-integration` branch was published and [PR #51](https://github.com/boisey9/BobAI/pull/51) opened against `main`. Initial published source is `a205897b65fca9b8faf425c160fd54fd97b67039`, parent `c8a164992e232013a5771a80e24e7614d58fbc7f` (PR #50). The PR is open and unmerged. Publishing this source does not authorize or perform a Vercel cutover.

Before publication, the clean detached release checkout matched all **39 Core/Web SHA-256 entries** in the [reviewed source inventory](2026-11-11-control-center-ui-release-source.json); the exact candidate contains 44 changed paths including its documentation. Git whitespace validation passed. Existing temporary dependency links, environment files, generated build files and private recovery material were excluded. The remote feature branch did not exist, main remained protected at `c8a1649`, and no open PR duplicated the work.

The publication follow-up changes only this record and `implementation.md`. The selected Core/Web source stays byte-identical to `a205897`. Final PR-head checks must be read from the current GitHub checks; the results below bind the initial published code and must not be misrepresented as a different head's acceptance.

## GitHub validation

Both branch-push and initial pull-request workflows passed at `a205897`:

| Workflow | Branch push | Initial PR checks |
| --- | --- | --- |
| Bob Core | [Succeeded](https://github.com/boisey9/BobAI/actions/runs/43614707420) | [Succeeded](https://github.com/boisey9/BobAI/actions/runs/43614737250) |
| Bob Control Center Web | [Succeeded](https://github.com/boisey9/BobAI/actions/runs/43614707459) | [Succeeded](https://github.com/boisey9/BobAI/actions/runs/43614737259) |

The actual Linux Core PR log reports **2,358 passed, 126 skipped, zero failures**, followed by **eight successful lifecycle checks** and all **three import dry runs**. Web type checking and production compilation succeeded. This is distinct from the November 11 local result of **2,361 passed and 123 skipped**: three disposable-age integration cases additionally skip in CI when `/usr/local/bin/age` or `/usr/local/bin/age-keygen` is absent. Those cases are in `backup-custody-encryption.test.mjs`, `backup-artifact-custody.test.mjs` and `backup-testing-custody.test.mjs`. No tool installation, workflow activation or test-gate removal was added to disguise that difference. Real hosted/database checks remain gated.

These checks qualify published source and its Linux build/tests. They do not establish owner browser acceptance, external-client lifecycle acceptance, independent restore readiness or a deployed release. The [earlier review record](2026-11-11-control-center-ui-release-preparation.md) retains the source review, browser checks, production-mode preview denial and rollback packet.

## Deployments stayed disabled

Both published Vercel configurations retain `main: false` and `codex/control-center-ui-integration: false`; other guards/settings are unchanged. No Vercel build, deployment, promotion or alias operation was issued. Branch protections were not changed.

The Vercel connector did not provide usable project history. Read-only existing authenticated CLI inspection was used instead, without changing authentication or permissions. Immediately before and after initial publication, complete returned histories contained **five Core deployments** and **six Web deployments**, with **no new deployment URL/creation-time pair**. The newest-created Web deployment is not necessarily the serving deployment.

The pre-publication canonical readback remained:

| Canonical service | Deployment | State |
| --- | --- | --- |
| Core | `dpl_CXiipZGjjegHiBNvoqzmHzeTvjLk` | READY, Production |
| Web | `dpl_CAkTAgNhXyySzQcqYqSxqt2Ny7PM` | READY, Production |

Final history/alias readback after the documentation follow-up is retained in the task-local publication receipts and final report. Source publication and a main merge remain distinct from Vercel rollout; main's automatic-deployment hold is deliberate.

## Continuity and remaining gates

BobCore context retrieved at `2026-11-14T16:13:50.127Z` matched BobAI UUID `10000000-0000-4000-8000-000000000001`, repository `boisey9/BobAI` and `codex` surface, revision `f9dadbc6565f765d83e1141d1f4b9fd5b49eb25192f9e66738de4355fab85caa`. All five sources were available, but the response remained partial with truncated events/memories and older task/handoff records. This is a fresh retrieval of partly dated state, not new operational acceptance. Retired staging was not used. No external BobCore write or synchronization is claimed; retain the publication checkpoint locally pending authorized, environment-verified synchronization.

Next source step is review and an explicitly authorized merge of the exact green PR head through the existing protected workflow. No merge is performed by this publication task. Do not weaken protections or enable automatic deployment to make it proceed.

The retained Vercel prerequisites remain unchanged: choose the independent recovery destination, complete a fresh encrypted snapshot/isolated restore with the separately held current key, and verify effective configuration plus Core/Web compatibility before staged Production builds or promotion. The dated November 3 USB copy alone does not close those gates. Keep recurring backup activation separate and preserve owner/context access during qualification. Acer/Jarvis remain out of scope.

No deployment, migration, credential/permission change, backup execution/activation, artifact upload, Production data mutation or Acer operation occurred. GitHub branch publication and PR creation are the authorized external writes in this task.
