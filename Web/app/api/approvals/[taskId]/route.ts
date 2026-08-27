import { NextRequest, NextResponse } from "next/server";

import { resolveDecisionApproval } from "@/lib/bob-core";
import {
  hasOwnerSession,
  validateOwnerCsrfToken,
} from "@/lib/session";

const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redirectToDashboard(
  request: NextRequest,
  project: string,
  key: "notice" | "error",
  message: string,
) {
  const url = new URL("/", request.url);
  url.searchParams.set("project", project);
  url.searchParams.set(key, message.slice(0, 240));
  url.hash = "approvals";
  return NextResponse.redirect(url, 303);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  if (!(await hasOwnerSession())) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const { taskId } = await params;
  if (!UUID.test(taskId)) {
    return NextResponse.json({ error: "Invalid approval identifier." }, { status: 400 });
  }

  const form = await request.formData();
  const csrfToken = String(form.get("csrfToken") ?? "").trim();
  if (!(await validateOwnerCsrfToken(csrfToken))) {
    return NextResponse.json({ error: "Invalid owner action token." }, { status: 403 });
  }

  const project = String(form.get("project") ?? "").trim().toLowerCase();
  const action = String(form.get("action") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();

  if (!PROJECT_KEY.test(project) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  }

  try {
    const result = await resolveDecisionApproval({
      taskId,
      project,
      action,
      ...(note ? { note } : {}),
    });
    return redirectToDashboard(
      request,
      project,
      "notice",
      `${result.decisionTitle} was ${result.resolution}.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The approval could not be saved.";
    return redirectToDashboard(request, project, "error", message);
  }
}
