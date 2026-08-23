import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

import { classifyProviderError } from "./ai/provider-error.js";
import type { AIProvider } from "./ai/provider.js";
import type { BobCoreConfig } from "./config.js";
import {
  chatRequestSchema,
  contextRequestSchema,
  memoryCreateRequestSchema,
  memoryIdSchema,
  type ChatResponse,
  type ErrorResponse,
} from "./contracts.js";
import {
  SharedContextProjectNotFoundError,
  type SharedContextService,
} from "./context/service.js";
import { MemoryPolicyError } from "./memory/policy.js";
import type { MemoryService } from "./memory/service.js";
import type { MemoryItem } from "./memory/types.js";
import { tokenMatches } from "./security/token.js";

const SERVICE_VERSION = "0.2.0";

type Variables = {
  requestId: string;
};

type AppDependencies = {
  config: BobCoreConfig;
  aiProvider: AIProvider;
  memoryService?: MemoryService | undefined;
  sharedContextService?: SharedContextService | undefined;
};

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, 50);
}

function publicMemory(item: MemoryItem) {
  return {
    id: item.id,
    scope: item.scope,
    subject: item.subject,
    content: item.content,
    source: item.source,
    sensitivity: item.sensitivity,
    metadata: item.metadata,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function createApp({
  config,
  aiProvider,
  memoryService,
  sharedContextService,
}: AppDependencies) {
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
      endpoints: [
        "/health",
        "/v1/status",
        "/v1/context",
        "/v1/chat",
        "/v1/memories",
      ],
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
      provider: config.aiProvider,
      model: config.aiModel,
      memory: {
        enabled: memoryService !== undefined,
        storage: memoryService ? "neon" : "disabled",
        capture: "explicit-only",
        retrieval: memoryService ? "automatic" : "disabled",
      },
      sharedContext: {
        enabled: sharedContextService !== undefined,
        version: "0.2",
        storage: sharedContextService ? "neon" : "disabled",
      },
      requestId: context.get("requestId"),
    }),
  );

  app.get("/v1/context", async (context) => {
    const requestId = context.get("requestId");

    if (!sharedContextService) {
      return context.json<ErrorResponse>(
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

    const parsed = contextRequestSchema.safeParse({
      project: context.req.query("project"),
      task: context.req.query("task"),
      surface: context.req.query("surface") ?? "other",
    });

    if (!parsed.success) {
      return context.json<ErrorResponse>(
        {
          error: {
            code: "invalid_context_request",
            message: "The shared-context request failed validation.",
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
      const sharedContext = await sharedContextService.build({
        projectKey: parsed.data.project,
        surface: parsed.data.surface,
        ...(parsed.data.task ? { task: parsed.data.task } : {}),
      });

      return context.json({
        context: sharedContext,
        requestId,
      });
    } catch (error) {
      if (error instanceof SharedContextProjectNotFoundError) {
        return context.json<ErrorResponse>(
          {
            error: {
              code: "shared_context_project_not_found",
              message: "That project is not registered in Bob Core yet.",
              requestId,
            },
          },
          404,
        );
      }

      if (config.nodeEnvironment !== "test") {
        console.error(
          JSON.stringify({
            event: "shared_context.request_failed",
            requestId,
            operation: "build",
            errorName: errorName(error),
          }),
        );
      }

      return context.json<ErrorResponse>(
        {
          error: {
            code: "shared_context_unavailable",
            message: "Bob Core could not assemble shared context. Try again shortly.",
            requestId,
          },
        },
        503,
      );
    }
  });

  app.get("/v1/memories", async (context) => {
    const requestId = context.get("requestId");

    if (!memoryService) {
      return context.json<ErrorResponse>(
        {
          error: {
            code: "memory_not_configured",
            message: "Bob Core memory is not configured yet.",
            requestId,
          },
        },
        503,
      );
    }

    const query = context.req.query("q")?.trim();
    const limit = parseLimit(context.req.query("limit"), 20);

    try {
      const memories = query
        ? await memoryService.search(query, limit)
        : await memoryService.list(limit);

      return context.json({
        memories: memories.map(publicMemory),
        requestId,
      });
    } catch (error) {
      if (config.nodeEnvironment !== "test") {
        console.error(
          JSON.stringify({
            event: "memory.request_failed",
            requestId,
            operation: "list",
            errorName: errorName(error),
          }),
        );
      }

      return context.json<ErrorResponse>(
        {
          error: {
            code: "memory_unavailable",
            message: "Bob Core could not read memory. Try again shortly.",
            requestId,
          },
        },
        503,
      );
    }
  });

  app.post(
    "/v1/memories",
    bodyLimit({
      maxSize: 8 * 1_024,
      onError: (context) =>
        context.json<ErrorResponse>(
          {
            error: {
              code: "payload_too_large",
              message: "The memory request is too large.",
              requestId: context.get("requestId"),
            },
          },
          413,
        ),
    }),
    async (context) => {
      const requestId = context.get("requestId");

      if (!memoryService) {
        return context.json<ErrorResponse>(
          {
            error: {
              code: "memory_not_configured",
              message: "Bob Core memory is not configured yet.",
              requestId,
            },
          },
          503,
        );
      }

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

      const parsed = memoryCreateRequestSchema.safeParse(body);

      if (!parsed.success) {
        return context.json<ErrorResponse>(
          {
            error: {
              code: "invalid_request",
              message: "The memory request failed validation.",
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
        const metadata: Record<string, unknown> = {};

        if (parsed.data.projectKey) {
          metadata.projectKey = parsed.data.projectKey;
        }

        if (parsed.data.tags) {
          metadata.tags = parsed.data.tags;
        }

        const result = await memoryService.remember(parsed.data.content, {
          source: "api_explicit",
          requestId,
          metadata,
          ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
          ...(parsed.data.subject !== undefined
            ? { subject: parsed.data.subject }
            : {}),
          ...(parsed.data.sensitivity
            ? { sensitivity: parsed.data.sensitivity }
            : {}),
        });
        const response = {
          memory: publicMemory(result.item),
          created: result.created,
          requestId,
        };

        return result.created
          ? context.json(response, 201)
          : context.json(response, 200);
      } catch (error) {
        if (error instanceof MemoryPolicyError) {
          return context.json<ErrorResponse>(
            {
              error: {
                code: "memory_policy_rejected",
                message: error.message,
                requestId,
              },
            },
            400,
          );
        }

        if (config.nodeEnvironment !== "test") {
          console.error(
            JSON.stringify({
              event: "memory.request_failed",
              requestId,
              operation: "create",
              errorName: errorName(error),
            }),
          );
        }

        return context.json<ErrorResponse>(
          {
            error: {
              code: "memory_unavailable",
              message: "Bob Core could not save memory. Try again shortly.",
              requestId,
            },
          },
          503,
        );
      }
    },
  );

  app.delete("/v1/memories/:memoryId", async (context) => {
    const requestId = context.get("requestId");

    if (!memoryService) {
      return context.json<ErrorResponse>(
        {
          error: {
            code: "memory_not_configured",
            message: "Bob Core memory is not configured yet.",
            requestId,
          },
        },
        503,
      );
    }

    const parsedId = memoryIdSchema.safeParse(context.req.param("memoryId"));

    if (!parsedId.success) {
      return context.json<ErrorResponse>(
        {
          error: {
            code: "invalid_memory_id",
            message: "The memory identifier is invalid.",
            requestId,
          },
        },
        400,
      );
    }

    try {
      const forgotten = await memoryService.forgetById(
        parsedId.data,
        requestId,
      );

      if (!forgotten) {
        return context.json<ErrorResponse>(
          {
            error: {
              code: "memory_not_found",
              message: "That memory does not exist or was already removed.",
              requestId,
            },
          },
          404,
        );
      }

      return context.json({
        forgotten: publicMemory(forgotten),
        requestId,
      });
    } catch (error) {
      if (config.nodeEnvironment !== "test") {
        console.error(
          JSON.stringify({
            event: "memory.request_failed",
            requestId,
            operation: "forget",
            errorName: errorName(error),
          }),
        );
      }

      return context.json<ErrorResponse>(
        {
          error: {
            code: "memory_unavailable",
            message: "Bob Core could not remove memory. Try again shortly.",
            requestId,
          },
        },
        503,
      );
    }
  });

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

      const conversationId =
        parsed.data.conversationId ?? crypto.randomUUID();
      const latestUserMessage = parsed.data.messages.at(-1)?.content ?? "";
      const memoryCommand = memoryService?.parseCommand(latestUserMessage);

      if (memoryService && memoryCommand) {
        try {
          const handled = await memoryService.handleCommand(
            memoryCommand,
            requestId,
          );
          const response: ChatResponse = {
            conversationId,
            message: {
              role: "assistant",
              content: handled.reply,
            },
            model: "bob-memory-v0.1",
            requestId,
          };

          return context.json(response);
        } catch (error) {
          if (config.nodeEnvironment !== "test") {
            console.error(
              JSON.stringify({
                event: "memory.request_failed",
                requestId,
                operation: memoryCommand.type,
                errorName: errorName(error),
              }),
            );
          }

          return context.json<ErrorResponse>(
            {
              error: {
                code: "memory_unavailable",
                message:
                  "Bob Core could not complete that memory request. Try again shortly.",
                requestId,
              },
            },
            503,
          );
        }
      }

      if (!memoryService && /\b(?:remember|forget|memories)\b/i.test(latestUserMessage)) {
        return context.json<ErrorResponse>(
          {
            error: {
              code: "memory_not_configured",
              message: "Bob Core memory is not configured yet.",
              requestId,
            },
          },
          503,
        );
      }

      let memoryContext: string | undefined;

      if (memoryService) {
        try {
          memoryContext = await memoryService.buildContext(latestUserMessage);
        } catch (error) {
          if (config.nodeEnvironment !== "test") {
            console.error(
              JSON.stringify({
                event: "memory.request_failed",
                requestId,
                operation: "retrieve",
                errorName: errorName(error),
              }),
            );
          }
        }
      }

      try {
        const generated = memoryContext
          ? await aiProvider.generate(parsed.data.messages, { memoryContext })
          : await aiProvider.generate(parsed.data.messages);
        const response: ChatResponse = {
          conversationId,
          message: {
            role: "assistant",
            content: generated.text,
          },
          model: generated.model,
          requestId,
        };

        return context.json(response);
      } catch (error) {
        const providerFailure = classifyProviderError(
          error,
          config.aiProvider,
        );

        if (config.nodeEnvironment !== "test") {
          console.error(
            JSON.stringify({
              event: "ai.request_failed",
              requestId,
              provider: config.aiProvider,
              model: config.aiModel,
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
