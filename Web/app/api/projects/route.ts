import { NextRequest, NextResponse } from "next/server";
import { CoreRequestError, createProject, getProjectCreationReadiness } from "@/lib/bob-core";
import { hasOwnerSession, validateOwnerCsrfToken } from "@/lib/session";
import { projectPayload } from "@/lib/project-contract";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "cache-control": "no-store" } });
}
function failure(error: unknown) {
  const code = error instanceof CoreRequestError && ["project_binding_changed", "project_anchor_unavailable", "project_exists", "operation_conflict"].includes(error.code ?? "")
    ? error.code! : "project_unavailable";
  const status = error instanceof CoreRequestError && [400, 401, 403, 409, 413, 429].includes(error.status) ? error.status : 503;
  const message = code === "project_binding_changed" ? "The project connection changed. No new mutation was sent. Keep any pending request for reconciliation."
    : code === "project_anchor_unavailable" ? "The Personal workspace is unavailable. Project creation needs owner attention."
      : code === "project_exists" ? "That project key is already in use. Choose another key."
        : code === "operation_conflict" ? "This operation ID belongs to a different request. Keep the original request for reconciliation."
          : status === 401 || status === 403 ? "This connection cannot create projects. Check Owner access."
            : status === 400 || status === 413 ? "Core could not accept these project details. Check their length and format."
              : "Core has not confirmed the request. Retry the same request to recover its receipt.";
  return json({ error: { code, message } }, status);
}

export async function GET() {
  try {
    if (!(await hasOwnerSession())) return json({ error: { code: "owner_session_required", message: "Sign in to Bob before continuing." } }, 401);
    return json(await getProjectCreationReadiness());
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await hasOwnerSession())) return json({ error: { code: "owner_session_required", message: "Sign in to Bob before continuing." } }, 401);
    if (!(await validateOwnerCsrfToken(request.headers.get("x-bob-csrf") ?? undefined))) {
      return json({ error: { code: "invalid_csrf", message: "Your session changed. Reload before trying again." } }, 403);
    }
  } catch { return json({ error: { code: "owner_session_unavailable", message: "Owner access could not be checked. Retry after signing in." } }, 503); }
  let input = null;
  try {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() === "application/json") {
      // Bound the body while reading, including requests without Content-Length.
      const reader = request.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = []; let bytes = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 24_576) { await reader.cancel(); return json({ error: { code: "invalid_project", message: "Project details are too large." } }, 400); }
          chunks.push(chunk.value);
        }
        const body = new Uint8Array(bytes); let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        input = projectPayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)));
      }
    }
  } catch { /* Invalid JSON is a validation failure, never a Core request. */ }
  if (!input) return json({ error: { code: "invalid_project", message: "Check the project name, key, goal and optional HTTPS repository URL." } }, 400);
  try { return json(await createProject(input, request.headers.get("x-bob-project-binding") ?? "")); }
  catch (error) { return failure(error); }
}
