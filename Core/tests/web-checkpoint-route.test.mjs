import { createHmac } from "node:crypto";
import { createElement } from "../../Web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../Web/node_modules/react-dom/server.node.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.js";
import { createTestConfig } from "./test-config.js";

const auth = vi.hoisted(() => ({ signedIn: true, failure: false, sessionToken: "synthetic-session", email: "owner@example.test" }));
vi.mock("../../Web/lib/owner-auth", () => ({ ownerAuthEnabled: () => true, ownerEmail: () => auth.email,
  withOwnerAuth: async work => {
    if (auth.failure) throw Error("synthetic-private-auth-error");
    return work({ api: { getSession: async () => auth.signedIn ? { user: { email: auth.email }, session: { token: auth.sessionToken } } : null } });
  } }));
vi.mock("../../Web/node_modules/next/headers.js", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("../../Web/node_modules/next/navigation.js", () => ({ redirect: path => { throw Error(`redirect:${path}`); } }));
import { POST } from "../../Web/app/api/checkpoint-import/route";
import ImportPage from "../../Web/app/import/page";
import { OwnerCheckpointImport } from "../../Web/components/owner-checkpoint-import";
import { CORE_ORIGIN, checkedReceipts, parseImportBundle, validReview } from "../../Web/lib/checkpoint-import-contract";

const secret = "synthetic-session-secret-000000000000000";
const stamp = "2026-10-26T16:00:00.000Z";
const projects = [
  { id: "10000000-0000-4000-8000-000000000001", key: "bobai", name: "BobAI" },
  { id: "625cd72a-8f72-4e6f-a090-e791b8681259", key: "fomoflow", name: "FOMOflow" },
  { id: "f21440d5-2331-4b03-8e22-9d24a4d514cd", key: "personal", name: "Personal" },
];
const actor = { interfaceId: "synthetic-owner", surface: "web" };
function bundle(keys = ["bobai"]) {
  return { version: 1, coreOrigin: CORE_ORIGIN, environment: "production", checkpoints: keys.map(key => ({
    project: projects.find(p => p.key === key), body: { operationId: `synthetic-import-${key}`, outcome: `Synthetic checkpoint ${key}`, unresolved: [], nextActions: ["Synthetic next action"] },
  })) };
}
let f;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(stamp));
  Object.assign(auth, { signedIn: true, failure: false, sessionToken: "synthetic-session", email: "owner@example.test" });
  for (const [key, value] of Object.entries({ BOB_AUTH_SECRET: secret, BOB_CORE_BASE_URL: CORE_ORIGIN,
    BOB_CORE_DEVICE_TOKEN: "synthetic-core-credential", VERCEL_ENV: "production" })) vi.stubEnv(key, value);
  const rows = projects.map(p => ({ id: p.id, projectKey: p.key, name: p.name, ownerId: "rick", status: "active",
    description: null, repository: null, metadata: {}, createdAt: stamp, updatedAt: stamp }));
  const store = new InMemorySharedContextStore({ projects: rows });
  const service = new SharedContextService(store, "rick");
  const config = createTestConfig({ sharedContextEnabled: true });
  const generate = vi.fn(async () => { throw Error("Checkpoint operations must never invoke inference"); });
  const app = createApp({ config, aiProvider: { generate }, sharedContextService: service });
  f = { rows, store, service, generate, calls: [], before: null, credential: { id: "synthetic-owner", projectKey: null, surface: "web", scopes: ["control-center:owner", "context:read"] } };
  const gateway = createInterfaceCredentialGateway(app.fetch.bind(app), config, async () => f.credential);
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    expect(new URL(url).origin).toBe(CORE_ORIGIN);
    const request = new Request(url, init);
    f.calls.push({ method: request.method, path: new URL(url).pathname, headers: request.headers,
      body: request.method === "POST" ? await request.clone().json() : null });
    await f.before?.(request);
    return gateway(request);
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function send(input, extra = {}) {
  const csrf = createHmac("sha256", secret).update(`bob-control-owner-action:${auth.sessionToken}`).digest("base64url");
  return POST(new Request("https://owner.example/api/checkpoint-import", { method: "POST", headers: {
    origin: "https://owner.example", "content-type": "application/json", "x-bob-csrf": csrf, ...extra }, body: JSON.stringify(input) }));
}
const review = async input => (await send({ action: "review", bundle: input })).json();
const commit = (input, reviewed) => send({ action: "commit", bundle: input, reviewToken: reviewed.reviewToken });
const writes = () => f.calls.filter(call => call.method === "POST");

