# Governed Web workflow — local implementation checkpoint

## Scope and owner direction

2026-09-30 20:57 UTC: the owner accepted prioritizing the BobCore Web app and governed project workflow, deferring work-calendar/work-email integrations and further iPhone-specific development. Exact owner response: "ok sounds good" (Sentinel_b806ba0547f4819184b97f05eb82a918), following the proposal to pause native-specific work while preserving what is built. Existing native/calendar code is untouched. Earlier prototype praise accepts the design direction, not final release acceptance.

Candidate remains isolated on `codex/bobcore-project-workflow-prototype`, based on `78bf3d066977262d6c4b6142634e34a3707832f3`. No original BobAI, FomoFlow, credentials, grants, deployments or shared databases changed. Event commit `71c8715` remains separate.

## Implemented staged slice

- Explicit governed packets with draft/ready/reviewed/released vocabulary; release always rejects until a separately approved policy exists. Ordinary task status and legacy completion are untouched.
- Separate staged migration in `Core/migrations/governed/`, not wired to startup. Project grants/policy default closed. Immutable candidate/specification/evidence/approval records, operation receipts and history; bounded packet/record loading; non-destructive rollback refusal when records exist.
- Pinned transaction adapter interface, project transaction lock, database governance triggers that serialize revocation/pause with transitions, actor-scoped grant checks, strict request validation and candidate binding.
- Specification acceptance, predecessor and baseline/policy checks, trusted issuer evidence, exact-candidate owner review, version conflicts and idempotent identical retries. Retried receipts distinguish historical acknowledgement from current packet state. No public evidence injection route.
- Separate Hono route factory with injected verified authentication; no production authenticator or normal-runtime mount supplied. Existing project/task/history reads use owner/project predicates and do not promote legacy tasks to governed packets.
- Local-only `/work` Web candidate reuses accepted prototype components/tokens, server-side dedicated connection with no legacy URL/token fallback, existing owner session/CSRF checks and bounded same-origin mutation requests. Release controls are absent. Pending request remains in this page for same-operation retry; durable browser outbox is not implemented.

## Final verification — bounded local slice

Executor recovery verified; partial edits preserved and no uncertain mutation replayed. Final code passes Core typecheck/emitted build, explicit synthetic fixture typecheck, Core 165/165 regression tests, PostgreSQL 19/19 actual acceptance tests, Web typecheck/optimized webpack build, rendered browser 13/13 tests (zero skips/flakes), and six default-off/hosted-refusal checks. Receipts are in `workflow-validation/*reviewed-final*` and `activation-guards.json`.

Browser verification uses real loopback Web → Core → PostgreSQL read/transition wiring, synthetic signed owner-session fixtures and trusted synthetic evidence producer. No live authentication or producer acceptance is implied. Covered project denial, changed/stale candidates, no release authority, lost-response identical retry, blocked/empty/loading/error/recovery, CSRF/origin/forged authority/payload bounds, keyboard focus and 390/320px layouts. Final desktop and 320px screenshots were visually inspected. Foreign-origin test forwards the actual signed request to the real server with the adversarial Origin and forwards its actual rejection; it does not fabricate a response. Initial failed attempts are retained separately.

PostgreSQL acceptance uses a synthetic private socket, no TCP, fsync enabled, actual crash/restart and pg_dump/restore. Immutable records, transactional rollback, concurrency, receipt replay, unique approval consumption, policy/evidence/predecessor invalidation, expiry, revocation serialization, role/RLS and rollback refusal are tested. Expiry uses isolated query-clock injection. No shared database was accessed. Temporary test services are stopped after packaging; synthetic files retained.

Review packet selects only the explicit source/log footprint and verifies patch applicability against clean base plus SHA-256 equivalence. Dependencies, screenshots, validation receipts and review artifacts are excluded from source diff. No unrelated native/calendar changes included. Independent human/agent review is still pending; this is a packet prepared for review.

## Decisions and activation gates

Core regression suite passed **165/165** after the scoped cache-write retry (`workflow-validation/core-tests.json`). The 19 PostgreSQL tests were run separately with explicit private-socket opt-in; the regression invocation excludes that file rather than reporting the actual database acceptance as skipped. Both Core/Web typechecks and Web webpack build pass. Original BobAI reference hashes (AGENTS, manifest, global styles, BobMark, context service and implementation index) remain unchanged against the incoming reference receipt.

