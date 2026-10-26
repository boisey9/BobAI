# Web authentication, session, and consent reconciliation

Date: 2026-10-26 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented and tested locally; independent review and live acceptance pending**. Branch: `codex/reconcile-web-auth-session-consent`. Base: reviewed provider/runtime commit `2cb86dd73259a11d94d2d4e90579f2e331f7001d`, following checkpoint commit `681ad29526452d0caac7b18141f8647d3db6fd2f` and [Phase 0](2026-10-26-bobcore-hybrid-phase-0.md).

The owner requested review of the provider/runtime slice followed by Web authentication/session/consent reconciliation, with all work local. The implementing agent reviewed provider cancellation/retry/error paths, project-creation authorization and receipts, and runtime isolation. No actionable defect was found in that bounded self-review; all **85 targeted tests** passed. The [provider/runtime slice](2026-10-26-core-provider-runtime-reconciliation.md#next-task-and-remaining-gates) was then preserved on its own local branch as `2cb86dd` before creating this successor branch. Independent review remains separate.

No push, PR, merge, deployment, database migration, credential/configuration activation, cloud-provider change, app listener, or Production mutation was performed. The Web slice is a local review diff, not runtime acceptance. Vercel, Neon, and BobCore keep their existing roles.

## Authority and evidence

The [project mapping](../../.bob/project.yml), [agent guidance](../../AGENTS.md), and project/interface/activity standards govern this work. Fresh tool discovery exposes only the retired staging connector. It was not called. No valid BobCore response is available to verify project UUID/environment, trusted surface, revision, timestamps, source availability, or truncation; current task IDs and expected versions remain unknown. Local evidence and explicit owner instructions support this work; the dated checkpoint below is **not uploaded**.

The owner-identified [Prepare BobCore readiness](codex://threads/01a1507c-319e-7789-b2d7-d0bd4dc4e01a?hostId=durable) handoff remains the historical operational baseline described in the predecessor. Its reported Production promotion and owner passkey/task/chat acceptance are separate from this local source review. Native Production Codex OAuth acceptance and commissioning-password retirement were unfinished in that reviewed record; this task did not refresh or change live access.

All **64 saved Web runtime files** were verified against the October 23 [release manifest](/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/MANIFEST.json). Saved source root: `/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/source/`. This verifies saved bytes, not a fresh deployment download. The original Phase 0 comparison counts describe the pinned GitHub baseline and are not remaining-difference counts.

| Saved source | SHA-256 | Selection |
| --- | --- | --- |
| `Web/lib/owner-auth.ts` | `4be7ac4f89a02c56d4d5443505c03bf9374062e3f928614c4654494e9b64069c` | Import private error/database/logger handling; retain repository hosted-pool and guarded local-fixture paths |
| `Web/lib/session.ts` | `8e77fe9f5dca48587fa4df053c1cf8f10388fe49a342f4a8b82022e20ac26bf3` | Exact saved file: add consistency proof helpers; preserve session/CSRF behavior |
| `Web/lib/oauth-grants.ts` | `f30cb094f326d45034537bb14ba0953bff63b79b4635ff499511f0dc45f220ce` | Exact saved file: add `handoffs:write` to supported scopes |
| `Web/components/owner-connect.tsx` | `8af6a93f18be57928703871421b95afc50eacb7d3b048310852e4d273c722553` | Exact saved file: describe optional checkpoint permission |

Reviewed additional implementation includes the login/account/connect pages; owner-login component; auth/session/consent/revocation routes; OAuth provider, grants and expired-session handling; database-error observer; workflow entry and local fixture guards; hosted database/profile modules; Web dependency/build/deployment configuration; and prior Core OAuth checkpoint tests. Installed Better Auth `1.7.3`, its PostgreSQL adapter, and Better Call error paths were inspected directly. No dependency or lockfile changed.

## Reconciled behavior

### Private authentication failures

The saved privacy wrapper replaces rejected database errors before the installed adapter or independent router fallback can serialize them. It retains only a validated five-character SQLSTATE and a fixed public message. It drops the original message, cause, client, SQL, and parameters; connect/query/end and synchronous release failures are covered. Other methods keep their original receiver so pool event handling still works.

The configured Better Auth logger emits a fixed diagnostic. `onAPIError.throw` avoids Better Call's independent raw-error logging fallback; the existing route boundary returns its private unavailable response. Normal library API errors remain HTTP errors. The request-scoped pool closes on success or failure, and construction, work, or disposal errors are sanitized.

The repository's `hostedProfile`/identity-bound hosted pool selection, explicit local fixture driver, and guarded localhost exception remain. Copying the saved file wholesale would have removed these paths. Existing HTTPS enforcement, owner-only account checks, passkey user verification, cookie settings, password gate, database rate limits, and schema validation remain configured as before. No credentials or password-retirement settings were changed.

### Session continuity and consistency proofs

Live owner sessions still come from Better Auth's database lookup with cookie caching disabled, or from the existing legacy HMAC mechanism only when Better Auth is disabled. Database errors or missing/revoked sessions do not fall back to a legacy cookie. CSRF remains tied to the current session token.

The added task, project-creation, and checkpoint-review helpers produce purpose-separated HMAC proofs only after a valid owner session. They bind to owner identity, Core URL and server credential, plus the project key/UUID, Personal anchor UUID, or exact review payload respectively. They intentionally survive an owner-session change so a later interface can recover an uncertain operation after signing in again. Owner, credential, signing-secret, project/anchor, or payload changes invalidate the relevant proof.

These proofs are consistency checks, not login tokens, CSRF tokens, Core credentials, or authorization grants. Their future consumers must still check the live session, CSRF, Core project identity, permissions, and operation receipt. This slice adds no consumer routes or task/project/import UI and grants no Personal workspace access.

### Explicit checkpoint consent

`handoffs:write` is now supported by the existing OAuth scope list and explained as “Save project progress checkpoints.” It remains optional in the owner consent form. The existing route requires requested-scope subset validation, current owner session, trusted origin and CSRF; grant creation remains project-bound and excludes Personal. The provider verifies live grant availability and scope subsets before claims are issued, while Core independently enforces checkpoint scope.

Adding a supported scope does not rewrite existing grants or issued tokens. Older grants without `handoffs:write` cannot acquire checkpoint authority. Any future new/replacement consent is a separate owner action. The existing operator client-provisioning script references the shared scope vocabulary; it was not run and no client or grant was provisioned. Grant revocation still removes associated access/refresh tokens and consents within its owner transaction.

## Preserved and deferred

- Keep repository workspace navigation in the login page, password route, passkey component, and account page; the saved payload omits it. Existing workspace gates and allowlisted destinations remain unchanged, and OAuth continuation takes precedence.
- Keep all Core runtime/provider/workflow source and prior checkpoint authorization unchanged. Keep Web OAuth issuer logic, transaction helpers, routes, scripts, build/deployment settings, dependencies, and credential/project configuration unchanged except the four selected Web source files above.
- Migration 008 remains unchanged at SHA-256 `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e` and was not executed. Supporting checkpoint scope in source does not establish the applied schema of any environment.
- Defer Web task/context/project/checkpoint-import interfaces and their remaining Core task-list/read/approval dependencies to the next slice. Do not import saved `staging-target`/configuration-health endpoints or downgrade repository dependency/build settings.
- No Acer worker, Ollama inference, automatic routing, Jarvis execution, voice, advanced Command Center capability, or local-only processing is implemented here.

## Validation

Validation uses Node `24.19.0`, installed locked dependencies, synthetic content, stubbed database/transport boundaries, and local builds. The initial auth/session regression run failed **22 cases and passed seven** against the prior source, exposing missing proofs and unsanitized failures. The focused run after reconciliation passed **78 tests**, including existing Core OAuth checkpoint and local fixture guards.

New regression coverage is in [owner authentication](../../Core/tests/web-owner-auth.test.mjs), [sessions/proofs](../../Core/tests/web-owner-session.test.mjs), [consent/grants](../../Core/tests/web-owner-consent.test.mjs), and [login/navigation](../../Core/tests/web-owner-login.test.mjs). The only test-runner change adds the existing Web `@/` alias to [Core Vitest configuration](../../Core/vitest.config.ts); no new dependency or runtime configuration is needed.

Tests exercise real Better Auth adapter and router error handling over fake query objects, private logs/responses, receiver binding and disposal, live-session/CSRF denial, proof domain/identity binding, rendered permission/login markup, owner routes, requested scope subsets, grant hooks, identical/conflicting consent receipts, revocation/rollback query sequences, and preserved workspace navigation. The status-compatibility probe disables schema introspection only within that synthetic test instance; runtime schema validation is unchanged and asserted. Provider hooks are captured through a test seam, not a real token exchange.

Full Core checks passed **603 tests**, with **106 skipped**, across **52 passing and six skipped files**; this adds 51 tests to the reviewed predecessor. Core type checking, all eight lifecycle tests and all three bootstrap import dry runs passed. Web `npm run check` passed type checking and the Next.js `16.3.2` webpack build. The build-generated `next-env.d.ts` change was restored to its pre-build contents; it is not part of the diff.

No `.env` file exists apart from the tracked examples. Full checks ran with a clean child-process environment: database inputs, local/hosted database fixtures, and application credential/configuration variables were absent. No real database, credential, token exchange, WebAuthn interaction, hosted endpoint, or app server was used. PostgreSQL atomicity/role behavior and real browser/session/passkey/OAuth acceptance remain unproven by these stubs; no skipped gate is represented as passing.

Final diff validation passed for exactly **12 files: four Web source files, four regression test files, one test-runner configuration, and three documentation files**. The documentation files are this record, the [Web README](../../Web/README.md), and the [implementation index](../../implementation.md). Whitespace/conflict-marker checks, all **36 local Markdown links/anchors**, and fenced blocks passed; external links received syntax review only. The three exact-source selections match the manifest-verified release bytes; the owner-auth difference from that release is limited to preserved repository fixture/hosted-pool integration. All Core runtime source, Web routes/workflow/issuer logic, migration files, dependency manifests/locks, deployment settings, and credential/project configuration remain unchanged against `2cb86dd`. The Web diff is unstaged and uncommitted for review. No actionable source defect was found in the final local self-review; independent review remains open.

## Next implementation task and blockers

Follow-up review on 2026-10-26 before task/context/project reconciliation: the implementing agent rechecked error containment, session/proof separation, optional checkpoint scope, grant revocation, and preserved navigation. No actionable defect was found in this bounded self-review. All **82 targeted tests** passed across the four Web regression files, Core OAuth checkpoint enforcement, local fixture guards, and database-error handling. The reviewed slice is preserved on its own local branch before the successor begins; independent review and live acceptance remain separate.

Next: **reconcile Web task/context/project interfaces and their remaining Core task APIs**, proposed local branch `codex/reconcile-web-task-context`. Compare the saved task-list/read contracts and approval-task protections first, then reconcile the existing Web consumers with UUID/version/operation guards and honest context-source availability. Reuse these session helpers; preserve governed-workflow integration. Checkpoint-import and project-creation interfaces should remain independently reviewable within that work. No wholesale tree replacement or release action is authorized.

Remaining gates: a correctly scoped callable BobCore connection; independent review; authorized testing of real database/session/passkey/OAuth behavior and existing runtime roles; Production Codex acceptance and commissioning-password retirement; verified backup plus complete isolated restoration before risky access/schema/deployment changes. Historical recovery observations are recorded in Phase 0 and were not refreshed here. Acer hardware/Ollama/service/reconnect readiness and the first heartbeat-plus-inference milestone remain future work.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-26. Project: `bobai` / `boisey9/BobAI`. Intended surface: `codex`. Stable pending operation ID: `9732cc46-394e-4683-b113-e83f4168396f`. No verified current task ID/version is available.

Outcome: reviewed the provider/runtime slice with 85 targeted tests and preserved it as local commit `2cb86dd`; prepared Web authentication/session/consent reconciliation on `codex/reconcile-web-auth-session-consent`. Added private auth failure handling, owner consistency proofs and explicit checkpoint consent while preserving workflow integration and current authorization gates.

Evidence: all 64 saved Web files match the manifest; 78 focused tests pass. Full Core checks pass 603 tests, eight lifecycle tests, and three import dry runs; 106 database/hosted cases remain skipped. Web type checking and the webpack build pass. The 12-file scope preserves runtime gates and configuration. No remote publication, deployment, migration, credential/provider change, or Production mutation occurred.

Unresolved: verified BobCore synchronization, independent/live acceptance, remaining task/context interface reconciliation, access-completion/recovery gates, and Acer readiness. Next: review this local diff, then the separately scoped Web task/context work. When a proper connection is available and writes are authorized, retrieve fresh context, validate project/environment/surface/revision/source completeness, resolve task/version if applicable, check prior receipts, submit a concise checkpoint and verify readback. Reuse this operation ID only for identical submitted content. This record is not an uploaded checkpoint, active decision, or accepted hybrid milestone.
