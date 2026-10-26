import { z } from "zod";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
} from "../security/interface-credential.js";
import {
  SharedContextService,
  SharedContextProjectNotFoundError,
  SharedContextProjectBindingError,
  SharedContextTaskNotFoundError,
  SharedContextTaskVersionError,
  SharedContextOperationConflictError,
  SharedContextTaskAmbiguousError,
  SharedContextTaskRequiresApprovalError,
  SharedContextTaskCursorError,
} from "./service.js";
import {
  TASK_PRIORITIES,
  SYNC_TASK_STATUSES,
  type ContextSurface,
} from "./types.js";

const operationId = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/);
const title = z.string().trim().min(1).max(180);
const dueAt = z.iso
  .datetime({ offset: true })
  .transform((date) => new Date(date).toISOString())
  .nullable()
  .optional();
export const createTaskSchema = z
  .object({
    operationId,
    expectedProjectId: z.uuid().optional(),
    title,
    description: z.string().trim().max(2_000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt,
  })
  .strict();
export const updateTaskSchema = z
  .object({
    operationId,
    expectedProjectId: z.uuid().optional(),
    expectedVersion: z.number().int().positive(),
    newTitle: title.optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    status: z.enum(SYNC_TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt,
  })
  .strict();
export const handoffSchema = z
  .object({
    operationId,
    expectedProjectId: z.uuid().optional(),
    outcome: z.string().trim().min(1).max(2_000),
    unresolved: z.array(z.string().trim().min(1).max(500)).max(10),
    nextActions: z.array(z.string().trim().min(1).max(500)).max(10),
  })
  .strict();

function defined<T extends object>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

export function mountContinuityRoutes(
  app: Hono<{ Variables: { requestId: string } }>,
  service?: SharedContextService,
) {
  app.on("GET", ["/v1/tasks", "/v1/tasks/:id"], async (context) => {
    context.header("cache-control", "no-store");
    const requestId = context.get("requestId");
    if (!service)
      return context.json({ error: { code: "shared_context_unavailable", requestId } }, 503);
    const bound = context.req.header(BOB_INTERFACE_PROJECT_HEADER);
    const requested = context.req.query("project")?.trim().toLowerCase();
    if (bound && requested && requested !== bound)
      return context.json({ error: { code: "interface_scope_forbidden", requestId } }, 403);
    const projectKey = bound ?? requested ?? "personal";
    const id = context.req.param("id");
    if (id && !z.uuid().safeParse(id).success)
      return context.json({ error: { code: "invalid_task_id", requestId } }, 400);
    const query = z.object({
      limit: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).pipe(z.number().max(100)).optional(),
      cursor: z.uuid().optional(),
    }).safeParse({ limit: context.req.query("limit"), cursor: context.req.query("cursor") });
    if (!query.success)
      return context.json({ error: { code: "invalid_request", requestId } }, 400);
    try {
      return context.json(id
        ? await service.readTask({ projectKey, taskId: id })
        : await service.listTasks({ projectKey, ...defined(query.data) }));
    } catch (error) {
      if (error instanceof SharedContextTaskCursorError)
        return context.json({ error: { code: "invalid_cursor", message: error.message, requestId } }, 400);
      if (error instanceof SharedContextTaskNotFoundError || error instanceof SharedContextProjectNotFoundError)
        return context.json({ error: { code: "not_found", requestId } }, 404);
      return context.json({ error: { code: "tasks_unavailable", message: "Tasks could not be retrieved. Refresh after reconnecting.", requestId } }, 503);
    }
  });
  app.on(
    ["POST", "PATCH"],
    ["/v1/tasks", "/v1/tasks/:id", "/v1/handoffs"],
    bodyLimit({ maxSize: 16_384 }),
    async (context) => {
      const requestId = context.get("requestId");
      if (!service)
        return context.json(
          { error: { code: "shared_context_unavailable", requestId } },
          503,
        );
      const bound = context.req.header(BOB_INTERFACE_PROJECT_HEADER);
      const requested = context.req.query("project")?.trim().toLowerCase();
      if (bound && requested && requested !== bound)
        return context.json(
          { error: { code: "interface_scope_forbidden", requestId } },
          403,
        );
      const projectKey = bound ?? requested ?? "personal";
      const actor = {
        interfaceId:
          context.req.header(BOB_INTERFACE_ID_HEADER) ?? "owner-primary",
        surface: (context.req.header(BOB_INTERFACE_SURFACE_HEADER) ??
          "bobai") as ContextSurface,
      };
      const body = await context.req.json().catch(() => null);
      const isHandoff = context.req.path === "/v1/handoffs";
      const isUpdate = context.req.method === "PATCH" && !isHandoff;
      const schema = isHandoff
        ? handoffSchema
        : isUpdate
          ? updateTaskSchema
          : createTaskSchema;
      const parsed = schema.safeParse(body);
      if (!parsed.success)
        return context.json(
          {
            error: {
              code: "invalid_request",
              message: "The request failed validation.",
              requestId,
              details: parsed.error.issues,
            },
          },
          400,
        );
      try {
        if (isHandoff) {
          if (context.req.method !== "POST")
            return context.json(
              { error: { code: "method_not_allowed", requestId } },
              405,
            );
          return context.json(
            await service.recordHandoff({
              ...handoffSchema.parse(body),
              projectKey,
              actor,
            }),
          );
        }
        if (isUpdate) {
          const id = z.uuid().safeParse(context.req.param("id"));
          if (!id.success)
            return context.json(
              { error: { code: "invalid_task_id", requestId } },
              400,
            );
          return context.json(
            await service.updateSyncedTask({
              ...defined(updateTaskSchema.parse(body)),
              taskId: id.data,
              projectKey,
              actor,
            }),
          );
        }
        if (context.req.path !== "/v1/tasks")
          return context.json(
            { error: { code: "method_not_allowed", requestId } },
            405,
          );
        const result = await service.createSyncedTask({
          ...defined(createTaskSchema.parse(body)),
          reuseByTitle: false,
          projectKey,
          actor,
        });
        return context.json(
          result,
          result.created && !result.idempotent ? 201 : 200,
        );
      } catch (error) {
        if (error instanceof SharedContextTaskRequiresApprovalError)
          return context.json({ error: { code: "task_requires_approval", message: error.message, requestId } }, 403);
        if (error instanceof SharedContextProjectBindingError)
          return context.json(
            {
              error: {
                code: "project_binding_changed",
                message: error.message,
                requestId,
              },
            },
            409,
          );
        if (error instanceof SharedContextTaskVersionError)
          return context.json(
            {
              error: {
                code: "task_version_conflict",
                message: error.message,
                current: error.current,
                requestId,
              },
            },
            409,
          );
        if (error instanceof SharedContextOperationConflictError)
          return context.json(
            {
              error: {
                code: "operation_conflict",
                message: error.message,
                requestId,
              },
            },
            409,
          );
        if (error instanceof SharedContextTaskAmbiguousError)
          return context.json(
            {
              error: {
                code: "task_title_ambiguous",
                message: error.message,
                requestId,
              },
            },
            409,
          );
        if (
          error instanceof SharedContextTaskNotFoundError ||
          error instanceof SharedContextProjectNotFoundError
        )
          return context.json({ error: { code: "not_found", requestId } }, 404);
        return context.json(
          {
            error: {
              code: "synchronization_unavailable",
              message: "Retry with the same operationId after reconnecting.",
              requestId,
            },
          },
          503,
        );
      }
    },
  );
}
