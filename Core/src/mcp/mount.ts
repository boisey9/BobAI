import type { createApp } from "../app.js";
import type { BobCoreConfig } from "../config.js";
import type { SharedContextService } from "../context/service.js";
import { tokenMatches } from "../security/token.js";
import { createBobMcpHandler } from "./server.js";

type BobCoreApp = ReturnType<typeof createApp>;

export function mountBobMcp(
  app: BobCoreApp,
  config: BobCoreConfig,
  sharedContextService?: SharedContextService,
): void {
  const handler = sharedContextService
    ? createBobMcpHandler(sharedContextService)
    : undefined;

  app.all("/mcp", async (context) => {
    const requestId = context.get("requestId") ?? crypto.randomUUID();
    const authorization = context.req.header("authorization");

    if (!authorization) {
      return context.json(
        {
          error: {
            code: "authentication_required",
            message: "A Bob Core device token is required.",
            requestId,
          },
        },
        401,
      );
    }

    const [scheme, providedToken, ...extraParts] = authorization
      .trim()
      .split(/\s+/);

    if (
      scheme?.toLowerCase() !== "bearer" ||
      !providedToken ||
      extraParts.length > 0
    ) {
      return context.json(
        {
          error: {
            code: "invalid_authorization_header",
            message: "The Authorization header is invalid.",
            requestId,
          },
        },
        401,
      );
    }

    if (!(await tokenMatches(providedToken, config.deviceToken))) {
      return context.json(
        {
          error: {
            code: "invalid_device_token",
            message: "The Bob Core device token is invalid.",
            requestId,
          },
        },
        401,
      );
    }

    if (!handler) {
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

    return handler.fetch(context.req.raw);
  });
}
