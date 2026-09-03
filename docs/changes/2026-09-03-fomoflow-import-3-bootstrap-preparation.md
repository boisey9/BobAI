# FOMOflow Bob Import #3 Bootstrap Preparation — 2026-09-03

## Objective

Prepare the Bob Core bootstrap bundle for FOMOflow after the canonical `boisey9/FomoFlow` repository completed its initial Import #3 reconciliation contract.

This change imports no production state by itself. It adds a committed, reviewable, dry-run-validatable bundle that can later be executed through the existing idempotent Bob Core importer.

## Canonical source state

FOMOflow canonical repository:

```text
repository: boisey9/FomoFlow
project key: fomoflow
import sequence: 3
canonical reconciliation merge: ec0067a90ddfd5c2bfd4909b7ef1a9fd7473b71a
import state: reconciling
```

The canonical repository now contains:

- `.bob/project.yml`;
- root `AGENTS.md` Bob Core bridge;
- `docs/changes/2026-09-03-bob-core-import-3-reconciliation.md`.

The repository contract explicitly keeps current `main` above stale audit/session material for implementation truth and preserves a separate trading-execution safety boundary.

## Curated bundle

Added:

```text
Core/imports/fomoflow-bootstrap-v1.json
```

Operation ID:

```text
fomoflow-bootstrap-memory-v1-2026-09-03
```

The bundle declares six canonical repository sources and ten approved project memories.

### Approved memories

1. canonical repository and source-precedence rule;
2. active authenticated V2 application and four current surfaces;
3. current React/Vite + Supabase + Twelve Data + Vercel runtime architecture;
4. action-first decision vocabulary v2 with legacy audit retention;
5. authoritative fail-closed decision/snapshot safety behavior;
6. risk/reward policy and the fact that RR does not bypass the other quality gates;
7. authoritative scheduled background alert ownership and user-scoped state;
8. current-vs-historical security reconciliation;
9. branch reconciliation and the retired V1 branch rule;
10. explicit AI trading-execution boundary.

## Deliberate exclusions

The bundle does not contain:

- raw ChatGPT transcripts or session exports;
- private reasoning;
- Supabase service-role keys, JWTs, database URLs, Twelve Data keys, Telegram tokens, Vercel credentials, or any other secret;
- live customer/user market records;
- historical tasks or decisions copied from old conversations;
- broker credentials or trade-execution capabilities;
- an instruction that `EXECUTE LONG` or `EXECUTE SHORT` authorizes an AI interface to place a trade.

No active decision or task is created by the bootstrap bundle. Those remain normal Bob Core workflow objects.

## Import validation

`Core/package.json` now includes:

```text
check:import:fomoflow
```

and the aggregate `check:import` validates BobAI, RFQ, and FOMOflow bootstrap fixtures.

The normal Core `check` therefore continues to require typecheck, tests, and every committed bootstrap-bundle dry run.

## Remaining acceptance gates

FOMOflow remains `reconciling` until all of the following pass:

1. this BobAI bootstrap PR passes Bob Core CI and Vercel preview checks and is merged;
2. `fomoflow-bootstrap-v1.json` passes local dry-run validation;
3. the bundle is imported live through the standard idempotent importer;
4. Bob Core contains exactly the expected approved memories and one matching `project.imported` event;
5. FOMOflow appears as an owner-selectable project in the Control Center;
6. a dedicated `codex-fomoflow` credential is provisioned without reusing BobAI or RFQ credentials;
7. Codex retrieves FOMOflow context and writes one safe synchronized task/event;
8. the FOMOflow credential is proven unable to read BobAI or RFQ state;
9. only then are Bob Core/project manifests changed from `reconciling` to `imported`.

## Next action after merge

Run the same standardized importer path proven by RFQ:

```bash
cd Core
npm run import:bootstrap -- --file imports/fomoflow-bootstrap-v1.json --dry-run
npm run import:bootstrap -- --file imports/fomoflow-bootstrap-v1.json
```

The live command requires the trusted local `DATABASE_URL` and owner ID environment; neither value belongs in chat, Git, the bundle, or an activity record.
