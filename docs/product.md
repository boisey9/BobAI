# Bob product contract

Approved direction: dependable project continuity and daily assistance, September 6, 2026. Implementation and acceptance state is in [the release gates](release-gates.md); this document defines the intended product, not a claim that every capability is live.

## Owner and interfaces

Bob initially serves one owner. iPhone is the primary voice and capture interface; Web is the planning, review, and approval interface; Codex performs engineering work. ChatGPT and GitHub Copilot connect independently through their supported authentication flows. Microsoft Copilot and company email remain IT/VARS dependent.

Personal Bob and a future company instance have separate ownership, deployments, credentials, databases, authentication, and billing. Losing company access must not affect personal Bob.

## Daily contract

| Need | Expected behavior |
| --- | --- |
| Know what matters | Today shows three suggested priorities, commitments, due/overdue tasks, waiting items, approvals, and meaningful project changes with source links and freshness. |
| Capture once | Typed or spoken capture enters the selected authorized workspace; unclassified capture enters Personal. “Saved” requires Core acknowledgement. |
| Capture offline | A protected device outbox survives app termination, retains operation IDs, and exposes pending/failed/retry states. |
| Follow through | Direct create/edit/complete/reschedule works without an AI provider. Explicit reminders remain versioned and independently observable. |
| Resume a project | Every interface receives the same active decisions, tasks, approved memory, recent events, and concise handoffs. Switching workspace clears the current conversation. |
| Review memory | Owner can review, edit, approve, supersede, export, and delete memories. A handoff or proposal cannot activate a decision. |

## Defaults and ownership

- Morning brief: 07:00 `America/Toronto`, configurable, using the local date as its logical identity across daylight-saving changes.
- Quiet hours: 21:00–07:00. A reminder explicitly requested for a particular time takes precedence.
- Automatic internal task/reminder management; explicit owner review for external writes.
- Full conversation storage remains off. Approved memory and concise handoffs provide continuity.
- Selected personal Apple calendars/reminder lists only: titles, dates, times, completion. No work sources, notes, attendees, locations, or unrelated fields.
- Apple owns imported records. Bob owns Bob-created tasks. Imports never silently create duplicate Bob tasks.
- Apple snapshots show the last successful synchronization and become stale after six hours. Missing or stale calendar data must not be called a free day.
- Permission revocation removes cached snapshots for that source. Foreground entry and explicit refresh are reliable sync opportunities; background execution is opportunistic.
- External Apple changes remain pending until the paired iPhone rechecks the source and EventKit confirms success.

## Notifications and cost

Notify for requested reminders, one morning brief, actionable blockers, and meaningful recovery/failure changes. Suppress unchanged monitoring results. Track scheduled, attempted, provider accepted, device acknowledged, and failed separately; provider acceptance does not prove display or reading.

The personal target is C$75/month, excluding existing ChatGPT/Codex subscriptions and Apple developer membership: C$35 hosting, C$10 database/backups, C$20 AI, C$10 scheduling/monitoring/buffer. These are allocations, not vendor prices. Alert at 50%, 80%, and 100%; reduce optional AI generation and monitoring first. Company costs are separate. Actual enforcement and alerts require the operational stage gate.

## Completion

Personal release acceptance requires two consecutive weeks of useful daily planning, reliable capture/reminders, and project resumption, plus successful isolation and recovery drills. Goals are 99.5% successful context/task operations, foreground cross-interface updates within five seconds, healthy-dependency reminder dispatch within two minutes, RPO at most 24 hours, and RTO at most two hours. These are targets until measured.
