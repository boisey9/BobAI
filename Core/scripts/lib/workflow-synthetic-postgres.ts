import { spawn,execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import {isAbsolute,resolve,sep} from "node:path";
import type { WorkflowQuery,WorkflowTransaction } from "../../src/workflow/postgres-store.js";

export const socket=process.env.BOB_LOCAL_WORKFLOW_TEST_SOCKET;
export const enabled=!!socket&&/^\/tmp\/bob-workflow-pg-[a-zA-Z0-9_-]+$/.test(socket);
const configuredBin=process.env.BOB_LOCAL_WORKFLOW_PG_BIN??"/usr/local/opt/postgresql@17/bin";
if(!isAbsolute(configuredBin))throw new Error("absolute_synthetic_postgres_binary_directory_required");
export const bin=resolve(configuredBin)+sep;
export const env={PATH:bin+":/usr/bin:/bin",LC_ALL:"C",PGPASSFILE:"/nonexistent/bob-workflow-password",PGSERVICEFILE:"/dev/null"};
export const execute=promisify(execFile);
export function syntheticConnection(user="bob_workflow_test_admin",database="postgres") {
  if(!["bob_workflow_test_admin","bob_workflow_adapter_app","bob_backup_synthetic_public","bob_backup_synthetic_nobypass","bob_backup_synthetic_full","bob_evidence_synthetic_reader","bob_private_reader_app","bob_private_capture_app"].includes(user))throw new Error("synthetic_role_required");
  if(!["postgres","workflow_backup_restore_synthetic"].includes(database))throw new Error("synthetic_database_required");
  if(!enabled)throw new Error("private_synthetic_workflow_socket_required");
  const child=spawn(bin+"psql",["-X","-q","-A","-t","-w","-v","ON_ERROR_STOP=1","-h",socket!,"-U",user,"-d",database],{env,stdio:["pipe","pipe","pipe"]});
  let pending:{marker:string;lines:string[];resolve:(v:{rows:Record<string,unknown>[]})=>void;reject:(e:Error)=>void}|undefined;
  let errors="";child.stderr.on("data",data=>{errors+=String(data);});
  createInterface({input:child.stdout}).on("line",line=>{if(!pending)return;if(line===pending.marker){const p=pending;pending=undefined;
    try{p.resolve({rows:p.lines.filter(l=>l.startsWith("[")).flatMap(l=>JSON.parse(l))});}catch(e){p.reject(e as Error);}}
    else pending.lines.push(line);});
  child.on("exit",()=>{pending?.reject(new Error(errors||"postgres_disconnected"));pending=undefined;});
  child.on("error",e=>{pending?.reject(e);pending=undefined;});
  const query:WorkflowQuery=async(sql,parameters=[])=>{
    if(child.exitCode!==null||child.signalCode!==null)throw new Error("postgres_disconnected");
    if(pending)throw new Error("parallel_query_on_pinned_connection");
    const rendered=sql.replace(/\$(\d+)/g,(_all,n:string)=>{
      const v=parameters[Number(n)-1];if(v===null)return "NULL";
      if(typeof v==="number"&&Number.isFinite(v))return String(v);
      if(typeof v==="boolean")return v?"true":"false";
      if(typeof v!=="string")throw new Error("unsupported_synthetic_parameter");
      return `convert_from(decode('${Buffer.from(v).toString("hex")}','hex'),'UTF8')`;
    });
    const returned=rendered.startsWith("UPDATE bob_owner_delegation.proofs ")&&rendered.endsWith("RETURNING claims")?rendered.replace(/RETURNING claims$/,"RETURNING jsonb_build_array(jsonb_build_object('claims',claims))::text"):rendered;
    const statement=/^\s*SELECT\b/i.test(rendered)?`SELECT COALESCE(jsonb_agg(q),'[]'::jsonb)::text FROM (${rendered}) q`:returned;
    return new Promise((resolve,reject)=>{const marker="done_"+randomUUID().replaceAll("-","");pending={marker,lines:[],resolve,reject};child.stdin.write(statement+";\n\\echo "+marker+"\n");});
  };
  return {child,query,close(){child.stdin.end("\\q\n");}};
}
export const syntheticRunner:WorkflowTransaction=async run=>{const c=syntheticConnection();try{await c.query("BEGIN");await c.query("SET LOCAL ROLE bob_workflow_test_app");
  const value=await run(c.query);await c.query("COMMIT");return value;}catch(e){try{await c.query("ROLLBACK");}catch{}throw e;}finally{c.close();}};
