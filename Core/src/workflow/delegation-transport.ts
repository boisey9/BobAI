import {timingSafeEqual} from "node:crypto";
import {bodyLimit} from "hono/body-limit";
import {Hono} from "hono";
import {z} from "zod";
import {actionBinding,type ActionBinding,createOwnerDelegation} from "./owner-delegation.js";
import {WorkflowError,workflowPrincipal} from "./packet-contract.js";

type Verifier=ReturnType<typeof createOwnerDelegation>;
export function ownerVerifierRouter(verifier:Verifier,clients:{web:string;core:string}){
 if(clients.web.length<32||clients.core.length<32||clients.web===clients.core)throw new Error("separate_verifier_clients_required");
 const app=new Hono();app.use("*",bodyLimit({maxSize:16384}));app.use("*",async(c,next)=>{c.header("cache-control","no-store");await next();});
 app.post("/:operation",async c=>{
  const operation=c.req.param("operation"),expected=operation==="issue"?clients.web:clients.core;
  const presented=c.req.header("authorization")??"",wanted=`Bearer ${expected}`;
  if(!["issue","redeem","revalidate"].includes(operation)||Buffer.byteLength(presented)!==Buffer.byteLength(wanted)||!timingSafeEqual(Buffer.from(presented),Buffer.from(wanted)))return c.json({error:"delegation_client_denied"},403);
  try{
   const text=await c.req.text();if(Buffer.byteLength(text)>16384)return c.json({error:"too_large"},413);
   const body=JSON.parse(text);if(!body||Object.keys(body).some(k=>k!=="action"&&k!=="token"&&k!=="audience"))throw new Error("invalid");
   if(body.audience!==verifier.audience)throw new WorkflowError("owner_delegation_denied",403);
   if(operation==="issue")return c.json(await verifier.issue(c.req.raw.headers,body.action),200,{"cache-control":"no-store"});
   if(typeof body.token!=="string")throw new Error("invalid");
   return c.json(operation==="redeem"?{principals:await verifier.redeem(body.token,body.action)}:{valid:await verifier.revalidate(body.token,body.action)},200,{"cache-control":"no-store"});
  }catch(e){return c.json({error:e instanceof WorkflowError?e.code:"owner_verifier_unavailable"},e instanceof WorkflowError?403:503,{"cache-control":"no-store"});}
 });return app;
}
export function coreOwnerVerifierClient(config:{issuer:string;audience:string;credential:string},network:typeof fetch=fetch){
 const audience=new URL(config.audience);if(audience.origin!==config.audience)throw new Error("owner_audience_required");
 const issuer=new URL(config.issuer);if(issuer.origin!==config.issuer||!(issuer.protocol==="https:"||issuer.protocol==="http:"&&["localhost","127.0.0.1"].includes(issuer.hostname))||config.credential.length<32)throw new Error("owner_verifier_configuration_required");
 async function call(operation:string,token:string,action:ActionBinding){const r=await network(`${issuer.origin}/${operation}`,{method:"POST",headers:{authorization:`Bearer ${config.credential}`,"content-type":"application/json"},body:JSON.stringify({token,action,audience:config.audience}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)});if(!r.ok)throw new WorkflowError(r.status===403?"owner_delegation_denied":"owner_verifier_unavailable",r.status===403?403:503);return r.json();}
 return {async redeem(request:Request,project:string){const token=request.headers.get("authorization")?.replace(/^Bearer /,"");if(!token)throw new WorkflowError("owner_delegation_denied",403);
   const url=new URL(request.url);if(url.origin!==config.audience)throw new WorkflowError("owner_delegation_denied",403);
   const action=actionBinding(request.method,url.pathname+url.search,await request.clone().text(),project);
   const response=await call("redeem",token,action);const principals=z.array(workflowPrincipal).min(1).max(100).parse(response.principals);
   if(project!=="_directory"&&(principals.length!==1||principals[0]!.projectKey!==project))throw new WorkflowError("owner_delegation_denied",403);
   if(new Set(principals.map(p=>p.projectKey)).size!==principals.length||principals.some(p=>p.ownerId!==principals[0]!.ownerId||p.actorId!==principals[0]!.actorId||p.projectKey==="personal"))throw new WorkflowError("owner_delegation_denied",403);
   return {principals,revalidate:async()=>{try{return (await call("revalidate",token,action)).valid===true;}catch{return false;}}};}
 };
}
