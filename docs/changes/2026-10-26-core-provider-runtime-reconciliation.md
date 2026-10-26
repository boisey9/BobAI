# Core provider and runtime reconciliation

Date: 2026-10-26 (America/Toronto). Project: `bobai` / `boisey9/BobAI`.

Status: **implemented and tested locally; independent review and release acceptance pending**. Branch: `codex/reconcile-core-provider-runtime`. Base: reviewed checkpoint slice `681ad29526452d0caac7b18141f8647d3db6fd2f`, following Phase 0 documentation `3214f4860335530b9be868ae1ba73c076a44c592` and pinned GitHub runtime `36552fc430b06b91ee1e47acef124e4ea36987c0`.

The owner requested review of the current slice and then Core provider/runtime reconciliation, with all work local. The [checkpoint slice](2026-10-26-core-context-checkpoint-reconciliation.md) received a fresh code review with no actionable defect found and 55 targeted tests passing, then was preserved in local commit `681ad29` on its original branch. That review was performed by the implementing agent; independent acceptance remains separate.

No push, PR, merge, deployment, database migration, credential change, provider/model switch, public listener, or Production mutation was performed. The migration source already restored by the prior commit remains unchanged and was not executed. No live provider or database was contacted by the tests.

## Authority, preflight, and source provenance

The [project mapping](../../.bob/project.yml) and [agent guidance](../../AGENTS.md) identify BobAI and its governance. BobCore remains the shared-state authority. Fresh tool discovery still exposes only the retired staging context tool; it was not called. No correctly scoped Production BobAI/Codex response is available to validate authority, project UUID/environment, revision, timestamps, source availability, or truncation. Current task IDs/versions and current owner decisions remain unverified. The pending checkpoint below is local, not synchronized.

