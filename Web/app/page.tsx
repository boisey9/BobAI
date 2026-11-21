import { DashboardWorkspace } from "@/components/dashboard-workspace";
import {workspaceEntryEnabled} from "@/lib/workflow-entry";
import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/bob-core";
import { getOwnerCsrfToken, hasOwnerSession } from "@/lib/session";
import { ownerWorkbenchEnabled } from "@/lib/workbench/owner-preview";

type DashboardPageProps = {
  searchParams: Promise<{
    project?: string;
    task?: string;
    taskView?: string;
    notice?: string;
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function projectKey(value: string | undefined): string {
  const fallback =
    process.env.BOB_CONTROL_CENTER_DEFAULT_PROJECT?.trim() || "bobai";
  const candidate = value?.trim().toLowerCase() || fallback.toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,99}$/.test(candidate) ? candidate : "bobai";
}

function safeMessage(value: string | undefined): string | null {
  const message = value?.trim();
  return message ? message.slice(0, 240) : null;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  if (!(await hasOwnerSession())) redirect("/login");
  if(workspaceEntryEnabled())redirect("/work");
  const csrfToken = await getOwnerCsrfToken();
  if (!csrfToken) redirect("/login");

  const params = await searchParams;
  const selectedProject = projectKey(params.project);
  const notice = safeMessage(params.notice);
  const actionError = safeMessage(params.error);
  const data = await getDashboardData(selectedProject);
  return <DashboardWorkspace data={data} selectedProject={selectedProject} csrfToken={csrfToken} params={params}
    coreLocation={coreDestination()} buildId={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,12) || "Build identity not reported"}
    notice={notice} actionError={actionError} showWorkbenchPreview={ownerWorkbenchEnabled()} />;
}

function coreDestination() {
  try { const url = new URL(process.env.BOB_CORE_BASE_URL || "https://bob-core.vercel.app"); return url.hostname === "bob-core.vercel.app" ? "Hosted BobCore · Vercel" : url.origin; }
  catch { return "Destination unverified"; }
}
