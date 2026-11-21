# BobCore Workbench S4 layout persistence · November 20, 2026

S4 adds local, default-off persistence for source-card placement and order. The original local candidate was prepared on `codex/workbench-s4` over `b26d58f9c1b0f3c19a3c5101b6478d9c92b9ccab`. The frozen S3 candidate matched all 25 source hashes and the full patch hash. Its retained evidence records 184 focused tests, 24 desktop assertions and five phone-emulation assertions. See the [S3 record](2026-11-19-workbench-s3-task-creation.md).

The read-only BobCore preflight verified the expected project key and UUID, repository `boisey9/BobAI`, and trusted `codex` surface. It returned partial context with truncated events and memories.

## Behavior

- Arrange source cards with the board’s existing moves and undo. **Save layout** explicitly saves their three ordered lanes. **Restore default layout** prepares an undoable board change. Saving that change creates another revision. **Load saved layout** reads the current saved version. It preserves the draft and never supersedes a move made after the read starts.
- The first visit to each sample checks for a saved layout. Bases and results are kept separately per sample. An old save or read response can affect only the originating project. A layout conflict leaves the local arrangement on screen. After loading the other tab’s saved arrangement, the owner can make and save a new change.
- A lost response retains the exact operation, version and placements in page memory. **Retry same save** replays that operation. Once the API acknowledges it, retry uses a separate GET only. The board reports a saved version after checking the current layout by GET. If a newer version superseded that receipt, the board reports a conflict.
- Draft placement and contents, selected context, source text, chat, approval state, task receipts, and undo history stay outside the saved layout. The source catalog must match the request and record. The API refuses missing, duplicate, extra and unknown references.

## Synthetic storage contract

- The dedicated loopback route `/api/review/workbench/layout` requires explicit S1–S4 review flags and an explicit private storage directory. It validates the loopback host, expected request header, same-origin POST, catalog selector and server-issued anonymous preview profile. The 24-hour cookie is HttpOnly, same-site and scoped to the layout API. It is independent of the S3 task binding and the live owner session.
- The scope binds the preview profile and host to a sample project key, project UUID, and standard or stress catalog. Within that scope, each accepted request must match the expected revision. The API publishes a complete private file without overwriting an existing revision. Identical replay recovers the original revision even when a newer one exists. Conflicting reuse of an operation ID and stale expected versions are refused.
- The server uses a private local directory outside the candidate checkout. It holds server metadata and synthetic source references only. The preview has a fixed 24-hour profile lifetime, 32 profile slots, and 40 revisions per project and catalog per profile. Expired profiles cannot accept saves or replay. Physical cleanup occurs when allocating a slot under capacity pressure. The store retains live receipts for the profile’s lifetime and returns an error at capacity. Browser storage carries neither layout content nor pending operations.
- This contract qualifies one local preview. Hosted storage, authenticated owner scope, cross-device use, and production retention need separate review. The local filesystem is controlled by the operating-system user running the preview.

## Local preview

Run from the S4 worktree’s `Web/` directory with dependencies installed. Choose a dedicated empty directory outside the checkout and resolve its absolute path. Keep the same directory and loopback host/port across preview restarts.

```sh
mkdir -m 700 -p ../../workbench-s4-review/layout-state
review_store="$(cd ../../workbench-s4-review/layout-state && pwd -P)"
env -i PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  TMPDIR=/private/tmp NEXT_TELEMETRY_DISABLED=1 BOB_UI_REVIEW_ENABLED=true \
  BOB_WORKBENCH_READ_REVIEW_ENABLED=true BOB_WORKBENCH_TASK_REVIEW_ENABLED=true \
  BOB_WORKBENCH_LAYOUT_REVIEW_ENABLED=true BOB_WORKBENCH_LAYOUT_REVIEW_DIRECTORY="$review_store" \
  node ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3457
```

Open the [Workbench preview](http://127.0.0.1:3457/review/workbench) and look for **Source layout** below the board.

## Qualification and pending checkpoint

| Check | Result |
| --- | --- |
| Focused tests | 227 passed across 18 files, including 43 S4 cases. These cover placement validation, concurrent requests, replay after newer saves, expiry, known staging-alias recovery, corruption, capacity, and scoped refusals. |
| Desktop Chrome | 25 assertions passed. Two tabs in the same profile produced a real save conflict while preserving the losing tab’s arrangement. A dropped accepted save replayed the identical request. After an injected read failure, recovery used GET alone. Draft exclusion, default restore, undo, and isolation were verified. |
| Phone emulation | Six Chrome assertions passed at 390 CSS pixels, covering tap moves, save, reload and focus. Requests stayed on loopback. |
| Actual preview restart | Five additional Chrome assertions verified the original profile’s exact three lanes, project UUID and version 6 after restart. An independent HTTP check also recovered the original revision 1 receipt without creating revision 2. Other project and catalog scopes stayed empty in that HTTP check. |
| Route guards | S3-only development returned 200 for the review pages and 404 for layout GET and POST. The local production build returned 404 for all four tested paths with opt-in flags set. Core and Web type checks and the optimized build passed. |

The initial HTTP probe exposed Next’s request-URL hostname normalization. The handler now uses the validated Host header for loopback identity and the exact POST Origin check. The source path and HTTP scheme remain checked against the request URL.

The tests cover concurrent requests in one process and controlled local filesystem interruption states. Separate-process stress, power-loss behavior and physical iPhone Safari remain unverified. A process interruption during profile allocation can leave a lock that fails closed for new allocations. An unpublished staging file can remain on disk. Those cases require reviewed local maintenance. The recognized staging alias of a published revision is readable and can replay its receipt.

## Draft PR preparation

The public-source review replaced organization and provider references with fictional labels and removed live context identifiers from these change records. Fixture keys, layout contracts, and storage scope retain their local behavior. The source diff excludes browser artifacts, preview storage, dependency links, and the original handoff. Both Vercel project configurations disable automatic deployments for `codex/workbench-s4` and retain the existing `main` hold. Draft PR review and merge approval are separate from hosted acceptance.
