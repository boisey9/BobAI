# BobCore Workbench S3 task creation · November 19, 2026

S3 adds an explicit task creation review to the sample Workbench board. It is local, synthetic and default-off. The original project/task/context read preview is documented in the [S2 review record](2026-11-19-workbench-s2-read-adapters.md).

## S2 review and authority

- The S3 worktree holds an uncommitted candidate on `codex/workbench-s3`, based on `b26d58f9c1b0f3c19a3c5101b6478d9c92b9ccab`. All 15 S2 file hashes and the S0–S2 patch hash matched the frozen manifest before implementation. The prior S2 receipts contain 20 desktop, 10 phone-emulation and 42 S1 replay assertions. Independent S2 review found no actionable issue for this scope.
- The read-only BobCore preflight verified the expected project key and UUID, repository `boisey9/BobAI`, and trusted `codex` surface. Events and memories were truncated.

## Confirmation, receipt and readback

1. Select two sources, run the sample comparison, edit the resulting draft and choose **Place draft on board**. Those actions remain local board operations.
2. Open **Review task creation**. Check the sample destination, title, priority, exact description and any due time. The description shows both versioned citations and their locators. It refuses text plus citations over 2,000 characters. An optional due date requires an explicit time, using the existing browser time zone and daylight-saving validation.
3. Choose **Create synthetic task**. The browser first verifies the sample key, UUID and run binding, then sends only the allowed task fields and an operation ID. The synthetic API scopes tasks and receipts by loopback host, run and project. It validates the same-origin request and bounded JSON, and commits one in-memory task per accepted operation.
4. If the create result is uncertain, **Retry same request** repeats the exact payload, operation ID and binding. A subsequent rejection preserves an earlier uncertainty. A changed payload under the same ID is a conflict. A valid create receipt yields a task UUID and initial version. The operation ID on screen identifies the retained browser request.
5. The UI sends a separate task-detail GET and checks its project UUID, binding, task UUID and current version before showing **Verified in local preview**. If that GET fails, **Retry readback** sends only a GET. A historical receipt can still identify the task when readback returns a newer version. If the run expires, a confirmed receipt remains visible with readback unavailable, while an unconfirmed create reports that recovery ended.

The preview accepts one confirmed creation per project draft per open Workbench document. Project switching keeps each sample's draft and outcome separate. The browser retains unresolved operations in memory while that document stays open. Fixture runs expire after 30 minutes or a dev-server restart. Synthetic task detail in the S3 receipt panel is the readback surface. The S2 Project reads view continues to show its own demonstration fixtures.

The synthetic API is available only when all three flags are explicitly enabled on the existing development-only, loopback review boundary. It has no hosted transport, credential configuration, SQL or model integration. The production `/api/tasks` path and owner recovery workflow use their existing code. Canonical route and credential-gateway coverage came from Core integration tests with isolated in-memory stores.

## Local preview

Run from the S3 worktree's `Web/` directory with locked dependencies installed.

```sh
env -i PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  TMPDIR=/private/tmp NEXT_TELEMETRY_DISABLED=1 BOB_UI_REVIEW_ENABLED=true \
  BOB_WORKBENCH_READ_REVIEW_ENABLED=true BOB_WORKBENCH_TASK_REVIEW_ENABLED=true \
  node ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3454
```

Open the [Workbench preview](http://127.0.0.1:3454/review/workbench). Its browser receipts and review patch are kept in the sibling `workflow-validation/workbench-s3-review` folder.

## Qualification and pending checkpoint

The actual Core task handlers were tested for initial receipt, exact replay, conflicting payload, detail readback after a newer version, and wrong-project refusal. Separate tests cover client envelope checks and the isolated review API's current binding, origin, body limits, capacity, concurrent replay and expiry. The independent frontend review found focus loss on submit/retry and futile retry controls after binding expiry. The candidate gives the status a stable focus target and ends retry controls after a confirmed expiry.

| Check | Result |
| --- | --- |
| Focused tests | 184 passed across 16 files. The 24 S3 cases cover the client, synthetic route, and actual Core routes with an in-memory store. |
| Desktop Chrome | 24 assertions passed. A deliberately dropped create response replayed one original receipt, an intervening refusal preserved uncertainty, and a failed detail read retried only GET. Both projects kept their own state. |
| Phone Chrome emulation | Five assertions passed at 390 CSS pixels, including tap confirmation, one create and one separate readback, and the expanded receipt. The first cold run exceeded the original 12-second request timeout while Next compiled the fixture endpoint. The final preview gives local requests 30 seconds. |
| Types and production build | Core and Web types passed. The optimized local build completed. Webpack reported a disk-cache warning during local compilation. |
| Route and data boundaries | S2-only development retained both Workbench review pages and returned 404 for S3 collection GET/POST and detail GET. Local production returned 404 for all five checked paths with all flags set. Browser traffic stayed on loopback and the fixture API, with no browser storage. |

Hosted task creation, authorized owner browser acceptance, and physical iPhone Safari remain unverified. This document is the local pending checkpoint. There was no commit, push, deployment, migration, credential change, live model call or real project mutation.
