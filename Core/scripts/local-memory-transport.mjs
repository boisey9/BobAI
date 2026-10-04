// Test-process-only transport: exact synthetic target -> existing local wire proxy.
import {neonConfig,Pool} from '@neondatabase/serverless';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
export const target='postgresql://bob_workflow_test_admin@bob-workflow-auth-fixture.invalid/postgres';
export function configure(){
 assert.equal(process.env.BOB_LOCAL_MEMORY_DRILL,'true');assert.equal(process.env.VERCEL,undefined);
 assert.match(process.env.BOB_LOCAL_WORKFLOW_TEST_SOCKET??'',/^\/tmp\/bob-workflow-pg-[A-Za-z0-9_-]+$/);
 neonConfig.webSocketConstructor=require('../../Web/node_modules/next/dist/compiled/ws');
 neonConfig.wsProxy=(host,port)=>{assert.equal(host,'bob-workflow-auth-fixture.invalid');assert.equal(Number(port),5432);return '127.0.0.1:3434/synthetic-auth-wire-proxy-only-20261001';};
 neonConfig.useSecureWebSocket=false;neonConfig.forceDisablePgSSL=true;neonConfig.pipelineConnect=false;neonConfig.pipelineTLS=false;neonConfig.poolQueryViaFetch=false;
 neonConfig.fetchEndpoint='https://bob-memory-fixture.invalid/sql';
 const pool=new Pool({connectionString:target,max:2});
 neonConfig.fetchFunction=async(url,options)=>{
  assert.equal(String(url),'https://bob-memory-fixture.invalid/sql');assert.equal(options.headers['Neon-Connection-String'],target);assert.equal(options.method,'POST');
  const body=JSON.parse(options.body);assert.equal(body.queries,undefined,'No batch emulation');
  try{const result=await pool.query({text:body.query,values:body.params,rowMode:'array',types:{getTypeParser:()=>v=>v}});
   return new Response(JSON.stringify({fields:result.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:result.rows,command:result.command,rowCount:result.rowCount}),{status:200});
  }catch(e){return new Response(JSON.stringify({message:e.message,code:e.code}),{status:400});}
 };
 return pool;
}
