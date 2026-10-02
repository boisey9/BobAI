// Server-only: never import this module into a client component.
import "server-only";
import {hostedProfile} from "../../Core/src/workflow/hosted-profile";
import {headers as requestHeaders} from "next/headers";
import {createHash} from "node:crypto";

export type GovernedPacket={id:string;title:string;specification:string;specificationDigest:string;
  predecessors:string[];state:"draft"|"ready"|"reviewed"|"released";version:number;
  acceptanceCurrent:boolean;candidateId:string|null;candidateDigest:string|null;updatedAt:string};
export type WorkflowWorkspace={recovery:WorkflowRecovery|null;project:{project_key:string;name:string;description:string|null};
  packetEvidence?:Array<{packetId:string;candidateDigest:string|null;evaluatedAt:number;policyConfigured:boolean;candidatePresent:boolean;bindingCurrent:boolean;evidenceComplete:boolean;checks:Array<{id:string;status:string;recordIds:string[];expiresAt:number|null}>}>;
  packets:GovernedPacket[];records:Array<{id:string;kind:string;packetId:string;content:Record<string,unknown>;createdAt:string}>;
  tasks:Array<{id:string;title:string;status:string;priority:string}>;
  history:Array<{id:string;event_type:string;summary:string;source:string;created_at:string}>;
  workflowHistory:Array<{sequence:string;packet_id:string;action:string;state:string;version:number;created_at:string}>;workflowHistoryTruncated:boolean;
  tasksTruncated:boolean;historyTruncated:boolean;paused:boolean;policyConfigured:boolean;releaseEnabled:false};
