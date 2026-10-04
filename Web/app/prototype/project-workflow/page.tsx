import { notFound } from "next/navigation";
import { ProjectWorkflowPrototype } from "./project-workflow";
export const dynamic = "force-dynamic";
export default function PrototypePage() {
  if (process.env.BOB_WORKFLOW_PROTOTYPE_ENABLED !== "true" || process.env.VERCEL) notFound();
  return <ProjectWorkflowPrototype />;
}
