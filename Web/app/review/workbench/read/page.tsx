import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { WorkbenchProjectReads } from "@/components/workbench/project-reads";
import { workbenchReadReviewEnabled } from "@/lib/ui-review-enabled";
import { readWorkbenchReview } from "@/lib/workbench/read-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project reads · BobCore Workbench" };

export default async function WorkbenchReadReview({ searchParams }: {
  searchParams: Promise<{ project?: string | string[]; cursor?: string | string[] }>;
}) {
  if (!workbenchReadReviewEnabled((await headers()).get("host"))) notFound();
  const { project = "demo-rfq", cursor } = await searchParams;
  const malformed = typeof project !== "string" || (cursor !== undefined && typeof cursor !== "string");
  const result = malformed ? { status: "invalid-request" } as const : await readWorkbenchReview(project, cursor);

  return <WorkbenchProjectReads mode="sample" result={result} cursor={typeof cursor === "string" ? cursor : undefined} />;
}
