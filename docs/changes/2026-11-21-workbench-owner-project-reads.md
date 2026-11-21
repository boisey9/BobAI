# Owner-only Workbench project reads

November 21, 2026. Local branch `codex/workbench-owner-project-reads` from GitHub `main` at `5cbc42c685df96b7cb3e21590064135c6b05609c`.

## Live preview review

The canonical Web alias still serves the PR #53 synthetic preview. An anonymous check returned healthy Web service, private no-store handling and no fixture content for document and RSC requests. The old local review page and layout API returned 404. The prior release receipt establishes the authenticated synthetic walkthrough and revoked-session denial. This review used anonymous probes only.

## Local implementation

- In an opted-in Control Center, **Workbench projects** opens `/workbench/reads`. The owner can select a registered project, page through its task summaries, and inspect the Shared Context revision, generation time, source freshness, availability and truncation. A partial snapshot, unavailable section, and successful empty task page have distinct states.
- An exact `BOB_OWNER_WORKBENCH_READS_ENABLED=true` is required independently in Core and Web. Web separately requires the existing database-backed owner session, excludes Vercel Preview and Development, and serves private/no-store HTML and RSC responses. The synthetic preview retains its own opt-in and its existing fixture behavior.
- Web reads `BOB_OWNER_WORKBENCH_PROJECTS`, a server-only JSON array of separately verified `{projectKey,id,repository}` registrations. The first entry supplies the initial selection. Use `null` only for a project with no registered repository. The reduced directory view must confirm the key, UUID and repository for each displayed active project before either content request. Both task and context responses also have to match the selected project. An unregistered selection, reused key with a different UUID, repository change, scope refusal or cross-project cursor fails closed. Directory entries outside the registration are omitted.
- The reused transport sends credentialed server-side GETs only to `/v1/control-center?project=…&view=workbench`, `/v1/tasks`, and `/v1/workbench/context` on the existing configured Core destination. The Workbench catalog view returns project identity details and skips the ordinary route's approvals, events and connections queries. The transport rejects redirects and uses no-store fetches with the existing bounded deadline. The browser receives rendered summaries and source status. Task mutation bindings, raw context bodies, and administrative or credential fields stay server-side.
- Ordinary `GET /v1/context` records a `context.retrieved` project event. The new Core endpoint reuses the same context assembly and revision computation with retrieval-event recording disabled. It projects only the project and request identity, revision, partial flag, and source metadata. It accepts the existing owner-wide Web interface with `control-center:owner` and `context:read`, and denies project-bound interfaces and raw master device tokens. There is no fallback to the audited endpoint. Existing authentication and credential-rate accounting continue their normal operational bookkeeping.

## Validation

- The Node 26 Core check passed with 2,531 tests, 123 gated skips, the lifecycle suite and three import dry runs. The Web type check and optimized production build passed.
- Core integration tests verified the reduced catalog makes one owner-scoped SELECT for six fields, refuses unauthorized and ambiguous requests before project SQL, and preserves the ordinary Control Center response. Context integration tests showed the same revision as the regular reader without its project retrieval event and without invoking a model. The Web regressions reject missing or changed UUIDs and ambiguous catalog queries before a content read.
- The compiled app passed ten Chromium acceptance groups against disposable local Better Auth/PostgreSQL and a loopback HTTPS Core fixture. They cover default-off 404 with zero Core calls, private/no-store HTML and RSC, anonymous/forged/revoked denial, read-method restrictions, archived and unregistered refusal, task pagination, project and cursor isolation, empty and partial states, a 390 px touch layout, and GET-only server transport. The catalog received only `view=workbench` requests.
- Independent review identified the initial catalog UUID gap. The correction and its missing, replaced and stale UUID regressions passed re-review.

## Activation and pending checkpoint

The new flag and registrations were not applied to any deployment. Git-triggered deployments are disabled for this branch and `main` in both Vercel projects. A future authorized rollout requires the reviewed Core read endpoint and Web candidate, an existing verified owner-wide Web credential, and independently verified project registrations. Stage with synthetic or approved read scope and verify owner access, cache behavior, project binding and the absence of project events from the Workbench path. No migration is part of this slice.

The read-only Codex preflight matched the BobAI project registration and trusted surface. The bounded context returned partial. This document is the source-side continuity checkpoint.
