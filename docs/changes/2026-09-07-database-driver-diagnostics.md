# Safe database diagnostics and credential separation

During isolated OAuth acceptance, a PostgreSQL pool emitted an unhandled shutdown error containing its client configuration. The inherited database owner password appeared in the tool diagnostic. This required credential replacement as well as a code fix.

## Remediation and resulting behavior

- Production Core now uses `bob_core_personal`, a dedicated runtime role without superuser, role creation, database creation or row-security bypass. It has application table/sequence access; migrations continue through the separately held owner role. The existing restricted backup role is independent.
- The production database binding no longer applies to generic Vercel previews. Staging has explicit branch-bound credentials.
- The inherited `neondb_owner` password was rotated independently on main and all three existing development/recovery branches. All four old credentials were tested and rejected with PostgreSQL `28P01`; replacement owner credentials passed read checks. Existing deployment configuration was updated privately.
- The accepted Core release was redeployed as `dpl_3kqDoLtB8xxeFB1v1dzRGWy14Tt7`. Production context returned six approved memories and an audited transactional write succeeded through the replacement runtime credential before owner-password revocation.
- Every repository PostgreSQL pool now handles idle/disposal errors with a diagnostic containing only an event name and a validated five-character SQLSTATE. Active query failures still reach the caller. Raw driver errors, client objects, messages and connection strings are excluded.

Core and Web carry the small diagnostic helper within their separate deployable roots; the same behavioral tests exercise both copies. This avoids introducing a shared package or widening Web's build boundary for a small adapter.

## Validation

Core type checks, import dry runs and regression tests pass. Tests include a synthetic credential-bearing driver error and a failing diagnostic sink in both deployables. Web type checks and production build passed. The isolated PostgreSQL encrypted recovery drill passed again after credential rotation: all 16 tables, consistent snapshot, corruption/nonempty rejection, credential/session revocation, task replay/update, request limits, and restored owner recovery. Restore took six seconds; complete fixture validation took twenty-three seconds. The full service RPO/RTO gate remains open.

CI and the reviewed diagnostic-code deployment are tracked separately from the already completed production credential cutover. Nightly storage activation still awaits its existing owner approval; OAuth remains an unfinished feature branch with production flags disabled.
