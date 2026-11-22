# Single-project Core boundary for Workbench

November 22, 2026. Local branch `codex/workbench-bobai-core-boundary` based on merged [PR #54](https://github.com/boisey9/BobAI/pull/54), `43304db72751cbf70f35dc50d7a63a82cdbd4454`.

PR #54 passed post-merge Core and Web CI. The merged feature is default-off. Vercel created no deployments from the merge. The live Workbench remains the synthetic preview.

## Activation boundary

PR #54 binds displayed projects in Web, while enabling its Core flag allows the existing owner-wide Web interface to query the reduced Workbench catalog and context for other owner projects. A BobAI-only rollout needs the same binding at Core.

- The Core flag also requires one explicit server-side registration in `BOB_OWNER_WORKBENCH_PROJECT`, with `projectKey`, `id`, and `repository`. Web's existing `BOB_OWNER_WORKBENCH_PROJECTS` list contains that same registration as its single entry at activation.
- The reduced Workbench catalog selects only the pinned active owner project. The dedicated Workbench task list and no-audit context summary verify the pinned registration before loading task rows or context sources. All three paths reject another project key. The existing owner-wide credential and its required scopes stay in place.
- The ordinary dashboard, task API, and context reader retain their current behavior. Workbench uses `GET /v1/workbench/tasks` only after the pinned catalog passes. Acceptance goes directly to the narrow Workbench route. Its test path avoids the authenticated dashboard and the ordinary context reader, which records project retrieval events.
- Existing Git-triggered deployment holds are preserved. This branch is also held in both Vercel projects. No environment values or credentials were published by this work.

## Recovery and rollout

A restricted read-only Production query reverified the active BobAI identity and the registered owner-wide Web scopes. The retained November 20 USB restore is outside the 24-hour release window. The reconnected USB matches the previously verified volume. The owner approved a fresh USB backup and isolated Docker restore with the existing Mac key for this rollout. Independent-key recovery remains open for future releases.

After recovery and source acceptance, stage and verify Core first with the exact pinned registration and its existing provider and OAuth settings. Then qualify Web using the same registration and existing auth settings. Recheck both rollback targets before cutover. Use just public health and the narrow BobAI Workbench flow for application acceptance. No audited context calls, model calls, project writes, migrations, or credential changes are part of this rollout.

## Validation

Independent source review passed. Core type checking and 162 focused tests passed. Regressions cover flag and credential refusal, changed project identity before content lookup, catalog and pagination isolation, foreign cursors and inconsistent rows, and unchanged ordinary context and task behavior. The fresh encrypted USB copy passed checksum readback and isolated Docker restoration verified 24 tables, 236 constraints, and 25 foreign keys. Retained owner sign-in and revocation passed on the restored copy. The temporary restore container and plaintext were removed.
