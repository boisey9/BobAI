import {createHash,randomBytes} from "node:crypto";
import {z} from "zod";
import {WorkflowError,workflowId,workflowPrincipal,type PacketPrincipal} from "./packet-contract.js";
import type {OwnerBinding,OwnerSessionApi,ProjectAccessReader} from "./owner-access.js";
import type {WorkflowQuery} from "./postgres-store.js";

export type ActionBinding={method:"GET"|"POST";path:string;bodyDigest:string;project:string};
export function actionBinding(method:string,path:string,body:string,project:string):ActionBinding{
 return bindingSchema.parse({method,path,bodyDigest:createHash("sha256").update(body).digest("hex"),project});
}
const bindingSchema=z.object({method:z.enum(["GET","POST"]),path:z.string().regex(/^\/v1\/governed\/[A-Za-z0-9_/?=.%:-]+$/),bodyDigest:z.string().regex(/^[a-f0-9]{64}$/),project:z.union([workflowPrincipal.shape.projectKey,z.literal("_directory")])}).strict();
const sessionSchema=z.object({user:z.object({id:workflowId,email:z.email(),emailVerified:z.literal(true)}),session:z.object({id:workflowId,userId:workflowId,expiresAt:z.coerce.date(),updatedAt:z.coerce.date(),revoked:z.boolean().optional()})});
const proofSchema=z.object({version:z.literal(1),issuer:z.string().url(),audience:z.string().url(),ownerId:workflowId,actorId:workflowId,userId:workflowId,
 sessionId:workflowId,sessionVersion:z.string(),expiresAt:z.number().int(),action:bindingSchema,projects:z.array(workflowPrincipal.shape.projectKey).min(1).max(100),projectVersions:z.array(z.object({projectKey:workflowPrincipal.shape.projectKey,version:z.string().uuid()})).min(1).max(100)}).strict();
