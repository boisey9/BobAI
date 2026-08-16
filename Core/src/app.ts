import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

import { classifyProviderError } from "./ai/provider-error.js";
import type { AIProvider } from "./ai/provider.js";
import type { BobCoreConfig } from "./config.js";
import {
  chatRequestSchema,
  type ChatResponse,
  type ErrorResponse,
} from "./contracts.js";
import { tokenMatches } from "./security/token.js";

const SERVICE_VERSION = "0.1.0";

type Variables = {
  requestId: string;
};

type AppDependencies = {
  config: BobCoreConfig;
  aiProvider: AIProvider;
};

export function createApp({ config, aiProvider }: AppDependencies) {
  const app = new Hono<{ Variables: Variables }>();

  app.use("*", secureHeaders());

  app.use("*", async (context, next) => {
    const incomingRequestId = context.req.header("x-request-id");
    const requestId =
      incomingRequestId && incomingRequestId.length <= 100
        ? incomingRequestId
        : crypto.randomUUID();
    const startedAt = Date.now();

    context.set("requestId", requestId);
    context.header("x-request-id", requestId);
    context.header("cache-control", "no-store");

    await next();

    if (config.nodeEnvironment !== "test") {
      console.info(
        JSON.stringify({
          event: "request.completed",
          requestId,
          method: context.req.method,
          path: context.req.path,
          status: context.res.status,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  });

  app.get("/", (context) =>
    context.json({
      service: "Bob Core",
      version: SERVICE_VERSION,
      endpoints: ["/health", "/v1/status", "/v1/chat"],
    }),
  );

  app.get("/health", (context) =>
    context.json({
      status: "ok",
      service: "bob-core",
      version: SERVICE_VERSION,
      environment: config.nodeEnvironment,
    }),
  );

  app.use("/v1/*", async (context, next) => {
    const requestId = context.get("requestId");
    const authorization = context.req.header("authorization");

    if (!authorization) {
      return context.json<ErrorResponse>(
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
      return context.json<ErrorResponse>(
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
      return context.json<ErrorResponse>(
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

    await next();
  });

  app.get("/v1/status", (context) =>
    context.json({
      status: "ready",
      service: "bob-core",
      version: SERVICE_VERSION,
      model: config.openAIModel,
      requestId: context.get("requestId"),
    }),
  );

  app.post(
    "/v1/chat",
    bodyLimit({
      maxSize: 32 * 1_024,
      onError: (context) =>
        context.json<ErrorResponse>(
          {
            error: {
              code: "payload_too_large",
              message: "The chat request is too large.",
              requestId: context.get("requestId"),
            },
          },
          413,
        ),
    }),
    async (context) => {
      const requestId = context.get("requestId");
      let body: unknown;

      try {
        body = await context.req.json();
      } catch {
        return context.json<ErrorResponse>(
          {
            error: {
              code: "invalid_json",
              message: "The request body must be valid JSON.",
              requestId,
            },
          },
          400,
        );
      }

      const parsed = chatRequestSchema.safeParse(body);

      if (!parsed.success) {
        return context.json<ErrorResponse>(
          {
            error: {
              code: "invalid_request",
              message: "The chat request failed validation.",
              requestId,
              details: parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
          },
          400,
        );
      }

      try {
        const generated = await aiProvider.generate(parsed.data.messages);
        const response: ChatResponse = {
          conversationId:
            parsed.data.conversationId ?? crypto.randomUUID(),
          message: {
            role: "assistant",
            content: generated.text,
          },
          model: generated.model,
          requestId,
        };

        return context.json(response);
      } catch (error) {
        const providerFailure = classifyProviderError(error);

        if (config.nodeEnvironment !== "test") {
          console.error(
            JSON.stringify({
              event: "ai.request_failed",
              requestId,
              errorName: providerFailure.errorName,
              providerStatus: providerFailure.status,
              providerCode: providerFailure.providerCode,
              providerRequestId: providerFailure.providerRequestId,
            }),
          );
        }

        return context.json<ErrorResponse>(
          {
            error: {
              code: providerFailure.publicCode,
              message: providerFailure.publicMessage,
              requestId,
            },
          },
          providerFailure.httpStatus,
        );
      }
    },
  );

  app.notFound((context) =>
    context.json<ErrorResponse>(
      {
        error: {
          code: "not_found",
          message: "The requested Bob Core endpoint does not exist.",
          requestId: context.get("requestId"),
        },
      },
      404,
    ),
  );

  app.onError((error, context) => {
    const requestId = context.get("requestId") ?? crypto.randomUUID();

    if (config.nodeEnvironment !== "test") {
      console.error(
        JSON.stringify({
          event: "request.unhandled_error",
          requestId,
          errorName: error.name,
        }),
      );
    }

    return context.json<ErrorResponse>(
      {
        error: {
          code: "internal_error",
          message: "Bob Core encountered an unexpected error.",
          requestId,
        },
      },
      500,
    );
  });

  return app;
}
