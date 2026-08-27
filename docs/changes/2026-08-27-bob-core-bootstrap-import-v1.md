# Bob Core Bootstrap Import v1

Date: 2026-08-27

## Objective

Create the first controlled migration path for bringing existing projects and approved durable memory into Bob Core, beginning with BobAI itself.

The importer must preserve the Bob authority model: raw chat history is source material, not automatically approved memory; existing Bob Core decisions/tasks remain authoritative; imports must be reviewable, idempotent, auditable, and free of credentials.

## Current state verified before implementation

Production Bob Core v0.2 already contains the shared-context schema and BobAI project state:

- 1 registered project (`bobai`);
- 9 structured decisions;
- 12 structured tasks;
- 88 project/activity events at inspection time;
- 0 active approved memory items.

The repository already contains the Bob Project Standard, `.bob/project.yml`, shared-context services, MCP surfaces, migrations, tests, and Control Center. A new shared-context schema or parallel memory system is not required for the first bootstrap.

## Design

Bootstrap Import v1 uses the existing Bob Core v0.2 tables.

A JSON bundle contains one project, provenance descriptors, and only explicitly approved memory items. The importer:

1. validates the bundle and project key;
2. requires `approved: true` for every memory;
3. limits a bundle to 200 memories;
4. resolves or creates the project;
5. checks a stable `operationId` for idempotency;
6. merges import metadata without replacing unrelated project metadata;
7. creates or updates project-scoped approved memories;
8. records the normal memory audit events;
9. records one `project.imported` activity event with counts and a SHA-256 bundle hash.

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
- Existing project metadata is merged instead of replaced so authentication/interface metadata is preserved.
- Memory remains factual context, not executable instructions.
- Import activity contains safe counts/source keys/hashes rather than raw source content.

## Files changed

- `Core/scripts/import-bob-bundle.mjs` — deterministic bundle validator/importer.
- `Core/imports/bobai-bootstrap-v1.json` — first curated BobAI memory bundle.
- `Core/imports/README.md` — import/export workflow and security rules.
- `Core/package.json` — dry-run validation and live import commands.
- `.gitignore` — private/local import bundle protection.
- `implementation.md` — current state and next-step index.

## Validation plan

Build gate:

- existing Bob Core TypeScript typecheck;
- existing complete Vitest suite;
- new `npm run check:import` dry-run validation of the committed BobAI bundle.

Runtime/data gate after merge:

- run the BobAI bundle once against the authorized production Neon database;
- verify seven active project-scoped memories exist;
- verify every imported memory has provenance/import metadata;
- verify one `project.imported` event for operation `bobai-bootstrap-memory-v1-2026-08-27`;
- retry the same operation and confirm idempotent behavior/no duplicates.

Functional gate:

- retrieve BobAI shared context from Bob Core after import and confirm the approved memories are returned alongside existing structured project state.

## Rollback

The importer does not modify schema. If the BobAI bootstrap data must be rolled back, soft-delete only memories tagged with the import operation ID and record the corresponding memory audit events. The project, existing decisions, tasks, credentials, and unrelated activity remain untouched.

## Follow-up

After BobAI acceptance:

1. add an owner-facing candidate-review flow for ChatGPT exports;
2. generate one private bundle per additional real project;
3. register a second project to exercise real multi-project isolation;
4. consider a first-class `bob_context_sources` registry only when source inventory/search requirements justify the schema expansion;
5. connect ChatGPT with a dedicated structured Bob Core credential so future approved memory can flow continuously instead of through bootstrap migration.
