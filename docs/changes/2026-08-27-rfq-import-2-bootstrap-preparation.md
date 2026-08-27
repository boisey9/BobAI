# RFQ Import #2 — Bootstrap Preparation

Date: 2026-08-27

## Objective

Prepare MicroBird RFQ as the second Bob project using the BobAI Import #1 contract while reconciling current Codex/repository work instead of treating historical conversation state as authoritative.

## Canonical identity

- Bob project key: `rfq`
- Name: `MicroBird RFQ`
- Import sequence: `2`
- Canonical repository: `boisey9/bird-quote-e2e`
- Current reconciliation baseline: canonical `main` at `2576af661728d0d59e40d35ed4bd5a0f63247f19`
- Import state during preparation: `reconciling`

`boisey9/Bird-Quote` is historical/supporting material only and is not the implementation authority for this import.

## Reconciliation evidence

The canonical repository establishes the current Azure-era architecture through `.agents/agents.md`, Arc42 documentation, ADRs, OpenSpec, code, migrations, tests, and current commits.

The root README still contains starter-era statements such as a four-step flow, mock-data direction, Supabase next steps, and the historical Bird-Quote repository. Those statements are deliberately excluded from approved Bob memory when they conflict with the current canonical sources.

Branch comparison identified two categories:

- work already represented in `main` by ancestry, including the pre-integration recovery, option/capacity restoration, RFQ workflow P2, and resolution/history UX lines;
- branch histories that require targeted review rather than automatic merging, especially `codex/recovery-azure-integrated-test-20260807` and the historical School Add-on branch.

The School Add-on behavior itself is already explicitly promoted on `main`; the remaining divergent history is not evidence that the feature is missing.

## Bootstrap bundle

Added `Core/imports/rfq-bootstrap-v1.json`.

The bundle contains eight approved project memories, all sourced from the canonical RFQ repository:

1. canonical repository authority;
2. current TypeScript/React/Vite/Express/Azure/PostgreSQL stack;
3. Azure deployment architecture;
4. application roles and authorization/scoping boundary;
5. five-step dealer wizard;
6. OpenSpec/ADR/agent governance;
7. central RFQ data domain;
8. reconciliation rule that current canonical implementation wins over stale project memory.

No raw ChatGPT transcript, credential, database URL, customer data, hidden reasoning, active decision, or active task is committed in the bundle.

## Next gates

RFQ remains `reconciling` until all Bob Project Import Contract gates pass. The next execution sequence is:

1. validate the bootstrap bundle with Bob Core import checks;
2. merge the RFQ repository manifest/reconciliation PR;
3. run the idempotent RFQ bootstrap import into Bob Core;
4. create Bob Core reconciliation tasks for branch review rather than importing branch status as durable memory;
5. provision a dedicated `codex-rfq` credential and local token; never reuse `codex-bobai`;
6. retrieve RFQ context from Codex without owner re-explanation;
7. prove the RFQ credential cannot read or mutate `bobai`;
8. only then mark RFQ as fully imported.

## Security

This preparation does not alter production Bob Core data, Azure RFQ data, RFQ application code, schemas, auth, permissions, or any raw credential. The committed bundle is deterministic, curated, and safe for dry-run validation.
