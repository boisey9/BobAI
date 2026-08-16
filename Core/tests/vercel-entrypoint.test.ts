import { afterEach, describe, expect, it, vi } from "vitest";

const DEVICE_TOKEN =
  "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Vercel Hono entrypoint", () => {
  it("mounts Bob Core routes at the deployment root", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "OPENAI_API_KEY",
      "test-openai-api-key-not-used-in-entrypoint-test",
    );
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("BOB_CORE_DEVICE_TOKEN", DEVICE_TOKEN);

    const { default: app } = await import("../index.js");
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "bob-core",
      version: "0.1.0",
    });
  });

  it("selects the free Z.AI GLM provider from environment settings", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "zai");
    vi.stubEnv("ZAI_API_KEY", "test-zai-api-key-not-used-in-entrypoint-test");
    vi.stubEnv("ZAI_MODEL", "glm-4.7-flash");
    vi.stubEnv("BOB_CORE_DEVICE_TOKEN", DEVICE_TOKEN);

    const { default: app } = await import("../index.js");
    const response = await app.request("/v1/status", {
      headers: {
        authorization: `Bearer ${DEVICE_TOKEN}`,
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "zai",
      model: "glm-4.7-flash",
    });
  });
});
