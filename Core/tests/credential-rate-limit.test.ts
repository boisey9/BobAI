import { describe, expect, it, vi } from "vitest";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const token = "bobif_rate_limit_test_abcdefghijklmnopqrstuvwxyz0123456789";
const request = (path: string, authorization = token) => new Request(`https://bob.test${path}`, {
  method: path === "/v1/chat" ? "POST" : "GET",
  headers: { authorization: `Bearer ${authorization}`, "x-bob-core-interface-id": "forged" },
});
const verifier = () => ({ id: "real-device", surface: "bobai" as const,
  scopes: ["context:read" as const, "chat:use" as const], projectKey: "bobai" });

describe("per-credential request capacity", () => {
  it("throttles before execution and separates AI from ordinary operations", async () => {
    const downstream = vi.fn(async () => new Response("ok"));
    const limit = vi.fn(async (_hash: string, operation: "core" | "ai") => ({ allowed: operation === "core", retryAfterSeconds: 17 }));
    const gateway = createInterfaceCredentialGateway(downstream, createTestConfig(), async () => verifier(), limit);
    const denied = await gateway(request("/v1/chat"));
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("17");
    expect(downstream).not.toHaveBeenCalled();
    expect((await gateway(request("/v1/context?project=bobai"))).status).toBe(200);
    expect(downstream).toHaveBeenCalledOnce();
    expect(limit.mock.calls[0]?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(limit.mock.calls[0]?.[0]).not.toContain(token);
    expect(limit.mock.calls[0]?.[0]).toBe(limit.mock.calls[1]?.[0]);
  });
  it("checks primary access and gives distinct credentials distinct buckets", async () => {
    const limit = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 }));
    const gateway = createInterfaceCredentialGateway(async () => new Response("ok"), createTestConfig(), async () => verifier(), limit);
    await gateway(request("/v1/context", token));
    await gateway(request("/mcp", TEST_DEVICE_TOKEN));
    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit.mock.calls[0]).not.toEqual(limit.mock.calls[1]);
  });
  it("does not consume capacity for invalid credentials or forbidden resources", async () => {
    const limit = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 }));
    const gateway = createInterfaceCredentialGateway(async () => new Response("unauthorized", { status: 401 }), createTestConfig(), async () => null, limit);
    expect((await gateway(request("/v1/context"))).status).toBe(401);
    expect(limit).not.toHaveBeenCalled();
    const scoped = createInterfaceCredentialGateway(async () => new Response("ok"), createTestConfig(), async () => verifier(), limit);
    expect((await scoped(request("/v1/context?project=personal"))).status).toBe(403);
    expect(limit).not.toHaveBeenCalled();
  });
  it("returns a recoverable error without executing a mutation if capacity storage fails", async () => {
    const downstream = vi.fn(async () => new Response("ok"));
    const gateway = createInterfaceCredentialGateway(downstream, createTestConfig(), async () => verifier(), async () => { throw new Error("database secret diagnostics"); });
    const response = await gateway(request("/v1/context"));
    expect(response.status).toBe(503);
    expect((await response.text())).not.toContain("secret diagnostics");
    expect(downstream).not.toHaveBeenCalled();
  });
});
