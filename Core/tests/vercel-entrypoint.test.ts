import { afterEach, describe, expect, it, vi } from "vitest";

const DEVICE_TOKEN =
  "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789";
const READ_TOKEN = "web-read-token-abcdefghijklmnopqrstuvwxyz-0123456789";

const { sqlMock, neonMock } = vi.hoisted(() => {
  const sqlMock = vi.fn(async () => [{ "?column?": 1 }]);
  const neonMock = vi.fn(() => sqlMock);
  return { sqlMock, neonMock };
});

vi.mock("@neondatabase/serverless", () => ({
  neon: neonMock,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  sqlMock.mockClear();
  neonMock.mockClear();
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
      version: "0.2.0",
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

  it("preserves the read-only credential gateway on the production wrapper", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "OPENAI_API_KEY",
      "test-openai-api-key-not-used-in-entrypoint-test",
    );
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://user:password@example.com/bobai",
    );
    vi.stubEnv("BOB_CORE_OWNER_ID", "rick");
    vi.stubEnv("BOB_CORE_MEMORY_ENABLED", "false");
    vi.stubEnv("BOB_CORE_SHARED_CONTEXT_ENABLED", "false");
    vi.stubEnv("BOB_CORE_DEVICE_TOKEN", DEVICE_TOKEN);

    const { default: app } = await import("../index.js");
    const response = await app.fetch(
      new Request("https://bob-core.test/v1/status", {
        headers: {
          authorization: `Bearer ${READ_TOKEN}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(neonMock).toHaveBeenCalledOnce();
    expect(sqlMock).toHaveBeenCalledOnce();
  });
});
