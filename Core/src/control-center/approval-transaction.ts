import { neon } from "@neondatabase/serverless";

import type { createApp } from "../app.js";
import type { BobCoreConfig } from "../config.js";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SCOPES_HEADER,
} from "../security/interface-credential.js";

type BobCoreApp = ReturnType<typeof createApp>;

type ProjectRow = { id: string };
type ApprovalResultRow = {
  task_id: string;
  decision_title: string;
  decision_id: string | null;
};
type RejectionResultRow = {
  task_id: string;
  decision_title: string;
};

const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function interfaceScopes(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}

function authorized(context: any): boolean {
  const interfaceId = context.req.header(BOB_INTERFACE_ID_HEADER);
  if (!interfaceId) return true;
  return interfaceScopes(
    context.req.header(BOB_INTERFACE_SCOPES_HEADER),
  ).has("decision:review");
}

function boundProject(
  context: any,
  requested: string | undefined,
): string | null {
  const trusted = context.req
    .header(BOB_INTERFACE_PROJECT_HEADER)
    ?.trim()
    .toLowerCase();
  if (trusted && PROJECT_KEY.test(trusted)) return trusted;

  const candidate = requested?.trim().toLowerCase();
  return candidate && PROJECT_KEY.test(candidate) ? candidate : null;
}

function errorResponse(
  context: any,
  status: 400 | 403 | 404 | 409 | 503,
  code: string,
  message: string,
) {
  return context.json(
    {
      error: {
        code,
        message,
        requestId: context.get("requestId") ?? crypto.randomUUID(),
      },
    },
    status,
  );
}

async function requestBody(
  context: any,
): Promise<Record<string, unknown> | null> {
  try {
    return toObject(await context.req.json());
  } catch {
    return null;
  }
}

function databaseCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

