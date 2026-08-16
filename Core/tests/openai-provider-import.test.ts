import { describe, expect, it } from "vitest";

import { OpenAIResponsesProvider } from "../src/ai/openai-provider.js";
import { ZAIChatCompletionsProvider } from "../src/ai/zai-provider.js";
import { createTestConfig } from "./test-config.js";

describe("AI SDK provider imports", () => {
  it("constructs the OpenAI provider without module namespace errors", () => {
    expect(() =>
      new OpenAIResponsesProvider(
        createTestConfig({
          aiProvider: "openai",
          aiAPIKey: "test-openai-api-key-not-used-for-network-calls",
          aiModel: "test-model",
          aiBaseURL: undefined,
        }),
      ),
    ).not.toThrow();
  });

  it("constructs the Z.AI provider with the compatible base URL", () => {
    expect(() =>
      new ZAIChatCompletionsProvider(
        createTestConfig({
          aiProvider: "zai",
          aiAPIKey: "test-zai-api-key-not-used-for-network-calls",
          aiModel: "glm-4.7-flash",
          aiBaseURL: "https://api.z.ai/api/paas/v4",
        }),
      ),
    ).not.toThrow();
  });
});
