import { randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workbenchLayoutReviewAPI } from "../../Web/lib/workbench/review-layout-api.js";
import { layoutRevisionLimit, sampleLayoutScope } from "../../Web/lib/workbench/layout-contract.js";
import type { Board } from "../../Web/components/workbench/fixtures.js";

const host = "127.0.0.1:3457";
const origin = `http://${host}`;
const route = "/api/review/workbench/layout";
const scope = sampleLayoutScope("demo-rfq", "standard")!;
const moved: Board = { reference: ["test"], review: ["finding"], focus: ["delivery"] };
const movedAgain: Board = { reference: [], review: ["finding", "test"], focus: ["delivery"] };
type Page = {
  projectKey: string; projectId: string; fixture: string; binding: string;
  expiresAt: string; version: number; board: Board | null; replayed: boolean;
};
type Options = {
  method?: string; project?: string; fixture?: string; query?: string; cookie?: string;
  binding?: string; headers?: Record<string, string>; body?: unknown; rawBody?: string;
  stream?: ReadableStream<Uint8Array>; signal?: AbortSignal;
  api?: typeof workbenchLayoutReviewAPI;
};

async function request({ method = "GET", project = "demo-rfq", fixture = "standard", query,
  cookie, binding, headers, body, rawBody, stream, signal, api = workbenchLayoutReviewAPI }: Options = {}) {
  const init: RequestInit & { duplex?: "half" } = {
    method, ...(signal ? { signal } : {}),
    headers: {
      host, origin, "x-bob-layout-review": "1",
      ...(cookie ? { cookie } : {}), ...(binding ? { "x-bob-layout-binding": binding } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}), ...headers,
    },
    ...(method === "POST" ? { body: stream ?? rawBody ?? JSON.stringify(body), duplex: "half" } : {}),
  };
  const requestOrigin = headers?.host ? `http://${headers.host}` : origin;
  const response = await api(new Request(`${requestOrigin}${route}?${query ?? `project=${project}&fixture=${fixture}`}`, init));
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response;
}

async function open(options: Options = {}) {
  const response = await request(options);
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? options.cookie;
  expect(cookie).toMatch(/^bob_workbench_layout_preview=[a-f0-9]{64}$/);
  return { cookie: cookie!, page: await response.json() as Page, response };
}

function saveInput(expectedVersion = 0, board = moved, operationId = randomUUID()) {
  return { expectedVersion, operationId, board };
}

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => entry.isDirectory()
    ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}

