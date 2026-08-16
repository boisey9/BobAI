import { OpenAI } from "openai";

import type { BobCoreConfig } from "../config.js";
import type { ChatMessage } from "../contracts.js";
import { buildBobInstructions } from "../prompts/bob.js";
import type {
  AIProvider,
  AIProviderContext,
  AIProviderResult,
} from "./provider.js";

export class OpenAIResponsesProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(config: BobCoreConfig) {
    this.client = new OpenAI({
      apiKey: config.aiAPIKey,
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
    const response = await this.client.responses.create({
      model: this.model,
      instructions: buildBobInstructions(context?.memoryContext),
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_output_tokens: this.maxOutputTokens,
      store: false,
    });

    const text = response.output_text.trim();

    if (!text) {
      throw new Error("The model returned an empty response.");
    }

    return {
      text,
      model: this.model,
    };
  }
}
