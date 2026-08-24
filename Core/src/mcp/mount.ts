import type { createApp } from "../app.js";
import type { BobCoreConfig } from "../config.js";
import { CONTEXT_SURFACES, type ContextSurface } from "../context/types.js";
import type { SharedContextService } from "../context/service.js";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SCOPES_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
  INTERFACE_CREDENTIAL_SCOPES,
  type InterfaceCredentialScope,
} from "../security/interface-credential.js";
import { tokenMatches } from "../security/token.js";
import { createBobMcpHandler } from "./server.js";

type BobCoreApp = ReturnType<typeof createApp>;

type AuthenticationFailure =
  | "authentication_required"
  | "invalid_authorization_header"
  | "invalid_device_token";

async function authenticationFailure(
  authorization: string | undefined,
  config: BobCoreConfig,
): Promise<AuthenticationFailure | null> {
  if (!authorization) return "authentication_required";

  const [scheme, providedToken, ...extraParts] = authorization
    .trim()
    .split(/\s+/);

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !providedToken ||
    extraParts.length > 0
  ) {
    return "invalid_authorization_header";
  }

  return (await tokenMatches(providedToken, config.deviceToken))
    ? null
    : "invalid_device_token";
}

function authenticationMessage(code: AuthenticationFailure): string {
  if (code === "authentication_required") {
    return "A Bob Core device token is required.";
  }
  if (code === "invalid_authorization_header") {
    return "The Authorization header is invalid.";
  }
  return "The Bob Core device token is invalid.";
}

function interfaceSurface(value: string | undefined): ContextSurface | undefined {
  return value && (CONTEXT_SURFACES as readonly string[]).includes(value)
    ? (value as ContextSurface)
    : undefined;
}

function interfaceScopes(
  value: string | undefined,
): InterfaceCredentialScope[] {
  if (!value) return [];

  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter(
      (scope): scope is InterfaceCredentialScope =>
        (INTERFACE_CREDENTIAL_SCOPES as readonly string[]).includes(scope),
    );
}

export function mountBobMcp(
  app: BobCoreApp,
  config: BobCoreConfig,
  sharedContextService?: SharedContextService,
): void {
  const primaryHandler = sharedContextService
    ? createBobMcpHandler(sharedContextService)
    : undefined;

  app.all("/mcp", async (context) => {
    const requestId = context.get("requestId") ?? crypto.randomUUID();
    const failure = await authenticationFailure(
      context.req.header("authorization"),
      config,
    );

    if (failure) {
      return context.json(
        {
          error: {
            code: failure,
            message: authenticationMessage(failure),
            requestId,
          },
        },
        401,
      );
    }

    if (!primaryHandler) {
      return context.json(
        {
          error: {
            code: "shared_context_not_configured",
            message: "Bob Core shared context is not configured yet.",
            requestId,
          },
        },
        503,
      );
    }

    return primaryHandler.fetch(context.req.raw);
  });

  app.all("/mcp/context", async (context) => {
    const requestId = context.get("requestId") ?? crypto.randomUUID();
    const failure = await authenticationFailure(
      context.req.header("authorization"),
      config,
    );

    if (failure) {
      return context.json(
        {
          error: {
            code: failure,
            message: authenticationMessage(failure),
            requestId,
          },
        },
        401,
      );
    }

    if (!sharedContextService) {
      return context.json(
        {
          error: {
            code: "shared_context_not_configured",
            message: "Bob Core shared context is not configured yet.",
            requestId,
          },
        },
        503,
      );
    }

    const projectKey = context.req.header(BOB_INTERFACE_PROJECT_HEADER)?.trim();
    const surface = interfaceSurface(
      context.req.header(BOB_INTERFACE_SURFACE_HEADER),
    );
    const handler = createBobMcpHandler(sharedContextService, {
      binding: {
        ...(projectKey ? { projectKey } : {}),
        ...(surface ? { surface } : {}),
      },
    });

    return handler.fetch(context.req.raw);
  });

  app.all("/mcp/sync", async (context) => {
    const requestId = context.get("requestId") ?? crypto.randomUUID();
    const failure = await authenticationFailure(
      context.req.header("authorization"),
      config,
    );

    if (failure) {
      return context.json(
        {
          error: {
            code: failure,
            message: authenticationMessage(failure),
            requestId,
          },
        },
        401,
      );
    }

    if (!sharedContextService) {
      return context.json(
        {
          error: {
            code: "shared_context_not_configured",
            message: "Bob Core shared context is not configured yet.",
            requestId,
          },
        },
        503,
      );
    }

    const interfaceId = context.req.header(BOB_INTERFACE_ID_HEADER)?.trim();
    const projectKey = context.req.header(BOB_INTERFACE_PROJECT_HEADER)?.trim();
    const surface = interfaceSurface(
      context.req.header(BOB_INTERFACE_SURFACE_HEADER),
    );
    const scopes = interfaceScopes(
      context.req.header(BOB_INTERFACE_SCOPES_HEADER),
    );

    if (
      !interfaceId ||
      !projectKey ||
      !surface ||
      !scopes.includes("mcp:sync")
    ) {
      return context.json(
        {
          error: {
            code: "interface_identity_required",
            message:
              "Bob Core two-way sync requires a verified, project-bound interface credential.",
            requestId,
          },
        },
        403,
      );
    }

    const handler = createBobMcpHandler(sharedContextService, {
      binding: { projectKey, surface },
      sync: {
        interfaceId,
        scopes,
      },
    });

    return handler.fetch(context.req.raw);
  });
}
