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
  metadata: {
    status?: number;
    providerCode?: string;
    providerRequestId?: string;
  },
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

export function classifyProviderError(error: unknown): ProviderFailure {
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
  const metadata = { status, providerCode, providerRequestId };

  if (status === 401 || normalizedCode === "invalid_api_key") {
    return buildFailure(
      errorName,
      "openai_authentication_failed",
      "OpenAI rejected the API key. Replace OPENAI_API_KEY in Vercel and redeploy Bob Core.",
      502,
      metadata,
    );
  }

  if (status === 403) {
    return buildFailure(
      errorName,
      "openai_permission_denied",
      "The OpenAI project or API key does not have permission to use the configured model.",
      502,
      metadata,
    );
  }

  if (status === 404 || normalizedCode === "model_not_found") {
    return buildFailure(
      errorName,
      "openai_model_unavailable",
      "The configured OpenAI model is unavailable. Check OPENAI_MODEL in Vercel and redeploy.",
      502,
      metadata,
    );
  }

  if (
    status === 429 &&
    (normalizedCode === "insufficient_quota" ||
      normalizedCode === "billing_hard_limit_reached")
  ) {
    return buildFailure(
      errorName,
      "openai_api_billing_required",
      "OpenAI API billing or credits are not active, or the project quota is exhausted. ChatGPT subscriptions do not include API usage.",
      503,
      metadata,
    );
  }

  if (status === 429) {
    return buildFailure(
      errorName,
      "openai_rate_limited",
      "OpenAI temporarily rate-limited Bob Core. Wait briefly and try again.",
      503,
      metadata,
    );
  }

  if (status === 400 || status === 422) {
    return buildFailure(
      errorName,
      "openai_request_rejected",
      "OpenAI rejected the request. Check the configured model and Bob Core settings.",
      502,
      metadata,
    );
  }

  if (status !== undefined && status >= 500) {
    return buildFailure(
      errorName,
      "openai_service_unavailable",
      "OpenAI is temporarily unavailable. Try again shortly.",
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
      "openai_connection_failed",
      "Bob Core could not reach OpenAI. Try again shortly.",
      503,
      metadata,
    );
  }

  return buildFailure(
    errorName,
    "ai_provider_error",
    "Bob Core could not complete the AI request. Check the Vercel runtime logs for the provider error type.",
    502,
    metadata,
  );
}
