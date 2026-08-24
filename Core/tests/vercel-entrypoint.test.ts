import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const READ_TOKEN = "web-read-token-abcdefghijklmnopqrstuvwxyz-0123456789";
const DEVICE_TOKEN = "device-token-abcdefghijklmnopqrstuvwxyz-0123456789";

const { sqlMock, neonMock } = vi.hoisted(() => {
  const sqlMock = vi.fn(async () => [{ "?column?": 1 }]);
  const neonMock = vi.fn(() => sqlMock);
  return { sqlMock, neonMock };
});

vi.mock("@neondatabase/serverless", () => ({
  neon: neonMock,
}));

const originalEnvironment = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  sqlMock.mockClear();
  neonMock.mockClear();

  process.env = {
    ...originalEnvironment,
    NODE_ENV: "test",
    AI_API_KEY: "test-ai-key-abcdefghijklmnopqrstuvwxyz",
    DATABASE_URL: "postgresql://user:password@example.com/bobai",
    BOB_CORE_OWNER_ID: "rick",
    BOB_CORE_MEMORY_ENABLED: "false",
    BOB_CORE_SHARED_CONTEXT_ENABLED: "false",
    BOB_CORE_DEVICE_TOKEN: DEVICE_TOKEN,
  };
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("Vercel Bob Core entrypoint", () => {
  it("preserves the read-only credential gateway on the production wrapper", async () => {
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
