import { OpenAI } from "openai";

import type { BobCoreConfig } from "../config.js";
import type { ChatMessage } from "../contracts.js";
import { buildBobInstructions } from "../prompts/bob.js";
import { classifyProviderError } from "./provider-error.js";
import type {
  AIProvider,
  AIProviderContext,
  AIProviderResult,
} from "./provider.js";

const DEFAULT_FALLBACK_MODEL = "glm-4.5-flash";
const ALTERNATE_FALLBACK_MODEL = "glm-4.7-flash";

const FALLBACK_FAILURE_CODES = new Set([
  "zai_model_busy",
  "zai_model_unavailable",
  "zai_rate_limited",
  "zai_service_unavailable",
  "zai_connection_failed",
  "zai_empty_response",
  "zai_unexpected_error",
]);

/**
 * Z.AI exposes an OpenAI-compatible Chat Completions API. Bob's identity,
 * behavioral instructions, approved memory, and conversation history stay in
 * Bob Core; GLM is the replaceable inference engine underneath that layer.
 */
export class ZAIChatCompletionsProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly fallbackModel: string;
  private readonly maxOutputTokens: number;
  private readonly nodeEnvironment: BobCoreConfig["nodeEnvironment"];

  constructor(config: BobCoreConfig) {
    this.client = new OpenAI({
      apiKey: config.aiAPIKey,
      baseURL: config.aiBaseURL,
      timeout: 45_000,
      maxRetries: 1,
    });
    this.model = config.aiModel;
    this.fallbackModel =
      config.aiModel === DEFAULT_FALLBACK_MODEL
        ? ALTERNATE_FALLBACK_MODEL
        : DEFAULT_FALLBACK_MODEL;
    this.maxOutputTokens = config.maxOutputTokens;
    this.nodeEnvironment = config.nodeEnvironment;
  }

  async generate(
    messages: ChatMessage[],
    context?: AIProviderContext,
  ): Promise<AIProviderResult> {
    const models = [this.model, this.fallbackModel].filter(
      (model, index, candidates) =>
        candidates.indexOf(model) === index,
    );

    for (const [index, model] of models.entries()) {
      try {
        return await this.generateWithModel(
          model,
          messages,
          context,
        );
      } catch (error) {
        const failure = classifyProviderError(error, "zai");
        const hasFallback = index < models.length - 1;

        if (
          !hasFallback ||
          !FALLBACK_FAILURE_CODES.has(failure.publicCode)
        ) {
          throw error;
        }

        if (this.nodeEnvironment !== "test") {
          console.warn(
            JSON.stringify({
              event: "ai.provider_fallback",
              provider: "zai",
              fromModel: model,
              toModel: models[index + 1],
              failureCode: failure.publicCode,
              providerStatus: failure.status,
              providerCode: failure.providerCode,
              providerRequestId: failure.providerRequestId,
            }),
          );
        }
      }
    }

    throw new Error("Z.AI did not provide a response.");
  }

  private async generateWithModel(
    model: string,
    messages: ChatMessage[],
    context?: AIProviderContext,
  ): Promise<AIProviderResult> {
    const completion = await this.client.chat.completions.create({
      model,
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
      throw Object.assign(
        new Error("The model returned an empty response."),
        { name: "EmptyProviderResponseError" },
      );
    }

    return {
      text,
      model,
    };
  }
}
