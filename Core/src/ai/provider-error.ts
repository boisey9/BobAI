import type { AIProviderName } from "../config.js";

export type ProviderFailure = {
  errorName: string;
  publicCode: string;
  publicMessage: string;
  httpStatus: 502 | 503;
  status?: number;
  providerCode?: string;
  providerRequestId?: string;
};

type UnknownRecord = Record<string, unknown>;

type ProviderMetadata = {
  status: number | undefined;
  providerCode: string | undefined;
  providerRequestId: string | undefined;
};

type ProviderLabels = {
  displayName: string;
  codePrefix: string;
  apiKeyEnvironment: string;
  modelEnvironment: string;
};

function providerLabels(provider: AIProviderName): ProviderLabels {
  if (provider === "zai") {
    return {
      displayName: "Z.AI",
      codePrefix: "zai",
      apiKeyEnvironment: "ZAI_API_KEY",
      modelEnvironment: "ZAI_MODEL or AI_MODEL",
    };
  }

  return {
    displayName: "OpenAI",
    codePrefix: "openai",
    apiKeyEnvironment: "OPENAI_API_KEY",
    modelEnvironment: "OPENAI_MODEL or AI_MODEL",
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function buildFailure(
  errorName: string,
  publicCode: string,
  publicMessage: string,
  httpStatus: 502 | 503,
  metadata: ProviderMetadata,
): ProviderFailure {
  return {
    errorName,
    publicCode,
    publicMessage,
    httpStatus,
    ...(metadata.status !== undefined
      ? { status: metadata.status }
      : {}),
    ...(metadata.providerCode !== undefined
      ? { providerCode: metadata.providerCode }
      : {}),
    ...(metadata.providerRequestId !== undefined
      ? { providerRequestId: metadata.providerRequestId }
      : {}),
  };
}

export function classifyProviderError(
  error: unknown,
  provider: AIProviderName = "openai",
): ProviderFailure {
  const labels = providerLabels(provider);
  const record = isRecord(error) ? error : {};
  const nestedError = isRecord(record.error) ? record.error : {};
  const errorName =
    error instanceof Error
      ? error.name
      : readString(record.name) ?? "UnknownError";
  const status = readNumber(record.status);
  const providerCode =
    readString(record.code) ?? readString(nestedError.code);
  const providerRequestId =
    readString(record.request_id) ?? readString(record.requestId);
  const normalizedCode = providerCode?.toLowerCase();
  const metadata: ProviderMetadata = {
    status,
    providerCode,
    providerRequestId,
  };

  if (status === 401 || normalizedCode === "invalid_api_key") {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_authentication_failed`,
      `${labels.displayName} rejected the API key. Replace ${labels.apiKeyEnvironment} in Vercel and redeploy Bob Core.`,
      502,
      metadata,
    );
  }

  if (status === 403) {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_permission_denied`,
      `${labels.displayName} does not permit this API key to use the configured model.`,
      502,
      metadata,
    );
  }

  if (status === 404 || normalizedCode === "model_not_found") {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_model_unavailable`,
      `The configured ${labels.displayName} model is unavailable. Check ${labels.modelEnvironment} in Vercel and redeploy.`,
      502,
      metadata,
    );
  }

  if (
    status === 429 &&
    (normalizedCode === "insufficient_quota" ||
      normalizedCode === "billing_hard_limit_reached")
  ) {
    const message =
      provider === "zai"
        ? "The Z.AI quota or free-tier allowance is exhausted. Check the Z.AI console and try again after the allowance resets."
        : "OpenAI API billing or credits are not active, or the project quota is exhausted. ChatGPT subscriptions do not include API usage.";

    return buildFailure(
      errorName,
      `${labels.codePrefix}_quota_exhausted`,
      message,
      503,
      metadata,
    );
  }

  if (status === 429) {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_rate_limited`,
      `${labels.displayName} temporarily rate-limited Bob Core. Wait briefly and try again.`,
      503,
      metadata,
    );
  }

  if (status === 400 || status === 422) {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_request_rejected`,
      `${labels.displayName} rejected the request. Check the configured model and Bob Core settings.`,
      502,
      metadata,
    );
  }

  if (status !== undefined && status >= 500) {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_service_unavailable`,
      `${labels.displayName} is temporarily unavailable. Try again shortly.`,
      503,
      metadata,
    );
  }

  if (
    errorName === "APIConnectionError" ||
    errorName === "APIConnectionTimeoutError" ||
    errorName === "APIUserAbortError"
  ) {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_connection_failed`,
      `Bob Core could not reach ${labels.displayName}. Try again shortly.`,
      503,
      metadata,
    );
  }

  return buildFailure(
    errorName,
    "ai_provider_error",
    `Bob Core could not complete the ${labels.displayName} request. Check the Vercel runtime logs for the provider error type.`,
    502,
    metadata,
  );
}
