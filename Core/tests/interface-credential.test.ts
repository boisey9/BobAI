import { describe, expect, it, vi } from "vitest";

import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SCOPES_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
  createInterfaceCredentialGateway,
  type InterfaceCredential,
} from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const INTERFACE_TOKEN =
  "bobif_copilot_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop";

function echoRequest(request: Request): Response {
  return Response.json({
    authorization: request.headers.get("authorization"),
    interfaceId: request.headers.get(BOB_INTERFACE_ID_HEADER),
    interfaceSurface: request.headers.get(BOB_INTERFACE_SURFACE_HEADER),
    interfaceProject: request.headers.get(BOB_INTERFACE_PROJECT_HEADER),
    interfaceScopes: request.headers.get(BOB_INTERFACE_SCOPES_HEADER),
    path: new URL(request.url).pathname,
  });
}

function verifier(credential: InterfaceCredential | null) {
  return vi.fn().mockResolvedValue(credential);
}

describe("Bob Core interface credential gateway", () => {
  it("exchanges an approved project-scoped REST credential", async () => {
    const verify = verifier({
      id: "control-center",
      surface: "web",
      scopes: ["context:read"],
      projectKey: "bobai",
    });
    const gateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verify,
    );

    const response = await gateway(
      new Request(
        "https://bob-core.test/v1/context?project=bobai&surface=web",
        { headers: { authorization: `Bearer ${INTERFACE_TOKEN}` } },
      ),
    );

    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({
      authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
      interfaceId: "control-center",
      interfaceSurface: "web",
      interfaceProject: "bobai",
      interfaceScopes: "context:read",
    });
  });

  it("blocks a project-scoped credential from another project", async () => {
    const gateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "copilot",
        surface: "copilot",
        scopes: ["context:read"],
        projectKey: "bobai",
      }),
    );

    const response = await gateway(
      new Request("https://bob-core.test/v1/context?project=other", {
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "interface_scope_forbidden" },
    });
  });

  it("authorizes only the dedicated read-only MCP context endpoint", async () => {
    const gateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "copilot",
        surface: "copilot",
        scopes: ["mcp:context:read"],
        projectKey: "bobai",
      }),
    );

    const allowed = await gateway(
      new Request("https://bob-core.test/mcp/context", {
        method: "POST",
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
      interfaceId: "copilot",
      interfaceSurface: "copilot",
      interfaceProject: "bobai",
      path: "/mcp/context",
    });

    const protectedPrimaryMcp = await gateway(
      new Request("https://bob-core.test/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );
    expect(await protectedPrimaryMcp.json()).toMatchObject({
      authorization: `Bearer ${INTERFACE_TOKEN}`,
      interfaceId: null,
      path: "/mcp",
    });
  });

  it("authorizes the two-way sync endpoint only with mcp:sync", async () => {
    const gateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "copilot-bobai",
        surface: "copilot",
        scopes: [
          "mcp:sync",
          "mcp:context:read",
          "mcp:event:write",
          "mcp:task:write",
          "mcp:decision:propose",
        ],
        projectKey: "bobai",
      }),
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
      interfaceId: "copilot-bobai",
      interfaceSurface: "copilot",
      interfaceProject: "bobai",
      interfaceScopes:
        "mcp:sync,mcp:context:read,mcp:event:write,mcp:task:write,mcp:decision:propose",
      path: "/mcp/sync",
    });
  });

  it("rejects a read-only MCP credential from the sync endpoint", async () => {
    const gateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "copilot-read",
        surface: "copilot",
        scopes: ["mcp:context:read"],
        projectKey: "bobai",
      }),
    );

    const response = await gateway(
      new Request("https://bob-core.test/mcp/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "interface_scope_forbidden" },
    });
  });

  it("rejects a valid credential that lacks the required REST scope", async () => {
    const gateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier({
        id: "copilot",
        surface: "copilot",
        scopes: ["mcp:context:read"],
        projectKey: "bobai",
      }),
    );

    const response = await gateway(
      new Request("https://bob-core.test/v1/status", {
        headers: { authorization: `Bearer ${INTERFACE_TOKEN}` },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("strips spoofed internal interface headers from primary-token requests", async () => {
    const gateway = createInterfaceCredentialGateway(
      echoRequest,
      createTestConfig(),
      verifier(null),
    );

    const response = await gateway(
      new Request("https://bob-core.test/v1/status", {
        headers: {
          authorization: `Bearer ${TEST_DEVICE_TOKEN}`,
          [BOB_INTERFACE_ID_HEADER]: "spoofed",
          [BOB_INTERFACE_SURFACE_HEADER]: "copilot",
          [BOB_INTERFACE_PROJECT_HEADER]: "other",
        },
      }),
    );

    expect(await response.json()).toMatchObject({
      interfaceId: null,
      interfaceSurface: null,
      interfaceProject: null,
    });
  });
});
