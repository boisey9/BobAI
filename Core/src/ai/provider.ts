import type { ChatMessage } from "../contracts.js";

export type AIProviderResult = {
  text: string;
  model: string;
};

export type AIProviderContext = {
  signal?: AbortSignal;
  memoryContext?: string;
  sharedContext?: import("../context/types.js").SharedContextPackage;
};

export interface AIProvider {
  generate(
    messages: ChatMessage[],
    context?: AIProviderContext,
  ): Promise<AIProviderResult>;
}
