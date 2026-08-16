import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8_787),
  OPENAI_API_KEY: z.string().min(20, "OPENAI_API_KEY is required."),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5-mini"),
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

export type BobCoreConfig = {
  nodeEnvironment: "development" | "test" | "production";
  port: number;
  openAIAPIKey: string;
  openAIModel: string;
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

  return {
    nodeEnvironment: result.data.NODE_ENV,
    port: result.data.PORT,
    openAIAPIKey: result.data.OPENAI_API_KEY,
    openAIModel: result.data.OPENAI_MODEL,
    deviceToken: result.data.BOB_CORE_DEVICE_TOKEN,
    maxOutputTokens: result.data.BOB_CORE_MAX_OUTPUT_TOKENS,
  };
}
