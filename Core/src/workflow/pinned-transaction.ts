import {boundHostedPool} from "./hosted-database.js";
import {hostedTargetSchema,type HostedTarget} from "./hosted-profile.js";
import { WorkflowError } from "./packet-contract.js";
import type { WorkflowQuery,WorkflowTransaction } from "./postgres-store.js";

// Structural interface is compatible with Pool.connect() in the already-used
// @neondatabase/serverless SDK. No pool/environment/default endpoint is created.
export type PinnedClient={query:WorkflowQuery;release(destroy?:boolean):void};
export type PinnedPool={options:{host?:string|undefined;database?:string|undefined;user?:string|undefined};connect():Promise<PinnedClient>};
export type IsolatedTarget={kind:"isolated-local";socket:string;database:string;role:string};
// Exact reviewed application operations, not SQL parsing or arbitrary SQL sandboxing.
// Changes to service SQL require explicit addition/review here. Parameters never become SQL.
const applicationStatements=new Set<string>([
  "SELECT set_config('bob.workflow_owner',$1,true), set_config('bob.workflow_project',$2,true)",
  "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
  "SELECT p.policy, p.paused, g.can_edit, g.can_review,\n        extract(epoch FROM clock_timestamp()) * 1000 AS now\n        FROM bob_workflow.projects p JOIN bob_workflow.grants g USING(owner_id,project_key)\n        WHERE p.owner_id=$1 AND p.project_key=$2 AND g.actor_id=$3 AND g.enabled=true\n        ",
  "SELECT document FROM bob_workflow.packets WHERE owner_id=$1 AND project_key=$2 ORDER BY id LIMIT 501",
  "SELECT r.id,r.packet_id,r.kind,r.content || CASE WHEN r.kind='approval' THEN\n        jsonb_build_object('consumed',EXISTS(SELECT 1 FROM bob_workflow.receipts op WHERE op.owner_id=r.owner_id\n          AND op.project_key=r.project_key AND op.approval_id=r.id)) ELSE '{}'::jsonb END AS content,r.created_at\n        FROM bob_workflow.records r WHERE r.owner_id=$1 AND r.project_key=$2 ORDER BY r.created_at,r.id LIMIT 10001",
  "SELECT policy FROM bob_workflow.policy_versions WHERE owner_id=$1 AND project_key=$2 AND version_id=$3",
  "INSERT INTO bob_workflow.records(owner_id,project_key,id,packet_id,kind,content,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)",
  "INSERT INTO bob_workflow.packets(owner_id,project_key,id,document) VALUES($1,$2,$3,$4::jsonb)\n            ON CONFLICT(owner_id,project_key,id) DO UPDATE SET document=EXCLUDED.document",
  "SELECT project_key,name,description,status FROM public.bob_projects WHERE owner_id=$1 AND project_key=$2 AND deleted_at IS NULL AND status='active'",
  "SELECT actor_id,result FROM bob_workflow.receipts WHERE owner_id=$1 AND project_key=$2 AND operation_id=$3",
  "SELECT id::text,project_key,name,description,status FROM public.bob_projects WHERE owner_id=$1 AND project_key=$2 AND deleted_at IS NULL",
  "SELECT t.id::text,t.title,t.description,t.status,t.priority,t.updated_at FROM public.bob_tasks t\n        JOIN public.bob_projects p ON p.id=t.project_id AND p.owner_id=t.owner_id\n        WHERE t.owner_id=$1 AND p.project_key=$2 AND p.deleted_at IS NULL ORDER BY t.updated_at DESC,t.id LIMIT 101",
  "SELECT e.id::text,e.event_type,e.summary,e.source,e.created_at FROM public.bob_events e\n        JOIN public.bob_projects p ON p.id=e.project_id AND p.owner_id=e.owner_id\n        WHERE e.owner_id=$1 AND p.project_key=$2 AND p.deleted_at IS NULL ORDER BY e.created_at DESC,e.id LIMIT 101",
  "SELECT sequence::text,packet_id,action,state,version,created_at FROM bob_workflow.history h\n        WHERE owner_id=$1 AND project_key=$2 ORDER BY h.sequence DESC LIMIT 101",
  "SELECT sequence::text,packet_id,operation_id,actor_id,action,state,version,created_at\n        FROM bob_workflow.history h WHERE owner_id=$1 AND project_key=$2 AND ($3::bigint IS NULL OR sequence<$3::bigint)\n        ORDER BY h.sequence DESC LIMIT 101",
  "SELECT actor_id,fingerprint,result FROM bob_workflow.receipts WHERE owner_id=$1 AND project_key=$2 AND operation_id=$3",
  "INSERT INTO bob_workflow.receipts(owner_id,project_key,operation_id,actor_id,fingerprint,result,approval_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
  "INSERT INTO bob_workflow.history(owner_id,project_key,packet_id,operation_id,actor_id,action,state,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)"
]);
export function createPinnedWorkflowTransaction(pool:PinnedPool,target:IsolatedTarget|HostedTarget,revalidate:()=>Promise<boolean>):WorkflowTransaction{
 const network=target.kind==="hosted-wss";
 if(network){hostedTargetSchema.parse(target);if(!boundHostedPool(pool,target)||pool.options.host!==target.host||pool.options.database!==target.database||pool.options.user!==target.role)throw new WorkflowError("workflow_database_target_not_approved",503);}
 else if(target.kind!=="isolated-local"||!/^\/tmp\/bob-workflow-pg-[A-Za-z0-9_-]+$/.test(target.socket)||
  pool.options.host!==target.socket||pool.options.database!==target.database||pool.options.user!==target.role||!target.database||!target.role)
  throw new WorkflowError("workflow_database_target_not_approved",503);
 if(typeof revalidate!=="function")throw new WorkflowError("workflow_authorization_unavailable",503);
 return async run=>{
  if(!await revalidate())throw new WorkflowError("workflow_access_denied",403);
  const client=await pool.connect();let begun=false,committing=false,poisoned=false,finished=false;
  try{
   const identity=(await client.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
    pg_backend_pid() AS pid,inet_server_addr()::text AS address,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
   if(!identity||identity.database!==target.database||identity.role!==target.role||identity.session_role!==target.role||(network?identity.address===null:identity.address!==null)||
    identity.rolsuper!==false||identity.rolbypassrls!==false||identity.rolcreatedb!==false||identity.rolcreaterole!==false)throw new WorkflowError("workflow_database_target_mismatch",503);
   await client.query("BEGIN");begun=true;
   let querying=false,boundaryViolated=false;
   const query:WorkflowQuery=async(sql,params)=>{
    if(finished||querying||!applicationStatements.has(sql)){boundaryViolated=true;throw new WorkflowError("workflow_transaction_boundary_violation",503);}
    querying=true;try{return await client.query(sql,params);}finally{querying=false;}
   };
   const result=await run(query);if(querying||boundaryViolated)throw new WorkflowError("workflow_transaction_boundary_violation",503);
   const pid=(await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
   if(pid!==identity.pid)throw new WorkflowError("workflow_pinned_connection_changed",503);
   if(!await revalidate())throw new WorkflowError("workflow_access_denied",403);
   finished=true;committing=true;await client.query("COMMIT");begun=false;return result;
  }catch(error){
   finished=true;poisoned=true;
   if(committing)throw new WorkflowError("workflow_write_outcome_unconfirmed",503);
   if(begun){try{await client.query("ROLLBACK");}catch{throw new WorkflowError("workflow_rollback_outcome_unconfirmed",503);}}
   throw error;
  }finally{client.release(poisoned);}
 };
}