describe("Workbench synthetic layout persistence endpoint", () => {
  let root: string;
  let directory: string;
  beforeEach(async () => {
    for (const key of ["VERCEL", "VERCEL_ENV", "DATABASE_URL", "BOB_AUTH_DATABASE_URL", "BOB_CORE_DEVICE_TOKEN",
      "AI_API_KEY", "OPENAI_API_KEY", "ZAI_API_KEY", "BOB_AUTH_SECRET", "BOB_CONTROL_CENTER_SESSION_SECRET"])
      vi.stubEnv(key, undefined);
    vi.stubEnv("NODE_ENV", "development");
    for (const key of ["BOB_UI_REVIEW_ENABLED", "BOB_WORKBENCH_READ_REVIEW_ENABLED",
      "BOB_WORKBENCH_TASK_REVIEW_ENABLED", "BOB_WORKBENCH_LAYOUT_REVIEW_ENABLED"])
      vi.stubEnv(key, "true");
    root = await mkdtemp(join(await realpath(tmpdir()), "bob-workbench-layout-test-"));
    await chmod(root, 0o700);
    directory = join(root, "layouts");
    await mkdir(directory, { mode: 0o700 });
    vi.stubEnv("BOB_WORKBENCH_LAYOUT_REVIEW_DIRECTORY", directory);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it.each(["BOB_UI_REVIEW_ENABLED", "BOB_WORKBENCH_READ_REVIEW_ENABLED", "BOB_WORKBENCH_TASK_REVIEW_ENABLED",
    "BOB_WORKBENCH_LAYOUT_REVIEW_ENABLED"])(
    "does not touch storage with %s disabled", async flag => {
      vi.stubEnv(flag, "false");
      expect((await request()).status).toBe(404);
      expect(await readdir(directory)).toEqual([]);
    });

  it.each(["production", "test"])("refuses %s mode before storage effects", async mode => {
    vi.stubEnv("NODE_ENV", mode);
    expect((await request()).status).toBe(404);
    expect(await readdir(directory)).toEqual([]);
  });

  it.each(["VERCEL", "VERCEL_ENV", "DATABASE_URL", "BOB_AUTH_DATABASE_URL", "BOB_CORE_DEVICE_TOKEN",
    "AI_API_KEY", "OPENAI_API_KEY", "ZAI_API_KEY", "BOB_AUTH_SECRET", "BOB_CONTROL_CENTER_SESSION_SECRET"])(
    "refuses a hosted or credential-bearing environment (%s)", async key => {
      vi.stubEnv(key, "synthetic-refusal-marker");
      expect((await request()).status).toBe(404);
      expect(await readdir(directory)).toEqual([]);
    });

  it("refuses missing review marker, foreign host, and ambiguous or non-sample scope", async () => {
    expect((await request({ headers: { "x-bob-layout-review": "" } })).status).toBe(404);
    expect((await request({ headers: { host: "public.invalid:3457" } })).status).toBe(404);
    for (const query of ["project=demo-rfq&project=demo-bobai&fixture=standard",
      "project=demo-rfq&fixture=standard&fixture=stress", "project=demo-rfq&fixture=standard&owner=other"])
      expect((await request({ query })).status).toBe(400);
    for (const query of ["project=bobai&fixture=standard", "project=demo-rfq&fixture=unrecognized"])
      expect((await request({ query })).status).toBe(400);
    expect(await readdir(directory)).toEqual([]);
  });

  it("issues a private synthetic profile, saves layout only, and reads it without another mutation", async () => {
    const { cookie, page, response } = await open();
    expect(page).toMatchObject({ projectKey: scope.projectKey, projectId: scope.projectId,
      fixture: "standard", version: 0, board: null, replayed: false });
    expect(page.binding).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(response.headers.get("set-cookie")).toContain(`Path=${route}`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=86400");
    const saved = await request({ method: "POST", cookie, binding: page.binding, body: saveInput() });
    expect(saved.status).toBe(200);
    const receipt = await saved.json() as Page;
    expect(receipt).toEqual({ ...page, version: 1, board: moved, replayed: false });
    const reloaded = await open({ cookie });
    expect(reloaded.page).toEqual(receipt);
    const serialized = JSON.stringify(receipt);
    for (const privateValue of [directory, root, cookie, "excerpt", "description", "ownerId", "question"])
      expect(serialized).not.toContain(privateValue);
  });

  it("gives concurrent identical requests one revision and one original receipt", async () => {
    const { cookie, page } = await open();
    const body = saveInput();
    const responses = await Promise.all(Array.from({ length: 4 }, () =>
      request({ method: "POST", cookie, binding: page.binding, body })));
    for (const response of responses) expect(response.status).toBe(200);
    const receipts = await Promise.all(responses.map(async response => await response.json() as Page));
    expect(receipts.filter(receipt => !receipt.replayed)).toHaveLength(1);
    expect(receipts.every(receipt => receipt.version === 1 && JSON.stringify(receipt.board) === JSON.stringify(moved))).toBe(true);
    expect((await open({ cookie })).page.version).toBe(1);
  });

  it("allows one concurrent CAS winner and preserves the winner after a stale version refusal", async () => {
    const { cookie, page } = await open();
    const boards = [moved, movedAgain];
    const responses = await Promise.all(boards.map(board => request({ method: "POST", cookie,
      binding: page.binding, body: saveInput(0, board) })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex(response => response.status === 200);
    expect(await responses[1 - winner]!.json()).toMatchObject({ error: { code: "layout_conflict" } });
    const current = (await open({ cookie })).page;
    expect(current).toMatchObject({ version: 1, board: boards[winner] });
    expect((await request({ method: "POST", cookie, binding: page.binding, body: saveInput(0) })).status).toBe(409);
    expect((await open({ cookie })).page).toEqual(current);
  });

  it("recovers the original receipt after a later save and rejects changed operation payloads", async () => {
    const { cookie, page } = await open();
    const original = saveInput();
    const first = await request({ method: "POST", cookie, binding: page.binding, body: original });
    expect(first.status).toBe(200);
    const receipt = await first.json() as Page;
    expect((await request({ method: "POST", cookie, binding: page.binding, body: saveInput(1, movedAgain) })).status).toBe(200);
    const retry = await request({ method: "POST", cookie, binding: page.binding, body: {
      board: { focus: moved.focus, review: moved.review, reference: moved.reference },
      operationId: original.operationId, expectedVersion: original.expectedVersion,
    } });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ...receipt, replayed: true });
    for (const changed of [{ ...original, board: movedAgain }, { ...original, expectedVersion: 2 }]) {
      const response = await request({ method: "POST", cookie, binding: page.binding, body: changed });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "layout_operation_conflict" } });
    }
    expect((await open({ cookie })).page).toMatchObject({ version: 2, board: movedAgain });
  });

  it("refuses missing or foreign bindings, other owners, projects, fixture modes and origins", async () => {
    const first = await open();
    const second = await open();
    const project = await open({ cookie: first.cookie, project: "demo-bobai" });
    const stress = await open({ cookie: first.cookie, fixture: "stress" });
    expect(new Set([first.page.binding, second.page.binding, project.page.binding, stress.page.binding]).size).toBe(4);
    for (const options of [
      { cookie: first.cookie },
      { cookie: first.cookie, binding: "a".repeat(64) },
      { cookie: second.cookie, binding: first.page.binding },
      { binding: first.page.binding },
      { cookie: first.cookie, binding: first.page.binding, project: "demo-bobai" },
      { cookie: first.cookie, binding: first.page.binding, fixture: "stress" },
      { cookie: first.cookie, binding: first.page.binding, headers: { host: "localhost:3457", origin: "http://localhost:3457" } },
    ]) {
      const response = await request({ method: "POST", body: saveInput(), ...options });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "layout_binding_changed" } });
    }
    expect((await request({ method: "POST", cookie: first.cookie, binding: first.page.binding,
      body: saveInput(), headers: { origin: "https://foreign.invalid" } })).status).toBe(403);
    expect((await open({ cookie: first.cookie })).page.version).toBe(0);
    expect((await open({ cookie: second.cookie })).page.version).toBe(0);
  });

  it("rejects malformed payloads, duplicate or missing cards, draft content and extra scope fields", async () => {
    const { cookie, page } = await open();
    const original = saveInput();
    const bodies = [null, [], {}, { ...original, expectedVersion: -1 }, { ...original, expectedVersion: 0.5 },
      { ...original, operationId: "not-a-uuid" }, { ...original, ownerId: "synthetic-other-owner" },
      { ...original, projectId: "10000000-0000-4000-8000-000000000001" },
      { ...original, board: { ...moved, reference: ["test", "delivery"] } },
      { ...original, board: { ...moved, reference: [] } },
      { ...original, board: { ...moved, focus: ["task-draft"] } },
      { ...original, board: { ...moved, focus: ["stress-4"] } },
      { ...original, board: { ...moved, title: "private draft marker" } },
      { ...original, board: { ...moved, reference: [{ id: "test", excerpt: "private source marker" }] } }];
    for (const body of bodies)
      expect((await request({ method: "POST", cookie, binding: page.binding, body })).status).toBe(400);
    expect((await request({ method: "POST", cookie, binding: page.binding, rawBody: "{" })).status).toBe(400);
    expect((await request({ method: "POST", cookie, binding: page.binding, body: original,
      headers: { "content-type": "text/plain" } })).status).toBe(400);
    expect((await open({ cookie })).page.version).toBe(0);
    for (const file of await files(directory)) {
      const content = await readFile(file, "utf8");
      expect(content).not.toContain("private draft marker");
      expect(content).not.toContain("private source marker");
    }
  });

  it("bounds a streamed body independently of Content-Length", async () => {
    const { cookie, page } = await open();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(9_000));
      controller.enqueue(new Uint8Array(9_000));
      controller.close();
    } });
    const response = await request({ method: "POST", cookie, binding: page.binding, stream,
      headers: { "content-length": "1" } });
    expect(response.status).toBe(413);
    expect((await open({ cookie })).page.version).toBe(0);
  });

  it("refuses a duplicate owner cookie instead of choosing a profile", async () => {
    const first = await open();
    const second = await open();
    const response = await request({ cookie: `${first.cookie}; ${second.cookie}` });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "layout_binding_changed" } });
    expect((await open({ cookie: first.cookie })).page.version).toBe(0);
    expect((await open({ cookie: second.cookie })).page.version).toBe(0);
  });

  it("rechecks lifetime after receiving a delayed body before it creates a revision", async () => {
    const { cookie, page } = await open();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const pending = request({ method: "POST", cookie, binding: page.binding, stream });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(page.expiresAt) + 1);
    controller.enqueue(new TextEncoder().encode(JSON.stringify(saveInput())));
    controller.close();
    const response = await pending;
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "layout_binding_changed" } });
    expect((await files(directory)).some(path => path.split("/").at(-1)?.startsWith("layout-"))).toBe(false);
  });

  it("cancels a stalled request body without writing a revision", async () => {
    const { cookie, page } = await open();
    const signal = new AbortController();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const pending = request({ method: "POST", cookie, binding: page.binding, stream, signal: signal.signal });
    signal.abort();
    const response = await pending;
    expect(response.status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
    expect((await open({ cookie })).page.version).toBe(0);
  });

  it("refuses an already cancelled request even when its complete body is available", async () => {
    const { cookie, page } = await open();
    const controller = new AbortController();
    controller.abort();
    const response = await request({ method: "POST", cookie, binding: page.binding,
      body: saveInput(), signal: controller.signal });
    expect(response.status).toBe(408);
    expect((await open({ cookie })).page.version).toBe(0);
  });

  it("reopens persisted layout and exact receipts after module state is discarded", async () => {
    const { cookie, page } = await open();
    const body = saveInput();
    const first = await request({ method: "POST", cookie, binding: page.binding, body });
    expect(first.status).toBe(200);
    const receipt = await first.json() as Page;
    vi.resetModules();
    const { workbenchLayoutReviewAPI: restarted } = await import("../../Web/lib/workbench/review-layout-api.js");
    expect((await open({ cookie, api: restarted })).page).toEqual(receipt);
    const replay = await request({ method: "POST", cookie, binding: page.binding, body, api: restarted });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ...receipt, replayed: true });
  });

  it("keeps prior receipts at the revision limit and does not extend the profile expiry", async () => {
    const { cookie, page } = await open();
    const original = saveInput();
    for (let version = 0; version < layoutRevisionLimit; version++) {
      const body = version === 0 ? original : saveInput(version, version % 2 === 0 ? moved : movedAgain);
      const response = await request({ method: "POST", cookie, binding: page.binding, body });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ version: version + 1, expiresAt: page.expiresAt });
    }
    const full = await request({ method: "POST", cookie, binding: page.binding, body: saveInput(layoutRevisionLimit) });
    expect(full.status).toBe(429);
    expect(await full.json()).toMatchObject({ error: { code: "layout_capacity" } });
    const replay = await request({ method: "POST", cookie, binding: page.binding, body: original });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ version: 1, board: moved, replayed: true });
    expect((await open({ cookie })).page.version).toBe(layoutRevisionLimit);
  }, 15_000);

  it("does not evict live profiles at capacity and only reclaims an expired profile with new identity", async () => {
    const first = await open();
    const body = saveInput();
    expect((await request({ method: "POST", cookie: first.cookie, binding: first.page.binding, body })).status).toBe(200);
    for (let index = 1; index < 32; index++) await open();
    const full = await request();
    expect(full.status).toBe(429);
    expect(await full.json()).toMatchObject({ error: { code: "layout_capacity" } });
    const replay = await request({ method: "POST", cookie: first.cookie, binding: first.page.binding, body });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ version: 1, replayed: true, board: moved });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(first.page.expiresAt) + 1);
    const replacement = await open();
    expect(replacement.page).toMatchObject({ version: 0, board: null });
    expect(replacement.cookie).not.toBe(first.cookie);
    expect(replacement.page.binding).not.toBe(first.page.binding);
    expect((await request({ method: "POST", cookie: first.cookie, binding: first.page.binding, body })).status).toBe(403);
    expect((await files(directory)).some(path => /^layout-.*-01\.json$/.test(basename(path)))).toBe(false);
    expect((await open({ cookie: replacement.cookie })).page.version).toBe(0);
  }, 15_000);

  it.each(["truncated", "duplicate-card", "wrong-project"])("refuses a %s revision on latest read and replay", async kind => {
    const { cookie, page } = await open();
    const body = saveInput();
    expect((await request({ method: "POST", cookie, binding: page.binding, body })).status).toBe(200);
    const revision = (await files(directory)).find(path => /^layout-.*-01\.json$/.test(basename(path)));
    expect(revision).toBeDefined();
    const saved = JSON.parse(await readFile(revision!, "utf8"));
    const corrupted = kind === "truncated" ? "{" : JSON.stringify(kind === "duplicate-card"
      ? { ...saved, board: { ...moved, reference: ["test", "delivery"] } }
      : { ...saved, projectId: "10000000-0000-4000-8000-000000000001" });
    await writeFile(revision!, corrupted);
    for (const response of [await request({ cookie }),
      await request({ method: "POST", cookie, binding: page.binding, body })]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "layout_unavailable" } });
    }
    expect(await readFile(revision!, "utf8")).toBe(corrupted);
  });

  it("refuses a missing earlier revision instead of treating a later snapshot as complete", async () => {
    const { cookie, page } = await open();
    expect((await request({ method: "POST", cookie, binding: page.binding, body: saveInput() })).status).toBe(200);
    expect((await request({ method: "POST", cookie, binding: page.binding, body: saveInput(1, movedAgain) })).status).toBe(200);
    const revision = (await files(directory)).find(path => /^layout-.*-01\.json$/.test(basename(path)));
    expect(revision).toBeDefined();
    await rm(revision!);
    const response = await request({ cookie });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "layout_unavailable" } });
  });

  it("fails closed and preserves evidence when an unknown hard link points to a revision", async () => {
    const { cookie, page } = await open();
    const body = saveInput();
    expect((await request({ method: "POST", cookie, binding: page.binding, body })).status).toBe(200);
    const revision = (await files(directory)).find(path => /^layout-.*-01\.json$/.test(basename(path)));
    expect(revision).toBeDefined();
    const retained = await readFile(revision!, "utf8");
    const stage = join(directory, `.layout-${randomUUID()}.tmp`);
    await link(revision!, stage);
    for (const response of [await request({ cookie }),
      await request({ method: "POST", cookie, binding: page.binding, body })]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "layout_unavailable" } });
    }
    expect(await readFile(revision!, "utf8")).toBe(retained);
    expect(await readFile(stage, "utf8")).toBe(retained);
  });

  it("recovers latest layout and exact replay when only the recognized publication aliases remain", async () => {
    const { cookie, page } = await open();
    const body = saveInput();
    const response = await request({ method: "POST", cookie, binding: page.binding, body });
    expect(response.status).toBe(200);
    const receipt = await response.json() as Page;
    const published = await files(directory);
    expect(published).toHaveLength(2);
    for (const path of published) {
      const value = JSON.parse(await readFile(path, "utf8"));
      expect(value.publicationId).toMatch(/^[a-f0-9-]{36}$/);
      await link(path, join(directory, `.layout-${value.publicationId}.tmp`));
    }
    expect((await open({ cookie })).page).toEqual(receipt);
    const replay = await request({ method: "POST", cookie, binding: page.binding, body });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ...receipt, replayed: true });
    expect((await open({ cookie })).page.version).toBe(1);
  });

  it("refuses expired bindings and cannot use one to overwrite a fresh profile", async () => {
    const { cookie, page } = await open();
    const body = saveInput();
    expect((await request({ method: "POST", cookie, binding: page.binding, body })).status).toBe(200);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(page.expiresAt) + 1);
    const expired = await request({ method: "POST", cookie, binding: page.binding, body });
    expect(expired.status).toBe(403);
    expect(await expired.json()).toMatchObject({ error: { code: "layout_binding_changed" } });
    const fresh = await open();
    expect(fresh.page).toMatchObject({ board: null, version: 0 });
    expect(fresh.cookie).not.toBe(cookie);
    expect(fresh.page.binding).not.toBe(page.binding);
    expect((await request({ method: "POST", cookie: fresh.cookie, binding: page.binding, body })).status).toBe(403);
    expect((await open({ cookie: fresh.cookie })).page.version).toBe(0);
  });

  it("refuses unsafe storage paths without exposing paths or changing unrelated files", async () => {
    const outside = join(root, "unrelated");
    await mkdir(outside, { mode: 0o700 });
    const marker = join(outside, "keep.txt");
    await writeFile(marker, "synthetic preservation marker", { mode: 0o600 });
    const alias = join(root, "alias");
    await symlink(outside, alias);
    vi.stubEnv("BOB_WORKBENCH_LAYOUT_REVIEW_DIRECTORY", alias);
    const response = await request();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("layout_unavailable");
    expect(body).not.toContain(root);
    expect(body).not.toContain("synthetic preservation marker");
    expect(await readdir(outside)).toEqual(["keep.txt"]);
    expect(await readFile(marker, "utf8")).toBe("synthetic preservation marker");
  });

  it("refuses storage readable by another account", async () => {
    await chmod(directory, 0o750);
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "layout_unavailable" } });
    expect(await readdir(directory)).toEqual([]);
  });
});
