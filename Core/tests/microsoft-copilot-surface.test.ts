import { describe, expect, it, vi } from "vitest";

import { CONTEXT_SURFACES } from "../src/context/types.js";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
  createInterfaceCredentialGateway,
} from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const INTERFACE_TOKEN =
  "bobif_microsoftcopilot_abcdefghijklmnopqrstuvwxyz0123456789abcdefgh";

describe("Microsoft Copilot Bob surface", () => {
  it("is an explicit supported context surface", () => {
    expect(CONTEXT_SURFACES).toContain("microsoft-copilot");
  });

  it("binds Microsoft Copilot identity and project at the credential gateway", async () => {
    const verifier = vi.fn().mockResolvedValue({
      id: "microsoft-copilot-bobai",
      surface: "microsoft-copilot" as const,
      scopes: ["mcp:sync" as const],
      projectKey: "bobai",
    });
    const gateway = createInterfaceCredentialGateway(
      (request) =>
        Response.json({
          authorization: request.headers.get("authorization"),
          interfaceId: request.headers.get(BOB_INTERFACE_ID_HEADER),
          surface: request.headers.get(BOB_INTERFACE_SURFACE_HEADER),
          project: request.headers.get(BOB_INTERFACE_PROJECT_HEADER),
        }),
      createTestConfig(),
      verifier,
    );

    const response = await gateway(
      new Request("https://bob-core.test/mcp/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
      interfaceId: "microsoft-copilot-bobai",
      surface: "microsoft-copilot",
      project: "bobai",
    });
  });
});
