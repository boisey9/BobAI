// Only isolated synthetic acceptance. This API models authoritative getSession
// records; it is not Better Auth signature/passkey or production acceptance.
import { syntheticConnection,socket } from "./workflow-synthetic-postgres.js";
import { createVerifiedWorkflowAccess,type OwnerSessionApi,type ProjectAccessReader } from "../../src/workflow/owner-access.js";
import { createPinnedWorkflowTransaction,type PinnedPool } from "../../src/workflow/pinned-transaction.js";
export const fixtureOwner={ownerId:"synthetic-owner",userId:"synthetic-owner-user",actorId:"synthetic-owner-actor",email:"owner@example.invalid"};
export async function fixtureAdmin(sql:string,params:unknown[]=[]){const c=syntheticConnection();try{return await c.query(sql,params);}finally{c.close();}}
export function fixturePool():PinnedPool{return {options:{host:socket!,database:"postgres",user:"bob_workflow_adapter_app"},async connect(){const c=syntheticConnection("bob_workflow_adapter_app");return {query:c.query,release:()=>c.close()};}};}
export function fixtureTransaction(){return createPinnedWorkflowTransaction(fixturePool(),{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},async()=>!!await fixtureAccess().verifyOwner(new Request("http://localhost/",{headers:{authorization:"Bearer synthetic-owner-workflow-fixture"}})));}
export const fixtureSessionApi:OwnerSessionApi={async getSession({headers}){
 const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(headers.get("authorization")??"");if(!match)return null;
 const row=(await fixtureAdmin(`SELECT u.id,u.email,u."emailVerified",s.id AS session_id,s."userId",s."expiresAt"
 FROM bob_auth_session s JOIN bob_auth_user u ON u.id=s."userId" WHERE s.token=$1`,[match[1]])).rows[0];
 return row?{user:{id:row.id,email:row.email,emailVerified:row.emailVerified},session:{id:row.session_id,userId:row.userId,expiresAt:row.expiresAt}}:null;
}};
export const fixtureRegistry:ProjectAccessReader={async project(owner,key){const row=(await fixtureAdmin(`SELECT p.owner_id,p.project_key,p.status,g.actor_id,g.enabled,g.delegation_version FROM bob_projects p
 JOIN bob_workflow.grants g ON g.owner_id=p.owner_id AND g.project_key=p.project_key
 WHERE p.owner_id=$1 AND p.project_key=$2 AND g.actor_id=$3 AND p.deleted_at IS NULL`,[owner.ownerId,key,owner.actorId])).rows[0];
 return row?{ownerId:row.owner_id,actorId:row.actor_id,projectKey:row.project_key,active:row.status==="active",enabled:row.enabled,revoked:row.enabled!==true,authorityVersion:row.delegation_version}:null;
},async directory(owner){return (await fixtureAdmin(`SELECT p.project_key FROM bob_projects p JOIN bob_workflow.grants g ON g.owner_id=p.owner_id AND g.project_key=p.project_key
 WHERE p.owner_id=$1 AND g.actor_id=$2 AND p.deleted_at IS NULL AND p.status='active' AND g.enabled=true AND p.project_key<>'personal' ORDER BY p.project_key`,[owner.ownerId,owner.actorId])).rows.map(r=>String(r.project_key));}};
export function fixtureAccess(){return createVerifiedWorkflowAccess(fixtureOwner,fixtureSessionApi,fixtureRegistry);}
