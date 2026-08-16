import type { BobCoreConfig } from "../config.js";
import { OpenAIResponsesProvider } from "./openai-provider.js";
import type { AIProvider } from "./provider.js";
import { ZAIChatCompletionsProvider } from "./zai-provider.js";

export function createAIProvider(config: BobCoreConfig): AIProvider {
  switch (config.aiProvider) {
    case "zai":
      return new ZAIChatCompletionsProvider(config);
    case "openai":
      return new OpenAIResponsesProvider(config);
  }
}
