import { NextRequest, NextResponse } from "next/server";

import { setInterfaceCredentialEnabled } from "@/lib/bob-core";
import { hasOwnerSession } from "@/lib/session";

const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const CREDENTIAL_ID = /^[a-z0-9][a-z0-9_-]{0,99}$/;

function redirectToDashboard(
  request: NextRequest,
  project: string,
  key: "notice" | "error",
  message: string,
) {
  const url = new URL("/", request.url);
  url.searchParams.set("project", project);
  url.searchParams.set(key, message.slice(0, 240));
  url.hash = "interfaces";
  return NextResponse.redirect(url, 303);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  if (!(await hasOwnerSession())) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const { credentialId: rawCredentialId } = await params;
  const credentialId = rawCredentialId.trim().toLowerCase();
  if (!CREDENTIAL_ID.test(credentialId)) {
    return NextResponse.json({ error: "Invalid credential identifier." }, { status: 400 });
  }

  const form = await request.formData();
  const project = String(form.get("project") ?? "").trim().toLowerCase();
  const enabledValue = String(form.get("enabled") ?? "").trim();

  if (!PROJECT_KEY.test(project) || !["true", "false"].includes(enabledValue)) {
    return NextResponse.json({ error: "Invalid credential request." }, { status: 400 });
  }

  const enabled = enabledValue === "true";

  try {
    const result = await setInterfaceCredentialEnabled({
      credentialId,
      project,
      enabled,
    });
    return redirectToDashboard(
      request,
      project,
      "notice",
      `${result.credential.id} was ${result.credential.enabled ? "enabled" : "disabled"}.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The credential could not be updated.";
    return redirectToDashboard(request, project, "error", message);
  }
}
