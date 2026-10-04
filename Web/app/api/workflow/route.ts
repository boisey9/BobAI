import { NextRequest,NextResponse } from "next/server";
import { hasOwnerSession,validateOwnerCsrfToken } from "@/lib/session";
import { localWorkflowEnabled,requestWorkflow,validWorkflowProject,WorkflowRequestError,workflowWebOrigin } from "@/lib/governed-workflow";

function reply(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"cache-control":"no-store"}});}
export async function POST(request:NextRequest){
  if(!localWorkflowEnabled())return reply({error:"Not found"},404);
  if(!await hasOwnerSession())return reply({error:"Owner session required"},401);
  if(!await validateOwnerCsrfToken(request.headers.get("x-bob-owner-csrf")??undefined))return reply({error:"Owner action token required"},403);
  let expectedOrigin:string;try{expectedOrigin=workflowWebOrigin();}catch{return reply({error:"Workflow Web origin is not configured"},503);}
  const origin=request.headers.get("origin");if(origin!==expectedOrigin)return reply({error:"Same-origin request required"},403);
  // Bound the actual bytes before parsing. Content-Length alone is not trusted.
  if(!request.body)return reply({error:"Invalid request"},400);
  const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>16384){await reader.cancel();return reply({error:"Request too large"},413);}chunks.push(value);}
  let body:{project?:unknown;command?:unknown};
  try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return reply({error:"Invalid request"},400);}
  if(!body||typeof body.project!=="string"||!validWorkflowProject(body.project)||!body.command||typeof body.command!=="object"||Array.isArray(body.command)||Object.keys(body).some(k=>k!=="project"&&k!=="command"))return reply({error:"Invalid request"},400);
  try{return reply(await requestWorkflow(body.project,body.command as Record<string,unknown>));}
  catch(e){return reply({error:e instanceof Error?e.message:"Save could not be confirmed. Retry the same request.",
    code:e instanceof WorkflowRequestError?e.code:null,
    outcome:e instanceof WorkflowRequestError&&e.confirmedRejected?"rejected":"unconfirmed"},409);}
}

export async function GET(request:NextRequest){
  if(!localWorkflowEnabled())return reply({error:"Not found"},404);
  if(!await hasOwnerSession())return reply({error:"Owner session required"},401);
  const project=request.nextUrl.searchParams.get("project"),operationId=request.nextUrl.searchParams.get("operation");
  if(!project||!validWorkflowProject(project))return reply({error:"Invalid recovery request"},400);
  try{return reply(await requestWorkflow(project,undefined,operationId?{kind:"receipt",operationId}:undefined));}catch(e){return reply({error:e instanceof Error?e.message:"Receipt unavailable"},409);}
}