export type OwnerProof=z.infer<typeof proofSchema>;
export interface OwnerProofStore {insert(hash:string,proof:OwnerProof):Promise<void>;consume(hash:string):Promise<OwnerProof|null>;consumed(hash:string):Promise<OwnerProof|null>}
export function postgresOwnerProofStore(query:WorkflowQuery):OwnerProofStore{
 return {async insert(hash,proof){await query("INSERT INTO bob_owner_delegation.proofs(proof_hash,claims,expires_at) VALUES($1,$2::jsonb,to_timestamp($3/1000.0))",[hash,JSON.stringify(proof),proof.expiresAt]);},
 async consume(hash){const r=await query("UPDATE bob_owner_delegation.proofs SET redeemed_at=clock_timestamp() WHERE proof_hash=$1 AND redeemed_at IS NULL AND expires_at>clock_timestamp() RETURNING claims",[hash]);return r.rows[0]?proofSchema.parse(r.rows[0].claims):null;},
 async consumed(hash){const r=await query("SELECT claims FROM bob_owner_delegation.proofs WHERE proof_hash=$1 AND redeemed_at IS NOT NULL AND expires_at>clock_timestamp()",[hash]);return r.rows[0]?proofSchema.parse(r.rows[0].claims):null;}};
}
export type DelegationConfiguration={issuer:string;audience:string;owner:OwnerBinding;proofLifetimeMs:number};
export type SessionAuthority={api:OwnerSessionApi;currentSession(id:string):Promise<unknown>};
export function createOwnerDelegation(config:DelegationConfiguration,authority:SessionAuthority,registry:ProjectAccessReader,store:OwnerProofStore,now=()=>Date.now()){
 const {owner}=config;
 for(const value of [config.issuer,config.audience]){const u=new URL(value);if(u.origin!==value||u.username||u.password||!(u.protocol==="https:"||u.protocol==="http:"&&["127.0.0.1","localhost"].includes(u.hostname)))throw new Error("delegation_target_invalid");}
 if(!Number.isSafeInteger(config.proofLifetimeMs)||config.proofLifetimeMs<=0)throw new Error("delegation_expiry_required");
 function checkedTime(){const value=now();return Number.isSafeInteger(value)&&value>=0?value:null;}
 function session(value:unknown){const r=sessionSchema.safeParse(value);if(!r.success)return null;const s=r.data,checked=checkedTime();
  return checked!==null&& s.user.id===owner.userId&&s.user.email.toLowerCase()===owner.email.toLowerCase()&&s.session.userId===s.user.id&&s.session.revoked!==true&&s.session.expiresAt.getTime()>checked?s:null;}
 async function projects(action:ActionBinding){const keys=action.project==="_directory"?await registry.directory(owner):[action.project];
  if(!keys.length||keys.length>100||new Set(keys).size!==keys.length)return null;
  const versions:Array<{projectKey:string;version:string}>=[];
  for(const key of keys){if(key==="personal"||!workflowPrincipal.shape.projectKey.safeParse(key).success)return null;
   const a=await registry.project(owner,key) as Record<string,unknown>|null;
   if(!a||a.ownerId!==owner.ownerId||a.actorId!==owner.actorId||a.projectKey!==key||a.active!==true||a.enabled!==true||a.revoked!==false||!z.uuid().safeParse(a.authorityVersion).success)return null;
   versions.push({projectKey:key,version:String(a.authorityVersion)});
  }return {keys,versions};
 }
 function hash(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new WorkflowError("owner_delegation_denied",403);return createHash("sha256").update(token).digest("hex");}
 async function valid(proof:OwnerProof,action:ActionBinding){
  const initial=checkedTime();if(initial===null)return false;
  if(proof.issuer!==config.issuer||proof.audience!==config.audience||proof.ownerId!==owner.ownerId||proof.actorId!==owner.actorId||proof.userId!==owner.userId||proof.expiresAt<=initial||JSON.stringify(proof.action)!==JSON.stringify(bindingSchema.parse(action)))return false;
  const s=session(await authority.currentSession(proof.sessionId));if(!s||s.session.id!==proof.sessionId||s.session.updatedAt.toISOString()!==proof.sessionVersion)return false;
  const allowed=await projects(action);const final=checkedTime();return final!==null&&proof.expiresAt>final&&s.session.expiresAt.getTime()>final&&!!allowed&&JSON.stringify(allowed.keys)===JSON.stringify(proof.projects)&&JSON.stringify(allowed.versions)===JSON.stringify(proof.projectVersions);
 }
 return {audience:config.audience,
  async issue(headers:Headers,input:ActionBinding){const action=bindingSchema.parse(input);const forwarded=new Headers();if(headers.has("cookie"))forwarded.set("cookie",headers.get("cookie")!);
   const s=session(await authority.api.getSession({headers:forwarded,query:{disableCookieCache:true}}));if(!s)throw new WorkflowError("owner_delegation_denied",403);const allowed=await projects(action);
   const issuedAt=checkedTime();if(!s||!allowed||issuedAt===null||s.session.expiresAt.getTime()<=issuedAt)throw new WorkflowError("owner_delegation_denied",403);
   const token=randomBytes(32).toString("hex"),proof:OwnerProof={version:1,issuer:config.issuer,audience:config.audience,ownerId:owner.ownerId,actorId:owner.actorId,userId:s.user.id,sessionId:s.session.id,sessionVersion:s.session.updatedAt.toISOString(),expiresAt:Math.min(s.session.expiresAt.getTime(),issuedAt+config.proofLifetimeMs),action,projects:allowed.keys,projectVersions:allowed.versions};
   await store.insert(hash(token),proof);const final=checkedTime();if(final===null||proof.expiresAt<=final||s.session.expiresAt.getTime()<=final)throw new WorkflowError("owner_delegation_denied",403);return {token};
  },
  async redeem(token:string,input:ActionBinding):Promise<PacketPrincipal[]>{const action=bindingSchema.parse(input),proof=await store.consume(hash(token));
   if(!proof||!await valid(proof,action))throw new WorkflowError("owner_delegation_denied",403);
   return proof.projects.map(projectKey=>({ownerId:proof.ownerId,actorId:proof.actorId,projectKey}));
  },
  async revalidate(token:string,input:ActionBinding){const action=bindingSchema.parse(input),proof=await store.consumed(hash(token));return !!proof&&await valid(proof,action);}
 };
}
