# Local directory, immutable policy versions and receipt reconciliation

Authorized continuation after independent P1 re-review. Prior checkpoint stays frozen at patch `6b172cc98e05166156a1f1bff0fbc0d3d424e28b32fb87d47dac073ec9c5874c`; all 26 source hashes rechecked unchanged. Review: `/Users/erikboisvert/Documents/Codex/2026-09-30/task-3/REVIEW-P1-REREVIEW.md` (local copy `review/ACCEPTED-P1-REVIEW.md`). Review independently exercised bounded in-memory service paths and hashes; full PG/browser were supplied receipts, not independent reruns.

Separate local branch `codex/bobcore-directory-recovery`, base `78bf3d066977262d6c4b6142634e34a3707832f3`. Original BobAI/FomoFlow/native/calendar source preserved. No commits, publication, deployment, live migration/settings/grants/credentials/provider calls. Normal Core router still unmounted; hosted Web refused; release always denies.

## Working bounded contracts

Directory authenticator must explicitly supply same-owner/same-actor project principals. Each grant is rechecked under its own scoped transaction; only registered active non-deleted projects are returned. Missing directory authenticator denies. No owner-wide/RLS exception or caller-supplied principal accepted. Web selects actual returned project names, with direct wrong-project requests denied server-side. Legacy task semantics unchanged.

New staged migration002 stores immutable project-scoped policy versions. Effective policy must match its immutable version, and version ID participates in policyDigest, consequently candidate/evidence/approval binding. Identical checks under a new version invalidate current acceptance; immutable old evidence/history remains. Empty002 rollback/reapply and refusal when policy history exists tested;001 rollback also refuses policy history. No worker policy-writing route or live owner-policy acceptance lifecycle supplied. All policy inputs, freshness and issuer/reviewer grants remain explicitly synthetic; no numeric lifetime default or delegated authority introduced.

Server read-only receipt reconciliation checks current access, actor, owner and project under the project lock. Returns committed historical ACK plus current packet or not_found; never replays a command. Web preserves only the operation identifier in the URL before sending; reload can retrieve an actual committed receipt after timeout without browser credential/command storage or duplicate write. Mounted identical retry remains supported. Missing/denied receipts do not recreate lost commands and keep new mutations blocked while recovery remains unresolved. URL identifiers are not secrets or authority; query-record privacy/referrer handling requires review before hosting (currently disabled).

Confirmed save refreshes records through authenticated no-store reads while preserving selected tab; background router refresh had exposed a history-navigation race, corrected here. Read errors remain honest and no fixture replaces missing data.

## Final evidence

Core167/167, actual synthetic PostgreSQL25/25, browser17/17 (zero skipped/flaky), Core/Web typechecks/builds, strict fixture typecheck and six default-off/hosted denials passed. PostgreSQL includes directory grant/revocation, actor/project receipt denial, immutable policy/version invalidation, crash/restart/retry and dump/restore. Browser includes actual Web→Core→PG reads/transitions, selection/revocation, real 15-second Web timeout after commit (fixture delays response17seconds), reload receipt recovery with one packet/history entry, no local/session storage, mobile/keyboard and prior security/candidate regressions. Mobile screenshot visually inspected.

Initial browser attempt14/16 exposed tab reset plus incorrect test label; second16/17 used a separate HTTP client omitting the secure fixture cookie over HTTP. Fixed navigation, label and used actual authenticated browser fetch; final17/17. Failed receipts retained; no auth guard or existing timeouts relaxed. New real-timeout assertion explicitly allows25seconds for the existing15second request deadline. Test services stopped. Synthetic cluster was reused; accepted source/receipt files stay unchanged.

Receipt SHA-256:
- `core-final.json`: `61d20d4fa3dcfa5919fd8e6bd5f789a3e99852f6875552f6f51dfa916831a396`
- `postgres-final.json`: `64d70ff7b309c343ac2f9f8222b10e3f3e75ea1a8fff3a10b3b6ba9941e72fe4`
- `browser-final.json`: `f46128f2f405bfc273868b51e5f9c8de553b4e729260663af7fa00e4e15dece3`
- `web-final-build.log`: `107f09dc1b2861c1e50ae80ba681fea82ad81522615e9b7e53b555e417ab1f6b`
- `activation-guards.json`: `82e92191e02a119f6d8375c15b8e719974517a8ff5e723cbc4ac9eaa034dbd30`

