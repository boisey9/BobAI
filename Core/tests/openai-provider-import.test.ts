import { describe, expect, it } from "vitest";

import { OpenAIResponsesProvider } from "../src/ai/openai-provider.js";
import type { BobCoreConfig } from "../src/config.js";

const config: BobCoreConfig = {
  nodeEnvironment: "test",
  port: 8_787,
  openAIAPIKey: "test-openai-api-key-not-used-for-network-calls",
  openAIModel: "test-model",
  deviceToken: "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789",
  maxOutputTokens: 700,
};

describe("OpenAI SDK provider import", () => {
  it("constructs the provider without module namespace errors", () => {
    expect(() => new OpenAIResponsesProvider(config)).not.toThrow();
  });
});
