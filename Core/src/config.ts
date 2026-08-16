import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8_787),
  AI_PROVIDER: z.enum(["openai", "zai"]).optional(),
  AI_API_KEY: z.string().trim().min(20).optional(),
  AI_MODEL: z.string().trim().min(1).optional(),
  AI_BASE_URL: z.string().trim().url().optional(),
  OPENAI_API_KEY: z.string().trim().min(20).optional(),
  OPENAI_MODEL: z.string().trim().min(1).optional(),
  ZAI_API_KEY: z.string().trim().min(20).optional(),
  ZAI_MODEL: z.string().trim().min(1).optional(),
  ZAI_BASE_URL: z.string().trim().url().optional(),
  BOB_CORE_DEVICE_TOKEN: z
    .string()
    .min(32, "BOB_CORE_DEVICE_TOKEN must be at least 32 characters.")
    .regex(
      /^[A-Za-z0-9._~+/-]+=*$/,
      "BOB_CORE_DEVICE_TOKEN must be a bearer-token-safe value.",
    ),
  BOB_CORE_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(64)
    .max(4_096)
    .default(700),
});

export type AIProviderName = "openai" | "zai";

export type BobCoreConfig = {
  nodeEnvironment: "development" | "test" | "production";
  port: number;
  aiProvider: AIProviderName;
  aiAPIKey: string;
  aiModel: string;
  aiBaseURL: string | undefined;
  deviceToken: string;
  maxOutputTokens: number;
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): BobCoreConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const invalidKeys = result.error.issues
      .map((issue) => issue.path.join(".") || "environment")
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .join(", ");

    throw new Error(
      `Bob Core configuration is invalid. Check: ${invalidKeys}. Secret values were not logged.`,
    );
  }

  const provider: AIProviderName =
    result.data.AI_PROVIDER ??
    (result.data.ZAI_API_KEY ? "zai" : "openai");
  const apiKey =
    result.data.AI_API_KEY ??
    (provider === "zai"
      ? result.data.ZAI_API_KEY
      : result.data.OPENAI_API_KEY);

  if (!apiKey) {
    const requiredKey =
      provider === "zai"
        ? "ZAI_API_KEY or AI_API_KEY"
        : "OPENAI_API_KEY or AI_API_KEY";

    throw new Error(
      `Bob Core configuration is invalid. Check: ${requiredKey}. Secret values were not logged.`,
    );
  }

  const model =
    result.data.AI_MODEL ??
    (provider === "zai"
      ? result.data.ZAI_MODEL ?? "glm-4.7-flash"
      : result.data.OPENAI_MODEL ?? "gpt-5-mini");
  const baseURL =
    result.data.AI_BASE_URL ??
    (provider === "zai"
      ? result.data.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4"
      : undefined);

  return {
    nodeEnvironment: result.data.NODE_ENV,
    port: result.data.PORT,
    aiProvider: provider,
    aiAPIKey: apiKey,
    aiModel: model,
    aiBaseURL: baseURL,
    deviceToken: result.data.BOB_CORE_DEVICE_TOKEN,
    maxOutputTokens: result.data.BOB_CORE_MAX_OUTPUT_TOKENS,
  };
}
