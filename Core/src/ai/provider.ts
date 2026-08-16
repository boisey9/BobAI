import type { ChatMessage } from "../contracts.js";

export type AIProviderResult = {
  text: string;
  model: string;
};

export interface AIProvider {
  generate(messages: ChatMessage[]): Promise<AIProviderResult>;
}