describe("checkpoint route uses real Web proofs and Core authorization with synthetic transport", () => {
  it("reviews, commits and verifies an append-only handoff through Web and Core", async () => {
    const input = bundle(), reviewed = await review(input);
    expect(validReview(reviewed, input)).toBe(true); expect(writes()).toHaveLength(0);
    const result = await (await commit(input, reviewed)).json();
    expect(result).toMatchObject({ complete: true, receipts: [{ projectKey: "bobai", verifiedBy: "context_readback" }] });
    expect(checkedReceipts(result.receipts, input)).toEqual(result.receipts);
    expect(writes()[0].body).toEqual({ ...input.checkpoints[0].body, expectedProjectId: projects[0].id });
    expect(f.calls.every(call => call.headers.get("authorization") === "Bearer synthetic-core-credential")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/ownerId|metadata|synthetic-core-credential/);
    expect(await f.store.listActiveDecisions("rick", projects[0].id, 100)).toEqual([]);
    expect(await f.store.listTasks("rick", projects[0].id, 100)).toEqual([]);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(["preview", "development", ""])("rejects %s environment before any transport", async environment => {
    vi.stubEnv("VERCEL_ENV", environment);
    expect((await send({ action: "review", bundle: bundle() })).status).toBe(503); expect(f.calls).toHaveLength(0);
  });
  it.each(["https://other.example", "http://bob-core.vercel.app", "https://bob-core.vercel.app/private"])("rejects changed Core origin %s before any transport", async origin => {
    vi.stubEnv("BOB_CORE_BASE_URL", origin);
    expect((await send({ action: "review", bundle: bundle() })).status).toBe(503); expect(f.calls).toHaveLength(0);
  });
  it.each(["credential", "owner", "signing-key"])("invalidates a review when %s changes", async change => {
    const input = bundle(), reviewed = await review(input), reads = f.calls.length;
    if (change === "credential") vi.stubEnv("BOB_CORE_DEVICE_TOKEN", "synthetic-other-credential");
    if (change === "owner") auth.email = "other@example.test";
    if (change === "signing-key") vi.stubEnv("BOB_AUTH_SECRET", secret + "changed");
    const response = await commit(input, reviewed); expect([403, 409]).toContain(response.status);
    expect(writes()).toHaveLength(0); expect(f.calls).toHaveLength(reads);
  });
  it("allows a fresh session for the same owner only with its current CSRF token", async () => {
    const input = bundle(), reviewed = await review(input);
    const oldCsrf = createHmac("sha256", secret).update(`bob-control-owner-action:${auth.sessionToken}`).digest("base64url");
    auth.sessionToken = "synthetic-renewed-session";
    expect((await send({ action: "commit", bundle: input, reviewToken: reviewed.reviewToken }, { "x-bob-csrf": oldCsrf })).status).toBe(403);
    expect(writes()).toHaveLength(0); expect((await commit(input, reviewed)).status).toBe(200);
  });
  it("does not broaden a project credential into another project or Personal", async () => {
    f.credential = { id: "synthetic-project-web", projectKey: "bobai", surface: "web", scopes: ["context:read", "handoffs:write"] };
    for (const key of ["fomoflow", "personal"])
      expect((await send({ action: "review", bundle: bundle(["bobai", key]) })).status).toBe(503);
    expect(writes()).toHaveLength(0);
  });
  it("rejects revoked Core credentials and replaced project UUIDs before writing", async () => {
    const input = bundle(), reviewed = await review(input);
    f.credential = null; expect((await commit(input, reviewed)).status).toBe(503); expect(writes()).toHaveLength(0);
    f.credential = { id: "synthetic-owner", projectKey: null, surface: "web", scopes: ["control-center:owner", "context:read"] };
    f.before = async request => { if (request.method === "POST") f.rows[0].id = projects[1].id; };
    const result = await (await commit(input, reviewed)).json(); expect(result.error.code).toBe("project_binding_changed");
    expect(await f.store.listHandoffs("rick", projects[0].id, 100)).toEqual([]);
  });
  it("reports operation conflicts without replacing prior content", async () => {
    const input = bundle(); expect((await commit(input, await review(input))).status).toBe(200);
    input.checkpoints[0].body.outcome = "Different payload on reused ID";
    const response = await commit(input, await review(input)); expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("operation_conflict");
    expect((await f.store.listHandoffs("rick", projects[0].id, 100)).map(h => h.outcome)).toEqual(["Synthetic checkpoint bobai"]);
  });
  it("recovers a historical receipt outside the bounded context list without duplicating it", async () => {
    const input = bundle(); const first = await (await commit(input, await review(input))).json();
    for (let index = 0; index < 5; index++) {
      vi.setSystemTime(new Date(Date.parse(stamp) + index + 1));
      await f.service.recordHandoff({ projectKey: "bobai", operationId: `synthetic-newer-${index}`, outcome: "Later synthetic checkpoint", unresolved: [], nextActions: [], actor });
    }
    const result = await (await commit(input, await review(input))).json();
    expect(result).toMatchObject({ complete: true, receipts: [{ handoffId: first.receipts[0].handoffId, idempotent: true, verifiedBy: "operation_receipt" }] });
    expect(await f.store.listHandoffs("rick", projects[0].id, 100)).toHaveLength(6);
  });
  it("concurrent identical commits produce one checkpoint and one creation audit event", async () => {
    const input = bundle(), reviewed = await review(input);
    let arrivals = 0, release; const both = new Promise(resolve => { release = resolve; });
    f.before = async request => { if (request.method === "POST") { if (++arrivals === 2) release(); await both; } };
    const results = await Promise.all([commit(input, reviewed), commit(input, reviewed)]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    const receipts = await Promise.all(results.map(r => r.json()));
    expect(receipts.map(r => r.receipts[0].idempotent).sort()).toEqual([false, true]);
    expect(await f.store.listHandoffs("rick", projects[0].id, 100)).toHaveLength(1);
    expect((await f.store.listRecentEvents("rick", projects[0].id, 100)).filter(e => e.eventType === "handoff.created")).toHaveLength(1);
  });
  it("contains session errors and protects the import page", async () => {
    auth.signedIn = false; await expect(ImportPage()).rejects.toThrow("redirect:/login");
    expect((await send({ action: "review", bundle: bundle() })).status).toBe(401);
    auth.signedIn = true; auth.failure = true;
    const response = await send({ action: "review", bundle: bundle() }); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-private-auth-error"); expect(f.calls).toHaveLength(0);
  });
  it("renders the owner page and does not offer a commit before file review", async () => {
    const html = renderToStaticMarkup(await ImportPage());
    expect(html).toContain("Import checkpoints"); expect(html).toContain('type="file"'); expect(html).not.toContain("Import reviewed checkpoints");
    expect(renderToStaticMarkup(createElement(OwnerCheckpointImport, { csrfToken: "synthetic-csrf" }))).toContain("No import has been sent.");
    expect(f.calls).toHaveLength(0);
  });
  it("uses one strict file/review/receipt contract in server and browser", async () => {
    const input = bundle(), reviewed = await review(input); expect(parseImportBundle(input)).toEqual(input);
    expect(parseImportBundle({ ...input, checkpoints: [{ ...input.checkpoints[0], body: { ...input.checkpoints[0].body, operationId: "bad operation" } }] })).toBeNull();
    expect(validReview({ ...reviewed, projects: [{ ...reviewed.projects[0], body: { ...input.checkpoints[0].body, outcome: "Substituted" } }] }, input)).toBe(false);
    expect(validReview({ ...reviewed, projects: [{ ...reviewed.projects[0], snapshot: { ...reviewed.projects[0].snapshot, sources: {} } }] }, input)).toBe(false);
    expect(checkedReceipts([{ projectKey: "bobai", operationId: input.checkpoints[0].body.operationId, handoffId: projects[0].id, idempotent: false, verifiedBy: "operation_receipt" }], input)).toBeNull();
  });
});
