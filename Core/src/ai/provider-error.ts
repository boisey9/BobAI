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

const ZAI_AUTHENTICATION_CODES = new Set([
  "1000",
  "1001",
  "1002",
  "1003",
  "1004",
]);
const ZAI_ACCOUNT_CODES = new Set([
  "1110",
  "1111",
  "1112",
  "1120",
  "1121",
]);
const ZAI_QUOTA_CODES = new Set([
  "1113",
  "1304",
  "1308",
  "1309",
  "1310",
]);
const ZAI_RATE_LIMIT_CODES = new Set([
  "1302",
  "1303",
  "1305",
  "1313",
]);
const ZAI_MODEL_CODES = new Set(["1211", "1311"]);
const ZAI_POLICY_CODES = new Set(["1300", "1301"]);
const ZAI_PERMISSION_CODES = new Set(["1220", "434"]);
const ZAI_REQUEST_CODES = new Set([
  "1200",
  "1210",
  "1212",
  "1213",
  "1214",
  "1215",
  "1221",
  "1222",
  "1230",
  "1261",
]);

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

function childRecord(
  record: UnknownRecord,
  key: string,
): UnknownRecord {
  return isRecord(record[key]) ? record[key] : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readCode(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return readString(value);
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return undefined;
}

function firstDefined<T>(
  ...values: Array<T | undefined>
): T | undefined {
  return values.find((value) => value !== undefined);
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
  const nestedError = childRecord(record, "error");
  const cause = childRecord(record, "cause");
  const response = childRecord(record, "response");
  const responseError = childRecord(response, "error");

  const errorName =
    error instanceof Error
      ? error.name
      : firstDefined(
          readString(record.name),
          readString(cause.name),
        ) ?? "UnknownError";
  const errorMessage =
    error instanceof Error
      ? error.message
      : firstDefined(
          readString(record.message),
          readString(nestedError.message),
          readString(cause.message),
          readString(responseError.message),
        ) ?? "";
  const status = firstDefined(
    readNumber(record.status),
    readNumber(record.statusCode),
    readNumber(nestedError.status),
    readNumber(cause.status),
    readNumber(response.status),
  );
  const providerCode = firstDefined(
    readCode(record.code),
    readCode(nestedError.code),
    readCode(cause.code),
    readCode(responseError.code),
  );
  const providerRequestId = firstDefined(
    readString(record.request_id),
    readString(record.requestId),
    readString(nestedError.request_id),
    readString(nestedError.requestId),
    readString(response.request_id),
    readString(response.requestId),
  );
  const normalizedCode = providerCode?.toLowerCase();
  const normalizedMessage = errorMessage.toLowerCase();
  const metadata: ProviderMetadata = {
    status,
    providerCode,
    providerRequestId,
  };

  if (provider === "zai" && providerCode) {
    if (ZAI_AUTHENTICATION_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_authentication_failed",
        "Z.AI rejected the API key. Replace ZAI_API_KEY in Vercel and redeploy Bob Core.",
        502,
        metadata,
      );
    }

    if (ZAI_ACCOUNT_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_account_unavailable",
        "The Z.AI account is inactive, locked, or temporarily unavailable. Check the Z.AI console.",
        503,
        metadata,
      );
    }

    if (ZAI_QUOTA_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_quota_exhausted",
        "The Z.AI allowance or account balance is exhausted. Check the Z.AI console and retry after the allowance resets.",
        503,
        metadata,
      );
    }

    if (ZAI_RATE_LIMIT_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_rate_limited",
        "Z.AI temporarily rate-limited Bob Core. Wait briefly and try again.",
        503,
        metadata,
      );
    }

    if (providerCode === "1312") {
      return buildFailure(
        errorName,
        "zai_model_busy",
        "The selected Z.AI model is under heavy traffic. Bob Core will try its free fallback model when available.",
        503,
        metadata,
      );
    }

    if (ZAI_MODEL_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_model_unavailable",
        "The configured Z.AI model is unavailable or not included for this account. Check ZAI_MODEL in Vercel.",
        502,
        metadata,
      );
    }

    if (ZAI_POLICY_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_policy_blocked",
        "Z.AI blocked that request under its content policy. Rephrase the request and try again.",
        502,
        metadata,
      );
    }

    if (ZAI_PERMISSION_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_permission_denied",
        "Z.AI does not permit this API key to use the requested API or model.",
        502,
        metadata,
      );
    }

    if (providerCode === "1234") {
      return buildFailure(
        errorName,
        "zai_connection_failed",
        "Z.AI reported a network error. Try again shortly.",
        503,
        metadata,
      );
    }

    if (ZAI_REQUEST_CODES.has(providerCode)) {
      return buildFailure(
        errorName,
        "zai_request_rejected",
        "Z.AI rejected the request parameters or prompt length. Check the configured model and try again.",
        502,
        metadata,
      );
    }
  }

  if (
    normalizedMessage.includes("empty response") ||
    normalizedMessage.includes("returned no answer")
  ) {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_empty_response`,
      `${labels.displayName} returned no answer. Try again; Bob Core will use a fallback model when one is configured.`,
      503,
      metadata,
    );
  }

  if (
    status === 401 ||
    normalizedCode === "invalid_api_key" ||
    normalizedCode === "authentication_error"
  ) {
    return buildFailure(
      errorName,
      `${labels.codePrefix}_authentication_failed`,
      `${labels.displayName} rejected the API key. Replace ${labels.apiKeyEnvironment} in Vercel and redeploy Bob Core.`,
      502,
      metadata,
    );
  }

  if (status === 403 || status === 434) {
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
    `${labels.codePrefix}_unexpected_error`,
    `${labels.displayName} returned an unexpected response. Try again; the diagnostic code and request ID are shown by the BobAI app.`,
    502,
    metadata,
  );
}
