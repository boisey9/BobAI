import { EventEmitter } from "node:events";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "../../Web/node_modules/better-auth/dist/index.mjs";

const seams = vi.hoisted(() => ({ pool: null, profile: null, setupError: null }));
vi.mock("../../Web/node_modules/@neondatabase/serverless/index.mjs", () => ({
  neonConfig: {}, Pool: class { constructor() { if (seams.setupError) throw seams.setupError; return seams.pool; } },
}));
vi.mock("../src/workflow/hosted-profile", () => ({
  hostedProfile: vi.fn(() => seams.profile), hostedSecret: vi.fn(() => "synthetic-hosted-password"),
}));
vi.mock("../src/workflow/hosted-database", () => ({ createHostedPool: vi.fn(() => seams.pool) }));
import { createHostedPool } from "../src/workflow/hosted-database";
import { createOwnerAuth, ownerAuthOptions, withOwnerDatabase } from "../../Web/lib/owner-auth";
import { GET as authRoute } from "../../Web/app/api/auth/[...all]/route";

const privateMessage = "synthetic-private-value-query-and-password";
const failure = () => Object.assign(new Error(privateMessage), {
  code: "57P01", client: { password: privateMessage }, query: privateMessage,
  parameters: [privateMessage], cause: new Error(privateMessage),
});
function poolFixture() {
  const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
  const pool = Object.assign(new EventEmitter(), {
    connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    end: vi.fn(async () => {}), totalCount: 0,
  });
  seams.pool = pool;
  return { pool, client };
}
beforeEach(() => {
  vi.stubEnv("BOB_AUTH_BASE_URL", "https://owner.example");
  vi.stubEnv("BOB_AUTH_ENABLED", "true");
  vi.stubEnv("BOB_AUTH_SECRET", "synthetic-owner-auth-secret-0000000000000");
  vi.stubEnv("BOB_AUTH_OWNER_EMAIL", "owner@example.test");
  vi.stubEnv("BOB_AUTH_DATABASE_URL", "postgresql://synthetic@unused.invalid/test");
  vi.stubEnv("BOB_AUTH_OAUTH_ENABLED", "false");
  vi.stubEnv("BOB_AUTH_PASSWORD_LOGIN_ENABLED", "false");
  vi.stubEnv("BOB_LOCAL_REAL_AUTH_FIXTURE", "false");
  vi.stubEnv("NODE_ENV", "production");
  seams.profile = null; seams.setupError = null; poolFixture();
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Unexpected network access"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("reconciled owner authentication privacy and preserved configuration", () => {
  it("keeps owner-only, fresh database sessions, secure cookies and password gating", async () => {
    const options = ownerAuthOptions(seams.pool);
    expect(options.trustedOrigins).toEqual(["https://owner.example"]);
    expect(options.session.cookieCache.enabled).toBe(false);
    expect(options.session.expiresIn).toBe(43200);
    expect(options.emailAndPassword).toMatchObject({ enabled: false, disableSignUp: true });
    expect(options.advanced.useSecureCookies).toBe(true);
    expect(options.rateLimit.storage).toBe("database");
    expect(await options.databaseHooks.user.create.before({ email: "outsider@example.test" })).toBe(false);
    expect(ownerAuthOptions(seams.pool, true).emailAndPassword).toMatchObject({ enabled: true, disableSignUp: false });
  });

  it("preserves HTTPS enforcement and the explicitly guarded local fixture exception", () => {
    vi.stubEnv("BOB_AUTH_BASE_URL", "http://127.0.0.1:3430");
    expect(() => ownerAuthOptions(seams.pool)).toThrow(/HTTPS/);
    vi.stubEnv("BOB_LOCAL_REAL_AUTH_FIXTURE", "true");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BOB_LOCAL_WORKFLOW_TEST_SOCKET", "/tmp/bob-workflow-pg-synthetic");
    vi.stubEnv("BOB_AUTH_DATABASE_URL", "postgresql://bob_workflow_test_admin@bob-workflow-auth-fixture.invalid/postgres");
    expect(ownerAuthOptions(seams.pool).advanced.useSecureCookies).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(() => ownerAuthOptions(seams.pool)).toThrow(/isolated_real_auth/);
  });

  it.each(["connect", "query", "end", "client-query", "release"])("sanitizes %s errors before the adapter can log them", async (method) => {
    const { pool, client } = poolFixture();
    const raw = failure();
    if (method === "client-query") client.query.mockRejectedValue(raw);
    else if (method === "release") client.release.mockImplementation(() => { throw raw; });
    else pool[method].mockRejectedValue(raw);
    const database = ownerAuthOptions(pool).database;
    const action = async () => {
      if (method === "client-query") return (await database.connect()).query("SELECT synthetic");
      if (method === "release") return (await database.connect()).release();
      return database[method]();
    };
    const error = await action().catch(value => value);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Owner authentication is temporarily unavailable.");
    expect(error.code).toBe("57P01");
    expect(inspect(error, { depth: 8 })).not.toContain(privateMessage);
    for (const key of ["cause", "client", "query", "parameters"]) expect(error[key]).toBeUndefined();
  });

  it("drops unsafe codes and does not inspect a throwing error property", async () => {
    for (const raw of [{ code: privateMessage }, { get code() { throw failure(); } }]) {
      seams.pool.connect.mockRejectedValue(raw);
      const error = await ownerAuthOptions(seams.pool).database.connect().catch(value => value);
      expect(error.message).toBe("Owner authentication is temporarily unavailable.");
      expect(error.code).toBeUndefined();
    }
  });

  it("preserves successful results, receiver binding and request-scoped disposal", async () => {
    const { pool, client } = poolFixture();
    pool.query.mockImplementation(async function () { expect(this).toBe(pool); return { rows: [{ ok: true }] }; });
    const wrapped = ownerAuthOptions(pool).database;
    wrapped.on("synthetic", () => {});
    expect(pool.listenerCount("synthetic")).toBe(1);
    expect(await withOwnerDatabase(async database => {
      const connection = await database.connect(); connection.release();
      return database.query("SELECT synthetic");
    })).toEqual({ rows: [{ ok: true }] });
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it.each(["construction", "work", "disposal"])("contains %s failures at the outer request boundary", async phase => {
    if (phase === "construction") seams.setupError = failure();
    if (phase === "disposal") seams.pool.end.mockRejectedValue(failure());
    const error = await withOwnerDatabase(async () => {
      if (phase === "work") throw failure();
      return "done";
    }).catch(value => value);
    expect(error.message).toBe("Owner authentication is temporarily unavailable.");
    expect(inspect(error, { depth: 8 })).not.toContain(privateMessage);
    expect(seams.pool.end).toHaveBeenCalledTimes(phase === "construction" ? 0 : 1);
  });

  it("retains the hosted identity-bound pool path", async () => {
    seams.profile = { auth: { host: "synthetic.invalid", database: "synthetic", role: "synthetic_auth" } };
    expect(await withOwnerDatabase(async () => "ok")).toBe("ok");
    expect(createHostedPool).toHaveBeenCalledWith(seams.profile.auth, "synthetic-hosted-password");
  });

  it("keeps real Better Auth adapter failures private and preserves API error status", async () => {
    const { client } = poolFixture();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    seams.pool.connect.mockRejectedValue(failure());
    const auth = createOwnerAuth(seams.pool);
    const context = await auth.$context;
    await expect(context.adapter.findOne({ model: "user", where: [{ field: "id", value: "synthetic" }] }))
      .rejects.toThrow("Owner authentication is temporarily unavailable.");
    seams.pool.connect.mockResolvedValue(client);
    const options = ownerAuthOptions(seams.pool);
    expect(options.advanced.database?.validateSchema).not.toBe(false);
    // Only this status-compatibility probe omits schema introspection: its pool
    // is a query stub with no tables. Runtime options retain schema validation.
    const statusProbe = betterAuth({ ...options, advanced: { ...options.advanced, database: { validateSchema: false } } });
    const response = await statusProbe.handler(new Request("https://owner.example/api/auth/sign-in/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://foreign.invalid" },
      body: JSON.stringify({ email: "owner@example.test", password: privateMessage }),
    }));
    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.code).toBe("EMAIL_PASSWORD_DISABLED");
    expect(JSON.stringify(responseBody)).not.toContain(privateMessage);
    expect(inspect([...errors.mock.calls, ...warnings.mock.calls], { depth: 10 })).not.toContain(privateMessage);
    expect(ownerAuthOptions(seams.pool).onAPIError.throw).toBe(true);
  });

  it("contains a real auth-router database failure in the existing private 503 response", async () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    seams.pool.connect.mockRejectedValue(failure());
    const response = await authRoute(new Request("https://owner.example/api/auth/ok", {
      headers: { "x-forwarded-for": "192.0.2.1" },
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(privateMessage);
    expect(inspect(output.mock.calls, { depth: 10 })).not.toContain(privateMessage);
    expect(seams.pool.end).toHaveBeenCalledTimes(1);
    const logger = ownerAuthOptions(seams.pool).logger;
    logger.log("error", privateMessage, failure());
    expect(output).toHaveBeenLastCalledWith("Owner authentication diagnostic.");
    output.mockImplementation(() => { throw failure(); });
    expect(() => logger.log("error", privateMessage, failure())).not.toThrow();
  });
});
