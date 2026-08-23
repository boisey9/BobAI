import type { createApp } from "../app.js";
import { activityRequestSchema, type ErrorResponse } from "../contracts.js";
import {
  SharedContextProjectNotFoundError,
  type SharedContextService,
} from "../context/service.js";

type BobCoreApp = ReturnType<typeof createApp>;

export function mountBobActivity(
  app: BobCoreApp,
  sharedContextService?: SharedContextService,
): void {
  app.get("/v1/activity", async (context) => {
    const requestId = context.get("requestId") ?? crypto.randomUUID();

    if (!sharedContextService) {
      return context.json<ErrorResponse>(
        {
          error: {
            code: "shared_context_not_configured",
            message: "Bob Core activity is not configured yet.",
            requestId,
          },
        },
        503,
      );
    }

    const parsed = activityRequestSchema.safeParse({
      project: context.req.query("project"),
      limit: context.req.query("limit") ?? 50,
    });

    if (!parsed.success) {
      return context.json<ErrorResponse>(
        {
          error: {
            code: "invalid_activity_request",
            message: "The activity request failed validation.",
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
      const activity = await sharedContextService.listActivity({
        limit: parsed.data.limit,
        ...(parsed.data.project ? { projectKey: parsed.data.project } : {}),
      });

      return context.json({
        activity,
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

      return context.json<ErrorResponse>(
        {
          error: {
            code: "activity_unavailable",
            message: "Bob Core could not read the activity timeline. Try again shortly.",
            requestId,
          },
        },
        503,
      );
    }
  });
}
