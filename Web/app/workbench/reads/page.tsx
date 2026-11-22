import { notFound, redirect } from "next/navigation";
import { WorkbenchProjectReads } from "@/components/workbench/project-reads";
import { hasOwnerSession } from "@/lib/session";
import { ownerWorkbenchEnabled, ownerWorkbenchReadsEnabled } from "@/lib/workbench/owner-preview";
import { readOwnerWorkbench } from "@/lib/workbench/owner-reads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project reads · BobCore Workbench" };

export default async function OwnerWorkbenchReads({ searchParams }: {
  searchParams: Promise<{ project?: string | string[]; cursor?: string | string[] }>;
}) {
  if (!ownerWorkbenchReadsEnabled()) notFound();
  if (!(await hasOwnerSession().catch(() => false))) redirect("/login");

  const { project, cursor } = await searchParams;
  const result = (project !== undefined && typeof project !== "string")
    || (cursor !== undefined && (typeof cursor !== "string" || project === undefined))
    ? { status: "invalid-request" } as const
    : await readOwnerWorkbench(project, cursor);

  return <WorkbenchProjectReads mode="owner" result={result}
    cursor={typeof cursor === "string" ? cursor : undefined}
    backHref={ownerWorkbenchEnabled() ? "/workbench" : "/"} />;
}