The owner-identified latest handoff, [Prepare BobCore readiness](codex://threads/01a1507c-319e-7789-b2d7-d0bd4dc4e01a?hostId=durable), and its dated release status remain the operational baseline described in the prior slice. They report Production promotion and owner passkey/task/chat acceptance, while Codex OAuth acceptance and commissioning-password retirement remain incomplete. This work does not resume those Production actions or reinterpret configuration as authenticated acceptance.

Saved source root: `/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/source/`. All **46 Core runtime files** were rechecked against the saved [manifest](/Users/erikboisvert/Documents/Codex/2026-10-18/task/bobcore-production-activation-20261023/prepared-release/MANIFEST.json). These are manifest-verified saved bytes, not a fresh download or a new live acceptance run. The [Phase 0 inventory](2026-10-26-bobcore-hybrid-phase-0.md#4-productiongithub-reconciliation-comes-first) remains the pinned original comparison, not a count of remaining differences after this slice.

| Saved source | SHA-256 | Reconciliation |
| --- | --- | --- |
| `Core/src/ai/openai-provider.ts` | `83634dc6c643ec6c4198cd79ca1842aeab7c584e714cf80e22483ab7885dad19` | Exact saved file: explicit reasoning and bounded retry policy |
| `Core/src/ai/provider-error.ts` | `2bd9fbea298234417b6ec31447d070ddcc6049da1e14683a7dc1380ded6be611` | Exact saved file: SDK transport classes and diagnostic IDs |
| `Core/src/config.ts` | `5947a0616807197f718f50fb799ace02f8b50e579abd29ffb119df0e906863f9` | Exact saved file: optional reasoning configuration |
| `Core/src/control-center/projects.ts` | `0061eed4101af0d4d4ac8e8df25937ec6913cdcff6197be96208f7958b3a498b` | Exact saved owner-only project route |
| `Core/src/context/operations.ts` | `af30c5e5234b2d5b19ae6103d50e4bd1073e07c80119f0fd778cab3874db2f79` | Exact saved project-conflict/anchor errors |
| `Core/src/context/service.ts` | `bceb1321e84fe0d03b1791f1a952a6f9e15f24be26587c5ed826452a79a8c56a` | Project creation/anchor methods only; preserve checkpoint work |
| `Core/src/context/types.ts` | `8e6c6c67a538fc839d63896210c64fe9249df917e3a1a1f7043c471e00e07cf2` | Project-create input/store contract only |
| `Core/src/context/in-memory-store.ts` | `6e60acfdacd91cc8a626ff1185f7394969bbb54933354eab3996057f80fce627` | Project creation and rollback of project state only |
| `Core/src/context/neon-store.ts` | `8a0ad70b2f4ee2c84d8751b01267b9aacfcc1bf70d1995bd93f9fb26d9ca81cb` | Parameterized project insert and known uniqueness-conflict handling only |
| `Core/src/security/interface-credential.ts` | `6ec6121d35c242adfb1fcbfdbd166da17d6d497c228c1134208eba5469177db3` | Project-creation access guard only |
| `Core/src/runtime.ts` | `5201d3028f2ab0dda05183b6af4ca646c3b33fe777e1e3a567dafe11c361d0b6` | Add project mount while retaining repository workflow integration |

## Provider behavior

The installed, locked OpenAI SDK `7.3.0` was inspected directly. Its transport exceptions inherit `name="Error"`, and its retry path waits on `Retry-After` without the caller's abort signal. The reconciled implementation:

- uses one SDK attempt for OpenAI Responses (`maxRetries: 0`) with the existing 15-second transport timeout and Core cancellation signal;
- preserves `store: false`, Bob identity/instructions, approved memory, Shared Context, and the selected provider/model;
- forwards `OPENAI_REASONING_EFFORT` only when explicitly configured for OpenAI; omission leaves the request field absent, and Z.AI receives no reasoning setting;
- recognizes actual SDK connection, timeout, and cancellation exception classes and maps them to the existing sanitized `503` contract;
- recognizes the SDK's `requestID` spelling and retains only bounded identifier-shaped diagnostic request IDs, dropping URLs, whitespace, and overlong values.

The optional reasoning vocabulary matches the installed SDK, but accepted values remain model-dependent. No environment value or cloud model was changed. The unchanged app retains its 35-second generation signal. Existing Z.AI model fallback remains as implemented; this work adds no cross-provider fallback or hybrid routing. Identifier filtering is not a general content-redaction system; no new raw-error logging was introduced.

## Runtime and owner project creation

The saved runtime could not safely replace the repository version: it omits the repository's governed-workflow router and private-runtime selection. The reconciled runtime adds the deployed project-creation mount while preserving those existing paths.

`GET /v1/control-center/projects/new` returns the current owner's Personal workspace anchor, and `POST /v1/control-center/projects` accepts a strict project creation command. Both require a trusted owner-wide Web credential with `control-center:owner`. The existing credential parser must verify stored owner-wide authority; request headers are stripped and rebound by the gateway. Primary device tokens, project-bound grants, non-Web surfaces, missing permissions, and revoked credentials cannot use this boundary.

The command requires `expectedAnchorId`, a stable `operationId`, `projectKey`, and `name`, with optional description/repository. Personal is reserved. Repository URLs must be HTTPS and contain no credentials, query, or fragment; bodies, fields, and lengths are bounded. Caller-supplied owners, auth metadata, and unknown fields are rejected.

Creation reuses the existing Shared Context store and transaction/receipt mechanism. The owner's existing Personal row provides the lock/receipt anchor before a new project row exists; its UUID/status are rechecked inside the operation. Project, audit event, and receipt commit together. Identical retries preserve the result, changed-content reuse fails, and duplicate or archived keys are not overwritten. The in-memory store now restores project rows as well as tasks/events/handoffs on rollback. The Neon adapter uses the existing schema and specific uniqueness constraint; it creates no schema or credential grant.

Personal remains a separately authorized workspace. The anchor is not a new memory store, and a new project does not create approved memories or active decisions. The same Core context service reads the resulting project state. Production transaction/role acceptance remains a separate gate.

## Preserved and intentionally deferred source

- `Core/src/app.ts`, `Core/src/index.ts`, `Core/index.ts`, and all `Core/src/workflow/` files remain unchanged. The governed router still has its independent authorization path; feature gates remain default-off. Explicit private runtime initialization still avoids ordinary provider/credential setup and fails closed on invalid configuration. The Vercel root entrypoint still forwards through the OAuth/interface fetch wrappers.
- The saved `/health/configuration` diagnostic and `operations/staging-target.ts` were not imported. They encode the retired staging database/model contract. They must not be treated as a current testing or Production readiness probe; any future diagnostic needs a separately reviewed, verified environment contract.
- Core/Web dependency manifests, lockfiles, deployment files, migration files, environment/credential configuration, and provider selection/factory/Z.AI implementation remain unchanged.
- Saved task-list/read APIs, task-approval guard handling, and Web authentication/task/context/project UI remain separate reconciliation work. Adding the project route alone does not claim that the repository Web UI has full deployed parity.
- No Acer worker, Ollama adapter, new execution capability, automatic routing, or new memory authority is introduced.

## Validation and review

Tests use Node `24.19.0`, locked dependencies, synthetic content, stubbed transports, and in-memory state. Before provider source changes, the new targeted tests produced **18 failures and 24 passes** against the prior implementation. Before mounting/reconciling project creation, all 18 initial runtime cases failed. Test fixtures were then aligned with the actual context/Hono types, and additional entrypoint/SQL-adapter cases were added.

The final full Core check passed **552 tests**, with **106 skipped**, across **48 passing and 6 skipped files**. Core type checking, all eight lifecycle checks, and all three bootstrap import dry runs passed. Web type checking passed. This adds 48 tests to the reviewed predecessor's 504. Coverage includes:

- real SDK request serialization, identity/context preservation, explicit/default reasoning behavior, long `Retry-After` handling, transport timeout, caller cancellation, empty responses, and sanitized Core API failures;
- runtime mount preservation, owner-only route isolation, revoked/primary/project-bound/forged-authority denial, body/schema limits, stale/missing/inactive anchors, identical/concurrent/conflicting retries, duplicate keys, and audit-failure rollback;
- parameterized SQL-adapter input and specific constraint-error handling through a fake query function, with no database connection;
- Vercel root gateway forwarding, private-runtime isolation, and failure without normal-runtime fallback.

`BOB_LOCAL_WORKFLOW_TEST_SOCKET` and `BOB_HOSTED_NETWORK_FIXTURE` were explicitly unset, along with database URL inputs. No local database, migration, hosted network fixture, app listener, or external inference call was started. Concurrent project creation/rollback acceptance here uses the in-memory store; no fresh PostgreSQL or deployment acceptance is claimed. No Web build/browser acceptance or independent review was performed.

Final diff validation passed for exactly **19 intended files: 11 Core source, five test, and three documentation files**. The eleven source paths are listed in the provenance table. The test changes are [configuration](../../Core/tests/config.test.ts), [provider errors](../../Core/tests/provider-error.test.ts), [OpenAI requests](../../Core/tests/openai-provider-request.test.ts), [entrypoints](../../Core/tests/runtime-entrypoint.test.ts), and [runtime/project creation](../../Core/tests/runtime-reconciliation.test.ts). Documentation changes are this record, the [Core README](../../Core/README.md), and the [implementation index](../../implementation.md).

Tracked/new-file whitespace and conflict-marker checks passed. Local Markdown links/anchors and fenced blocks were checked; external links received syntax review only. Preserved runtime/entrypoint/workflow files, prior MCP checkpoint contract, Web source, migrations, dependency manifests/lockfiles, and deployment/credential configuration were checked against the base. Migration 008 retains SHA-256 `46836d03e0225daec29896b535f47689cf71f5483f224664116b04a45906717e`. No additional actionable defect was found in the final local source review. Review and testing do not close Production release or recovery gates.

## Next task and remaining gates

Follow-up review on 2026-10-26, before Web reconciliation: the implementing agent rechecked the provider timeout/cancellation/error paths, owner-wide project authorization, operation/rollback behavior, and preserved runtime entrypoints. No actionable defect was found in this bounded review. All **85 targeted tests** passed across configuration, provider errors, OpenAI requests, runtime/project creation, entrypoints, interface credentials, provider selection, and Z.AI requests. This is a fresh local self-review, not independent review or PostgreSQL/Production acceptance. The reviewed slice is preserved on its own local branch before the Web successor begins.

The next implementation slice is **Web authentication reconciliation**, following the approved sequence: compare the saved owner-auth/session/consent behavior against the repository, restore explicit `handoffs:write` consent support with scope-subset and revocation tests, and preserve the governed-workflow integration and Web dependency setup. Do not activate credentials or retire password access as a side effect of source reconciliation. Web task/context/project interface reconciliation follows separately, including the remaining Core task APIs/approval handling it depends on.

Production BobCore/Codex synchronization, commissioning-password retirement, and verified backup/complete restoration remain open in the reviewed evidence. Risky Production schema/access/deployment operations require the recovery gate first. Existing Neon runtime-role privileges and project-creation transaction behavior need authorized testing before any release. Acer/Ollama capabilities and the first heartbeat-plus-inference milestone remain unverified.

## Pending BobAI checkpoint — not uploaded

Date: 2026-10-26. Intended source: `codex`. Project: `bobai` / `boisey9/BobAI`. Stable pending operation ID: `4380566b-6887-441a-b073-17e6c83732b9`. No authenticated task ID/version is available.

Outcome: reviewed and locally committed the identity/checkpoint slice as `681ad29`; prepared provider/runtime reconciliation on `codex/reconcile-core-provider-runtime`. Reconciled bounded OpenAI transport/error behavior, optional reasoning configuration, and owner-only project creation using the existing authority/transaction model. Preserved governed/private runtime paths and authentication wrappers; omitted the retired staging diagnostic.

Evidence: 46 saved Core runtime files matched the release manifest. Core type checking, 552 tests, eight lifecycle checks, three import dry runs, and Web type checking passed; 106 database/hosted cases stayed disabled. No remote publication, deployment, migration, credential/provider change, or Production mutation occurred.

Unresolved: callable verified BobCore connection, independent review and live transaction/role acceptance, Web authentication/consent and task/interface reconciliation, password retirement, recovery readiness, and Acer capability inventory. This record is not an uploaded checkpoint, active decision, or hybrid runtime acceptance.

Next actions: review this local slice, then begin the separately scoped Web authentication reconciliation. When the proper connection is available and synchronization is authorized, retrieve fresh context, validate authority/project/environment/surface/revision/source completeness, resolve task ID/expected version if applicable, check for an existing receipt, and verify identical retry/readback after a concise checkpoint write. Reuse the operation ID only for identical submitted content; never upload through staging or another project's credential.
