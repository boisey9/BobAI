# Actual owner authentication — isolated local acceptance

Owner-authorized successor to the independently accepted43-file owner-delegation checkpoint (review: `../task-3/REVIEW-OWNER-DELEGATION.md`; base `78bf3d066977262d6c4b6142634e34a3707832f3`). No live accounts, grants, secrets, providers, migrations, publication or activation.

## Change

The existing Better Auth1.7.3 owner configuration and Neon serverless1.1.0 Pool now run against an isolated synthetic PostgreSQL database through a loopback-only fixture wire proxy. The proxy uses the already installed Next bundled WebSocket implementation: no packages installed. Normal driver configuration is unchanged. Fixture activation requires an explicit flag, exact fictitious database identity, canonical loopback auth origin, private synthetic socket path and absence of VERCEL. Production HTTP authentication remains rejected without those fixture checks.

The private verifier factory's implementation is shared with the Node fixture; the Web entry retains its server-only wrapper. The actual Better Auth getSession and authoritative session SQL reader feed the accepted exact-action single-use delegation protocol. Actual Web login/auth handlers, private verifier HTTP and Core restricted workflow transactions run together. The real fixture never falls back to the synthetic verifier. Ordinary tasks, protocol authority, immutable evidence, release gates and accepted prerequisite binding are unchanged.

Fixture setup creates a fictitious password account with the actual library, marks its email verified locally, and resets its rate-limit table between test cases. This is not email-provider verification. Tests use genuine signed library cookies, actual password hashing and actual session records. No passkey-device, OAuth-provider or real-account acceptance is claimed. The auth fixture uses a synthetic administrative database role; production least-privilege provisioning remains unverified.

## Verification

Core197/197; actual PostgreSQL43/43; rendered actual-library Web25/25, zero skipped/unexpected/flaky. Added fixture-target refusal tests and actual-library browser regressions for forged cookies, foreign account/origin denial, configured sign-in rate limiting, expiry, sign-out and previously minted proof invalidation. Existing rendered cases retain wrong-project/revoked-access checks, changed candidates, owner review without release authority, retry/recovery, mobile and keyboard behavior. Final Core types/build, optimized Web build/typecheck, six default/hosted activation refusals, and explicit production HTTPS/secure-cookie/cache guards are recorded in the hash-bound review packet.

The first actual-library browser run passed17/25; eight scenario tests held cookies after recreating the synthetic account. The fixture helper now explicitly signs in again after those resets; final25/25 passes. Earlier failed build/test receipts are preserved. Full PostgreSQL protocol tests use the accepted local SQL fixture; the rendered run additionally exercises the actual auth driver's transport. Browser traces are disabled to avoid persisting cookies/passwords.

Official session guidance inspected: https://better-auth.com/docs/concepts/session-management . Existing cookieCache:false is retained; no new owner freshness policy is inferred from library defaults.

## Remaining production gates

Independent review of this frozen successor; approved auth/workflow database roles and exact targets; private issuer/Core adapter host mounting and service credential provisioning; canonical HTTPS issuer/audience/origins and network boundary; approved proof expiry/storage retention/capacity and backup/restore; trusted evidence issuer, mandatory checks/regression baseline and release policy; actual owner cross-interface and rollback acceptance. Empty project-directory proof issuance still fails closed. Online rechecks detect observed revocation before access/commit, but separate auth/project services do not provide atomic revocation serialization with workflow COMMIT.

Native/calendar, draft autosave and event activation remain outside this slice. Local fixtures demonstrate library compatibility and behavior, not hosted readiness or final release approval.
