import { describe, expect, it, vi } from "vitest";

import { ZAIChatCompletionsProvider } from "../src/ai/zai-provider.js";
import { createTestConfig } from "./test-config.js";

const config = createTestConfig({
  aiProvider: "zai",
  aiAPIKey: "test-zai-api-key-abcdefghijklmnopqrstuvwxyz",
  aiModel: "glm-4.7-flash",
  aiBaseURL: "https://api.z.ai/api/paas/v4",
});

function installCreateMock(
  provider: ZAIChatCompletionsProvider,
  create: ReturnType<typeof vi.fn>,
) {
  Object.defineProperty(provider, "client", {
    value: {
      chat: {
        completions: { create },
      },
    },
  });
}

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
    installCreateMock(provider, create);

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
    expect(create).toHaveBeenCalledTimes(1);
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

  it("falls back to the alternate free model when the primary model is busy", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce({
        name: "APIError",
        response: {
          status: 429,
          error: {
            code: 1312,
            message: "High traffic",
          },
        },
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Fallback Bob is online.",
            },
          },
        ],
      });
    const provider = new ZAIChatCompletionsProvider(config);
    installCreateMock(provider, create);

    const result = await provider.generate([
      { role: "user", content: "Hello Bob" },
    ]);

    expect(result).toEqual({
      text: "Fallback Bob is online.",
      model: "glm-4.5-flash",
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "glm-4.7-flash",
    });
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      model: "glm-4.5-flash",
    });
  });

  it("falls back when Z.AI reports an overloaded service", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce({
        name: "APIError",
        status: 503,
        error: {
          code: 1305,
          message: "System overloaded",
        },
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Alternate model recovered the reply.",
            },
          },
        ],
      });
    const provider = new ZAIChatCompletionsProvider(config);
    installCreateMock(provider, create);

    const result = await provider.generate([
      { role: "user", content: "Are you there?" },
    ]);

    expect(result).toEqual({
      text: "Alternate model recovered the reply.",
      model: "glm-4.5-flash",
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not hide authentication failures behind model fallback", async () => {
    const create = vi.fn().mockRejectedValue({
      name: "AuthenticationError",
      status: 401,
      code: "invalid_api_key",
    });
    const provider = new ZAIChatCompletionsProvider(config);
    installCreateMock(provider, create);

    await expect(
      provider.generate([
        { role: "user", content: "Hello Bob" },
      ]),
    ).rejects.toMatchObject({
      name: "AuthenticationError",
      status: 401,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not hide allowance exhaustion behind model fallback", async () => {
    const create = vi.fn().mockRejectedValue({
      name: "RateLimitError",
      status: 429,
      error: {
        code: 1316,
        message: "Package exhausted",
      },
    });
    const provider = new ZAIChatCompletionsProvider(config);
    installCreateMock(provider, create);

    await expect(
      provider.generate([
        { role: "user", content: "Hello Bob" },
      ]),
    ).rejects.toMatchObject({
      name: "RateLimitError",
      status: 429,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
