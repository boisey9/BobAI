import { OpenAI } from "openai";

import type { BobCoreConfig } from "../config.js";
import type { ChatMessage } from "../contracts.js";
import { buildBobInstructions } from "../prompts/bob.js";
import type {
  AIProvider,
  AIProviderContext,
  AIProviderResult,
} from "./provider.js";

/**
 * Z.AI exposes an OpenAI-compatible Chat Completions API. Bob's identity,
 * behavioral instructions, approved memory, and conversation history stay in
 * Bob Core; GLM is the replaceable inference engine underneath that layer.
 */
export class ZAIChatCompletionsProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(config: BobCoreConfig) {
    this.client = new OpenAI({
      apiKey: config.aiAPIKey,
      baseURL: config.aiBaseURL,
      timeout: 45_000,
      maxRetries: 2,
    });
    this.model = config.aiModel;
    this.maxOutputTokens = config.maxOutputTokens;
  }

  async generate(
    messages: ChatMessage[],
    context?: AIProviderContext,
  ): Promise<AIProviderResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: buildBobInstructions(context?.memoryContext),
        },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      max_tokens: this.maxOutputTokens,
      temperature: 0.7,
      stream: false,
    });

    const text = completion.choices[0]?.message?.content?.trim();

    if (!text) {
      throw new Error("The model returned an empty response.");
    }

    return {
      text,
      model: this.model,
    };
  }
}
