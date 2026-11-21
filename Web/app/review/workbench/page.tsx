import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Workbench } from "@/components/workbench/workbench";
import { reviewEnabled, workbenchLayoutReviewEnabled, workbenchReadReviewEnabled, workbenchTaskReviewEnabled } from "@/lib/ui-review-enabled";

export const dynamic = "force-dynamic";

export default async function WorkbenchReview({
  searchParams,
}: {
  searchParams: Promise<{ stress?: string; project?: string | string[] }>;
}) {
  const host = (await headers()).get("host");
  if (!reviewEnabled(host)) notFound();
  const { stress, project } = await searchParams;
  const readReview = workbenchReadReviewEnabled(host);
  const initialProject = readReview && project === "demo-bobai" ? "demo-bobai" : "demo-rfq";
  return <Workbench stress={stress === "1"} readReview={readReview} initialProject={initialProject}
    taskReview={workbenchTaskReviewEnabled(host)} layoutReview={workbenchLayoutReviewEnabled(host)} />;
}
