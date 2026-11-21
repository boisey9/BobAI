# BobCore Workbench S0 and S1 · November 19, 2026

The local candidate adds a Workbench at `http://127.0.0.1:3449/review/workbench`. It demonstrates gathering sample sources, discussing a prepared comparison, and editing and arranging an unsaved draft. The body of the R1 implementation brief and the supplied concept informed the interaction and layout. Route access uses the existing guarded review boundary.

The full implementation brief was supplied as the attached handoff. The original `CODEX_START_HERE.md` was read via the source ChatGPT conversation before the implementation edit. The acceptance evidence below is based on the attached brief, verified repository source and the tests we ran.

## S0 source reconciliation

GitHub returned protected main at `b26d58f9c1b0f3c19a3c5101b6478d9c92b9ccab`, tree `93e3c46d8348f889f4ca12f51260778269ab6c36`. The candidate lives as uncommitted work on `codex/workbench-s0-s1` in a separate worktree from that source. The local PR #51 follow-up at `487b3df` contains release audit and index changes, with no Core/Web delta. The dirty backup branch and parallel worktrees were left intact.

The read-only BobCore preflight verified the expected project key and UUID, repository `boisey9/BobAI`, and trusted `codex` surface. All five sources were available and the context was partial, with truncated events and memories. Earlier task and handoff timestamps were treated as historical.

| Existing source | S0 disposition and regression coverage |
| --- | --- |
| [Review guard](../../Web/lib/ui-review-enabled.ts), [proxy](../../Web/proxy.ts), [existing synthetic dashboard](../../Web/app/review/page.tsx) | Reuse the guarded path and repeat the page-level check. Existing review dashboard and review task API continue on their original paths. |
| [Owner auth](../../Web/lib/owner-auth.ts), [session](../../Web/lib/session.ts) and [owner login](../../Web/app/api/session/route.ts) | Preserve owner session, passwords/passkeys, consent and server-held credential boundaries. New preview has no application authentication inputs. |
| [Task manager](../../Web/components/task-manager.tsx) and [task contract](../../Web/lib/task-contract.ts) | Preserve binding, version, operation ID and uncertain request recovery. Draft fields follow the existing limits. Source references and board placements stay separate from the canonical payload. |
| [Approvals](../../Web/app/api/approvals), [Connections](../../Web/components/connections-view.tsx) and [System state](../../Web/components/system-readiness.tsx) | Leave canonical controls and status logic alone. Board groups have presentation meaning only. |

## S1 review flow

1. On **Sample RFQ**, add **Delivery & Approvals** and **Review finding** to context. On desktop, drag a source handle into the tray to perform the same action.
2. Run **What evidence is still missing?** using **Run sample comparison**. Open each citation to inspect its version and location. The response keeps the two cited versions even if the selected tray changes later.
3. Select **Create task draft** or drag the sample finding into **Review next**. Review the fixed sample destination, edit title, description, priority and optional date, then choose **Place draft on board**. The card remains visibly unsaved. Cancel discards editor changes and retains any previously placed draft.
4. Drag the draft to another group or open **Move** and select a destination. Use **Move up** or **Move down** within a lane and **Undo move** to restore the previous layout. Native buttons and the disclosure work with keyboard or a single tap. On phones, use the **Sources**, **Board** and **Bob** buttons.
5. Switch to the Operations sample. Source selection, comparison, unsent question, draft, placements and undo belong to the originating sample. Switching back restores that workspace in the current document. Reload resets the review. `?stress=1` loads 100 fictional source placements per sample project.

The comparison is available for the prepared question and supported pair. Other selections receive an explicit message. The preview holds state in component memory and has no application API adapter, project credentials, live source fetching, model generation or task persistence.

## Run locally

Use the installed locked dependencies for the candidate worktree. Run the following from its `Web/` directory. The clean process environment enables only the local development review.

```sh
env -i PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  TMPDIR=/private/tmp NEXT_TELEMETRY_DISABLED=1 BOB_UI_REVIEW_ENABLED=true \
  node ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3449
```

The preview uses the existing Next.js and React dependencies. Desktop uses native browser dragging with an app-local payload and an active-project check. Touch uses the same actions via the visible controls. The board holds only fixture identifiers and a single editable draft per sample project.

## Validation boundary

| Check | Result |
| --- | --- |
| Existing behavior | 140 focused Core tests across 11 files and eight existing Daily Workspace cases in Chrome passed. These cover owner auth, approvals, readiness, task binding and identical retry. |
| New desktop browser checks | 42 assertions passed in installed Chrome. These cover native source/finding/card dragging, keyboard-only completion, undo, focus return, drag cancellation and cross-project and external drop refusal. |
| New phone browser checks | Five assertions passed with Chrome emulating iPhone 13. Touch input completed the gather, discuss, edit, move and undo flow. |
| Layout | No horizontal overflow at 320, 390, 768, 1024 or 1440 CSS pixels in the tested view. The three phone panels also fit at 390 CSS pixels with 200% text. Reduced motion disables smooth review scrolling. |
| Stress fixture | 100 placements rendered, loaded-source search narrowed the result, the seventh selected source was refused, and the Move control preserved the 100-card inventory. A stress-size native drag was inconsistent across runs. Desktop native drag was verified separately at normal fixture size. |
| Data boundaries | Browser instrumentation observed zero application API, off-origin or write-method requests. Local and session storage stayed empty in the desktop trace. |
| Build and route guards | Web TypeScript and production webpack build passed. Seven guard cases passed. Production mode with the flag enabled returned 404 for the review pages and review task API. The unauthenticated dashboard retained a streamed login redirect. The opted-in development route returned 200 on loopback and 404 with a foreign Host. |

The first Chrome regression launch exited before its tests because the restricted sandbox could not launch Chrome. The managed retry passed. During the final webpack run, the cache reported a disk-space warning. Compilation, TypeScript, build output and the production-mode smoke checks completed successfully.

The browser scripts, receipts and captures are in the sibling `workflow-validation/workbench-s0-s1-review` evidence folder. This qualification uses emulated touch and enlarged text. It does not establish physical iPhone Safari, browser chrome zoom, screen-reader or complete WCAG acceptance. Connected inference, durable layout, real approval or task acceptance, and performance timing remain outside the slice.

BobCore synchronization remains local pending because this review is limited to synthetic work. There was no commit, push, deployment, migration, credential change or project record write.
