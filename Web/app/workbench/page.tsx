import { notFound, redirect } from "next/navigation";
import { Workbench } from "@/components/workbench/workbench";
import { hasOwnerSession } from "@/lib/session";
import { ownerWorkbenchEnabled, ownerWorkbenchReadsEnabled, ownerWorkbenchReadsPath } from "@/lib/workbench/owner-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workbench preview · BobCore" };

export default async function OwnerWorkbench() {
  if (!ownerWorkbenchEnabled()) notFound();
  if (!(await hasOwnerSession().catch(() => false))) redirect("/login");

  return <Workbench ownerPreview initialProject="demo-rfq" stress={false}
    readReview={false} taskReview={false} layoutReview={false}
    projectReadsHref={ownerWorkbenchReadsEnabled() ? ownerWorkbenchReadsPath : undefined} />;
}