export function localWorkflowEnabled(){return process.env.VERCEL?!!hostedProfile():process.env.BOB_GOVERNED_WORKFLOW_ENABLED==="true";}
export function validWorkflowProject(project:string){return /^[a-z0-9][a-z0-9_-]{0,99}$/.test(project);}
export function workflowWebOrigin():string {
  const value=hostedProfile()?.webOrigin??process.env.BOB_WORKFLOW_WEB_ORIGIN?.trim();
  if(!value)throw new Error("The reviewed workflow Web origin is not configured.");
  const url=new URL(value),loopback=["127.0.0.1","localhost","[::1]"].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||!(url.protocol==="https:"||url.protocol==="http:"&&loopback))
    throw new Error("Invalid workflow Web origin.");
  return url.origin;
}
export class WorkflowRequestError extends Error {
  constructor(message:string,public readonly confirmedRejected:boolean,public readonly code:string|null=null){super(message);}
}
const workflowMessages:Record<string,string>={
  packet_version_conflict:"This work packet changed. Refresh its current state before reviewing it.",
  candidate_changed:"This candidate changed. Its earlier approval no longer applies.",
  specification_required:"Accept the current specification before preparing a candidate.",
  predecessor_required:"Complete and review the required earlier work first.",
  evidence_missing_or_ambiguous:"The current candidate needs complete verification evidence.",
  evidence_not_current_pass:"The current candidate has failed or expired checks. Verify a new candidate before review.",
  workflow_paused:"Workflows are paused. You can still read existing records.",
  workflow_access_denied:"This connection is not authorized for the selected project.",
  policy_mismatch:"The verification policy changed. Prepare and verify a new candidate.",
  owner_review_requires_ready:"Verify readiness before requesting owner review.",
};
export type WorkflowDirectory={projects:Array<{project_key:string;name:string;description:string|null;status:string}>};
export type WorkflowRecovery={outcome:"committed"|"not_found";operationId:string;packet?:GovernedPacket;currentPacket?:GovernedPacket};
export async function requestWorkflow<T>(project:string,command?:Record<string,unknown>,read?:{kind:"directory"|"receipt"|"workspace_recovery";operationId?:string}):Promise<T>{
  if(!localWorkflowEnabled()||!validWorkflowProject(project))throw new Error("Governed workflow is unavailable.");
  // Explicit target and private owner verifier: no legacy Core fallback, shared
  // owner token, device grant or client identity may become owner authority.
  const profile=hostedProfile();
  const base=profile?.coreOrigin??process.env.BOB_WORKFLOW_CORE_BASE_URL?.trim();
  const issuer=profile?.issuer??process.env.BOB_WORKFLOW_OWNER_ISSUER?.trim();
  const credential=process.env.BOB_WORKFLOW_WEB_VERIFIER_CREDENTIAL?.trim();
  if(!base||!issuer||!credential||credential.length<32)throw new Error("The reviewed workflow connection is not configured.");
  const url=new URL(base);
  const loopback=["127.0.0.1","localhost","[::1]"].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||!(url.protocol==="https:"||url.protocol==="http:"&&loopback))
    throw new Error("Invalid workflow connection target.");
  if(read&&read.kind!=="directory"&&(!read.operationId||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(read.operationId)))throw new Error("Invalid recovery identifier.");
  const suffix=read?.kind==="directory"?"_directory":`${encodeURIComponent(project)}${read?.kind==="receipt"?"/receipts/"+encodeURIComponent(read.operationId!):read?.kind==="workspace_recovery"?"?operation="+encodeURIComponent(read.operationId!):command?"/commands":""}`;
  const target=new URL(`${url.origin}/v1/governed/${suffix}`),body=command?JSON.stringify(command):"";
  const broker=new URL(issuer);
  if(broker.origin!==issuer||!(broker.protocol==="https:"||broker.protocol==="http:"&&["127.0.0.1","localhost"].includes(broker.hostname)))throw new Error("Invalid owner verifier target.");
  const syntheticFixture=process.env.BOB_WORKFLOW_SYNTHETIC_OWNER_FIXTURE==="true"&&loopback&&["127.0.0.1","localhost"].includes(broker.hostname);
  if(process.env.BOB_AUTH_ENABLED!=="true"&&!syntheticFixture)throw new Error("Verified owner authentication is required; legacy sessions cannot delegate authority.");
  const cookie=(await requestHeaders()).get("cookie");if(!cookie)throw new Error("Verified owner session required.");
  const action={method:command?"POST":"GET",path:target.pathname+target.search,bodyDigest:createHash("sha256").update(body).digest("hex"),project:read?.kind==="directory"?"_directory":project};
  const issued=await fetch(`${broker.origin}/issue`,{method:"POST",headers:{authorization:`Bearer ${credential}`,cookie,"content-type":"application/json"},body:JSON.stringify({action,audience:url.origin}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)});
  if(issued.status===403)throw new WorkflowRequestError(workflowMessages.workflow_access_denied!,false,"workflow_access_denied");
  if(!issued.ok)throw new Error("Owner session verification unavailable.");
  const {token}=await issued.json();if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token))throw new Error("Invalid owner proof.");
  const response=await fetch(target,{
    method:command?"POST":"GET",headers:{authorization:`Bearer ${token}`,accept:"application/json",
      ...(command?{"content-type":"application/json"}:{})},...(command?{body}:{}),
    cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok){const body=await response.json().catch(()=>null);const code=body?.error?.code;
    const safeCode=typeof code==="string"&&/^[a-z_]{1,100}$/.test(code)?code:null;
    throw new WorkflowRequestError(safeCode&&workflowMessages[safeCode]||
      (command?"Core could not confirm this save. Keep the original request for recovery.":"Current project records are unavailable. Try refreshing this project."),
      body?.outcome==="rejected"&&[400,409].includes(response.status),safeCode);}
  const data=await response.json();
  if(!command&&(!read||read.kind==="workspace_recovery")&&data?.project?.project_key!==project)throw new Error("Workflow project scope does not match.");
  if(read?.kind==="receipt"&&data.operationId!==read.operationId)throw new Error("Recovery receipt mismatch.");
  if(read?.kind==="workspace_recovery"&&data.recovery?.operationId!==read.operationId)throw new Error("Recovery workspace mismatch.");
  return data as T;
}
