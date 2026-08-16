import { describe, expect, it } from "vitest";

import { OpenAIResponsesProvider } from "../src/ai/openai-provider.js";
import { createAIProvider } from "../src/ai/provider-factory.js";
import { ZAIChatCompletionsProvider } from "../src/ai/zai-provider.js";
import { createTestConfig } from "./test-config.js";

describe("AI provider factory", () => {
  it("selects Z.AI for the GLM configuration", () => {
    const provider = createAIProvider(
      createTestConfig({
        aiProvider: "zai",
        aiAPIKey: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
        aiModel: "glm-4.7-flash",
        aiBaseURL: "https://api.z.ai/api/paas/v4",
      }),
    );

    expect(provider).toBeInstanceOf(ZAIChatCompletionsProvider);
  });

  it("retains the OpenAI fallback", () => {
    const provider = createAIProvider(
      createTestConfig({
        aiProvider: "openai",
        aiAPIKey: "test-openai-api-key-abcdefghijklmnopqrstuvwxyz",
        aiModel: "gpt-5-mini",
        aiBaseURL: undefined,
      }),
    );

    expect(provider).toBeInstanceOf(OpenAIResponsesProvider);
  });
});
