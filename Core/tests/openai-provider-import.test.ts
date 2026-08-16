import { describe, expect, it } from "vitest";

import { OpenAIResponsesProvider } from "../src/ai/openai-provider.js";
import { ZAIChatCompletionsProvider } from "../src/ai/zai-provider.js";
import type { BobCoreConfig } from "../src/config.js";

const baseConfig: Omit<
  BobCoreConfig,
  "aiProvider" | "aiAPIKey" | "aiModel" | "aiBaseURL"
> = {
  nodeEnvironment: "test",
  port: 8_787,
  deviceToken: "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789",
  maxOutputTokens: 700,
};

describe("AI SDK provider imports", () => {
  it("constructs the OpenAI provider without module namespace errors", () => {
    const config: BobCoreConfig = {
      ...baseConfig,
      aiProvider: "openai",
      aiAPIKey: "test-openai-api-key-not-used-for-network-calls",
      aiModel: "test-model",
      aiBaseURL: undefined,
    };

    expect(() => new OpenAIResponsesProvider(config)).not.toThrow();
  });

  it("constructs the Z.AI provider with the compatible base URL", () => {
    const config: BobCoreConfig = {
      ...baseConfig,
      aiProvider: "zai",
      aiAPIKey: "test-zai-api-key-not-used-for-network-calls",
      aiModel: "glm-4.7-flash",
      aiBaseURL: "https://api.z.ai/api/paas/v4",
    };

    expect(() => new ZAIChatCompletionsProvider(config)).not.toThrow();
  });
});
