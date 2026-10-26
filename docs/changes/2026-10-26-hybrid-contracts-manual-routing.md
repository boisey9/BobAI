# Default-off hybrid contracts and manual routing policy

Date: 2026-10-26 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented and validated locally; hybrid execution remains unavailable**. Branch: `codex/bobcore-hybrid-contracts`. Reviewed parent: `ce5203ae807546978e303df9a3dab6f8b642e4e1` (`Reconcile owner-reviewed checkpoint import and source inventory`). This successor is an uncommitted review diff. No push, PR, merge, deployment, migration execution, credential change, device enrollment or live inference occurred.

## Preflight, review and continuity

The repository mapping, agent instructions and project/interface/activity standards were reviewed. The owner's scope is local default-off contracts and manual routing after reviewing the checkpoint importer and saved-source inventory. Existing Vercel hosting, Neon authority, BobCore ownership and configured cloud provider are preserved.

The preceding 14-file checkpoint slice passed **83 targeted review tests** covering the importer, real Web/Core routes, owner-session proofs, OAuth checkpoint scope and provider timeouts. Its 110 saved-source hashes, 78 exact / 29 different / three omitted dispositions, and 24 preserved governed-workflow files were verified before preserving it as local commit `ce5203a` and creating this branch. No actionable behavior defect was found in that bounded self-review. Independent approval remains separate.

During the successor's context tests, one explanatory detail was corrected in the checkpoint source comment and change record: both stores already exclude `context.retrieved` audit events from the context package's recent-event list. Other operational events can change the overall revision. Binding reviewed state independently of unrelated events remains appropriate; no checkpoint-import behavior changed.

The first preflight exposed only retired staging, which was not used. After the interrupted session resumed, the new `bob_core` connection successfully returned context with:

| Evidence | Returned value |
| --- | --- |
| Authority | `bob-core`, version `0.2` |
| Project | `bobai`, UUID `10000000-0000-4000-8000-000000000001`, name BobAI, active |
| Repository / surface | `boisey9/BobAI` / `codex` |
| Revision | `505bba917c6d792a5e6003dafe5752a8024489787ada497fc50b89d60a019e7e` |
| Generated / checked | `2026-10-26T23:04:37.760Z` / all five sources checked `2026-10-26T23:04:37.555Z` |
| Availability | All five sources available; events and memories truncated; `partial=true` |
| Environment limitation | Response has no explicit environment or credential-binding field. Local MCP configuration points to the Production `bob-core.vercel.app` origin, but configuration alone does not complete environment/access acceptance. |

Project identity and read access now have fresh evidence. The returned latest task update is September 9, and the latest handoff is October 23 at 12:04 UTC. Their pending-authentication statements predate the later owner-designated readiness record and local reconciliation evidence. They do not undo newer owner instructions or establish current deployment state. The active September 7 scoped-access decision also explicitly supersedes an older blanket read-only credential description still returned among decisions. No hybrid-specific task exists in the untruncated returned task list; the related broad access/recovery task is `b22684f4-6041-46a0-9c9d-cda955a8d21a`, version 7. It was not changed or marked complete.

The owner's local-only instruction controls checkpoint writes for this task. No BobCore event/task write was attempted, and no historical pending checkpoint was uploaded. The fresh read does not prove two-way synchronization. A new pending checkpoint is included below.

## Implemented contracts and boundaries

The new `Core/src/hybrid/` module is side-effect-free and not imported by a runtime entrypoint, route or provider factory. The policy defaults to `enabled=false` and only accepts manual selection. It has no environment-variable loader, dispatcher, queue, worker, database store, recurring work or SDK client. Passing an explicit enabled policy is possible in synthetic tests and future internal code; it is not an activation mechanism exposed by the running application.

Contracts use the existing Zod dependency, chat message conventions, operation-ID format and version conventions. Unknown fields are rejected. They define:

- Owner/project UUID/key, explicit `testing` or `production` environment, and Core instance identity. These are assertions compared with trusted server-derived bindings, not caller-issued authority. The retired staging identity is not an alias for testing.
- Enrollment intent and Core-owned device grants with a separately identifiable grant, generation, approval/expiry status, approved capabilities and model inventory. No raw credential or secret is part of these DTOs. Challenge issuance, owner approval, secret exchange and revocation storage remain unimplemented.
- Heartbeat sequence, bounded health telemetry, worker/Ollama versions, installed model names/digests, and capacity. A health-only report can represent absent Ollama. Execution requires an inference-capable report with loopback transport and cloud functionality disabled. Reports are declarations, not cryptographic proof of the actual machine configuration.
- Explicit cloud or local inference intent. Cloud uses the configured provider/model; local specifies one device and exact approved installed model/digest. Neither input supplies a provider key, arbitrary endpoint, tool list, shell command, filesystem/browser capability or Jarvis instruction.
- Run, attempt, lease and result identities; positive safe-integer versions/fencing tokens; context/policy references; worker claim/renew/complete/fail; and client cancel/acknowledge requests. Worker completion carries the actual Ollama model/digest, context revision, lease and bounded result/usage. Cloud adapters retain the existing `AIProviderResult` contract.

