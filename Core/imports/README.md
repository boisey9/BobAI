# Bob Core bootstrap imports

Bootstrap Import v1 is the controlled path for moving existing project knowledge into Bob Core without treating raw conversation history as authoritative memory.

## What a bundle imports

Each JSON bundle represents one Bob project and may contain:

- the stable project identity and repository mapping;
- provenance descriptors for the material used to curate the import;
- approved durable memory items.

Bootstrap Import v1 deliberately does **not** import active decisions or tasks from old transcripts. Existing Bob Core decisions/tasks remain authoritative. Historical material that appears to contain a decision should be reviewed through the normal owner decision flow instead of being silently activated by migration.

## What is not stored

Do not put the following in a committed import bundle:

- raw ChatGPT exports or full conversation transcripts;
- API keys, Bob Core tokens, database URLs, cookies, private keys, or signing material;
- sensitive personal data that is not required as approved Bob memory;
- private chain-of-thought or hidden reasoning;
- transient status that belongs in Bob Core tasks/events instead of memory.

Use `Core/imports/private/` or a `*.local.json` file for local export-derived working bundles. Both are ignored by Git.

## Bundle rules

- `version` must be `1`.
- `operationId` is a stable idempotency key. Reusing it means retrying the identical import.
- `project.projectKey` must match Bob Core's project-key format.
- every memory must set `approved: true` explicitly;
- every memory must point to a declared `sourceKey`;
- each memory receives `projectKey`, provenance, bundle hash, and operation ID metadata;
- one bundle is limited to 200 approved memories so imports remain reviewable.

The committed `bobai-bootstrap-v1.json` is the first acceptance fixture. It contains only durable BobAI architecture/workflow/visual-identity facts already supported by the repository or explicit BobAI project context.

## Validate without writing

From `Core/`:

```bash
npm run check:import
```

Or validate any bundle:

```bash
npm run import:bootstrap -- --file imports/private/my-project.local.json --dry-run
```

Dry-run validation does not require database credentials and makes no writes.

## Run a live import

The live importer requires `DATABASE_URL` and `BOB_OWNER_ID` in the execution environment. Never pass or commit either value in the bundle.

```bash
npm run import:bootstrap -- --file imports/private/my-project.local.json
```

The importer:

1. resolves or creates the Bob Core project;
2. checks whether the `operationId` has already completed;
3. merges only import metadata into the project, preserving unrelated metadata such as interface credentials;
4. creates or updates matching approved memories inside that project;
5. records memory audit events;
6. records one `project.imported` activity event with counts and the bundle hash.

If the operation already completed, it exits idempotently instead of importing duplicates.

## ChatGPT export workflow

A ChatGPT data export is an **input source**, not a Bob memory database. The safe workflow is:

1. keep the raw export outside Git and outside Bob memory;
2. group relevant conversations by project;
3. extract only durable candidate facts/preferences;
4. compare project-specific technical facts with the repository or other source of truth;
5. remove stale, contradictory, sensitive, or transient items;
6. mark only the reviewed items `approved: true` in a local bundle;
7. run dry-run validation;
8. perform the live import;
9. retrieve Bob Core shared context and confirm the memories appear under the expected project.

Later import versions can add an owner-facing review UI and source catalog. The v1 boundary is intentionally smaller: deterministic, auditable, idempotent project + approved-memory migration using the existing Bob Core v0.2 schema.
