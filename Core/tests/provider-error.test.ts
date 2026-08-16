import { describe, expect, it } from "vitest";

import { classifyProviderError } from "../src/ai/provider-error.js";

describe("AI provider error classification", () => {
  it("identifies missing OpenAI billing or exhausted quota", () => {
    const failure = classifyProviderError(
      Object.assign(new Error("provider detail must not be returned"), {
        name: "RateLimitError",
        status: 429,
        code: "insufficient_quota",
        request_id: "req_quota_test",
      }),
      "openai",
    );

    expect(failure).toMatchObject({
      errorName: "RateLimitError",
      publicCode: "openai_quota_exhausted",
      httpStatus: 503,
      status: 429,
      providerCode: "insufficient_quota",
      providerRequestId: "req_quota_test",
    });
    expect(failure.publicMessage).toContain("billing or credits");
    expect(failure.publicMessage).not.toContain("provider detail");
  });

  it("identifies a rejected Z.AI API key", () => {
    const failure = classifyProviderError(
      {
        name: "AuthenticationError",
        status: 401,
        code: "invalid_api_key",
      },
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_authentication_failed",
      httpStatus: 502,
      status: 401,
    });
    expect(failure.publicMessage).toContain("ZAI_API_KEY");
  });

  it("classifies Z.AI two-factor authentication as an authentication failure", () => {
    const failure = classifyProviderError(
      {
        status: 401,
        error: {
          code: 1005,
          message: "provider detail must stay private",
        },
      },
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_authentication_failed",
      httpStatus: 502,
      providerCode: "1005",
    });
    expect(failure.publicMessage).not.toContain("provider detail");
  });

  it("identifies an unavailable Z.AI model", () => {
    const failure = classifyProviderError(
      {
        name: "NotFoundError",
        status: 404,
        code: "model_not_found",
      },
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_model_unavailable",
      httpStatus: 502,
      status: 404,
    });
    expect(failure.publicMessage).toContain("Z.AI");
  });

  it("reads nested Z.AI high-traffic business codes", () => {
    const failure = classifyProviderError(
      {
        name: "APIError",
        response: {
          status: 429,
          error: {
            code: 1312,
            message: "provider detail must stay private",
          },
        },
        requestId: "zai_req_busy",
      },
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_model_busy",
      httpStatus: 503,
      status: 429,
      providerCode: "1312",
      providerRequestId: "zai_req_busy",
    });
    expect(failure.publicMessage).toContain("fallback model");
    expect(failure.publicMessage).not.toContain("provider detail");
  });

  it("identifies Z.AI allowance or package exhaustion", () => {
    const failure = classifyProviderError(
      {
        statusCode: "429",
        error: {
          code: "1316",
          message: "Package exhausted",
        },
        _request_id: "zai_req_quota",
      },
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_quota_exhausted",
      httpStatus: 503,
      status: 429,
      providerCode: "1316",
      providerRequestId: "zai_req_quota",
    });
  });

  it("identifies Z.AI endpoint or model permission failures", () => {
    const failure = classifyProviderError(
      {
        status: 403,
        error: {
          code: 1315,
          message: "No permission",
        },
      },
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_permission_denied",
      httpStatus: 502,
      providerCode: "1315",
    });
  });

  it("identifies Z.AI overload as a retryable service failure", () => {
    const failure = classifyProviderError(
      {
        status: 503,
        error: {
          code: 1305,
          message: "System overloaded",
        },
      },
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_service_unavailable",
      httpStatus: 503,
      providerCode: "1305",
    });
  });

  it("identifies an empty provider answer", () => {
    const failure = classifyProviderError(
      Object.assign(new Error("The model returned an empty response."), {
        name: "EmptyProviderResponseError",
      }),
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_empty_response",
      httpStatus: 503,
    });
  });

  it("keeps unknown provider failures generic and sanitized", () => {
    const failure = classifyProviderError(
      new Error("sensitive detail"),
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "zai_unexpected_error",
      httpStatus: 502,
    });
    expect(failure.publicMessage).toContain("Z.AI");
    expect(failure.publicMessage).not.toContain("sensitive detail");
  });
});