export function mountBobControlCenterApprovalTransaction(
  app: BobCoreApp,
  config: BobCoreConfig,
): void {
  const sql = config.databaseURL ? neon(config.databaseURL) : null;

  app.post("/v1/control-center/approvals/:taskId", async (context) => {
    if (!authorized(context)) {
      return errorResponse(
        context,
        403,
        "decision_review_scope_forbidden",
        "This credential cannot resolve decision proposals.",
      );
    }
    if (!sql) {
      return errorResponse(
        context,
        503,
        "control_center_not_configured",
        "Bob Control Center administration is not configured.",
      );
    }

    const taskId = context.req.param("taskId");
    if (!UUID.test(taskId)) {
      return errorResponse(
        context,
        400,
        "invalid_task_id",
        "The approval task identifier is invalid.",
      );
    }

    const body = await requestBody(context);
    const action = body ? stringValue(body, "action") : null;
    const note = body ? stringValue(body, "note") : null;
    const projectKey = boundProject(
      context,
      body ? stringValue(body, "project") ?? undefined : undefined,
    );

    if (
      !body ||
      (action !== "approve" && action !== "reject") ||
      !projectKey
    ) {
      return errorResponse(
        context,
        400,
        "invalid_approval_request",
        "A valid project and approval action are required.",
      );
    }
    if (note && note.length > 500) {
      return errorResponse(
        context,
        400,
        "approval_note_too_long",
        "The approval note must be 500 characters or fewer.",
      );
    }

    const requestId = context.get("requestId") ?? crypto.randomUUID();
    const interfaceId =
      context.req.header(BOB_INTERFACE_ID_HEADER)?.trim() || "primary";

    try {
      const projects = (await sql`
        SELECT id::text
        FROM public.bob_projects
        WHERE owner_id = ${config.ownerId}
          AND lower(project_key) = lower(${projectKey})
          AND deleted_at IS NULL
        LIMIT 1
      `) as ProjectRow[];
      const project = projects[0];
      if (!project) {
        return errorResponse(
          context,
          404,
          "control_center_project_not_found",
          "That project is not registered in Bob Core.",
        );
      }

      if (action === "approve") {
        const decisionId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        const results = await sql.transaction([
          sql`
            SELECT id::text
            FROM public.bob_tasks
            WHERE owner_id = ${config.ownerId}
              AND project_id = ${project.id}::uuid
              AND id = ${taskId}::uuid
              AND metadata ->> 'kind' = 'decision_review'
              AND status IN ('open', 'in_progress', 'blocked')
            FOR UPDATE
          `,
          sql`
            INSERT INTO public.bob_decisions (
              id, owner_id, project_id, title, decision, reason, status, source, metadata
            )
            SELECT
              ${decisionId}::uuid,
              ${config.ownerId},
              ${project.id}::uuid,
              t.metadata ->> 'decisionTitle',
              t.metadata ->> 'proposal',
              NULLIF(t.metadata ->> 'reason', ''),
              'active',
              'control-center',
              jsonb_build_object(
                'reviewTaskId', t.id::text,
                'approvedByInterface', ${interfaceId}::text,
                'approvedAt', now(),
                'note', ${note}::text
              )
            FROM public.bob_tasks t
            WHERE t.owner_id = ${config.ownerId}
              AND t.project_id = ${project.id}::uuid
              AND t.id = ${taskId}::uuid
              AND t.metadata ->> 'kind' = 'decision_review'
              AND t.status IN ('open', 'in_progress', 'blocked')
              AND NULLIF(t.metadata ->> 'decisionTitle', '') IS NOT NULL
              AND NULLIF(t.metadata ->> 'proposal', '') IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM public.bob_decisions d
                WHERE d.owner_id = ${config.ownerId}
                  AND d.project_id = ${project.id}::uuid
                  AND d.status = 'active'
                  AND lower(d.title) = lower(t.metadata ->> 'decisionTitle')
              )
            RETURNING id::text
          `,
          sql`
            UPDATE public.bob_tasks t
            SET
              status = 'done',
              completed_at = now(),
              updated_at = now(),
              metadata = t.metadata || jsonb_build_object(
                'resolution', 'approved'::text,
                'resolvedAt', now(),
                'resolvedByInterface', ${interfaceId}::text,
                'resolutionNote', ${note}::text,
                'decisionId', (
                  SELECT d.id::text
                  FROM public.bob_decisions d
                  WHERE d.owner_id = ${config.ownerId}
                    AND d.project_id = ${project.id}::uuid
                    AND d.status = 'active'
                    AND lower(d.title) = lower(t.metadata ->> 'decisionTitle')
                  ORDER BY d.created_at ASC
                  LIMIT 1
                )
              )
            WHERE t.owner_id = ${config.ownerId}
              AND t.project_id = ${project.id}::uuid
              AND t.id = ${taskId}::uuid
              AND t.metadata ->> 'kind' = 'decision_review'
              AND t.status IN ('open', 'in_progress', 'blocked')
              AND EXISTS (
                SELECT 1
                FROM public.bob_decisions d
                WHERE d.owner_id = ${config.ownerId}
                  AND d.project_id = ${project.id}::uuid
                  AND d.status = 'active'
                  AND lower(d.title) = lower(t.metadata ->> 'decisionTitle')
              )
            RETURNING
              t.id::text AS task_id,
              t.metadata ->> 'decisionTitle' AS decision_title,
              t.metadata ->> 'decisionId' AS decision_id
          `,
          sql`
            INSERT INTO public.bob_events (
              id, owner_id, project_id, event_type, summary, source, details
            )
            SELECT
              ${eventId}::uuid,
              ${config.ownerId},
              ${project.id}::uuid,
              'decision.approved',
              'Decision approved in Bob Control Center: ' || COALESCE(t.metadata ->> 'decisionTitle', t.title),
              'web',
              jsonb_build_object(
                'reviewTaskId', t.id::text,
                'decisionTitle', t.metadata ->> 'decisionTitle',
                'resolvedByInterface', ${interfaceId}::text
              )
            FROM public.bob_tasks t
            WHERE t.owner_id = ${config.ownerId}
              AND t.project_id = ${project.id}::uuid
              AND t.id = ${taskId}::uuid
              AND t.status = 'done'
              AND t.metadata ->> 'resolution' = 'approved'
              AND NOT EXISTS (
                SELECT 1
                FROM public.bob_events e
                WHERE e.owner_id = ${config.ownerId}
                  AND e.project_id = ${project.id}::uuid
                  AND e.event_type = 'decision.approved'
                  AND e.details ->> 'reviewTaskId' = t.id::text
              )
            RETURNING id::text
          `,
        ]);

        const lockedRows = results[0] as Array<{ id: string }>;
        const updatedRows = results[2] as ApprovalResultRow[];
        const result = updatedRows[0];
        if (lockedRows.length === 0 || !result || !result.decision_id) {
          return errorResponse(
            context,
            409,
            "approval_already_resolved",
            "That decision proposal is no longer pending review.",
          );
        }

        return context.json({
          resolution: "approved",
          taskId: result.task_id,
          decisionTitle: result.decision_title,
          decisionId: result.decision_id,
          requestId,
        });
      }

      const eventId = crypto.randomUUID();
      const results = await sql.transaction([
        sql`
          SELECT id::text
          FROM public.bob_tasks
          WHERE owner_id = ${config.ownerId}
            AND project_id = ${project.id}::uuid
            AND id = ${taskId}::uuid
            AND metadata ->> 'kind' = 'decision_review'
            AND status IN ('open', 'in_progress', 'blocked')
          FOR UPDATE
        `,
        sql`
          UPDATE public.bob_tasks t
          SET
            status = 'done',
            completed_at = now(),
            updated_at = now(),
            metadata = t.metadata || jsonb_build_object(
              'resolution', 'rejected'::text,
              'resolvedAt', now(),
              'resolvedByInterface', ${interfaceId}::text,
              'resolutionNote', ${note}::text
            )
          WHERE t.owner_id = ${config.ownerId}
            AND t.project_id = ${project.id}::uuid
            AND t.id = ${taskId}::uuid
            AND t.metadata ->> 'kind' = 'decision_review'
            AND t.status IN ('open', 'in_progress', 'blocked')
          RETURNING
            t.id::text AS task_id,
            t.metadata ->> 'decisionTitle' AS decision_title
        `,
        sql`
          INSERT INTO public.bob_events (
            id, owner_id, project_id, event_type, summary, source, details
          )
          SELECT
            ${eventId}::uuid,
            ${config.ownerId},
            ${project.id}::uuid,
            'decision.rejected',
            'Decision rejected in Bob Control Center: ' || COALESCE(t.metadata ->> 'decisionTitle', t.title),
            'web',
            jsonb_build_object(
              'reviewTaskId', t.id::text,
              'decisionTitle', t.metadata ->> 'decisionTitle',
              'resolvedByInterface', ${interfaceId}::text
            )
          FROM public.bob_tasks t
          WHERE t.owner_id = ${config.ownerId}
            AND t.project_id = ${project.id}::uuid
            AND t.id = ${taskId}::uuid
            AND t.status = 'done'
            AND t.metadata ->> 'resolution' = 'rejected'
            AND NOT EXISTS (
              SELECT 1
              FROM public.bob_events e
              WHERE e.owner_id = ${config.ownerId}
                AND e.project_id = ${project.id}::uuid
                AND e.event_type = 'decision.rejected'
                AND e.details ->> 'reviewTaskId' = t.id::text
            )
          RETURNING id::text
        `,
      ]);

      const lockedRows = results[0] as Array<{ id: string }>;
      const updatedRows = results[1] as RejectionResultRow[];
      const result = updatedRows[0];
      if (lockedRows.length === 0 || !result) {
        return errorResponse(
          context,
          409,
          "approval_already_resolved",
          "That decision proposal is no longer pending review.",
        );
      }

      return context.json({
        resolution: "rejected",
        taskId: result.task_id,
        decisionTitle: result.decision_title,
        requestId,
      });
    } catch (error) {
      const code = databaseCode(error);
      console.error("control-center decision transaction failed", {
        requestId,
        databaseCode: code ?? "unknown",
      });
      return errorResponse(
        context,
        503,
        "decision_review_unavailable",
        code
          ? `Bob Core could not resolve that decision proposal. Database code: ${code}.`
          : "Bob Core could not resolve that decision proposal.",
      );
    }
  });
}
