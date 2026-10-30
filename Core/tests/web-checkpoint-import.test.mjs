import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImportHandler, parseImportBundle } from "../../Web/lib/checkpoint-import";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";

const stamp = "2026-10-26T16:00:00.000Z";
// Recorded destination identities, with entirely synthetic local fixture content.
const projects = [
  { id: "10000000-0000-4000-8000-000000000001", key: "bobai", name: "BobAI" },
  { id: "625cd72a-8f72-4e6f-a090-e791b8681259", key: "fomoflow", name: "FOMOflow" },
];
const actor = { interfaceId: "synthetic-owner", surface: "web" };
function bundle(count = 1) {
  return { version: 1, coreOrigin: "https://bob-core.vercel.app", environment: "production",
    checkpoints: projects.slice(0, count).map((project, i) => ({ project, body: { operationId: `synthetic-checkpoint-${i}`,
      outcome: `Synthetic outcome ${i}`, unresolved: ["Synthetic unresolved"], nextActions: ["Synthetic next action"] } })) };
}
function fixture() {
  const rows = projects.map(p => ({ id: p.id, projectKey: p.key, name: p.name, ownerId: "rick", status: "active",
    description: null, repository: null, metadata: {}, createdAt: stamp, updatedAt: stamp }));
  const store = new InMemorySharedContextStore({ projects: rows });
  const service = new SharedContextService(store, "rick");
  const state = { now: Date.parse(stamp), signedIn: true, secret: "synthetic-signing-key", mutate: null, readCount: 0 };
  const deps = {
    hasOwnerSession: vi.fn(async () => state.signedIn), csrf: vi.fn(async token => token === "synthetic-csrf"),
    read: vi.fn(async key => {
      const value = await service.build({ projectKey: key, surface: "web" });
      state.readCount++;
      await state.mutate?.(value, state.readCount);
      return value;
    }),
    write: vi.fn(async (key, body) => service.recordHandoff({ projectKey: key, ...body, actor })),
    sign: vi.fn(async payload => createHmac("sha256", state.secret).update(payload).digest("base64url")), now: () => state.now,
  };
  const handler = createImportHandler(deps);
  const send = (input, headers = {}) => handler(new Request("https://owner.example/api/checkpoint-import", { method: "POST",
    headers: { origin: "https://owner.example", "content-type": "application/json", "x-bob-csrf": "synthetic-csrf", ...headers }, body: JSON.stringify(input) }));
  const review = async (input = bundle()) => (await send({ action: "review", bundle: input })).json();
  const commit = (input, reviewed) => send({ action: "commit", bundle: input, reviewToken: reviewed.reviewToken });
  return { state, deps, service, store, rows, handler, send, review, commit };
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(stamp)); });
afterEach(() => vi.useRealTimers());

