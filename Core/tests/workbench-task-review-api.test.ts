import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workbenchTaskReviewAPI } from "../../Web/lib/workbench/review-task-api.js";
import type { TaskDetail, TaskPage, TaskReceipt } from "../../Web/lib/types.js";

const host = "127.0.0.1:3107";
const origin = `http://${host}`;
const fixtureInput = {
  operationId: "sample-operation-1", title: "  Synthetic acceptance check  ",
  dueAt: "2026-11-20T10:00:00-05:00",
};

type Options = {
  method?: "GET" | "POST";
  run: string;
  project?: string;
  taskId?: string;
  binding?: string;
  headers?: Record<string, string>;
  body?: unknown;
  stream?: ReadableStream<Uint8Array>;
};

async function sample({ method = "GET", run, project = "project=demo-rfq", binding, taskId, headers, body, stream }: Options) {
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: {
      host, origin, "x-bob-workbench-run": run, ...(binding ? { "x-bob-task-binding": binding } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(method === "POST" ? { body: stream ?? JSON.stringify(body), duplex: "half" } : {}),
  };
  const path = "/api/review/workbench/tasks" + (taskId ? `/${taskId}` : "");
  const response = await workbenchTaskReviewAPI(new Request(`${origin}${path}?${project}`, init), taskId);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response;
}

async function open(run: string, key = "demo-rfq", binding?: string) {
  const response = await sample({ run, project: `project=${key}`, ...(binding ? { binding } : {}) });
  expect(response.status).toBe(200);
  return await response.json() as TaskPage;
}

describe("Workbench synthetic task review endpoint", () => {
  beforeEach(() => {
    for (const key of ["VERCEL", "VERCEL_ENV", "DATABASE_URL", "BOB_AUTH_DATABASE_URL", "BOB_CORE_DEVICE_TOKEN",
      "AI_API_KEY", "OPENAI_API_KEY", "ZAI_API_KEY", "BOB_AUTH_SECRET", "BOB_CONTROL_CENTER_SESSION_SECRET"])
      vi.stubEnv(key, undefined);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BOB_UI_REVIEW_ENABLED", "true");
    vi.stubEnv("BOB_WORKBENCH_READ_REVIEW_ENABLED", "true");
    vi.stubEnv("BOB_WORKBENCH_TASK_REVIEW_ENABLED", "true");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("refuses unopened runs, ambiguous scope, nonlocal hosts, wrong origin and disabled review", async () => {
    const run = randomUUID();
    const missing = await sample({ method: "POST", run, binding: "a".repeat(43), body: fixtureInput });
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({ error: { code: "task_binding_changed" } });
    expect((await sample({ run, project: "project=demo-rfq&project=demo-bobai" })).status).toBe(400);
    expect((await sample({ run, headers: { host: "public.invalid:3107" } })).status).toBe(404);
    const page = await open(run);
    const foreign = await sample({ method: "POST", run, binding: page.taskBinding, body: fixtureInput,
      headers: { origin: "http://localhost:3107" } });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({ error: { code: "invalid_origin" } });
    vi.stubEnv("BOB_WORKBENCH_TASK_REVIEW_ENABLED", "false");
    expect((await sample({ run })).status).toBe(404);
    vi.stubEnv("BOB_WORKBENCH_TASK_REVIEW_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect((await sample({ run })).status).toBe(404);
  });

  it("creates once across concurrent submissions and independently reads the scoped task", async () => {
    const run = randomUUID();
    const first = await open(run);
    const second = await open(run, "demo-bobai");
    expect(first.tasks).toEqual([]);
    expect((await open(run)).taskBinding).toBe(first.taskBinding);
    expect(second.taskBinding).not.toBe(first.taskBinding);
    const binding = first.taskBinding;
    const attempts = await Promise.all(Array.from({ length: 4 }, () =>
      sample({ method: "POST", run, binding, body: fixtureInput })));
    for (const attempt of attempts) expect(attempt.status).toBe(200);
    const receipts = await Promise.all(attempts.map(async response => await response.json() as TaskReceipt));
    expect(receipts.filter(receipt => !receipt.idempotent)).toHaveLength(1);
    expect(new Set(receipts.map(receipt => receipt.task.id)).size).toBe(1);
    const task = receipts[0]!.task;
    expect(task).toMatchObject({ title: "Synthetic acceptance check", dueAt: "2026-11-20T15:00:00.000Z",
      projectId: first.project.id, status: "open", version: 1, source: "sample", editable: false });

    expect((await sample({ run })).status).toBe(403);
    expect((await sample({ run, binding: "b".repeat(43) })).status).toBe(403);
    const boundPage = await open(run, "demo-rfq", binding);
    expect(boundPage.tasks.map(({ id }) => id)).toEqual([task.id]);
    const response = await sample({ run, binding, taskId: task.id });
    expect(response.status).toBe(200);
    const detail = await response.json() as TaskDetail;
    expect(detail).toMatchObject({ authority: "bob-core", taskBinding: binding, project: first.project, task });
    expect((await sample({ run: randomUUID(), binding, taskId: task.id })).status).toBe(403);
    expect((await sample({ run, binding, taskId: task.id, headers: { host: "localhost:3107" } })).status).toBe(403);
    expect((await sample({ run, project: "project=demo-bobai", binding: second.taskBinding, taskId: task.id })).status).toBe(404);
    const replay = await sample({ method: "POST", run, binding, body: {
      title: fixtureInput.title, dueAt: fixtureInput.dueAt, operationId: fixtureInput.operationId,
    } });
    expect(await replay.json()).toEqual({ task, created: true, changed: true, idempotent: true });
  });

  it("rejects invalid bodies and conflicting retries, and keeps receipts through capacity pressure", async () => {
    const run = randomUUID();
    const { taskBinding: binding } = await open(run);
    expect((await sample({ method: "POST", run, binding, body: fixtureInput,
      headers: { "content-type": "text/plain" } })).status).toBe(400);
    expect((await sample({ method: "POST", run, binding, body: { ...fixtureInput, sourceIds: ["sample"] } })).status).toBe(400);
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(9_000));
      controller.enqueue(new Uint8Array(8_000));
      controller.close();
    } });
    expect((await sample({ method: "POST", run, binding, stream })).status).toBe(413);

    expect((await sample({ method: "POST", run, binding, body: fixtureInput })).status).toBe(200);
    const conflict = await sample({ method: "POST", run, binding, body: { ...fixtureInput, description: null } });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "operation_conflict" } });
    for (let index = 2; index <= 30; index++) {
      const body = { ...fixtureInput, operationId: `sample-operation-${index}` };
      expect((await sample({ method: "POST", run, binding, body })).status).toBe(200);
    }
    expect((await sample({ method: "POST", run, binding,
      body: { ...fixtureInput, operationId: "sample-operation-31" } })).status).toBe(429);
    const recovered = await sample({ method: "POST", run, binding, body: fixtureInput });
    expect(await recovered.json()).toMatchObject({ idempotent: true });
  });

  it("requires an explicit new connection after expiry and refuses submission on the old binding", async () => {
    const run = randomUUID();
    const { taskBinding: binding } = await open(run);
    expect((await sample({ method: "POST", run, binding, body: fixtureInput })).status).toBe(200);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    expect((await sample({ run, binding })).status).toBe(403);
    expect((await sample({ method: "POST", run, binding, body: fixtureInput })).status).toBe(403);
    const reopened = await open(run);
    expect(reopened.taskBinding).not.toBe(binding);
    expect(reopened.tasks).toEqual([]);
    expect((await sample({ method: "POST", run, binding, body: fixtureInput })).status).toBe(403);
  });
});
