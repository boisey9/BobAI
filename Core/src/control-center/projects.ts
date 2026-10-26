import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import type { createApp } from "../app.js";
import type { SharedContextService } from "../context/service.js";
import {
  SharedContextOperationConflictError,
  SharedContextProjectAnchorError,
  SharedContextProjectExistsError,
} from "../context/operations.js";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SCOPES_HEADER,
  BOB_INTERFACE_SURFACE_HEADER,
} from "../security/interface-credential.js";

const optionalText = (maximum: number) => z.string().trim().max(maximum)
  .nullable().optional().transform(value => value || null);
const repository = optionalText(500).refine(value => {
  if (value === null) return true;
  try {
    const url = new URL(value);
    return value.startsWith("https://") && !/\s/.test(value) && url.protocol === "https:" &&
      !url.username && !url.password && !url.href.includes("?") && !url.href.includes("#") && url.href.length <= 500;
  } catch { return false; }
}, "Repository must be an HTTPS URL without credentials, a query, or a fragment.")
  .transform(value => value === null ? null : new URL(value).href);

export const createOwnerProjectSchema = z.object({
  operationId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/),
  expectedAnchorId: z.string().trim().pipe(z.uuid()).transform(value => value.toLowerCase()),
  projectKey: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/)
    .refine(value => value !== "personal", "Personal already belongs to the owner."),
  name: z.string().trim().min(1).max(200),
  description: optionalText(4_000),
  repository,
}).strict();

export function mountBobProjectCreation(
  app: ReturnType<typeof createApp>,
  service?: SharedContextService,
): void {
  // These internal headers are stripped/replaced by the credential gateway.
  // Unlike historical administration routes, the primary device token cannot
  // act as an owner and a project-bound credential cannot create another project.
  app.use("/v1/control-center/projects", async (context, next) => {
    if (context.req.method !== "POST") return next();
    const scopes = new Set((context.req.header(BOB_INTERFACE_SCOPES_HEADER) ?? "").split(","));
    if (!context.req.header(BOB_INTERFACE_ID_HEADER)?.trim() ||
      context.req.header(BOB_INTERFACE_SURFACE_HEADER) !== "web" ||
      context.req.header(BOB_INTERFACE_PROJECT_HEADER) !== undefined || !scopes.has("control-center:owner"))
      return context.json({ error: { code: "owner_access_required", requestId: context.get("requestId") } }, 403);
    return next();
  });
  app.use("/v1/control-center/projects/new", async (context, next) => {
    if (!["GET", "HEAD"].includes(context.req.method)) return next();
    const scopes = new Set((context.req.header(BOB_INTERFACE_SCOPES_HEADER) ?? "").split(","));
    if (!context.req.header(BOB_INTERFACE_ID_HEADER)?.trim() ||
      context.req.header(BOB_INTERFACE_SURFACE_HEADER) !== "web" ||
      context.req.header(BOB_INTERFACE_PROJECT_HEADER) !== undefined || !scopes.has("control-center:owner"))
      return context.json({ error: { code: "owner_access_required", requestId: context.get("requestId") } }, 403);
    return next();
  });

  app.get("/v1/control-center/projects/new", async context => {
    const requestId = context.get("requestId");
    if (!service) return context.json({ error: { code: "shared_context_unavailable", requestId } }, 503);
    try { return context.json(await service.projectCreationAnchor()); }
    catch (error) {
      if (error instanceof SharedContextProjectAnchorError)
        return context.json({ error: { code: "project_anchor_unavailable", message: error.message, requestId } }, 409);
      return context.json({ error: { code: "project_creation_unavailable", requestId } }, 503);
    }
  });

  app.post("/v1/control-center/projects", bodyLimit({ maxSize: 24_576, onError: context =>
    context.json({ error: { code: "request_too_large", requestId: context.get("requestId") } }, 413) }), async context => {
    const requestId = context.get("requestId");
    if (!service) return context.json({ error: { code: "shared_context_unavailable", requestId } }, 503);
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(context.req.header("content-type")?.trim() ?? ""))
      return context.json({ error: { code: "unsupported_media_type", requestId } }, 415);
    const body = await context.req.json().catch(() => null);
    const parsed = createOwnerProjectSchema.safeParse(body);
    if (!parsed.success) return context.json({ error: { code: "invalid_request", requestId } }, 400);
    try {
      const result = await service.createOwnerProject(parsed.data, context.req.header(BOB_INTERFACE_ID_HEADER)!);
      return context.json(result, result.idempotent ? 200 : 201);
    } catch (error) {
      if (error instanceof SharedContextProjectAnchorError)
        return context.json({ error: { code: "project_anchor_unavailable", message: error.message, requestId } }, 409);
      if (error instanceof SharedContextProjectExistsError)
        return context.json({ error: { code: "project_exists", message: error.message, requestId } }, 409);
      if (error instanceof SharedContextOperationConflictError)
        return context.json({ error: { code: "operation_conflict", message: "This operation ID was already used. Retry its original request or start a new operation.", requestId } }, 409);
      return context.json({ error: { code: "project_creation_unavailable", message: "Project creation could not be confirmed. Retry the same request with the same operation ID.", requestId } }, 503);
    }
  });
}
