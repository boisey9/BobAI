// Private host factory only. No route, credential, pool or live service is created on import.
// Shared Node host implementation. Web imports only the server-only wrapper.
if(typeof window!=="undefined")throw new Error("server_host_only");
import type {Pool} from "@neondatabase/serverless";
import {createOwnerAuth,ownerAuthEnabled} from "./owner-auth";
import {createOwnerDelegation,postgresOwnerProofStore,type DelegationConfiguration} from "../../Core/src/workflow/owner-delegation";
import {ownerVerifierRouter} from "../../Core/src/workflow/delegation-transport";
import type {ProjectAccessReader} from "../../Core/src/workflow/owner-access";
import type {WorkflowQuery} from "../../Core/src/workflow/postgres-store";

// Host must supply the explicitly reviewed auth-store pool/role and exact
// project registry. It must not reuse an MCP client/grant or a legacy cookie.
export function createWorkflowOwnerVerifier(pool:Pool,configuration:DelegationConfiguration,registry:ProjectAccessReader,clients:{web:string;core:string}){
 if(!ownerAuthEnabled())throw new Error("verified_owner_auth_required");
 const auth=createOwnerAuth(pool),query:WorkflowQuery=async(sql,params)=>({rows:(await pool.query(sql,params)).rows});
 const verifier=createOwnerDelegation(configuration,{api:{getSession:input=>auth.api.getSession(input)},
  async currentSession(id){const row=(await query(`SELECT u.id,u.email,u."emailVerified",s.id AS session_id,s."userId",s."expiresAt",s."updatedAt"
   FROM bob_auth_session s JOIN bob_auth_user u ON u.id=s."userId" WHERE s.id=$1`,[id])).rows[0];
   return row?{user:{id:row.id,email:row.email,emailVerified:row.emailVerified},session:{id:row.session_id,userId:row.userId,expiresAt:row.expiresAt,updatedAt:row.updatedAt}}:null;
  }},registry,postgresOwnerProofStore(query));
 return ownerVerifierRouter(verifier,clients);
}
