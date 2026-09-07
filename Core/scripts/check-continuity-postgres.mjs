// Run only against an isolated Neon branch. Never consumes production DATABASE_URL.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";
import { NeonSharedContextStore } from "../src/context/neon-store.ts";
import {
  SharedContextService,
  SharedContextOperationConflictError,
  SharedContextTaskVersionError,
} from "../src/context/service.ts";
import { NeonMemoryStore } from "../src/memory/neon-store.ts";
import { MemoryService } from "../src/memory/service.ts";
import { fingerprint } from "../src/context/operations.ts";

const connectionString = process.env.BOB_TEST_DATABASE_URL;
assert(
  connectionString && process.env.BOB_TEST_BRANCH_ID,
  "Set BOB_TEST_DATABASE_URL and the explicitly isolated BOB_TEST_BRANCH_ID.",
);
assert(
  process.env.BOB_TEST_BRANCH_ID !== "br-rapid-hall-aykwycjn",
  "Production is forbidden for this drill.",
);
const owner = `continuity-test-${crypto.randomUUID()}`;
const projectId = crypto.randomUUID();
const pool = new Pool({ connectionString, max: 1 });
try {
  const migration = await readFile(
    new URL("../migrations/003_durable_continuity.sql", import.meta.url),
    "utf8",
  );
  await pool.query(migration);
  await pool.query(
    "INSERT INTO public.bob_projects(id, owner_id, project_key, name, status) VALUES ($1, $2, 'test-project', 'Continuity test', 'active')",
    [projectId, owner],
  );
  const store = new NeonSharedContextStore(connectionString);
  const memoryStore = new NeonMemoryStore(connectionString);
  const memories = new MemoryService(memoryStore, owner, 6);
  const service = new SharedContextService(store, owner, memories);
  const actor = { interfaceId: "continuity-test", surface: "codex" };
  const create = {
    projectKey: "test-project",
    operationId: "concurrent-create-0001",
    title: "One durable task",
    actor,
  };
  const concurrent = await Promise.all(
    Array.from({ length: 12 }, () => service.createSyncedTask(create)),
  );
  assert.equal(new Set(concurrent.map((result) => result.task.id)).size, 1);
  assert.equal(concurrent.filter((result) => !result.idempotent).length, 1);
  assert.equal((await store.listRecentEvents(owner, projectId, 100)).length, 1);
  await assert.rejects(
    service.createSyncedTask({ ...create, title: "Conflicting reuse" }),
    SharedContextOperationConflictError,
  );
  const original = concurrent[0].task;
  assert.equal(original.version, 1);
  const updates = await Promise.allSettled(
    ["done", "blocked"].map((status) =>
      service.updateSyncedTask({
        projectKey: "test-project",
        operationId: `concurrent-update-${status}`,
        taskId: original.id,
        expectedVersion: 1,
        status,
        actor,
      }),
    ),
  );
  assert.equal(
    updates.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert(
    updates.find((result) => result.status === "rejected").reason instanceof
      SharedContextTaskVersionError,
  );
  const restarted = new SharedContextService(
    new NeonSharedContextStore(connectionString),
    owner,
  );
  const retry = await restarted.createSyncedTask(create);
  assert.equal(
    retry.task.version,
    1,
    "Replay must return the original receipt, not the task's later state",
  );
  assert.equal(retry.task.status, "open");
  assert.equal(retry.idempotent, true);
  await assert.rejects(
    store.runOperation(
      {
        ownerId: owner,
        projectId,
        operationId: "crash-before-receipt",
        kind: "test",
        fingerprint: fingerprint("crash"),
      },
      async (transaction) => {
        await transaction.createTask({
          ownerId: owner,
          projectId,
          title: "Must roll back",
          description: null,
          priority: "normal",
          source: "test",
        });
        await transaction.recordEvent({
          ownerId: owner,
          projectId,
          eventType: "test",
          summary: "Must roll back",
          source: "test",
        });
        throw new Error("Simulated failure before receipt/commit");
      },
    ),
  );
  assert.equal(
    await store.findTaskByTitle(owner, projectId, "Must roll back"),
    null,
  );
  const rollback = await pool.query(
    "SELECT count(*)::integer AS count FROM public.bob_events WHERE owner_id = $1 AND event_type = 'test'",
    [owner],
  );
  assert.equal(rollback.rows[0].count, 0);
  for (const [content, metadata, scope, sensitivity] of [
    [
      "Baseline project architecture",
      { projectKey: "test-project" },
      "project",
      "normal",
    ],
    ["Private personal fact", {}, "personal", "normal"],
    [
      "Personal scope with project tag",
      { projectKey: "test-project" },
      "personal",
      "normal",
    ],
    [
      "Project sensitive fact",
      { projectKey: "test-project" },
      "project",
      "sensitive",
    ],
    [
      "Unapproved project fact",
      { projectKey: "test-project", approvalStatus: "pending" },
      "project",
      "normal",
    ],
    [
      "Unrelated project fact",
      { projectKey: "another-project" },
      "project",
      "normal",
    ],
  ])
    await memoryStore.create({
      ownerId: owner,
      content,
      metadata,
      scope,
      sensitivity,
      subject: null,
      source: "test",
    });
  const plain = await service.build({ projectKey: "test-project" });
  const long = await service.build({
    projectKey: "test-project",
    task: "An unrelated long task description about scheduling authentication morning commitments reminder synchronization and deployment",
  });
  assert.deepEqual(
    plain.memories.map((m) => m.content),
    ["Baseline project architecture"],
  );
  assert.deepEqual(long.memories, plain.memories);
  assert.equal(
    plain.revision,
    long.revision,
    "Retrieval activity and task wording must not alter an unchanged bounded context",
  );
  const handoff = await service.recordHandoff({
    projectKey: "test-project",
    operationId: "handoff-roundtrip-01",
    outcome: "Validated",
    unresolved: ["Pilot pending"],
    nextActions: ["Owner review"],
    actor,
  });
  assert.equal(
    (await service.build({ projectKey: "test-project" })).handoffs[0].id,
    handoff.handoff.id,
  );
  assert.equal(
    (
      await new MemoryService(memoryStore, "another-owner", 6).forWorkspace(
        "test-project",
      )
    ).length,
    0,
  );
  console.log(
    JSON.stringify({
      passed: true,
      branchId: process.env.BOB_TEST_BRANCH_ID,
      owner,
      checks: [
        "12 concurrent identical creates",
        "conflicting operation payload",
        "concurrent optimistic versions",
        "restart and original-response replay",
        "mutation/audit rollback",
        "owner/project/privacy/approval isolation",
        "baseline independent of phrasing",
        "stable context revision",
        "separate handoff",
      ],
    }),
  );
} finally {
  await pool.end();
}
