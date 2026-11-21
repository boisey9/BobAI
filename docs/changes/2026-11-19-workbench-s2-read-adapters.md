# BobCore Workbench S2 read adapters · November 19, 2026

S2 adds a **local, default-off** Project reads view. Sample RFQ shows two task pages and a complete context source report. Operations shows an empty task page and a partial source report with truncated events and unavailable memories. The two synthetic projects have separate keys and UUIDs.

## Source and authority

- The review successor is `codex/workbench-s2` at GitHub main `b26d58f9c1b0f3c19a3c5101b6478d9c92b9ccab` with the six-file S0/S1 patch replayed and verified against its manifest before applying S2. The original S0/S1 worktree and receipts remain available. Its native drag at 100 placements remains an open stress case.
- Independent S0/S1 review identified a phone keyboard focus issue. Canceling a task draft reopened from the board could send focus to the hidden Bob panel. The successor returns focus to the board button that opened the editor. The organization board still holds disposable session state.
- The read-only BobCore preflight verified the expected project key and UUID, repository `boisey9/BobAI`, and trusted `codex` surface. All five sources were available. Events and memories were truncated, so the response was partial. The Workbench uses its own fixture identities.

## Read contracts and scope

| Adapter | Existing Core envelope | Workbench projection |
| --- | --- | --- |
| Project directory | `GET /v1/control-center?project=…` | Active entries in the supplied grant list with repository and selected-project checks. The directory omits UUIDs. The preview labels the configured grant UUID as expected and validates each task and context response against it. |
| Task list | `GET /v1/tasks?project=…&limit=10[&cursor=…]` | Task identity, title, status, priority, version, due and update timestamps, and approval marker. The adapter checks the outer project and every task's project UUID, unique IDs, and the returned continuation. |
| Shared Context | `GET /v1/context?project=…&surface=web` | Authority, project key and UUID, repository, trusted Web surface and revision checks. Display is limited to generation time, per-source check and update times, partial availability, and truncation. |

The reader accepts only injected GETs. The server-only fixture supplies responses in-process and configures no HTTP client, destination, credential or fallback. It projects only fields needed by the preview. Task mutation bindings, owner identifiers, approval records, interface credentials, and raw context bodies are omitted. Invalid, unauthorized, mismatched or cross-project responses stop the snapshot. Transient failures appear as unavailable sections, distinct from a successful empty response.

Selected hosted GET paths can have side effects. Shared Context may record retrieval activity and authenticated requests may update rate-limit or session state. This candidate has no hosted adapter wiring. Contract validation exercises Core's actual task and context handlers with disposable in-memory stores. The Control Center catalog remains a synthetic response. Any future hosted transport requires separate authorization and a review of these effects.

## Open the local preview

Use the installed locked dependencies from the successor's `Web/` directory.

```sh
env -i PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  TMPDIR=/private/tmp NEXT_TELEMETRY_DISABLED=1 BOB_UI_REVIEW_ENABLED=true \
  BOB_WORKBENCH_READ_REVIEW_ENABLED=true \
  node ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3451
```

Open [Project reads](http://127.0.0.1:3451/review/workbench/read) or follow **Project reads** from the Workbench. It follows the selected sample. The preview requires both opt-in flags, a loopback Host, development mode, and the existing review guard's isolation checks. To keep an unsaved board open, open Project reads in a second tab. Board edits are held in the current document and reload resets them.

## Qualification and pending checkpoint

The focused suite passed **160 tests across 13 files**, including 18 read-adapter cases and two tests through the Core task/context handlers. It covers scope and owner refusal, full and empty pages, invalid cursors, concurrent project isolation, protected response fields, context freshness and partial sources. The existing checks cover owner auth and sessions, account login and consent, task retry/readback, approvals and dashboard readiness. Core and Web type checks and a local production build passed.

| Check | Result |
| --- | --- |
| Independent S2 code review | Found no actionable scope, response-contract or privacy issue in the adapters, synthetic transport and route guard. |
| S2 Chrome review | 20 desktop assertions passed for project selection, pagination, completeness and refusal. Ten assertions passed with Chrome emulating an iPhone 13, including a 320 CSS pixel layout and focus restoration on Cancel and Escape. |
| S1 desktop regression | 42 assertions passed again on the successor. These cover source selection, sample discussion, editing and organizing the draft, drag, keyboard, undo, per-project state and 200% text at phone width. |
| Route guards | Eight direct flag cases passed. Development with only the S1 flag returned 200 for the Workbench and 404 for Project reads, with the link absent. Development with both flags served S2 on loopback and returned 404 for a foreign Host. The final local production build returned 404 for all four checked review routes with both flags set. |
| Browser data boundary | The replay and S2 browser checks observed no application API, write-method or off-origin requests. Desktop storage stayed empty. |

Browser receipts and screenshots are in the sibling `workflow-validation/workbench-s2-review` folder. Phone results come from Chrome emulation. Physical Safari and assistive-technology acceptance remain unverified.

No commit, push, deployment, migration, credential change, live model call, or project mutation tool was used. This document is the local pending checkpoint. Hosted adapter acceptance and canonical task writes are separate work.
