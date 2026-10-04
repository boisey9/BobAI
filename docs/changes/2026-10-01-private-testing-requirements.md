# Approved private-testing requirements — local checkpoint

Owner message Sentinel_6b322d5e11888191be6f3fb99fdc5eec approves the exact summary in Sentinel_49eac4f88b048191b7d8a41180162314: preserve memory, isolation, ordinary tasks, audit history and approved UI; passing code/database/login/browser/memory-continuity/encrypted-recovery checks; independent security review and owner walkthrough; separately designated validator; missing/skipped checks block readiness. This is requirements approval, not acceptance of this candidate, all previously proposed PB details, issuer identity, grants or hosted setup.

## Implementation

`Core/src/workflow/private-testing-requirements.ts` freezes that provenance and maps fifteen requirements to nine versioned checks plus global independent-validator/no-skipped constraints. Definition and catalog digests change with procedures. Commands are reviewed declarative data, never report-supplied execution instructions.

`private-testing-evaluation.ts` is an unmounted pure readiness evaluator. Its injected server authority must verify immutable authenticated reports and current manual acceptance records. It rejects wrong project/actor/candidate/environment/digest/procedure/issuer, revoked or expired authority, context changes during verification, missing/skipped/failed/empty tests, stale/future automated evidence and stale manual acceptance versions. It uses one final clock read. Owner walkthrough is distinct from independent validator certification; no default owner-approval lifetime is invented. No route, database migration or runtime activation was added.

## Required check mapping

| Check | Required evidence | Current limitation |
|---|---|---|
| Core types/build | Exact-tree typecheck and emitted build | Compilation is not runtime acceptance |
| Core regression | All source tests, zero skipped; database suites separate | Unit/mocked memory is insufficient |
| Web types/build | Exact-tree typecheck and webpack build | Rendered acceptance separate |
| Governed PostgreSQL | Owned isolated runner: transactions, isolation, retries/replay and storage | Synthetic roles only |
| Actual-auth Web | Owned actual Better Auth/Core/Web/PG browser runner | Synthetic account; no hosted/provider acceptance |
| Memory continuity | Real existing memory/context persistence, restart and two-project isolation | No reviewed pinned local memory drill yet; explicitly unavailable |
| Encrypted recovery | Owned encrypted snapshot/restore, content comparison, restored-authority quarantine | Hosted custody/RTO not proved |
| Independent security review | Current exact candidate/hash review; blocking findings resolved | Designated validator identity/key unset |
| Owner walkthrough | Verified owner, exact candidate/environment, core journey and recovery | Visual direction approval is not final acceptance |

Existing `Core/scripts/check-continuity-postgres.mjs` requires an explicit isolated Neon test target and applies a migration. It was not run against an inferred target. A pinned local actual-memory adapter/drill is a remaining local engineering task; packet-history success cannot substitute. The evaluator therefore cannot currently return full eligibility. No client-supplied receipt is trusted: `verifyCheck` remains a trusted server adapter contract, not a completed report parser/issuer integration.

## Validation and limits

New focused suite: 46 passed. Final full source suite: see hash-bound receipt; database fixtures explicitly excluded, not credited as executed here. Core typecheck and emitted build passed. Initial run retained as `core-with-unconfigured-pg.json`: 322 passed and 17 skipped because two unconfigured database suites were accidentally included. The corrected source-only run has no skips. Accepted predecessor's 276 source/62 PostgreSQL/31 actual-auth rendered checks remain prior evidence, not fresh successor execution. New modules are unmounted and do not change existing Core/Web runtime paths. No new PostgreSQL/browser or Web build rerun is claimed.

## Remaining gates

Implement the isolated actual-memory continuity drill; choose the independent validator identity, authenticated immutable report source and verification key/access; mount reviewed report/procedure adapters; independently review this exact checkpoint; complete owner walkthrough and candidate acceptance. Hosted targets, minimum roles, secrets, migrations, backup custody, provider protection, publication and deployment each remain separate explicit approvals. No live access or activation is implied.
