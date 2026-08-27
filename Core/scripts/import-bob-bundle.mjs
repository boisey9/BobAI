import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { neon } from "@neondatabase/serverless";

const PROJECT_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const ALLOWED_PROJECT_STATUSES = new Set(["active", "archived"]);
const ALLOWED_MEMORY_SCOPES = new Set(["personal", "project", "preference", "fact"]);
const ALLOWED_SENSITIVITIES = new Set(["normal", "sensitive"]);
const ALLOWED_CONFIDENCE = new Set(["confirmed", "inferred"]);
const MAX_MEMORIES = 200;

function fail(message) {
  throw new Error(`Invalid Bob import bundle: ${message}`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value, name) {
  if (!isRecord(value)) {
    fail(`${name} must be an object.`);
  }
  return value;
}

function requireString(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${name} must be a non-empty string.`);
  }

  const normalized = value.trim();
  if (maxLength && normalized.length > maxLength) {
    fail(`${name} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function optionalString(value, name, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  return requireString(value, name, maxLength);
}

function parseArgs(argv) {
  const args = { file: null, dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--file") {
      args.file = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (!arg.startsWith("-") && args.file === null) {
      args.file = arg;
      continue;
    }
    fail(`unknown argument '${arg}'.`);
  }

  if (!args.file) {
    fail("provide a bundle path with --file <path>.");
  }
  return args;
}

function normalizeBundle(raw) {
  const bundle = requireRecord(raw, "bundle");
  if (bundle.version !== 1) {
    fail("version must be 1.");
  }

  const operationId = requireString(bundle.operationId, "operationId", 200);
  const project = requireRecord(bundle.project, "project");
  const projectKey = requireString(project.projectKey, "project.projectKey", 100).toLowerCase();
  if (!PROJECT_KEY_RE.test(projectKey)) {
    fail("project.projectKey contains unsupported characters.");
  }

  const status = project.status ?? "active";
  if (!ALLOWED_PROJECT_STATUSES.has(status)) {
    fail("project.status must be active or archived.");
  }

  const projectMetadata = project.metadata === undefined
    ? {}
    : requireRecord(project.metadata, "project.metadata");
  if (Object.hasOwn(projectMetadata, "auth")) {
    fail("project.metadata.auth is reserved and cannot be changed by an import bundle.");
  }

  const sourcesRaw = bundle.sources ?? [];
  if (!Array.isArray(sourcesRaw)) {
    fail("sources must be an array.");
  }

  const sourceKeys = new Set();
  const sources = sourcesRaw.map((sourceRaw, index) => {
    const source = requireRecord(sourceRaw, `sources[${index}]`);
    const key = requireString(source.key, `sources[${index}].key`, 300);
    if (sourceKeys.has(key)) {
      fail(`source key '${key}' is duplicated.`);
    }
    sourceKeys.add(key);
    return {
      key,
      type: requireString(source.type, `sources[${index}].type`, 100),
      title: requireString(source.title, `sources[${index}].title`, 300),
      locator: optionalString(source.locator, `sources[${index}].locator`, 1000),
      reference: optionalString(source.reference, `sources[${index}].reference`, 2000),
      metadata: source.metadata === undefined
        ? {}
        : requireRecord(source.metadata, `sources[${index}].metadata`),
    };
  });

  const memoriesRaw = bundle.memories ?? [];
  if (!Array.isArray(memoriesRaw)) {
    fail("memories must be an array.");
  }
  if (memoriesRaw.length > MAX_MEMORIES) {
    fail(`memories may contain at most ${MAX_MEMORIES} items per bundle.`);
  }

  const memories = memoriesRaw.map((memoryRaw, index) => {
    const memory = requireRecord(memoryRaw, `memories[${index}]`);
    if (memory.approved !== true) {
      fail(`memories[${index}] must set approved=true before import.`);
    }

    const scope = requireString(memory.scope, `memories[${index}].scope`, 50);
    if (!ALLOWED_MEMORY_SCOPES.has(scope)) {
      fail(`memories[${index}].scope is unsupported.`);
    }

    const sensitivity = memory.sensitivity ?? "normal";
    if (!ALLOWED_SENSITIVITIES.has(sensitivity)) {
      fail(`memories[${index}].sensitivity is unsupported.`);
    }

    const confidence = memory.confidence ?? "confirmed";
    if (!ALLOWED_CONFIDENCE.has(confidence)) {
      fail(`memories[${index}].confidence is unsupported.`);
    }

    const sourceKey = requireString(memory.sourceKey, `memories[${index}].sourceKey`, 300);
    if (!sourceKeys.has(sourceKey)) {
      fail(`memories[${index}].sourceKey '${sourceKey}' is not declared in sources.`);
    }

    return {
      scope,
      subject: optionalString(memory.subject, `memories[${index}].subject`, 200),
      content: requireString(memory.content, `memories[${index}].content`, 2000),
      sensitivity,
      confidence,
      sourceKey,
      metadata: memory.metadata === undefined
        ? {}
        : requireRecord(memory.metadata, `memories[${index}].metadata`),
    };
  });

  return {
    version: 1,
    operationId,
    project: {
      projectKey,
      name: requireString(project.name, "project.name", 200),
      description: optionalString(project.description, "project.description", 4000),
      repository: optionalString(project.repository, "project.repository", 500),
      status,
      metadata: projectMetadata,
    },
    sources,
    memories,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceFor(bundle, key) {
  return bundle.sources.find((source) => source.key === key);
}

function importSummary(bundle, bundleHash) {
  return {
    version: bundle.version,
    operationId: bundle.operationId,
    projectKey: bundle.project.projectKey,
    sources: bundle.sources.length,
    approvedMemories: bundle.memories.length,
    bundleHash,
  };
}

const args = parseArgs(process.argv.slice(2));
const filePath = resolve(process.cwd(), args.file);
const fileText = await readFile(filePath, "utf8");
const bundle = normalizeBundle(JSON.parse(fileText));
const bundleHash = sha256(fileText);

if (args.dryRun) {
  console.log(JSON.stringify({ dryRun: true, ...importSummary(bundle, bundleHash) }, null, 2));
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL?.trim();
const ownerId = process.env.BOB_OWNER_ID?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for a live Bob import.");
}
if (!ownerId) {
  throw new Error("BOB_OWNER_ID is required for a live Bob import.");
}

const sql = neon(connectionString);

const projectRows = await sql`
  SELECT id, project_key
  FROM public.bob_projects
  WHERE owner_id = ${ownerId}
    AND lower(project_key) = lower(${bundle.project.projectKey})
    AND deleted_at IS NULL
  LIMIT 1
`;

if (projectRows[0]) {
  const priorImports = await sql`
    SELECT id, created_at
    FROM public.bob_events
    WHERE owner_id = ${ownerId}
      AND project_id = ${projectRows[0].id}
      AND event_type = 'project.imported'
      AND details ->> 'operationId' = ${bundle.operationId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (priorImports[0]) {
    console.log(JSON.stringify({
      idempotent: true,
      eventId: priorImports[0].id,
      ...importSummary(bundle, bundleHash),
    }, null, 2));
    process.exit(0);
  }
}

const projectImportMetadata = {
  ...bundle.project.metadata,
  bootstrapImport: {
    operationId: bundle.operationId,
    bundleHash,
  },
};

let projectId;
if (projectRows[0]) {
  projectId = projectRows[0].id;
  await sql`
    UPDATE public.bob_projects
    SET metadata = metadata || ${JSON.stringify(projectImportMetadata)}::jsonb,
        updated_at = now()
    WHERE id = ${projectId}
      AND owner_id = ${ownerId}
  `;
} else {
  projectId = randomUUID();
  await sql`
    INSERT INTO public.bob_projects (
      id,
      owner_id,
      project_key,
      name,
      description,
      repository,
      status,
      metadata
    ) VALUES (
      ${projectId},
      ${ownerId},
      ${bundle.project.projectKey},
      ${bundle.project.name},
      ${bundle.project.description},
      ${bundle.project.repository},
      ${bundle.project.status},
      ${JSON.stringify(projectImportMetadata)}::jsonb
    )
  `;
}

let createdMemories = 0;
let updatedMemories = 0;

for (const memory of bundle.memories) {
  const source = sourceFor(bundle, memory.sourceKey);
  const provenance = {
    sourceKey: source.key,
    sourceType: source.type,
    sourceTitle: source.title,
    sourceLocator: source.locator,
    sourceReferenceHash: source.reference ? sha256(source.reference) : null,
    sourceMetadata: source.metadata,
    confidence: memory.confidence,
    approved: true,
  };
  const memoryMetadata = {
    ...memory.metadata,
    projectKey: bundle.project.projectKey,
    provenance,
    bootstrapImport: {
      operationId: bundle.operationId,
      bundleHash,
    },
  };

  const existingRows = await sql`
    SELECT id
    FROM public.bob_memory_items
    WHERE owner_id = ${ownerId}
      AND lower(content) = lower(${memory.content})
      AND coalesce(metadata ->> 'projectKey', '') = ${bundle.project.projectKey}
      AND deleted_at IS NULL
    LIMIT 1
  `;

  let memoryId;
  let memoryAction;
  if (existingRows[0]) {
    memoryId = existingRows[0].id;
    memoryAction = "updated";
    updatedMemories += 1;
    await sql`
      UPDATE public.bob_memory_items
      SET scope = ${memory.scope},
          subject = ${memory.subject},
          source = 'bootstrap_import',
          sensitivity = ${memory.sensitivity},
          metadata = metadata || ${JSON.stringify(memoryMetadata)}::jsonb,
          updated_at = now()
      WHERE id = ${memoryId}
        AND owner_id = ${ownerId}
    `;
  } else {
    memoryId = randomUUID();
    memoryAction = "created";
    createdMemories += 1;
    await sql`
      INSERT INTO public.bob_memory_items (
        id,
        owner_id,
        scope,
        subject,
        content,
        source,
        sensitivity,
        metadata
      ) VALUES (
        ${memoryId},
        ${ownerId},
        ${memory.scope},
        ${memory.subject},
        ${memory.content},
        'bootstrap_import',
        ${memory.sensitivity},
        ${JSON.stringify(memoryMetadata)}::jsonb
      )
    `;
  }

  await sql`
    INSERT INTO public.bob_memory_events (
      id,
      memory_id,
      owner_id,
      action,
      request_id,
      details
    ) VALUES (
      ${randomUUID()},
      ${memoryId},
      ${ownerId},
      ${memoryAction},
      ${bundle.operationId},
      ${JSON.stringify({
        importOperationId: bundle.operationId,
        sourceKey: source.key,
        bundleHash,
      })}::jsonb
    )
  `;
}

const importEventId = randomUUID();
await sql`
  INSERT INTO public.bob_events (
    id,
    owner_id,
    project_id,
    event_type,
    summary,
    source,
    details
  ) VALUES (
    ${importEventId},
    ${ownerId},
    ${projectId},
    'project.imported',
    ${`Imported ${bundle.memories.length} approved memories into ${bundle.project.name}.`},
    'bootstrap-import-v1',
    ${JSON.stringify({
      operationId: bundle.operationId,
      bundleHash,
      sourceKeys: bundle.sources.map((source) => source.key),
      createdMemories,
      updatedMemories,
    })}::jsonb
  )
`;

console.log(JSON.stringify({
  idempotent: false,
  eventId: importEventId,
  createdMemories,
  updatedMemories,
  ...importSummary(bundle, bundleHash),
}, null, 2));