Owner must choose approved regression contracts/required checks, trusted evidence producers, grant/reviewer authority, approval lifetime/retention and release authority before live activation. Synthetic fixture policy is not a proposed owner default. Baseline acceptance is represented by the separately operator-provisioned accepted policy; no live baseline producer, owner-policy acceptance workflow or credential/session attestation adapter is supplied yet. Release is disabled.

Before runtime use: review producer and principal adapters, least-privilege database role separation/RLS threat model, migration/backup/restore plan, deployed scoped authentication, replay recovery and owner cross-interface acceptance. RLS uses transaction settings supplied by trusted service; it does not isolate a compromised DB role capable of choosing arbitrary settings. No deployment, publication, live migrations, live settings, external messages or event activation is authorized by this checkpoint.

## Remaining slice limits and next safe step

Project selection still uses a project-key input; an authorized project directory/read adapter is next. Approved memory retrieval, full backlog/priorities/export and cross-interface acceptance are not delivered here. Pending operation survives uncertainty only while this page remains mounted; reload/navigation requires a durable scoped reconciliation design. Policy acceptance is operator-fixture provisioning, not immutable owner policy/version lifecycle. Workflow registry/grants must align with the authoritative project registry before production. Trusted authentication/evidence adapters remain absent, normal Core routes unmounted, all hosted/live gates closed. Bound limits (500 packets/10,000 records) require pagination/retention review.

Next safe local slice: authorized project-directory wiring plus immutable policy/baseline acceptance and receipt-reconciliation contracts, with synthetic acceptance and a small owner-reviewed UI update. Owner decisions: required permanent checks/baseline, trusted issuers, reviewer authority, approval lifetime/retention and release authority. Fixture choices are not defaults.

## Independent-review P1 correction — 2026-09-30

Independent review requested changes: prior A/v1 reviewed → B ready → A/v2 reviewed → old B approved was incorrectly allowed. The original review and failed reproduction are preserved in `review/pre-p1/`; prior hash-bound packet is retained unchanged there. The previous 19/165/13 receipts are historical and superseded for this correction.

Dependent candidate records now require a unique sorted array of predecessor packet IDs, exact candidate digests and consumed acceptance IDs. These inputs participate in candidateDigest; old evidence/approvals cannot satisfy a replacement candidate. Candidate preparation requires current reviewed prerequisites. Readiness and owner review compare each frozen binding against the current accepted predecessor and recursively validate its dependency chain; missing legacy bindings fail closed and require rebuilding. Acceptance evaluator rechecks dependencies at its final boundary. Project transaction serialization remains unchanged.

Already-reviewed dependents retain immutable history/state but expose `acceptanceCurrent=false` after direct or transitive dependency/policy change, cannot satisfy later prerequisites, and display a historical-review warning. Identical retry still acknowledges the original receipt while returning a current stale-acceptance projection. No immutable approval was rewritten; no automatic release/downgrade or deployment permission introduced. Memoized recursive checks bound repeated traversal within a chain.

Final corrected-source checks: Core **167/167**, actual PostgreSQL **22/22**, rendered integration **15/15** (zero skips/flakes), Core/Web typechecks/builds, explicit strict fixture typecheck and six activation denials. PostgreSQL additions reproduce upstream re-review denial, require fresh dependent evidence for successful rebuild, preserve historical records under transitive invalidation, and serialize concurrent upstream replacement after dependent approval; retry reports historical ACK plus stale current acceptance. Browser additions test actual old-dependent rejection and visible stale history. Final stale-dependency screenshot inspected visually.

Initial synthetic PostgreSQL restart did not supply its private-socket/no-TCP options; the safety guard stopped acceptance before tests ran. Corrected explicit options, preserved guard-failure receipt. Subsequent run had 21 passes and one read-projection assertion mismatch; corrected expected current projection, retained failure, then 22/22 passed. Strict fixture compilation caught a projected-read inferred type; annotated the fixture's mutable packet as WorkPacket and reran successfully. No assertion timeout/security guard was relaxed. All P1 Web/Core/PostgreSQL test services stopped. No live services, original work, credentials/grants, publication/deployment or migrations changed.

Updated selected patch still has 26 files against base 78bf3d066977262d6c4b6142634e34a3707832f3. Independent re-review required before next slice. Live adapter/policy/retention/registry decisions and earlier scope limits remain unchanged.
