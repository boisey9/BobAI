import { describe, expect, it, vi } from "vitest";

import { safeInterfaceCredentials } from "../src/control-center/mount.js";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  createInterfaceCredentialGateway,
  type InterfaceCredential,
} from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const INTERFACE_TOKEN =
  "bobif_web_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrst";

function verifier(credential: InterfaceCredential | null) {
  return vi.fn().mockResolvedValue(credential);
}

function echoRequest(request: Request): Response {
  return Response.json({
    authorization: request.headers.get("authorization"),
    interfaceId: request.headers.get(BOB_INTERFACE_ID_HEADER),
    project: request.headers.get(BOB_INTERFACE_PROJECT_HEADER),
    path: new URL(request.url).pathname,
  });
}

describe("Bob Control Center v2 administration", () => {
  it("never exposes stored interface credential hashes", () => {
    const result = safeInterfaceCredentials({
      auth: {
        interfaceCredentials: [
          {
            id: "copilot-bobai",
            hash: "do-not-return-this-hash",
            surface: "copilot",
            scopes: ["mcp:context:read", "mcp:sync"],
            enabled: true,
            createdAt: "2026-08-24T20:54:45.498Z",
          },
        ],
      },
    });

    expect(result).toEqual([
      {
        id: "copilot-bobai",
        surface: "copilot",
        scopes: ["mcp:context:read", "mcp:sync"],
        enabled: true,
        createdAt: "2026-08-24T20:54:45.498Z",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("do-not-return-this-hash");
  });

  it("allows only a credential with the Control Center read scope", async () => {
    const allowedGateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "control-center-bobai",
        surface: "web",
        scopes: ["control-center:read"],
        projectKey: "bobai",
      }),
    );

    const allowed = await allowedGateway(
      new Request("https://bob-core.test/v1/control-center?project=bobai", {
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );

    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
      interfaceId: "control-center-bobai",
      project: "bobai",
    });

    const deniedGateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "read-only",
        surface: "web",
        scopes: ["context:read"],
        projectKey: "bobai",
      }),
    );
    const denied = await deniedGateway(
      new Request("https://bob-core.test/v1/control-center?project=bobai", {
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );

    expect(denied.status).toBe(403);
  });

  it("keeps decision review and credential management separately scoped", async () => {
    const reviewGateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "control-center-bobai",
        surface: "web",
        scopes: ["decision:review"],
        projectKey: "bobai",
      }),
    );

    const review = await reviewGateway(
      new Request(
        "https://bob-core.test/v1/control-center/approvals/11111111-1111-4111-8111-111111111111",
        {
          method: "POST",
          headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
        },
      ),
    );
    expect(review.status).toBe(200);

    const credentials = await reviewGateway(
      new Request(
        "https://bob-core.test/v1/control-center/credentials/copilot-bobai",
        {
          method: "POST",
          headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
        },
      ),
    );
    expect(credentials.status).toBe(403);
  });
});
