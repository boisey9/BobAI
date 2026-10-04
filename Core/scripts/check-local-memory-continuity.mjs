import {configure,target} from "./local-memory-transport.mjs";
const transport=configure();
import { observeDatabaseErrors } from "./lib/database-errors.mjs";
// Run only against an isolated Neon branch. Never consumes production DATABASE_URL.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

const connectionString=target;
const owner = `continuity-test-${crypto.randomUUID()}`;
const projectId = crypto.randomUUID();
const pool = observeDatabaseErrors(new Pool({ connectionString, max: 1 }));
try {
  for(const name of ["001_memory_v0_1.sql","002_shared_context_v0_2.sql"]){await pool.query(await readFile(new URL("../migrations/"+name,import.meta.url),"utf8"));}
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
  const killed = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("./local-memory-crash-fixture.mjs", import.meta.url)),
    ],
    {
      env: { ...process.env, BOB_TEST_OWNER: owner },
      timeout: 30_000,
      encoding: "utf8",
    },
  );
  assert.equal(killed.error, undefined);
  assert.equal(killed.signal, "SIGKILL");
  const recovered = await restarted.createSyncedTask({
    projectKey: "test-project",
    operationId: "killed-after-commit",
    title: "Persist despite a lost response",
    actor: { interfaceId: "replacement-client", surface: "codex" },
  });
  assert.equal(recovered.idempotent, true);
  const crashEvidence = await pool.query(
    "SELECT (SELECT count(*)::int FROM bob_tasks WHERE owner_id = $1 AND title = 'Persist despite a lost response') AS tasks, (SELECT count(*)::int FROM bob_events WHERE owner_id = $1 AND details->>'operationId' = 'killed-after-commit') AS events, (SELECT count(*)::int FROM bob_operation_receipts WHERE owner_id = $1 AND operation_id = 'killed-after-commit') AS receipts",
    [owner],
  );
  assert.deepEqual(crashEvidence.rows[0], { tasks: 1, events: 1, receipts: 1 });
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
  // Actual database reads; only explicitly identified fault cases are injected.
  const projectB=crypto.randomUUID(),personal=crypto.randomUUID();
  for(const [id,key] of [[projectB,"another-project"],[personal,"personal"]]) await pool.query("INSERT INTO bob_projects(id,owner_id,project_key,name) VALUES($1,$2,$3,$3)",[id,owner,key]);
  const b=await service.build({projectKey:"another-project"});assert.deepEqual(b.memories.map(m=>m.content),["Unrelated project fact"]);
  const personalContext=await service.build({projectKey:"personal"});assert.deepEqual(personalContext.memories.map(m=>m.content),["Private personal fact"]);
  await assert.rejects(service.build({projectKey:"missing-project"}));
  const foreignService=new SharedContextService(store,"another-owner",memories);await assert.rejects(foreignService.build({projectKey:"test-project"}));
  for(let n=0;n<22;n++)await pool.query("INSERT INTO bob_tasks(id,owner_id,project_id,title) VALUES($1,$2,$3,$4)",[crypto.randomUUID(),owner,projectId,"Bounded synthetic task "+n]);
  for(let n=0;n<8;n++)await memoryStore.create({ownerId:owner,content:"Bounded synthetic memory "+n,metadata:{projectKey:"test-project"},scope:"project",sensitivity:"normal",subject:null,source:"test"});
  const active=crypto.randomUUID(),stale=crypto.randomUUID();
  for(const [id,status,text] of [[stale,"superseded","Old proposal must not be active"],[active,"active","Approved new decision"]])await pool.query("INSERT INTO bob_decisions(id,owner_id,project_id,title,decision,status) VALUES($1,$2,$3,$4,$5,$6)",[id,owner,projectId,"Synthetic precedence",text,status]);
  const bounded=await service.build({projectKey:"test-project"});assert.equal(bounded.tasks.length,20);assert.equal(bounded.memories.length,6);assert.equal(bounded.sources.tasks.truncated,true);assert.equal(bounded.sources.memories.truncated,true);assert.equal(bounded.partial,true);assert.deepEqual(bounded.decisions.map(d=>d.id),[active]);assert.match(bounded.authority.rule,/obey active project decisions over stale context/);
  const proposal=await service.proposeDecision({projectKey:"test-project",operationId:"proposal-stays-inactive-01",title:"Proposed only",proposal:"Do not activate",actor});
  assert(!(await service.build({projectKey:"test-project"})).decisions.some(d=>d.title==="Proposed only"));
  const noMemory=new SharedContextService(store,owner);assert.equal((await noMemory.build({projectKey:"test-project"})).sources.memories.status,"unavailable");
  const originalList=store.listActiveDecisions.bind(store);store.listActiveDecisions=async()=>{throw Error("Explicit synthetic dependency failure");};
  const unavailable=await service.build({projectKey:"test-project"});assert.equal(unavailable.sources.decisions.status,"unavailable");assert.equal(unavailable.partial,true);assert.deepEqual(unavailable.decisions,[]);store.listActiveDecisions=originalList;
  await pool.query("UPDATE bob_memory_items SET deleted_at=now() WHERE owner_id=$1 AND content LIKE 'Bounded synthetic memory %'",[owner]);
  await pool.query("UPDATE bob_tasks SET status='cancelled' WHERE owner_id=$1 AND title LIKE 'Bounded synthetic task %'",[owner]);
  const persisted=await service.build({projectKey:"test-project"});
  console.log(
    JSON.stringify({
      passed: true,
      syntheticLocalOnly:true,
      persisted:{memoryIds:persisted.memories.map(m=>m.id),taskIds:persisted.tasks.map(t=>t.id),handoffId:persisted.handoffs[0].id,decisionIds:persisted.decisions.map(d=>d.id)},
      owner,
      checks: [
        "12 concurrent identical creates",
        "conflicting operation payload",
        "concurrent optimistic versions",
        "restart and original-response replay",
        "mutation/audit rollback",
        "SIGKILL after commit before response and authorized replacement-client replay",
        "owner/project/privacy/approval isolation",
        "baseline independent of phrasing",
        "stable context revision",
        "separate handoff",
        "two-project and Personal actual reads; missing/foreign project denial",
        "bounded tasks/memories with truncation disclosure",
        "active decisions only; proposals not activated; authority rule",
        "missing memory dependency and injected decision-source outage disclosure",
      ],
    }),
  );
} finally {
  await pool.end();
  await transport.end();
}
