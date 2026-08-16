import { OpenAI } from "openai";

import type { BobCoreConfig } from "../config.js";
import type { ChatMessage } from "../contracts.js";
import { BOB_INSTRUCTIONS } from "../prompts/bob.js";
import type { AIProvider, AIProviderResult } from "./provider.js";

export class OpenAIResponsesProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(config: BobCoreConfig) {
    this.client = new OpenAI({
      apiKey: config.openAIAPIKey,
      timeout: 45_000,
      maxRetries: 2,
    });
    this.model = config.openAIModel;
    this.maxOutputTokens = config.maxOutputTokens;
  }

  async generate(messages: ChatMessage[]): Promise<AIProviderResult> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: BOB_INSTRUCTIONS,
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
