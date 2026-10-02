# Inherited owner-delegation final expiry correction

## Applicability and review status

Independent finding task-3/REVIEW-OWNER-DELEGATION-TIMING.md reproduces proof expiry during the last awaited grant read against frozen43. Exact same owner-delegation.ts SHA25650ba99bc12b102c559ce54087dc44a3068f538fcabd12c8a8387bf53272bbd0a is present in frozen proposed89. Current pinned-transaction.ts still directly treats revalidate true as COMMIT authorization. Thus defect is inherited in CURRENT89, not confined to obsolete43. Original43 record/no-blocker verdict and all accepted85/76/proposed89 snapshots preserved. Original timing finding copied to review/INHERITED-TIMING-FINDING.md. Proposed89 was not accepted.

Independent current-target follow-up was blocked by platform cybersecurity safety restriction, as reported by parent. It was not retried through another tool/worker/route. This local remediation and its tests are not independent review. Corrected candidate stays unaccepted; reviewer restriction remains unresolved. Our local tool calls were not rejected.

## Correction

Only authorization-runtime file changed: Core/src/workflow/owner-delegation.ts. checkedTime rejects invalid/nonintegral/negative clocks. After awaited currentSession and all directory/project grants, one final clock checks proof and checked session expiry strictly greater than that clock, alongside existing exact action/session/grant bindings. Equality is expired. Issue checks session after grants, chooses proof expiry from that issuance clock, and checks both proof/session after storage insert before returning a token. If store insertion outlasts expiry, no token returned; an unreturned expired row may remain until separately approved retention operations. No new cleanup/deletion or authority added.

Pinned transaction runtime unchanged: failed revalidation reaches existing ROLLBACK before COMMIT. No new SQL/migrations, grants, headers, credential policy, source adapter activation, baseline acceptance or delegated owner authority. Existing cache-disabled actual Better Auth integration retained.

## Tests

Seventeen deterministic cases: proof/session expiry equality during currentSession, directory and last project read; redemption grant expiry with burned single use; issuance session expiry at getter/grant/directory/insert; proof expiry during storage; one ms before boundary passes; invalid final clocks deny. Actual PostgreSQL adds two final-grant-read expiry cases using production verifier/pinned transaction/store/service with restricted workflow role and synthetic SQL session/proof records. Both execute packet/receipt/history insert paths first, advance injected time during last actual grant read, then assert deny,0committed packets/receipts/history and consumed proof retained. Session case proves session expires while proof remains future.

Full Core source420 pass,0fail/skipped; actual workflow47 + storage12 + recovery5 pass. Core typecheck/emitted build pass. Actual local Better Auth/rendered31 passed,0unexpected/skipped/flaky; Web webpack build passed.

Superseded failures retained: earlier1ms PG test assumed expired proof always issued; safe issuance now may deny after insert. Updated test accepts only denial at issuance or later expired redemption. Initial successor source run lacked explicitly retained synthetic compatibility receipt inputs; copied those from frozen89, rerunpassed. Copied prior receipt inputs remain compatibility only, not newly certified reports. Browser stdout was redirected to the same filename the existing runner writes internally, corrupting that summary file; collision retained as diagnostic, valid browser-final.json plus observed runner exit0 are the evidence. Derived browser-result-validation.json is explicitly not external certification. No rerun or runner code change was needed; underlying31 tests and build succeeded. No live secrets/data or plugin writes.

## Honest guarantee and gates

Expiry is checked using the verifier's final valid clock after its awaited authority reads; asynchronous time between that result and later HTTP transit/SQL commit is not atomically covered. Grant/session revocation after last read remains documented cross-service boundary, not an instant distributed guarantee. DB injected-time tests prove known expiry during the verifier invocation is denied and actual transaction rolls back; they do not prove deployed auth/RLS/provider access or synchronized production clocks.

All normal live/event/release gates remain off. No credentials/grants/settings, hosted service calls, publication/deploy or live migrations. Independent correction review AND adapters-slice review remain required; platform restriction must be resolved without circumvention before acceptance. Owner candidate/environment/validator/public key/custody/access/expiry designation remain unset.
