import { describe, expect, it } from "vitest";

import { classifyProviderError } from "../src/ai/provider-error.js";

describe("AI provider error classification", () => {
  it("identifies missing API billing or exhausted quota", () => {
    const failure = classifyProviderError(
      Object.assign(new Error("provider detail must not be returned"), {
        name: "RateLimitError",
        status: 429,
        code: "insufficient_quota",
        request_id: "req_quota_test",
      }),
    );

    expect(failure).toMatchObject({
      errorName: "RateLimitError",
      publicCode: "openai_api_billing_required",
      httpStatus: 503,
      status: 429,
      providerCode: "insufficient_quota",
      providerRequestId: "req_quota_test",
    });
    expect(failure.publicMessage).toContain("billing or credits");
    expect(failure.publicMessage).not.toContain("provider detail");
  });

  it("identifies a rejected API key", () => {
    const failure = classifyProviderError({
      name: "AuthenticationError",
      status: 401,
      code: "invalid_api_key",
    });

    expect(failure).toMatchObject({
      publicCode: "openai_authentication_failed",
      httpStatus: 502,
      status: 401,
    });
  });

  it("identifies an unavailable model", () => {
    const failure = classifyProviderError({
      name: "NotFoundError",
      status: 404,
      code: "model_not_found",
    });

    expect(failure).toMatchObject({
      publicCode: "openai_model_unavailable",
      httpStatus: 502,
      status: 404,
    });
  });

  it("keeps unknown provider failures generic", () => {
    const failure = classifyProviderError(new Error("sensitive detail"));

    expect(failure).toMatchObject({
      publicCode: "ai_provider_error",
      httpStatus: 502,
    });
    expect(failure.publicMessage).not.toContain("sensitive detail");
  });
});
