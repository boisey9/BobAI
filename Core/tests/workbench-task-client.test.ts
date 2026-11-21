import { describe, expect, it, vi } from "vitest";
import { createWorkbenchTaskClient } from "../../Web/lib/workbench/task-creation.js";
import { workbenchSampleProjects } from "../../Web/lib/workbench/sample-projects.js";

const [project, other] = workbenchSampleProjects;
const run = "c9ac75db-a56d-4fc4-88ed-a5c247a0534b";
const id = "95d71f49-937c-4cbd-8d72-26d8a109233d";
const operationId = "workbench-unit-test-1";
const binding = "A".repeat(43);
const checkedAt = "2026-11-19T16:40:00.000Z";
const input = { title: "Review evidence", description: "Sample citation", priority: "high", dueAt: null } as const;
const task = { ...input, id, projectId: project.id, status: "open", version: 1 };
const authority = { authority: "bob-core", project, taskBinding: binding, checkedAt };
const receipt = { task, idempotent: false, created: true, changed: true };

function mockClient() {
  const transport = vi.fn<(path: string, options: RequestInit) => Promise<Response>>();
  transport.mockResolvedValueOnce(Response.json(authority));
  const client = createWorkbenchTaskClient(transport);
  return { transport, client, prepare: () => client.prepare(project, run, operationId, input) };
}

describe("synthetic Workbench task create client", () => {
  it("retains the identical body and binding on an uncertain retry, then uses a separate GET by returned ID", async () => {
    const { client, transport, prepare } = mockClient();
    const intent = await prepare();
    transport.mockRejectedValueOnce(new Error("Response lost"));
    transport.mockResolvedValueOnce(Response.json({ ...receipt, idempotent: true }));
    transport.mockResolvedValueOnce(Response.json({ ...authority, task: { ...task, title: "Current title", version: 2 } }));
    expect(await client.create(intent)).toEqual({ kind: "uncertain" });
    const replay = await client.create(intent);
    expect(replay).toMatchObject({ kind: "receipt", receipt: { task: { id, version: 1 }, idempotent: true } });
    if (replay.kind !== "receipt") throw new Error("Missing replay receipt");
    expect(await client.read(intent, replay.receipt)).toMatchObject({ task: { id, title: "Current title", version: 2 } });
    const [open, first, retry, read] = transport.mock.calls;
    expect(open?.[1].method).toBe("GET");
    expect(first?.[1]).toMatchObject({ method: "POST", credentials: "omit", redirect: "error",
      headers: { "x-bob-task-binding": binding, "x-bob-workbench-run": run } });
    expect(retry?.[1].body).toBe(first?.[1].body);
    expect(JSON.parse(String(first?.[1].body))).toEqual({ operationId, ...input });
    expect(read).toMatchObject(["/api/review/workbench/tasks/" + id + "?project=demo-rfq",
      { method: "GET", headers: { "x-bob-task-binding": binding } }]);
  });

  it("refuses to prepare a mutation from another project's directory response", async () => {
    const { transport, prepare } = mockClient();
    transport.mockReset().mockResolvedValueOnce(Response.json({ ...authority, project: other }));
    await expect(prepare()).rejects.toThrow("Could not verify");
    expect(transport.mock.calls.map(([, options]) => options.method)).toEqual(["GET"]);
  });

  it.each([
    ["binding refusal", 403, "task_binding_changed", { kind: "refused", reason: "binding" }],
    ["operation conflict", 409, "operation_conflict", { kind: "refused", reason: "conflict" }],
    ["bad payload", 400, "invalid_request", { kind: "refused", reason: "invalid" }],
    ["server unavailable", 503, "timeout", { kind: "uncertain" }],
    ["rate limit", 429, "preview_capacity", { kind: "uncertain" }],
  ] as const)("classifies %s", async (_label, code, errorCode, expected) => {
    const { client, transport, prepare } = mockClient();
    const intent = await prepare();
    transport.mockResolvedValueOnce(Response.json({ error: { code: errorCode } }, { status: code }));
    expect(await client.create(intent)).toEqual(expected);
  });

  it.each([
    { ...receipt, task: { ...task, projectId: other.id } },
    { ...receipt, task: { ...task, title: "Wrong title" } },
    { ...receipt, task: { ...task, version: 2 } },
    { ...receipt, created: false },
  ])("keeps a malformed or mismatched success uncertain", async badReceipt => {
    const { client, transport, prepare } = mockClient();
    const intent = await prepare();
    transport.mockResolvedValueOnce(Response.json(badReceipt));
    expect(await client.create(intent)).toEqual({ kind: "uncertain" });
  });

  it.each([
    { ...authority, taskBinding: "B".repeat(43), task },
    { ...authority, project: other, task },
    { ...authority, task: { ...task, projectId: other.id } },
    { ...authority, task: { ...task, id: run } },
    { ...authority, task: { ...task, version: 0 } },
    { ...authority, task: { ...task, title: "Wrong title at receipt version" } },
  ])("rejects an unverified current task", async detail => {
    const { client, transport, prepare } = mockClient();
    const intent = await prepare();
    transport.mockResolvedValueOnce(Response.json(receipt));
    const created = await client.create(intent);
    if (created.kind !== "receipt") throw new Error("Missing receipt");
    transport.mockResolvedValueOnce(Response.json(detail));
    transport.mockResolvedValueOnce(Response.json({ ...authority, task }));
    expect(await client.read(intent, created.receipt)).toBeNull();
    expect(await client.read(intent, created.receipt)).toMatchObject({ task: { id, version: 1 } });
    expect(transport.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });

  it("distinguishes expired readback from a retryable read failure and preserves the original receipt", async () => {
    const { client, transport, prepare } = mockClient();
    const intent = await prepare();
    transport.mockResolvedValueOnce(Response.json(receipt));
    const created = await client.create(intent);
    if (created.kind !== "receipt") throw new Error("Missing receipt");
    transport.mockResolvedValueOnce(Response.json({ error: { code: "task_binding_changed" } }, { status: 403 }));
    expect(await client.read(intent, created.receipt)).toEqual({ kind: "binding-ended" });
    expect(created.receipt.task).toMatchObject({ id, version: 1 });
    expect(transport.mock.calls.map(([, options]) => options.method)).toEqual(["GET", "POST", "GET"]);
  });
});
