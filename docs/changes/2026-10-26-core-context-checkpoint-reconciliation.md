# Core project identity and checkpoint reconciliation

Date: 2026-10-26 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented, tested, and reviewed locally; independent review and release acceptance pending**. Branch: `codex/reconcile-core-context-checkpoints`. Parent: Phase 0 documentation commit `3214f4860335530b9be868ae1ba73c076a44c592`, whose runtime baseline is GitHub `36552fc430b06b91ee1e47acef124e4ea36987c0`. The Phase 0 branch remains `codex/bobcore-hybrid-phase-0`.

This is the first bounded implementation slice from the [approved hybrid foundation](2026-10-26-bobcore-hybrid-phase-0.md). It reconciles selected accepted release behavior into repository source. It does not implement Acer enrollment, inference, execution, or a new memory authority. Work remains local: no push, PR, merge, deployment, database migration execution, credential/provider change, or Production write.

## Authority and latest handoff

The [project mapping](../../.bob/project.yml), [agent guidance](../../AGENTS.md), and project/interface/activity standards establish BobCore as shared-state authority and repository files as implementation evidence. The owner explicitly retired BobCore Staging during this work. It must not be used as a fallback.

The owner identified [Prepare BobCore readiness](codex://threads/01a1507c-319e-7789-b2d7-d0bd4dc4e01a?hostId=durable) as the latest prior work. Its recent technical turns and [saved status](/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/evidence/LIVE-STATUS.json) were read on October 26. The saved record, dated October 24, reports:

- Production promotion and owner acceptance of passkey sign-in, task persistence, and chat;
- migrations 004/007/008 acknowledged as committed, with authentication-table isolation checks;
- a password-disabled Web candidate READY, with canonical password retirement still unverified;
- native Codex configuration installed, but OAuth acceptance false and the last native observation at `2026-10-24T00:25:40.601520+00:00` recorded as `not_logged_in`.

These are dated outcomes, not a new live acceptance run. Later organization-only turns in that chat do not change those technical gates. No message was sent to that chat and none of its Production operations were resumed.

Fresh local configuration inspection found `bob-core` at `https://bob-core.vercel.app/mcp/sync` and `bobcore_bobai` at `https://bob-core.vercel.app/mcp/linked`. This chat exposes no callable non-staging BobCore context/checkpoint tool. The CLI's current `unknown` OAuth status is inconclusive; it is not a new failed-login result. No authenticated Production response is available to validate authority, exact project UUID/environment, revision, timestamps, source availability, or truncation for this task. Production task ID/version and current owner decisions therefore remain unverified. No credentials were read or changed, no authentication was bypassed, and the checkpoint below is local only.

## Evidence and selective source decisions

GitHub main and the absence of open PRs were rechecked before this slice. The [Phase 0 ledger](2026-10-26-bobcore-hybrid-phase-0.md#2-evidence-ledger-and-preflight) records deployment identities, the 110-file saved runtime manifest, and the 58 differing/additional runtime files. Those counts describe the pinned original comparison, not a claim that all divergence is resolved here.

Saved source is under `/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/source/`. The following SHA-256 values were rechecked against those files:

| Release source | SHA-256 | Selected behavior |
| --- | --- | --- |
| `Core/src/mcp/server.ts` | `135b50083c06406e947e70868c399d6d24ac955f3fa2adf9160a2060e82bbc89` | Stored project UUID and scope-gated checkpoint tool |
| `Core/src/security/oauth.ts` | `f4854404605fda6ea966d2f2b7029059460343ac1bf6f9f50cf22c461c8cda35` | `handoffs:write` as an explicitly supported scope |
| `Core/src/context/service.ts` | `bceb1321e84fe0d03b1791f1a952a6f9e15f24be26587c5ed826452a79a8c56a` | Optional expected-project guard before receipt lookup/write |
| `Core/src/context/routes.ts` | `b390054de7cc3c900d2b515d0581e65fc5510c64b8e7a885dd5a3bb746d514f2` | Shared strict schema and REST binding-conflict response |

These hashes identify source evidence, not the final modified files. Source was reconciled selectively; the deployment payload was not copied over the repository. The existing project type, interface scope vocabulary, shared context assembly, task versions, transactional handoff/audit/receipt service, and OAuth binding/revocation checks already existed and are reused.

The saved candidate's two identity/checkpoint test files supplied initial regression cases. Additional cases cover read-only surfaces, legacy REST-to-MCP replay, strict input, concurrent identical/conflicting requests, context readback, and revocation after a successful write.

### Migration provenance — source only

The new [008 migration file](../../Core/migrations/008_oauth_checkpoint_scope.sql) is byte-identical to both saved October 23 copies. SHA-256: `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e`.

The activation record reports that 008 was applied together with the recorded 004/007 activation work. No current schema query or migration execution was performed here, including against a local test database. The file restores missing source provenance to Git; it is not an unapplied-migration claim.

008 changes the permitted scope vocabulary, not existing grants/tokens. It requires the old 007 constraint, takes a bounded exclusive table lock, adds the replacement check, and drops the old check in one transaction. Reapplying it to the recorded post-008 schema is expected to fail its guarded baseline check. Before any separately authorized future schema work, verify the actual target and applied state; do not infer execution from a missing filename or rerun this file blindly. Verified backup/restore readiness remains a prerequisite for risky changes.

## Resulting contract

1. `bob_get_context` exposes the stored `project.id` UUID in structured output and JSON text. Authenticated project/surface binding continues to override conflicting arguments or forged internal headers.
2. `bob_record_handoff` is registered only for a bound sync principal with both `mcp:sync` and `handoffs:write`. It accepts the existing outcome/unresolved/next-actions checkpoint shape, a stable operation ID, and optional `expectedProjectId`.
3. A supplied UUID must match the currently resolved project before operation processing. REST returns `409 project_binding_changed`; MCP reports a failed tool result through the existing error boundary. Omission remains supported for older clients; new clients should use the UUID from verified context.
4. The existing service commits the handoff, audit event, and operation receipt together. Identical retries return the original result and provenance; conflicting payload reuse fails. The optional UUID is fingerprinted, so an identical retry must preserve its presence or absence.
5. OAuth must validate token claims against a currently valid project grant. Adding a scope to Core's supported vocabulary does not grant it. Missing scopes, mismatched claims, Personal grants on this engineering boundary, and revoked grants remain denied.
6. `/mcp/context` and the current primary `/mcp` tool set remain read-only. Checkpoints remain separate from approved memory, active decisions, tasks, and executable authority. No AI provider is called for a checkpoint.

See the updated [MCP contract](../../Core/MCP.md#bob_record_handoff) for input limits and output fields.

## Compatibility, exclusions, and risks

- The repository-only governed workflow and its runtime mounting remain unchanged. No existing feature gate is activated. Runtime/app/provider configuration is untouched.
- The deployment's additional task-approval guard/error handling, project-creation route, provider handling, Web authentication/privacy changes, and task/context UI remain separate reconciliation work. This slice does not claim complete runtime parity.
- `Web/lib/oauth-grants.ts` still lacks the deployed `handoffs:write` consent vocabulary. Web issuance/consent reconciliation and acceptance are required before this repository alone can provision the intended OAuth connection. The mocked Core tests are not an issuer or owner-browser acceptance test.
- Existing credentials receive no new grant automatically. Live client readiness still needs the supported BobCore connection, authenticated project/surface identity, checkpoint write, identical retry/readback, and revocation acceptance under separate authorization.
- Concurrency evidence here uses the in-memory operation store. The unchanged PostgreSQL implementation has historical coverage, but no fresh PostgreSQL concurrency, migration, recovery, or hosted-network acceptance was run for this slice.
- Commissioning-password retirement and recurring backup/complete restoration remain open operational gates in the reviewed evidence. An unchanged repository file or green unit suite does not close them.

## Validation

Locked Core and Web dependencies were installed with scripts disabled, using Node `24.19.0`. Lockfiles are unchanged. The two restored test files were run against the original runtime before the source edits: **11 failed, 9 passed**, exposing the missing UUID/scope/tool behavior. After the selected implementation, the original 20 cases passed.

After adding the additional regression cases, the full Core check passed:

- TypeScript `tsc --noEmit`;
- Vitest: **504 passed, 106 skipped**, across **45 passing and 6 skipped files**;
- eight owned-child lifecycle tests;
- BobAI, RFQ, and FOMOflow bootstrap import validation in `--dry-run` mode only.

The final suite includes 30 tests across the two new regression files. `BOB_LOCAL_WORKFLOW_TEST_SOCKET` and `BOB_HOSTED_NETWORK_FIXTURE` were explicitly removed from the test process environment to keep the database and hosted suites disabled; database URL inputs were also removed. No application listener, database fixture, or migration was started. Web `npm run typecheck` passed; no Web runtime/source change or browser acceptance is included.

Final diff validation passed: exactly ten intended paths (four Core source files, two new test files, one migration source file, and three documentation files); `git diff --check` for tracked changes and equivalent checks for new files; no conflict markers; 29 local Markdown paths/anchors resolved; six external/deep links passed syntax review; fenced blocks are balanced. Runtime/app wiring, workflow source, Web source, provider code, configuration, lockfiles, and the committed Phase 0 document remain unchanged. Markdown structure and contract consistency were reviewed without a graphical renderer. No independent reviewer or live synchronization result is implied by these local checks.

## Next implementation task and release gates

The first implementation task, **reconcile deployed Core project identity and checkpoint authorization with GitHub**, is prepared locally on the requested branch. At the owner's request, a follow-up local code review inspected the complete source diff, OAuth claim/grant enforcement, gateway header binding, both read-only MCP surfaces, shared REST schema, project validation, receipt fingerprinting, PostgreSQL transaction/locking code, migration provenance, and the new tests. No actionable defect was found in this bounded slice. A fresh targeted run passed 55 tests across MCP identity, OAuth checkpoints, continuity, MCP, and OAuth. This was a review by the implementing agent, not an independent review or database/live acceptance run. The user has not authorized publication, merge, or release.

The next bounded source task is **Core provider/runtime reconciliation**: compare the saved provider timeout/error behavior and runtime/app wiring with the pinned repository, retain the disabled governed-workflow router, and select applicable project-creation integration without copying the saved runtime wholesale. Add targeted timeout/abort/error and route-isolation regressions. Web authentication and Web task/context reconciliation follow as separate slices. Any additional migration or live acceptance requires its own authorized gate.

Before risky Production schema/access/deployment changes, require a verified backup artifact, successful isolated restore, integrity/relationship and owner-access checks, credential revocation, and measured RPO/RTO. Acer capability inventory remains unverified. The first hybrid milestone remains an authenticated Acer heartbeat followed by one explicitly routed Ollama inference through BobCore in verified testing with synthetic content. Jarvis execution and automatic routing are later milestones.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-26. Intended source: `codex`. Project: `bobai` / `boisey9/BobAI`. Stable pending operation ID: `079b0182-e68b-431d-a177-7c2416fb5160`. No authenticated task ID/version is available.

Outcome: selectively reconciled project UUID output, scoped MCP checkpoint registration, explicit OAuth checkpoint scope, and optional expected-project validation on local branch `codex/reconcile-core-context-checkpoints`. Restored exact migration 008 source without executing it. Preserved existing workflow integration and feature gates. Reviewed the owner-identified latest readiness handoff.

Evidence: Core type checking, 504 tests, eight lifecycle checks, and three import dry runs passed; Web type checking passed. 106 database/hosted cases stayed disabled. No publication, deployment, migration execution, credential/provider change, or Production write occurred.

Unresolved: correctly scoped BobCore tools are not callable in this chat; staging is retired. Web consent/source reconciliation, native client acceptance, password retirement, backup/restore readiness, and Acer capability verification remain open. Local regressions are not Production synchronization or hybrid acceptance.

Next actions: review this local slice, prepare the next separately scoped provider/runtime reconciliation, and establish the proper BobCore connection before any synchronization claim. At future authorized upload, retrieve fresh context, validate project identity/environment and source completeness, resolve any task ID/expected version, check existing receipts, submit a concise checkpoint, then verify identical retry/readback. Reuse this operation ID only for an identical submitted payload; allocate a new ID for changed content. Do not upload through staging or another project's grant.
