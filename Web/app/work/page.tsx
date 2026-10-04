import { notFound,redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { getOwnerCsrfToken,hasOwnerSession } from "@/lib/session";
import { localWorkflowEnabled,requestWorkflow,validWorkflowProject,type WorkflowDirectory,type WorkflowRecovery,type WorkflowWorkspace } from "@/lib/governed-workflow";
import {safeWorkspaceDestination,workspaceLoginDestination} from "@/lib/workflow-entry";
import { GovernedWorkspace } from "./workspace";

export const dynamic="force-dynamic";
export default async function WorkPage({searchParams}:{searchParams:Promise<{project?:string;packet?:string;operation?:string}>}){
  if(!localWorkflowEnabled())notFound();
  const {project:requestedProject,packet,operation}=await searchParams;
  const query=new URLSearchParams();if(requestedProject)query.set("project",requestedProject);if(packet)query.set("packet",packet);if(operation)query.set("operation",operation);
  const destination=safeWorkspaceDestination("/work"+(query.size?"?"+query.toString():""))??"/work";
  if(!await hasOwnerSession())redirect(workspaceLoginDestination(destination));
  const csrf=await getOwnerCsrfToken();if(!csrf)redirect(workspaceLoginDestination(destination));
  let directory:WorkflowDirectory={projects:[]},recovery:WorkflowRecovery|null=null;
  try{directory=await requestWorkflow<WorkflowDirectory>("projects",undefined,{kind:"directory"});}catch{}
  const project=requestedProject??directory.projects[0]?.project_key??"unavailable";
  if(!validWorkflowProject(project))notFound();
  let data:WorkflowWorkspace|null=null,error:string|null=null;
  try{data=await requestWorkflow<WorkflowWorkspace>(project,undefined,operation?{kind:"workspace_recovery",operationId:operation}:undefined);recovery=data.recovery;}catch(e){error=e instanceof Error?e.message:"Project source unavailable.";}
  const revision=createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return <GovernedWorkspace key={`${project}:${revision}:${packet??""}`} projectKey={project} initial={data} initialError={error} csrf={csrf} selectedPacket={recovery?.currentPacket?.id??packet} projects={directory.projects} recovery={recovery} recoveryOperation={operation}/>;
}
