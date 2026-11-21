# Owner-only synthetic Workbench preview

November 20, 2026. Base `f2f4e20c3ac1aa804a06a94acb0463973a9711f4`, the verified PR #52 merge on `main`.

## Owner workflow

The signed-in Control Center shows **Workbench preview** when the deployment enables it. The page starts in Sample RFQ. Select **Delivery & Approvals** and **Review finding**, run the sample comparison, and create and edit a task draft. Place it on the board and move it by dragging or using the card's Move menu. Undo reverses the board move. The Sources, Board, and Bob tabs expose the same flow on narrow screens. The sample project selector switches to a separate fictional Operations workspace. Leaving or reloading clears the changes.

## Access and data

- `/workbench` is default-off. An exact `BOB_OWNER_WORKBENCH_PREVIEW=true` opt-in also requires the existing database-backed owner-authentication configuration. Vercel Preview and Development targets are excluded. An opted-in loopback fixture can exercise the same compiled page.
- The dynamic page verifies the current owner session before returning the Workbench. Missing, forged, or revoked sessions and authentication dependency errors are denied. The document and React Server Component responses use private, no-store caching.
- The preview takes no real project identity or query input and uses the existing fictional fixture projects. Source selections, the prepared response, draft edits, moves, and undo stay in page memory. Workbench task and layout clients are disabled in this variant. No Core queries, project writes, provider calls, browser persistence, or workspace content imports belong to the preview. The existing Control Center dashboard and owner-session handling retain their normal behavior.
- The existing loopback-only `/review` pages and APIs keep their earlier guards. Git-triggered deployment remains disabled on `main` and this feature branch for both deployables.

## Local validation

An independent source review found no blocking access, cache, or data-flow issues. The Node 26 Web type check and optimized webpack build passed. The Core check passed with 2,457 tests and 123 gated skips, along with the lifecycle and import dry-run checks. Nine opt-in policy cases cover the default-off behavior, the existing owner auth requirement, and Vercel environment restrictions.

Ten Chromium acceptance groups passed against the compiled Web app and an isolated fixture using the existing Better Auth stack and disposable PostgreSQL tables. The checks covered owner sign-in, anonymous and forged-session denial after an owner request, private/no-store document and RSC responses, signed-out navigation, revoked session denial, the full desktop and 390 px touch workflow, two-project isolation, reload reset, and the production-mode 404s on the old review routes. Preview interactions requested only the page and its static assets. The independent default-off HTTP probe returned 404. These checks establish local behavior. Hosted cache, owner access, and functional acceptance are pending.

## Release controls

After source review, CI, and the existing recovery gate, stage only the Web deployment with the preview opt-in on that deployment and preserve the effective owner-authentication settings. Verify the exact reviewed source and rollback deployment. Check anonymous denial, existing owner sign-in, the preview link and fixture workflow, and production 404 responses for the old review routes before completing hosted acceptance. Rolling back to the prior Web deployment removes the feature. Core requires no deploy, and the change needs no migration, credential, permission, or provider change.

On November 20, the owner approved using the verified Mac-key restore from the encrypted BobCore USB for this preview release. The snapshot was captured at 8:29 p.m. Toronto time and must still meet the 24-hour freshness limit at rollout. Independent-key verification remains open for future releases. See the [existing controlled release checklist](2026-11-11-control-center-ui-release-preparation.md).

The read-only BobCore preflight matched the BobAI project UUID, repository, and Codex surface. The revision was current at retrieval and bounded context was partial. This local change record is the pending continuity checkpoint.
