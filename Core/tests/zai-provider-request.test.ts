import { describe, expect, it, vi } from "vitest";

import { ZAIChatCompletionsProvider } from "../src/ai/zai-provider.js";
import { createTestConfig } from "./test-config.js";

const config = createTestConfig({
  aiProvider: "zai",
  aiAPIKey: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
  aiModel: "glm-4.7-flash",
  aiBaseURL: "https://api.z.ai/api/paas/v4",
});

describe("Z.AI provider request", () => {
  it("sends Bob instructions, approved memory, and conversation through Chat Completions", async () => {
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

    const result = await provider.generate(
      [{ role: "user", content: "Who are you?" }],
      {
        memoryContext: JSON.stringify([
          { content: "I prefer to be called Rick." },
        ]),
      },
    );

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
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining(
              "I prefer to be called Rick.",
            ),
          }),
          { role: "user", content: "Who are you?" },
        ]),
      }),
    );
  });
});