Draft bounds follow Phase 0: 90-second heartbeat freshness and maximum lease, 30-second renewal interval, ten-minute maximum run deadline, at most three attempts, and content expiry fixed at creation plus one hour. The policy also uses a 30-second authorization freshness limit, five-minute required-context freshness limit, and 30-second future-clock tolerance. These are local contract defaults, not measured Acer capacity or activated timers.

The one-hour field describes the future encrypted operational buffer. No content persistence, encryption key management, timed cleanup or acknowledgement deletion is implemented here. Logical expiry and physical deletion must be enforced by the later service; backup retention can outlive deletion. Metadata and content remain separate in the run contract. A valid lease/result JSON object does not enforce atomic claims, current-fence acceptance, one committed outcome, replay protection or restoration quarantine.

## Manual policy and context continuity

`evaluateManualRoute` produces either a fixed denial code or a content-bearing internal plan. It performs no I/O and grants no authority. Its facts must originate from authenticated Core services; exposing these inputs directly as a request body would bypass the intended boundary.

Evaluation requires matching owner/project/environment/instance bindings, current active Core authorization and permission for the chosen route. It validates authoritative context identity and surface, active decisions, source availability/freshness and project isolation. Decisions, tasks, approved memories and handoffs are required; unavailable optional activity and ordinary truncation remain disclosed in the plan. The policy reuses `buildBobInstructions` and the existing canonical fingerprint function. Both choices receive the same complete prepared Bob instructions, approved context and messages.

The captured context keeps its overall revision and a separate hash of relevant state and required-source completeness. Unrelated operational activity can change the overall revision without changing that hash. Later durable execution must retain the original captured content and recheck current authorization, policy and relevant state before dispatch; this evaluator does not implement that lifecycle.

Local selection additionally requires the selected device's approved, unexpired grant, matching heartbeat instance/grant generation, both health and inference capabilities, fresh server receipt/report timestamps, idle status, verified-report loopback/cloud-disabled settings, and the exact model in both the approved and installed inventories. Capacity is bounded by the smaller reported/approved byte and output limits. Inputs over capacity fail explicitly; no context is dropped and no alternate model is selected. Byte limits are conservative transport/input bounds, not a tokenizer, GPU-memory or context-window guarantee. Actual model fit must be verified by the future adapter and Acer acceptance.

Plans explicitly prohibit crossing between local and cloud after failure. Unsupported automatic routing and genuinely local-only content processing are rejected. The first future route is hosted hybrid: Core sees content even when inference eventually runs locally. Running the same Web application locally does not change that boundary. Existing Z.AI model fallback within its configured cloud adapter is preserved; this slice neither changes it nor claims it is disabled.

## Legacy compatibility and disabled runtime

Ordinary `/v1/chat` requests continue to use the existing configured provider. The only runtime validation change is that explicit `route` or `processingMode` fields are now rejected with the existing invalid-request response before inference. Previously, unknown fields were stripped, which could silently treat a local selection as normal cloud chat. Valid existing chat payloads and provider behavior remain compatible; these new fields were not supported legacy inputs.

No `/v1/local-nodes` or `/v1/inference-runs` routes are mounted. A deliberately unrecognized `BOB_CORE_HYBRID_ENABLED=true` value in the regression fixture still produces no endpoints; it is not a supported deployment flag. There is no UI route selector or local compute connection in this slice.

## Validation and source inventory

Successor review, 2026-10-26: the device-enrollment task re-read the contracts, context preparation, routing evaluator and compatibility boundary. **108 focused tests passed** across hybrid contracts/policy/runtime compatibility, continuity and interface credentials. No actionable behavior defect was found in this bounded self-review; independent approval remains separate. This slice is preserved as the local predecessor of `codex/bobcore-device-heartbeat` before device work begins.

Validation used installed locked dependencies, Node `24.19.0`, synthetic content and a clean child-process environment without database/hosted fixture inputs. The interrupted run's temporary logs were unavailable on resume, so the focused and full checks were rerun against the preserved source.

| Check | Result |
| --- | --- |
| Hybrid contract tests | 26 passed: strict fields, limits, no execution capabilities, model identities, leases, completion content and fixed expiry |
| Manual policy tests | 56 passed: disabled defaults, binding/isolation, live-fact requirements, context continuity/freshness, unsupported modes and device/model denial cases |
| Runtime compatibility tests | Eight passed using actual runtime/provider construction and mocked adapter generation: both configured providers, hybrid-field rejection and absent endpoints; no live transport |
| Full Core `npm run check` | Type checking; **792 tests across 60 files passed**; eight lifecycle tests; three bootstrap import dry runs |
| Disabled test gates | **106 database/hosted tests across six files skipped**; no migration or database fixture enabled |
| Web `npm run check` | Type checking and Next.js `16.3.2` webpack build passed |

No new browser flow was introduced; the Web source change is a comment. There was no real owner-session, device, Ollama, database, lease-concurrency or recovery acceptance. Tests validate shape and pure preflight decisions, not the security or durability of a future implementation.

