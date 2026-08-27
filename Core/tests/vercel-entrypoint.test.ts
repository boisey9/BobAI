import { afterEach, describe, expect, it, vi } from "vitest";

const DEVICE_TOKEN =
  "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789";
const INTERFACE_TOKEN =
  "bobif_web_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrst";
const LEGACY_READ_TOKEN =
  "web-read-token-abcdefghijklmnopqrstuvwxyz-0123456789";

const { sqlMock, neonMock } = vi.hoisted(() => {
  const sqlMock = vi.fn();
  const neonMock = vi.fn(() => sqlMock);
  return { sqlMock, neonMock };
});

vi.mock("@neondatabase/serverless", () => ({
  neon: neonMock,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  sqlMock.mockReset();
  neonMock.mockClear();
});

function stubDatabaseEnvironment() {
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
}

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

  it("preserves scoped interface credentials on the production wrapper", async () => {
    stubDatabaseEnvironment();
    sqlMock.mockResolvedValueOnce([
      {
        project_key: "bobai",
        credential: {
          id: "control-center-bobai",
          surface: "web",
          scopes: ["status:read"],
          enabled: true,
        },
      },
    ]);

    const { default: app } = await import("../index.js");
    const response = await app.fetch(
      new Request("https://bob-core.test/v1/status", {
        headers: {
          authorization: `Bearer ${INTERFACE_TOKEN}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(neonMock).toHaveBeenCalledTimes(3);
    expect(sqlMock).toHaveBeenCalledOnce();
  });

  it("preserves two-way sync credentials on the production wrapper", async () => {
    stubDatabaseEnvironment();
    sqlMock.mockResolvedValueOnce([
      {
        project_key: "bobai",
        credential: {
          id: "copilot-bobai",
          surface: "copilot",
          scopes: [
            "mcp:sync",
            "mcp:context:read",
            "mcp:event:write",
            "mcp:task:write",
            "mcp:decision:propose",
          ],
          enabled: true,
        },
      },
    ]);

    const { default: app } = await import("../index.js");
    const response = await app.fetch(
      new Request("https://bob-core.test/mcp/sync", {
        method: "POST",
        headers: {
          authorization: `Bearer ${INTERFACE_TOKEN}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "shared_context_not_configured" },
    });
    expect(sqlMock).toHaveBeenCalledOnce();
  });

  it("keeps legacy Control Center read hashes compatible", async () => {
    stubDatabaseEnvironment();
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ "?column?": 1 }]);

    const { default: app } = await import("../index.js");
    const response = await app.fetch(
      new Request("https://bob-core.test/v1/status", {
        headers: {
          authorization: `Bearer ${LEGACY_READ_TOKEN}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
