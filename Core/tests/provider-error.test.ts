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

  it("keeps unknown provider failures generic and sanitized", () => {
    const failure = classifyProviderError(
      new Error("sensitive detail"),
      "zai",
    );

    expect(failure).toMatchObject({
      publicCode: "ai_provider_error",
      httpStatus: 502,
    });
    expect(failure.publicMessage).toContain("Z.AI");
    expect(failure.publicMessage).not.toContain("sensitive detail");
  });
});
