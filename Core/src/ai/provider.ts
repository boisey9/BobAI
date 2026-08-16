import type { ChatMessage } from "../contracts.js";

export type AIProviderResult = {
  text: string;
  model: string;
};

export type AIProviderContext = {
  memoryContext?: string;
};

export interface AIProvider {
  generate(
    messages: ChatMessage[],
    context?: AIProviderContext,
  ): Promise<AIProviderResult>;
}