All 110 saved source files still verify against their manifest. The predecessor's inventory remains pinned to `ce5203a`: 78 exact, 29 different, three omitted. This successor changes two payload files: the chat contract guard and the checkpoint comment. After restoring generated `Web/next-env.d.ts`, the working comparison is **77 exact, 30 different, three omitted**; the new hybrid modules/tests are outside that historical runtime payload. All 24 governed-workflow files remain identical to the pinned GitHub baseline. No new source gap or wholesale replacement is implied.

Exactly **13 paths** belong to this review diff:

| Area | Paths |
| --- | --- |
| Hybrid contracts/policy | [contracts](../../Core/src/hybrid/contracts.ts), [context preparation](../../Core/src/hybrid/context.ts), [manual policy](../../Core/src/hybrid/routing-policy.ts) |
| Compatibility and clarification | [legacy chat contract](../../Core/src/contracts.ts), [checkpoint comment only](../../Web/lib/checkpoint-import.ts) |
| Tests/fixtures | [contract tests](../../Core/tests/hybrid-contracts.test.ts), [policy tests](../../Core/tests/hybrid-policy.test.ts), [runtime compatibility](../../Core/tests/hybrid-compatibility.test.ts), [synthetic fixture](../../Core/tests/hybrid-fixture.ts) |
| Documentation | This record, [Core README](../../Core/README.md), [implementation index](../../implementation.md), [checkpoint explanation correction](2026-10-26-web-checkpoint-import-reconciliation.md) |

Final scope checks cover these paths, whitespace/conflict markers, local Markdown links/fences, source hashes, restored generated files and unchanged provider/runtime/authentication/migration/dependency/deployment configuration. The implementing agent's bounded review is complete; independent review remains open.

## Next implementation and blockers

**Recommended next slice after review: device enrollment, revocation and authenticated heartbeat**, proposed local branch `codex/bobcore-device-heartbeat`. Build the owner-approved enrollment lifecycle and telemetry-only node boundary, reusing the existing owner authorization conventions while keeping worker grants separate. Prove wrong-project/environment/instance, replay, revoked/expired grant and stale-heartbeat denials using synthetic evidence. Actual credential issuance, schema work, service setup or hosted activation requires separately authorized scope; none is implied by this recommendation.

Durable run/lease/receipt transactions, encrypted content storage and cleanup, restoration invalidation, the loopback Ollama adapter and minimal existing-Web controls remain subsequent slices. The first operational milestone is still an authenticated Acer heartbeat followed by one successful BobCore-routed Ollama inference in an explicitly verified testing environment. Jarvis execution, automatic routing, voice, advanced dashboard features and genuine local-only processing remain later work.

Remaining blockers and limits: independent review; full environment/credential and two-way client acceptance; reconciliation of dated/partial BobCore records; actual device enrollment and hardware/model/service verification; durable database/concurrency acceptance; and a verified backup artifact plus complete isolated restore. Historical observations of a six-hour restore window, unprotected Production branch, empty backup ledger and skipped scheduled backups are not refreshed or closed here. Verified recovery remains a prerequisite before risky Production schema/access changes or cutovers.

## Pending BobAI checkpoint — local only, not uploaded

Date: 2026-10-26. Project: `bobai` / `boisey9/BobAI`. Surface: `codex`. Stable operation ID: `0e8477f4-520e-49a5-a9fa-213f3ba27438`. No dedicated hybrid task ID/version was returned. Related broad access/recovery task `b22684f4-6041-46a0-9c9d-cda955a8d21a` was read at version 7; no update to that task is proposed by this checkpoint.

Outcome: reviewed checkpoint import/source inventory and preserved it as local commit `ce5203a`. Prepared default-off hybrid contracts and a pure manual routing evaluator on `codex/bobcore-hybrid-contracts`. Reused Bob identity/context/fingerprinting; retained provider behavior; rejected hybrid selections on legacy chat before cloud dispatch. Corrected the checkpoint comment about retrieval events without changing its behavior.

Evidence: 90 focused hybrid tests, 792 full Core tests, eight lifecycle checks, three import dry runs and Web types/build pass. 106 database/hosted cases remain skipped. The 13-file diff is local. All 110 saved hashes and 24 preserved workflow files verify. Fresh BobCore read matched BobAI UUID/repository/codex at revision `505bba917c6d792a5e6003dafe5752a8024489787ada497fc50b89d60a019e7e`; events/memories were truncated and no environment field was returned.

Unresolved: independent review, explicit environment/access acceptance and dated-state reconciliation, device/worker implementation, durable execution/recovery and Acer/Ollama verification. Next: review this slice, then prepare device enrollment/revocation/heartbeat. No worker, hybrid route, database change, live inference, checkpoint synchronization or runtime acceptance occurred. This record stays local under the owner's instruction. Before any later upload, obtain the applicable scope, retrieve fresh context, resolve task/version as appropriate, reconcile prior receipts and verify write/readback. Reuse this operation ID only for identical submitted content.
