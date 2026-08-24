import { describe, expect, it, vi } from "vitest";

import { createReadCredentialGateway } from "../src/security/read-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const WEB_TOKEN = "web-read-token-abcdefghijklmnopqrstuvwxyz-0123456789";

function echoAuthorization(request: Request): Response {
  return Response.json({
    authorization: request.headers.get("authorization"),
    method: request.method,
    path: new URL(request.url).pathname,
  });
}

describe("Bob Core read-only web credential gateway", () => {
  it("exchanges an approved read credential only for approved GET endpoints", async () => {
    const verifier = vi.fn().mockResolvedValue(true);
    const gateway = createReadCredentialGateway(
      echoAuthorization,
      createTestConfig(),
      verifier,
    );

    const response = await gateway(
      new Request("https://bob-core.test/v1/status", {
        headers: { authorization: `Bearer ${WEB_TOKEN}` },
      }),
    );

    expect(verifier).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({
      authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
      method: "GET",
      path: "/v1/status",
    });
  });

  it("does not grant the read credential access to write methods", async () => {
    const verifier = vi.fn().mockResolvedValue(true);
    const gateway = createReadCredentialGateway(
      echoAuthorization,
      createTestConfig(),
      verifier,
    );

    const response = await gateway(
      new Request("https://bob-core.test/v1/chat", {
        method: "POST",
        headers: { authorization: `Bearer ${WEB_TOKEN}` },
      }),
    );

    expect(verifier).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      authorization: `Bearer ${WEB_TOKEN}`,
      method: "POST",
    });
  });

  it("does not grant the read credential access to memory listing", async () => {
    const verifier = vi.fn().mockResolvedValue(true);
    const gateway = createReadCredentialGateway(
      echoAuthorization,
      createTestConfig(),
      verifier,
    );

    const response = await gateway(
      new Request("https://bob-core.test/v1/memories", {
        headers: { authorization: `Bearer ${WEB_TOKEN}` },
      }),
    );

    expect(verifier).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      authorization: `Bearer ${WEB_TOKEN}`,
      path: "/v1/memories",
    });
  });

  it("fails closed when a read credential is not approved", async () => {
    const verifier = vi.fn().mockResolvedValue(false);
    const gateway = createReadCredentialGateway(
      echoAuthorization,
      createTestConfig(),
      verifier,
    );

    const response = await gateway(
      new Request("https://bob-core.test/v1/activity", {
        headers: { authorization: `Bearer ${WEB_TOKEN}` },
      }),
    );

    expect(await response.json()).toMatchObject({
      authorization: `Bearer ${WEB_TOKEN}`,
    });
  });
});
