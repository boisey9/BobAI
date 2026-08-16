import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const DEVICE_TOKEN =
  "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789";

describe("Bob Core provider configuration", () => {
  it("defaults Z.AI to the free GLM-4.7-Flash model", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      AI_PROVIDER: "zai",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      BOB_CORE_DEVICE_TOKEN: DEVICE_TOKEN,
    });

    expect(config).toMatchObject({
      aiProvider: "zai",
      aiModel: "glm-4.7-flash",
      aiBaseURL: "https://api.z.ai/api/paas/v4",
    });
  });

  it("automatically selects Z.AI when only ZAI_API_KEY is supplied", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      ZAI_MODEL: "glm-4.5-flash",
      BOB_CORE_DEVICE_TOKEN: DEVICE_TOKEN,
    });

    expect(config.aiProvider).toBe("zai");
    expect(config.aiModel).toBe("glm-4.5-flash");
  });

  it("keeps the existing OpenAI environment variables compatible", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-openai-api-key-abcdefghijklmnopqrstuvwxyz",
      OPENAI_MODEL: "gpt-5-mini",
      BOB_CORE_DEVICE_TOKEN: DEVICE_TOKEN,
    });

    expect(config).toMatchObject({
      aiProvider: "openai",
      aiModel: "gpt-5-mini",
      aiBaseURL: undefined,
    });
  });

  it("rejects a selected provider without its API key", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        AI_PROVIDER: "zai",
        BOB_CORE_DEVICE_TOKEN: DEVICE_TOKEN,
      }),
    ).toThrow("ZAI_API_KEY or AI_API_KEY");
  });
});
