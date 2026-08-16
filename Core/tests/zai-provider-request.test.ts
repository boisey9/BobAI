import { describe, expect, it, vi } from "vitest";

import { ZAIChatCompletionsProvider } from "../src/ai/zai-provider.js";
import type { BobCoreConfig } from "../src/config.js";

const config: BobCoreConfig = {
  nodeEnvironment: "test",
  port: 8_787,
  aiProvider: "zai",
  aiAPIKey: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
  aiModel: "glm-4.7-flash",
  aiBaseURL: "https://api.z.ai/api/paas/v4",
  databaseURL: undefined,
  ownerId: "rick",
  memoryEnabled: false,
  memoryRetrievalLimit: 6,
  deviceToken: "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789",
  maxOutputTokens: 700,
};

describe("Z.AI provider request", () => {
  it("sends Bob instructions and conversation through Chat Completions", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "I'm Bob, running through GLM.",
          },
        },
      ],
    });
    const provider = new ZAIChatCompletionsProvider(config);

    Object.defineProperty(provider, "client", {
      value: {
        chat: {
          completions: { create },
        },
      },
    });

    const result = await provider.generate([
      { role: "user", content: "Who are you?" },
    ]);

    expect(result).toEqual({
      text: "I'm Bob, running through GLM.",
      model: "glm-4.7-flash",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "glm-4.7-flash",
        max_tokens: 700,
        stream: false,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          { role: "user", content: "Who are you?" },
        ]),
      }),
    );
  });
});
