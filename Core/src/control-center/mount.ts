import { neon } from "@neondatabase/serverless";

import type { createApp } from "../app.js";
import type { BobCoreConfig } from "../config.js";
import {
  BOB_INTERFACE_ID_HEADER,
  BOB_INTERFACE_PROJECT_HEADER,
  BOB_INTERFACE_SCOPES_HEADER,
} from "../security/interface-credential.js";

type BobCoreApp = ReturnType<typeof createApp>;

type ProjectRow = {
  id: string;
  project_key: string;
  name: string;
  description: string | null;
  repository: string | null;
  status: "active" | "archived";
  metadata: unknown;
  updated_at: string | Date;
};

type ApprovalRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type EventRow = {
  id: string;
  event_type: string;
  summary: string;
  source: string;
  details: unknown;
  created_at: string | Date;
};

type SafeInterfaceCredential = {
  id: string;
  surface: string;
  scopes: string[];
  enabled: boolean;
  createdAt: string | null;
};

type PendingApproval = {
  id: string;
  title: string;
  decisionTitle: string;
  proposal: string;
  reason: string | null;
  source: string;
  interfaceId: string | null;
  surface: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};

const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const CREDENTIAL_ID = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toISOString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

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

function booleanValue(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof record[key] === "boolean"
    ? (record[key] as boolean)
    : fallback;
}

function authMetadata(metadata: unknown): Record<string, unknown> {
  return toObject(toObject(metadata).auth);
}

export function safeInterfaceCredentials(
  metadata: unknown,
): SafeInterfaceCredential[] {
  const credentials = authMetadata(metadata).interfaceCredentials;
  if (!Array.isArray(credentials)) return [];

  return credentials.flatMap((value) => {
    const record = toObject(value);
    const id = stringValue(record, "id");
    const surface = stringValue(record, "surface");
    const scopes = Array.isArray(record.scopes)
      ? record.scopes.filter(
          (scope): scope is string => typeof scope === "string",
        )
      : [];

    if (!id || !surface) return [];

    return [
      {
        id,
        surface,
        scopes: [...new Set(scopes)],
        enabled: booleanValue(record, "enabled", true),
        createdAt: stringValue(record, "createdAt"),
      },
    ];
  });
}

function legacyCredentialCount(metadata: unknown): number {
  const hashes = authMetadata(metadata).readCredentialHashes;
  return Array.isArray(hashes) ? hashes.length : 0;
}

