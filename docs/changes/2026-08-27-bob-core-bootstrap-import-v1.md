# Bob Core Bootstrap Import v1

Date: 2026-08-27

## Objective

Create the first controlled migration path for bringing existing projects and approved durable memory into Bob Core, beginning with BobAI itself.

The importer preserves the Bob authority model: raw chat history is source material, not automatically approved memory; existing Bob Core decisions/tasks remain authoritative; imports are reviewable, idempotent, auditable, and free of credentials.

## Current state verified before implementation

Production Bob Core v0.2 already contained the shared-context schema and BobAI project state:

- 1 registered project (`bobai`);
- 9 structured decisions;
- 12 structured tasks;
- 88 project/activity events at inspection time;
- 0 active approved memory items.

The repository already contained the Bob Project Standard, `.bob/project.yml`, shared-context services, MCP surfaces, migrations, tests, and Control Center. A new shared-context schema or parallel memory system was therefore not required for the first bootstrap.

## Design

Bootstrap Import v1 uses the existing Bob Core v0.2 tables.

A JSON bundle contains one project, provenance descriptors, and only explicitly approved memory items. The importer:

1. validates the bundle and project key;
2. requires `approved: true` for every memory;
3. limits a bundle to 200 memories;
4. resolves or creates the project;
5. checks a stable `operationId` for idempotency and binds it to the exact bundle hash;
6. rejects attempts to write reserved authentication metadata;
7. preserves an existing project's identity/status fields and merges only import metadata;
8. creates or updates project-scoped approved memories;
9. records the normal memory audit events;
10. records one `project.imported` activity event with counts and a SHA-256 bundle hash.

Provenance is stored in memory metadata in v1 (`sourceKey`, source type/title/locator, reference hash, confidence, operation ID, bundle hash). This avoids a schema migration for the first acceptance test. A first-class source catalog can be added later if Bob needs to retain/search external source inventories independently of imported memory.

## BobAI bootstrap bundle

`Core/imports/bobai-bootstrap-v1.json` is the first acceptance fixture. It contains seven durable, explicitly approved BobAI memories curated from:

- repository `AGENTS.md`;
- `.bob/project.yml`;
- `implementation.md`;
- the Bob Core Across Apps project context;
- the BobAI App Icon Ideas project context.

The bundle does not contain raw transcripts, credentials, personal secrets, or transient task state.

## Security boundaries

- No raw ChatGPT export or full conversation transcript is written into Bob memory.
- No raw export is committed to Git.
- `Core/imports/private/` and `Core/imports/*.local.json` are ignored.
- `DATABASE_URL` and `BOB_OWNER_ID` come only from the execution environment.
- The importer does not activate historical decisions or create tasks from old chats.
- Import bundles cannot change reserved project authentication metadata.
- Existing project name/description/repository/status remain authoritative when importing into an already-registered project.
- Memory remains factual context, not executable instructions.
- Import activity contains safe counts/source keys/hashes rather than raw source content.

## Files changed

- `Core/scripts/import-bob-bundle.mjs` — deterministic bundle validator/importer.
- `Core/imports/bobai-bootstrap-v1.json` — first curated BobAI memory bundle.
- `Core/imports/README.md` — import/export workflow and security rules.
- `Core/package.json` — dry-run validation and live import commands.
- `.gitignore` — private/local import bundle protection.
- `implementation.md` — current state and next-step index.

## Validation and production acceptance

### Build gate — passed

The final implementation passed:

- Bob Core TypeScript typecheck;
- the complete Bob Core Vitest suite;
- `npm run check:import` dry-run validation of the committed BobAI bundle;
- Bob Core Vercel preview;
- Bob Control Center Vercel preview.

### Runtime/data gate — passed

The reviewed BobAI bundle was applied to the authorized production Neon database as one atomic transaction using operation `bobai-bootstrap-memory-v1-2026-08-27` and bundle hash `0055b11a1800f984b3116c077862ee3ad4646e8b9836f98f574796cfae211147`.

Post-write verification confirmed:

- exactly 7 active `bobai` project memories;
- all 7 memories are marked with approved provenance and the expected operation ID;
- exactly 7 corresponding memory audit events;
- exactly 1 `project.imported` activity event;
- the activity event reports 7 created memories and the exact reviewed bundle hash;
- existing BobAI project authentication metadata remains present;
- project identity/status/repository remained unchanged.

The stored import event now provides the idempotency anchor used by the CLI. Reusing the same operation ID with the same bundle hash is treated as a retry; changing the bundle while reusing the operation ID is rejected.

### Functional shared-context gate — pending authenticated retrieval

The data required by Shared Context is present and verified in the same production tables used by Bob Core. Final end-to-end acceptance is an authenticated `bob_get_context(projectKey="bobai")` retrieval that returns the imported memories alongside structured BobAI state.

That final call is intentionally not bypassed with a database credential or reconstructed bearer token. It will be completed through an authorized Bob interface credential.

## Rollback

The importer does not modify schema. If the BobAI bootstrap data must be rolled back, soft-delete only memories tagged with the import operation ID and record the corresponding memory audit events. The project, existing decisions, tasks, credentials, and unrelated activity remain untouched.

## Follow-up

After BobAI acceptance:

1. complete authenticated shared-context retrieval of the imported BobAI memories;
2. add an owner-facing candidate-review flow for ChatGPT exports;
3. generate one private bundle per additional real project;
4. register a second project to exercise real multi-project isolation;
5. consider a first-class `bob_context_sources` registry only when source inventory/search requirements justify the schema expansion;
6. connect ChatGPT with a dedicated structured Bob Core credential so future approved memory can flow continuously instead of through bootstrap migration.
