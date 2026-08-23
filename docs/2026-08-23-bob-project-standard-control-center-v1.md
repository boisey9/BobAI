# Bob Project Standard and Control Center v1

## Objective

Make BobAI the reference implementation for a reusable Bob project structure and add an owner-facing operational monitor that can eventually span every Bob-connected project and interface.

## Business outcome

The user should be able to describe what they want to Bob without repeatedly writing developer-role prompts or re-explaining project history. Bob Core supplies current state; the repository supplies implementation truth; developer agents execute within a standard workflow; BobAI provides a visible control surface for operational activity.

## Standards introduced

- `.bob/project.yml` — stable project identity and source-of-truth map.
- `docs/standards/bob-project-standard-v1.md` — repository and SaaS development operating model.
- `docs/standards/bob-interface-standard-v1.md` — reusable AI-interface integration contract.
- `docs/standards/bob-activity-standard-v1.md` — privacy-safe operational activity rules.
- `AGENTS.md` remains the concise executable developer-agent contract and points to the standards instead of accumulating project history.

## Activity Monitor v1

Bob Core already had `bob_events`, so this milestone adds no production schema migration. The existing event stream becomes the operational activity source.

### API

Authenticated endpoint:

```text
GET /v1/activity
GET /v1/activity?project=bobai&limit=50
```

The response provides recent activity with project labels, event type, summary, source, safe structured details, and timestamp.

### Safe automatic activity

Shared Context retrieval records a `context.retrieved` event with:

- interface surface;
- whether a task was supplied.

The task text itself is deliberately not stored.

Activity recording is best-effort observability and cannot cause a successful context retrieval to fail.

### BobAI Control Center

The BobAI home header gains a Control Center button. The first screen shows:

- Bob Core status;
- Memory status;
- Shared Context status;
- recent activity count;
- chronological activity across registered Bob projects;
- source/project labels and relative timestamps;
- pull-to-refresh and explicit refresh;
- safe disconnected/error/empty states.

## Privacy and security

The Activity Monitor must never become a chain-of-thought viewer. It records outcomes and operational actions only.

Excluded by design:

- private reasoning / chain-of-thought;
- raw prompts or conversation transcripts by default;
- task text when safe metadata is sufficient;
- bearer tokens, provider keys, database URLs, passwords, signing/private-key material;
- sensitive memory content.

The activity API is protected by the existing Bob Core bearer authentication.

## Deployment validation model

Bob Project Standard v1 separates release validation into:

1. Build — compile/deploy completed.
2. Runtime — deployed process/endpoints are healthy.
3. Functional — requested user workflow passes acceptance.

A Vercel observability/connector permission failure is reported separately from an application deployment failure.

## Current Vercel validation

At the start of this milestone, the latest Bob Core production deployment reported success through GitHub/Vercel. The connected Vercel runtime-diagnostics tooling returned HTTP 403 for Bob Core project diagnostics, which is an observability permission limitation and not by itself a failed application deployment.

## Next evolution

- project selector and project health cards;
- task/decision state-change activity;
- audited MCP write tools;
- GitHub/Vercel/deployment event ingestion;
- failed/blocked work alerts;
- per-client credentials and authorization audit;
- compact multi-project dashboard in BobAI/Mac.