function pendingApproval(row: ApprovalRow): PendingApproval | null {
  const metadata = toObject(row.metadata);
  const decisionTitle = stringValue(metadata, "decisionTitle");
  const proposal = stringValue(metadata, "proposal");
  if (!decisionTitle || !proposal) return null;

  return {
    id: row.id,
    title: row.title,
    decisionTitle,
    proposal,
    reason: stringValue(metadata, "reason"),
    source: row.source,
    interfaceId: stringValue(metadata, "interfaceId"),
    surface: stringValue(metadata, "surface"),
    status: row.status,
    priority: row.priority,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function interfaceScopes(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}

function authorized(context: any, requiredScope: string): boolean {
  const interfaceId = context.req.header(BOB_INTERFACE_ID_HEADER);
  if (!interfaceId) return true;
  return interfaceScopes(
    context.req.header(BOB_INTERFACE_SCOPES_HEADER),
  ).has(requiredScope);
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

function safeProject(row: ProjectRow) {
  return {
    projectKey: row.project_key,
    name: row.name,
    description: row.description,
    repository: row.repository,
    status: row.status,
    updatedAt: toISOString(row.updated_at),
  };
}

function errorResponse(
  context: any,
  status: 400 | 401 | 403 | 404 | 409 | 503,
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
    const value = await context.req.json();
    return toObject(value);
  } catch {
    return null;
  }
}

export function mountBobControlCenter(
  app: BobCoreApp,
  config: BobCoreConfig,
): void {
  const sql = config.databaseURL ? neon(config.databaseURL) : null;

  app.get("/v1/control-center", async (context) => {
    if (!authorized(context, "control-center:read")) {
      return errorResponse(
        context,
        403,
        "control_center_scope_forbidden",
        "This credential cannot read Control Center administration data.",
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

    const selectedKey = boundProject(
      context,
      context.req.query("project"),
    );
    if (!selectedKey) {
      return errorResponse(
        context,
        400,
        "invalid_project",
        "A valid Bob project key is required.",
      );
    }

    try {
      const trustedProject = context.req
        .header(BOB_INTERFACE_PROJECT_HEADER)
        ?.trim();
      const projects = trustedProject
        ? ((await sql`
            SELECT id, project_key, name, description, repository, status, metadata, updated_at
            FROM public.bob_projects
            WHERE owner_id = ${config.ownerId}
              AND lower(project_key) = lower(${trustedProject})
              AND deleted_at IS NULL
            ORDER BY name
          `) as ProjectRow[])
        : ((await sql`
            SELECT id, project_key, name, description, repository, status, metadata, updated_at
            FROM public.bob_projects
            WHERE owner_id = ${config.ownerId}
              AND deleted_at IS NULL
            ORDER BY name
          `) as ProjectRow[]);

      const selected = projects.find(
        (project) => project.project_key.toLowerCase() === selectedKey,
      );
      if (!selected) {
        return errorResponse(
          context,
          404,
          "control_center_project_not_found",
          "That project is not registered in Bob Core.",
        );
      }

      const approvalRows = (await sql`
        SELECT id::text, title, description, status, priority, source, metadata, created_at, updated_at
        FROM public.bob_tasks
        WHERE owner_id = ${config.ownerId}
          AND project_id = ${selected.id}::uuid
          AND metadata ->> 'kind' = 'decision_review'
          AND status IN ('open', 'in_progress', 'blocked')
        ORDER BY updated_at DESC
        LIMIT 50
      `) as unknown as ApprovalRow[];

      const eventRows = (await sql`
        SELECT id::text, event_type, summary, source, details, created_at
        FROM public.bob_events
        WHERE owner_id = ${config.ownerId}
          AND project_id = ${selected.id}::uuid
        ORDER BY created_at DESC
        LIMIT 120
      `) as unknown as EventRow[];

      return context.json({
        projects: projects.map(safeProject),
        selectedProject: safeProject(selected),
        interfaces: safeInterfaceCredentials(selected.metadata),
        legacyCredentialCount: legacyCredentialCount(selected.metadata),
        approvals: approvalRows.flatMap((row) => {
          const approval = pendingApproval(row);
          return approval ? [approval] : [];
        }),
        releaseEvents: eventRows.map((event) => ({
          id: event.id,
          eventType: event.event_type,
          summary: event.summary,
          source: event.source,
          details: toObject(event.details),
          createdAt: toISOString(event.created_at),
        })),
        generatedAt: new Date().toISOString(),
        requestId: context.get("requestId"),
      });
    } catch {
      return errorResponse(
        context,
        503,
        "control_center_unavailable",
        "Bob Core could not assemble Control Center administration data.",
      );
    }
  });

  app.post("/v1/control-center/approvals/:taskId", async (context) => {
    if (!authorized(context, "decision:review")) {
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

    const interfaceId =
      context.req.header(BOB_INTERFACE_ID_HEADER)?.trim() || "primary";
    const resolution = action === "approve" ? "approved" : "rejected";
    const eventType =
      action === "approve" ? "decision.approved" : "decision.rejected";
    const eventId = crypto.randomUUID();
    const decisionId = crypto.randomUUID();

    try {
      const projects = (await sql`
        SELECT id, project_key, name, description, repository, status, metadata, updated_at
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
        const rows = (await sql`
          WITH target AS (
            SELECT
              t.id,
              t.title,
              t.metadata,
              t.metadata ->> 'decisionTitle' AS decision_title,
              t.metadata ->> 'proposal' AS proposal,
              NULLIF(t.metadata ->> 'reason', '') AS reason
            FROM public.bob_tasks t
            WHERE t.owner_id = ${config.ownerId}
              AND t.project_id = ${project.id}::uuid
              AND t.id = ${taskId}::uuid
              AND t.metadata ->> 'kind' = 'decision_review'
              AND t.status IN ('open', 'in_progress', 'blocked')
            LIMIT 1
          ),
          existing_decision AS (
            SELECT d.id
            FROM public.bob_decisions d, target
            WHERE d.owner_id = ${config.ownerId}
              AND d.project_id = ${project.id}::uuid
              AND lower(d.title) = lower(target.decision_title)
              AND d.status = 'active'
            LIMIT 1
          ),
          created_decision AS (
            INSERT INTO public.bob_decisions (
              id, owner_id, project_id, title, decision, reason, status, source, metadata
            )
            SELECT
              ${decisionId}::uuid,
              ${config.ownerId},
              ${project.id}::uuid,
              target.decision_title,
              target.proposal,
              target.reason,
              'active',
              'control-center',
              jsonb_build_object(
                'reviewTaskId', target.id::text,
                'approvedByInterface', ${interfaceId},
                'approvedAt', now(),
                'note', ${note}
              )
            FROM target
            WHERE target.decision_title IS NOT NULL
              AND target.proposal IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM existing_decision)
            RETURNING id
          ),
          decision_result AS (
            SELECT id FROM existing_decision
            UNION ALL
            SELECT id FROM created_decision
            LIMIT 1
          ),
          updated_task AS (
            UPDATE public.bob_tasks t
            SET
              status = 'done',
              completed_at = now(),
              updated_at = now(),
              metadata = t.metadata || jsonb_build_object(
                'resolution', ${resolution},
                'resolvedAt', now(),
                'resolvedByInterface', ${interfaceId},
                'resolutionNote', ${note},
                'decisionId', (SELECT id::text FROM decision_result LIMIT 1)
              )
            FROM target
            WHERE t.id = target.id
            RETURNING t.id, t.title, t.metadata
          ),
          created_event AS (
            INSERT INTO public.bob_events (
              id, owner_id, project_id, event_type, summary, source, details
            )
            SELECT
              ${eventId}::uuid,
              ${config.ownerId},
              ${project.id}::uuid,
              ${eventType},
              'Decision approved in Bob Control Center: ' || COALESCE(target.decision_title, target.title),
              'web',
              jsonb_build_object(
                'reviewTaskId', target.id::text,
                'decisionTitle', target.decision_title,
                'resolvedByInterface', ${interfaceId}
              )
            FROM target, updated_task
            RETURNING id
          )
          SELECT
            updated_task.id::text AS task_id,
            target.decision_title,
            (SELECT id::text FROM decision_result LIMIT 1) AS decision_id
          FROM updated_task, target
        `) as Array<{
          task_id: string;
          decision_title: string;
          decision_id: string | null;
        }>;

        const result = rows[0];
        if (!result) {
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
          requestId: context.get("requestId"),
        });
      }

      const rows = (await sql`
        WITH target AS (
          SELECT
            t.id,
            t.title,
            t.metadata,
            t.metadata ->> 'decisionTitle' AS decision_title
          FROM public.bob_tasks t
          WHERE t.owner_id = ${config.ownerId}
            AND t.project_id = ${project.id}::uuid
            AND t.id = ${taskId}::uuid
            AND t.metadata ->> 'kind' = 'decision_review'
            AND t.status IN ('open', 'in_progress', 'blocked')
          LIMIT 1
        ),
        updated_task AS (
          UPDATE public.bob_tasks t
          SET
            status = 'done',
            completed_at = now(),
            updated_at = now(),
            metadata = t.metadata || jsonb_build_object(
              'resolution', ${resolution},
              'resolvedAt', now(),
              'resolvedByInterface', ${interfaceId},
              'resolutionNote', ${note}
            )
          FROM target
          WHERE t.id = target.id
          RETURNING t.id, t.title
        ),
        created_event AS (
          INSERT INTO public.bob_events (
            id, owner_id, project_id, event_type, summary, source, details
          )
          SELECT
            ${eventId}::uuid,
            ${config.ownerId},
            ${project.id}::uuid,
            ${eventType},
            'Decision rejected in Bob Control Center: ' || COALESCE(target.decision_title, target.title),
            'web',
            jsonb_build_object(
              'reviewTaskId', target.id::text,
              'decisionTitle', target.decision_title,
              'resolvedByInterface', ${interfaceId}
            )
          FROM target, updated_task
          RETURNING id
        )
        SELECT
          updated_task.id::text AS task_id,
          target.decision_title
        FROM updated_task, target
      `) as Array<{ task_id: string; decision_title: string }>;

      const result = rows[0];
      if (!result) {
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
        requestId: context.get("requestId"),
      });
    } catch {
      return errorResponse(
        context,
        503,
        "decision_review_unavailable",
        "Bob Core could not resolve that decision proposal.",
      );
    }
  });

  app.post(
    "/v1/control-center/credentials/:credentialId",
    async (context) => {
      if (!authorized(context, "credentials:manage")) {
        return errorResponse(
          context,
          403,
          "credential_management_scope_forbidden",
          "This credential cannot manage Bob interface credentials.",
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

      const credentialId = context.req
        .param("credentialId")
        .trim()
        .toLowerCase();
      if (!CREDENTIAL_ID.test(credentialId)) {
        return errorResponse(
          context,
          400,
          "invalid_credential_id",
          "The interface credential identifier is invalid.",
        );
      }

      const body = await requestBody(context);
      const enabled = body?.enabled;
      const projectKey = boundProject(
        context,
        body ? stringValue(body, "project") ?? undefined : undefined,
      );
      if (typeof enabled !== "boolean" || !projectKey) {
        return errorResponse(
          context,
          400,
          "invalid_credential_request",
          "A valid project and enabled state are required.",
        );
      }

      const callingInterface =
        context.req.header(BOB_INTERFACE_ID_HEADER)?.trim() || null;
      if (!enabled && callingInterface === credentialId) {
        return errorResponse(
          context,
          409,
          "cannot_disable_current_interface",
          "The Control Center cannot disable its own active credential.",
        );
      }

      try {
        const rows = (await sql`
          WITH target AS (
            SELECT id, metadata
            FROM public.bob_projects
            WHERE owner_id = ${config.ownerId}
              AND lower(project_key) = lower(${projectKey})
              AND deleted_at IS NULL
            LIMIT 1
          ),
          rewritten AS (
            SELECT
              target.id,
              bool_or(credential ->> 'id' = ${credentialId}) AS found,
              jsonb_agg(
                CASE
                  WHEN credential ->> 'id' = ${credentialId}
                    THEN jsonb_set(credential, '{enabled}', to_jsonb(${enabled}::boolean), true)
                  ELSE credential
                END
              ) AS credentials
            FROM target
            CROSS JOIN LATERAL jsonb_array_elements(
              COALESCE(target.metadata #> '{auth,interfaceCredentials}', '[]'::jsonb)
            ) AS credential
            GROUP BY target.id
          ),
          updated AS (
            UPDATE public.bob_projects p
            SET
              metadata = jsonb_set(
                p.metadata,
                '{auth,interfaceCredentials}',
                rewritten.credentials,
                true
              ),
              updated_at = now()
            FROM rewritten
            WHERE p.id = rewritten.id
              AND rewritten.found = true
            RETURNING p.id, p.metadata
          )
          SELECT id::text, metadata
          FROM updated
        `) as Array<{ id: string; metadata: unknown }>;

        const updated = rows[0];
        if (!updated) {
          return errorResponse(
            context,
            404,
            "credential_not_found",
            "That structured interface credential was not found.",
          );
        }

        const credential = safeInterfaceCredentials(updated.metadata).find(
          (candidate) => candidate.id === credentialId,
        );
        if (!credential) {
          return errorResponse(
            context,
            404,
            "credential_not_found",
            "That structured interface credential was not found.",
          );
        }

        await sql`
          INSERT INTO public.bob_events (
            id, owner_id, project_id, event_type, summary, source, details
          ) VALUES (
            ${crypto.randomUUID()}::uuid,
            ${config.ownerId},
            ${updated.id}::uuid,
            ${enabled ? "credential.enabled" : "credential.disabled"},
            ${enabled ? "Interface credential enabled in Bob Control Center." : "Interface credential disabled in Bob Control Center."},
            'web',
            jsonb_build_object(
              'credentialId', ${credential.id},
              'surface', ${credential.surface},
              'enabled', ${credential.enabled},
              'changedByInterface', ${callingInterface ?? "primary"}
            )
          )
        `;

        return context.json({
          credential,
          requestId: context.get("requestId"),
        });
      } catch {
        return errorResponse(
          context,
          503,
          "credential_management_unavailable",
          "Bob Core could not update that interface credential.",
        );
      }
    },
  );
}