Final exact source hashes, patch hash and selected-tree verification are in `review/selected-manifest.json` and `review/selected-tree-verification.json`; generated artifacts/dependencies excluded. This new slice needs independent review.

## Remaining decisions and next boundary

No owner decision blocked this local slice. Live policy activation requires owner acceptance of permanent checks/baseline, trusted issuers, reviewer role, freshness/retention and release authority; earlier recommendations are not decisions. Directory principal sourcing still synthetic and authoritative grant/registry lifecycle alignment remains unimplemented. No live auth/producer adapter.

Next consequential choice is whether uncommitted request contents may be retained for recovery after leaving the page, and with which retention/deletion boundaries. Current recovery stores no browser contents/credentials and cannot rebuild an absent receipt's lost command. Immutable owner policy acceptance and scoped server outbox can be designed locally after that product boundary; activation and migration still require separate review/approval. Pagination/capacity, full memory/export and owner live acceptance remain outside this slice.

## Independent-review P2 correction — coherent recovery

Independent review requested changes: workspace read first, commit between reads, receipt currentPacket then discarded except ID caused a confirmed-recovery message with old/missing packet state. Initial review and29-file packet plus original five receipt hashes preserved in `review/pre-p2/`; review source `/Users/erikboisvert/Documents/Codex/2026-09-30/task-3/REVIEW-DIRECTORY-RECOVERY.md`. Its historical draft-decision status predates explicit22:39 owner acceptance: seven-day draft recovery is approved as a separate follow-on planning/local slice, not implemented here and not a release blocker.

Core workspace now optionally reconciles the operation under the same scoped project transaction/lock as packet, immutable records and governed history reads. Receipt helper remains actor/owner/project scoped; no authority is taken from operation ID. Web makes one validated recovery-workspace read and initializes packet/history/evidence from it, rather than merging two independent snapshots. Workspace failure renders no confirmed/current-state claim, even if standalone receipt exists. Missing receipt remains a consistent before-commit projection and can be checked again. Standalone receipt API remains read-only.

Actual PostgreSQL concurrent capture/revision tests hold the project lock after packet read, queue the writer, prove no interleaving, then verify coherent before/after projections and actor denial. Browser race fixture performs a real old workspace read then actual capture/revision commit before coherent recovery; UI renders the new/mutated packet version, current specification, honest evidence and disabled inappropriate controls. Third browser case verifies workspace failure with a successful standalone receipt does not claim current state shown. These are synthetic actual Web→Core→PostgreSQL operations, not response mocks.

New database test found numeric history sequences ordered through a text SELECT alias: after a digit boundary the newest action could be misplaced. Corrected both workspace and history queries to sort qualified numeric sequence. Initial26/27 database receipt retained as `postgres-p2-history-order-failed.json`; final27/27 passes. No security/assertion timeout relaxed.

Final corrected-source results: Core167/167, PostgreSQL27/27, browser20/20 (zero failed/skipped/flaky), Core/Web typechecks/builds, strict fixture check, six activation denials. Services stopped. Old receipt files and P1 source hashes preserved. New patch remains29 files, exact changed paths/hashes in manifest; independent re-review pending. No draft autosave, live adapters, auth/project relaxation, releases, migrations on shared data, publication or production changes.

Corrected test-receipt SHA-256:
- `core-p2-final.json`: `0e1dbd88d4f91241398b4e712105f81f26e438c920ef9ae5ecf9d8a7c630af5c`
- `postgres-p2-final.json`: `cf4c69fce49dff826190f049c3d97af658320a307fe49faa5ff8676c59096bd1`
- `browser-p2-final.json`: `dfdf052e993987f38c5be385300defacda7ec9d1526304a6c220e84efca69400`
- `web-p2-final-build.log`: `fd4275e61811eba6618af98bf6597d1316681fb3178759cfa283d8481df48f71`
- `activation-guards.json`: `82e92191e02a119f6d8375c15b8e719974517a8ff5e723cbc4ac9eaa034dbd30`
