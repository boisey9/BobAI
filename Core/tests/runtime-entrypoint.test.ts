import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { createBobCoreRuntime } from "../src/runtime.js";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.js";
import { createOAuthGateway } from "../src/security/oauth.js";
import { privateWorkflowRuntime } from "../src/workflow/private-runtime.js";
import { createTestConfig } from "./test-config.js";

vi.mock("../src/config.js", () => ({ loadConfig: vi.fn() }));
vi.mock("../src/runtime.js", () => ({ createBobCoreRuntime: vi.fn() }));
vi.mock("../src/security/interface-credential.js", () => ({ createInterfaceCredentialGateway: vi.fn() }));
vi.mock("../src/security/oauth.js", () => ({ createOAuthGateway: vi.fn() }));
vi.mock("../src/workflow/private-runtime.js", () => ({ privateWorkflowRuntime: vi.fn() }));

beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); });

describe("preserved Vercel and private runtime entrypoints", () => {
  it("forwards normal root-entrypoint requests through the OAuth and interface gateways", async () => {
    const seen: string[] = [];
    const app = new Hono<{ Variables: { requestId: string } }>();
    app.get("/probe", c => { seen.push("app"); return c.json({ ok: true }); });
    vi.mocked(privateWorkflowRuntime).mockReturnValue(null);
    vi.mocked(loadConfig).mockReturnValue(createTestConfig());
    vi.mocked(createBobCoreRuntime).mockReturnValue({ app, memoryService: undefined, sharedContextService: undefined });
    vi.mocked(createInterfaceCredentialGateway).mockImplementation(handler => request => {
      seen.push("interface"); return handler(request);
    });
    vi.mocked(createOAuthGateway).mockImplementation((_handler, compatible) => request => {
      seen.push("oauth"); return compatible(request);
    });
    const { default: entry } = await import("../index.js");
    expect((await entry.fetch(new Request("https://core.test/probe"))).status).toBe(200);
    expect(seen).toEqual(["oauth", "interface", "app"]);
  });

  it("preserves private-runtime isolation without loading ordinary credentials or provider services", async () => {
    const app = new Hono<{ Variables: { requestId: string } }>();
    app.get("/health", c => c.json({ mode: "private-test" }));
    vi.mocked(privateWorkflowRuntime).mockReturnValue(app);
    const { default: entry } = await import("../index.js");
    expect(await (await entry.fetch(new Request("https://core.test/health"))).json()).toEqual({ mode: "private-test" });
    expect((await entry.fetch(new Request("https://core.test/v1/control-center/projects/new"))).status).toBe(404);
    expect(loadConfig).not.toHaveBeenCalled();
    expect(createBobCoreRuntime).not.toHaveBeenCalled();
    expect(createOAuthGateway).not.toHaveBeenCalled();
  });

  it("fails closed when private runtime configuration fails instead of entering the normal runtime", async () => {
    vi.mocked(privateWorkflowRuntime).mockImplementation(() => { throw Error("private_runtime_unconfigured"); });
    await expect(import("../index.js")).rejects.toThrow("private_runtime_unconfigured");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(createBobCoreRuntime).not.toHaveBeenCalled();
  });
});