describe("owner checkpoint review and commit over real in-memory Core continuity", () => {
  it("reviews without checkpoint writes; returns bounded context evidence, then confirms receipt/readback", async () => {
    const f = fixture(), input = bundle(), reviewed = await f.review(input);
    expect(f.deps.write).not.toHaveBeenCalled(); expect(reviewed.projects[0].snapshot).toMatchObject({ generatedAt: stamp,
      sources: { tasks: { checkedAt: stamp, truncated: false } } });
    expect(JSON.stringify(reviewed)).not.toMatch(/ownerId|metadata|synthetic-signing-key/);
    const response = await f.commit(input, reviewed); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ complete: true, receipts: [{ projectKey: "bobai", idempotent: false, verifiedBy: "context_readback" }] });
    expect(f.deps.write.mock.calls[0][1].expectedProjectId).toBe(projects[0].id);
    const events = await f.store.listRecentEvents("rick", projects[0].id, 100);
    expect(events.filter(e => e.eventType === "handoff.created")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("Synthetic outcome");
  });
  it.each(["session", "csrf", "origin"])("rejects invalid %s before Core reads or writes", async mode => {
    const f = fixture(); if (mode === "session") f.state.signedIn = false;
    const response = await f.send({ action: "review", bundle: bundle() }, mode === "csrf" ? { "x-bob-csrf": "bad" } : mode === "origin" ? { origin: "https://foreign.invalid" } : {});
    expect(response.status).toBe(mode === "session" ? 401 : 403); expect(f.deps.read).not.toHaveBeenCalled(); expect(f.deps.write).not.toHaveBeenCalled();
  });
  it.each(["surface", "project", "generatedAt", "checkedAt", "futureTime"])("rejects unverified context %s during review", async mode => {
    const f = fixture(); f.state.mutate = value => {
      if (mode === "surface") value.request.surface = "chatgpt";
      if (mode === "project") value.request.projectKey = "other";
      if (mode === "generatedAt") value.generatedAt = "2026-10-25T00:00:00Z";
      if (mode === "checkedAt") value.sources.tasks.checkedAt = "invalid";
      if (mode === "futureTime") value.generatedAt = "2027-01-01T00:00:00Z";
    };
    expect((await f.send({ action: "review", bundle: bundle() })).status).toBe(["surface", "project"].includes(mode) ? 409 : 503); expect(f.deps.write).not.toHaveBeenCalled();
  });
  it("allows disclosed bounded context but rejects unavailable required sources", async () => {
    const f = fixture(); f.state.mutate = value => { value.partial = true; value.sources.tasks.truncated = true; };
    const reviewed = await f.review(); expect(reviewed.projects[0].snapshot).toMatchObject({ partial: true, sources: { tasks: { truncated: true } } });
    expect((await f.commit(bundle(), reviewed)).status).toBe(200);
    f.state.mutate = value => { value.sources.decisions.status = "unavailable"; };
    expect((await f.send({ action: "review", bundle: bundle() })).status).toBe(503);
  });
  it("binds required-source completeness as well as content to the review", async () => {
    const f = fixture(), reviewed = await f.review();
    f.state.mutate = value => { value.sources.tasks.truncated = true; };
    expect((await f.commit(bundle(), reviewed)).status).toBe(409); expect(f.deps.write).not.toHaveBeenCalled();
  });
  it.each(["payload", "signature", "expiry", "connection"])("requires a new review after changed %s", async mode => {
    const f = fixture(), input = bundle(), reviewed = await f.review(input);
    if (mode === "payload") input.checkpoints[0].body.outcome = "Changed after review";
    if (mode === "signature") reviewed.reviewToken += "x";
    if (mode === "expiry") f.state.now += 300001;
    if (mode === "connection") f.state.secret = "synthetic-other-connection";
    expect((await f.commit(input, reviewed)).status).toBe(409); expect(f.deps.write).not.toHaveBeenCalled();
  });
  it("checks review expiry again after the last pre-write context read", async () => {
    const f = fixture(), reviewed = await f.review();
    f.state.mutate = (_value, read) => { if (read === 3) f.state.now += 300001; };
    expect((await f.commit(bundle(), reviewed)).status).toBe(409); expect(f.deps.write).not.toHaveBeenCalled();
  });
  it("preflights every project before the first write and stops on changed state", async () => {
    const f = fixture(), input = bundle(2), reviewed = await f.review(input);
    f.rows[1].name = "Changed project";
    expect((await f.commit(input, reviewed)).status).toBe(409); expect(f.deps.write).not.toHaveBeenCalled();
  });
  it("reports a partial batch and recovers identical operations without duplicate checkpoints", async () => {
    const f = fixture(), input = bundle(2), reviewed = await f.review(input);
    f.deps.write.mockImplementationOnce(async (key, body) => f.service.recordHandoff({ projectKey: key, ...body, actor }))
      .mockRejectedValueOnce(Error("synthetic-private-network-failure"));
    const failed = await f.commit(input, reviewed), result = await failed.json();
    expect(failed.status).toBe(503); expect(result.partialReceipts).toHaveLength(1);
    expect(result.pendingOperationId).toBe(input.checkpoints[1].body.operationId); expect(JSON.stringify(result)).not.toContain("synthetic-private-network-failure");
    const recovered = await (await f.commit(input, await f.review(input))).json();
    expect(recovered.complete).toBe(true); expect(recovered.receipts.map(r => r.idempotent)).toEqual([true, false]);
    for (const project of projects) expect(await f.store.listHandoffs("rick", project.id, 100)).toHaveLength(1);
  });
  it("recovers a lost response using a new review and stored original operation", async () => {
    const f = fixture(), input = bundle(), reviewed = await f.review(input);
    f.deps.write.mockImplementationOnce(async (key, body) => { await f.service.recordHandoff({ projectKey: key, ...body, actor }); throw Error("synthetic-lost-response"); });
    expect((await f.commit(input, reviewed)).status).toBe(503);
    const recovered = await (await f.commit(input, await f.review(input))).json();
    expect(recovered.receipts[0]).toMatchObject({ idempotent: true, verifiedBy: "context_readback" });
    expect(await f.store.listHandoffs("rick", projects[0].id, 100)).toHaveLength(1);
  });
  it("does not claim verification from a malformed or unreadable receipt", async () => {
    const f = fixture(), input = bundle(), reviewed = await f.review(input);
    f.deps.write.mockResolvedValueOnce({ idempotent: false, handoff: { id: "-".repeat(36), projectId: projects[0].id, ...input.checkpoints[0].body } });
    const result = await (await f.commit(input, reviewed)).json(); expect(result.partialReceipts).toEqual([]);
    expect(result.error.code).toBe("receipt_unconfirmed");
  });
  it("keeps a valid receipt marked unverified when readback fails", async () => {
    const f = fixture(), reviewed = await f.review();
    f.state.mutate = (_value, read) => { if (read === 4) throw Error("synthetic-private-readback"); };
    const response = await f.commit(bundle(), reviewed), result = await response.json();
    expect(response.status).toBe(503); expect(result.partialReceipts[0].verifiedBy).toBe("receipt_only"); expect(result.complete).toBeUndefined();
  });
  it("validates exact destination, shape, duplicates and streamed byte limits", async () => {
    for (const change of [v => v.environment = "staging", v => v.checkpoints[0].project = { ...projects[0], id: projects[1].id },
      v => v.checkpoints[0].body.extra = "hidden", v => v.checkpoints.push(v.checkpoints[0])]) {
      const value = bundle(); change(value); expect(parseImportBundle(value)).toBeNull();
    }
    const f = fixture(); let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(66000)); }, cancel() { cancelled = true; } });
    const response = await f.handler(new Request("https://owner.example/api/checkpoint-import", { method: "POST", duplex: "half", body: stream,
      headers: { origin: "https://owner.example", "content-type": "application/json", "x-bob-csrf": "synthetic-csrf" } }));
    expect(response.status).toBe(400); expect(cancelled).toBe(true); expect(f.deps.read).not.toHaveBeenCalled();
  });
});
