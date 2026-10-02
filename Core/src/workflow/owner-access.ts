import { z } from "zod";
import { workflowId,workflowPrincipal,type PacketPrincipal } from "./packet-contract.js";

// Compatible with the existing Better Auth api.getSession boundary. The host
// supplies its real API, never parsed cookies, trusted headers or body claims.
export type OwnerSessionApi={getSession(input:{headers:Headers;query:{disableCookieCache:true}}):Promise<unknown>};
export type OwnerBinding={ownerId:string;userId:string;actorId:string;email:string};
export type ProjectAccess={ownerId:string;actorId:string;projectKey:string;active:boolean;enabled:boolean;revoked:boolean};
export type ProjectAccessReader={project(owner:OwnerBinding,project:string):Promise<unknown>;directory(owner:OwnerBinding):Promise<string[]>};
const sessionSchema=z.object({user:z.object({id:workflowId,email:z.email(),emailVerified:z.literal(true)}),
 session:z.object({id:workflowId,userId:workflowId,expiresAt:z.coerce.date(),revoked:z.boolean().optional()})});
const accessSchema=z.object({ownerId:workflowId,actorId:workflowId,projectKey:workflowPrincipal.shape.projectKey,
 active:z.literal(true),enabled:z.literal(true),revoked:z.literal(false)});

export function createVerifiedWorkflowAccess(binding:OwnerBinding,api:OwnerSessionApi,registry:ProjectAccessReader,now=()=>Date.now()){
 const owner=z.object({ownerId:workflowId,userId:workflowId,actorId:workflowId,email:z.email()}).strict().parse(binding);
 async function identity(request:Request){
  try{
   // Only authentication material reaches the authentication API. Spoofed
   // x-bob identity/project/scope headers cannot affect verified resolution.
   const headers=new Headers();for(const key of ["cookie","authorization"])if(request.headers.has(key))headers.set(key,request.headers.get(key)!);
   const result=sessionSchema.safeParse(await api.getSession({headers,query:{disableCookieCache:true}}));
   if(!result.success)return null;const {user,session}=result.data;
   if(user.id!==owner.userId||user.email.toLowerCase()!==owner.email.toLowerCase()||session.userId!==user.id||session.revoked===true||session.expiresAt.getTime()<=now())return null;
   return owner;
  }catch{return null;}
 }
 async function project(verified:OwnerBinding,key:string):Promise<PacketPrincipal|null>{
  if(!workflowPrincipal.shape.projectKey.safeParse(key).success||key==="personal")return null;
  const parsed=accessSchema.safeParse(await registry.project(verified,key));
  if(!parsed.success||parsed.data.ownerId!==verified.ownerId||parsed.data.actorId!==verified.actorId||parsed.data.projectKey!==key)return null;
  return {ownerId:verified.ownerId,actorId:verified.actorId,projectKey:key};
 }
 return {
  verifyOwner:identity,
  async authenticate(request:Request,key:string){try{const verified=await identity(request);return verified?await project(verified,key):null;}catch{return null;}},
  async directory(request:Request){try{const verified=await identity(request);if(!verified)return null;
   const keys=z.array(workflowPrincipal.shape.projectKey).max(100).parse(await registry.directory(verified));
   if(new Set(keys).size!==keys.length)return null;
   const principals:PacketPrincipal[]=[];for(const key of keys){const p=await project(verified,key);if(p)principals.push(p);}return principals;
  }catch{return null;}}
 };
}
