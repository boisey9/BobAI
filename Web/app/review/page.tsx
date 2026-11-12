import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import {DashboardWorkspace} from '@/components/dashboard-workspace';
import {ReviewBoundary} from '@/components/review-boundary';
import {reviewEnabled,reviewProjects,reviewDashboard,tasksFor} from '@/lib/ui-review';
export const dynamic='force-dynamic';
export default async function Review({searchParams}:{searchParams:Promise<{project?:string;scenario?:string;taskView?:string;task?:string}>}) {
  if(!reviewEnabled((await headers()).get('host')))notFound();
  const params=await searchParams;
  const project=reviewProjects.includes(params.project??'')?params.project!:'demo-manufacturing';
  const scenario=['connected','not-checked','failed-inference','partial','offline'].includes(params.scenario??'')?params.scenario!:'not-checked';
  return <ReviewBoundary><div className="review-banner"><strong>LOCAL REVIEW · SYNTHETIC DATA</strong><span>No live Core, database, model or client connection.</span><form action="/review"><input type="hidden" name="project" value={project}/><label>Scenario <select name="scenario" defaultValue={scenario}><option value="not-checked">Connected · inference not checked</option><option value="connected">Connected · inference observed</option><option value="failed-inference">Inference attempt failed</option><option value="partial">Partial / stale sources</option><option value="offline">Core unavailable</option></select></label> <button>Review scenario</button></form></div><DashboardWorkspace data={reviewDashboard(project,scenario,tasksFor(project))} selectedProject={project} csrfToken="synthetic-review" params={params} review coreLocation="Example hosted Core · no live connection" buildId="Local UI review · based on c8a1649"/></ReviewBoundary>;
}
