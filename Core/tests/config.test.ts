import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { TEST_DEVICE_TOKEN } from "./test-config.js";

describe("Bob Core provider, memory, and shared context configuration", () => {
  it("defaults Z.AI to the free GLM-4.7-Flash model", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      AI_PROVIDER: "zai",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    });

    expect(config).toMatchObject({
      aiProvider: "zai",
      aiModel: "glm-4.7-flash",
      aiBaseURL: "https://api.z.ai/api/paas/v4",
      memoryEnabled: false,
      sharedContextEnabled: false,
      databaseURL: undefined,
      ownerId: "rick",
      memoryRetrievalLimit: 6,
    });
  });

  it("automatically selects Z.AI when only ZAI_API_KEY is supplied", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      ZAI_MODEL: "glm-4.5-flash",
      BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    });

    expect(config.aiProvider).toBe("zai");
    expect(config.aiModel).toBe("glm-4.5-flash");
  });

  it("keeps the existing OpenAI environment variables compatible", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-openai-api-key-abcdefghijklmnopqrstuvwxyz",
      OPENAI_MODEL: "gpt-5-mini",
      BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    });

    expect(config).toMatchObject({
      aiProvider: "openai",
      aiModel: "gpt-5-mini",
      aiBaseURL: undefined,
    });
  });

  it("automatically enables memory when DATABASE_URL is present", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      DATABASE_URL:
        "postgresql://user:password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
      BOB_CORE_OWNER_ID: "rick-private",
      BOB_CORE_MEMORY_RETRIEVAL_LIMIT: "4",
      BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    });

    expect(config).toMatchObject({
      memoryEnabled: true,
      sharedContextEnabled: false,
      ownerId: "rick-private",
      memoryRetrievalLimit: 4,
    });
  });

  it("allows memory to be explicitly disabled during deployment", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      DATABASE_URL:
        "postgresql://user:password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
      BOB_CORE_MEMORY_ENABLED: "false",
      BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    });

    expect(config.memoryEnabled).toBe(false);
  });

  it("keeps shared context opt-in even when memory is configured", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      DATABASE_URL:
        "postgresql://user:password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
      BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    });

    expect(config.sharedContextEnabled).toBe(false);
  });

  it("enables shared context only when explicitly requested with a database", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
      DATABASE_URL:
        "postgresql://user:password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
      BOB_CORE_SHARED_CONTEXT_ENABLED: "true",
      BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
    });

    expect(config.sharedContextEnabled).toBe(true);
  });

  it("rejects enabled memory without a database connection", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
        BOB_CORE_MEMORY_ENABLED: "true",
        BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
      }),
    ).toThrow("DATABASE_URL");
  });

  it("rejects enabled shared context without a database connection", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        ZAI_API_KEY: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
        BOB_CORE_SHARED_CONTEXT_ENABLED: "true",
        BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
      }),
    ).toThrow("DATABASE_URL");
  });

  it("rejects a selected provider without its API key", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        AI_PROVIDER: "zai",
        BOB_CORE_DEVICE_TOKEN: TEST_DEVICE_TOKEN,
      }),
    ).toThrow("ZAI_API_KEY or AI_API_KEY");
  });
});
