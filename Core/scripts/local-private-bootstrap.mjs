// LOCAL rehearsal only. Not a hosted migration or provisioning command.
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
export async function localBootstrapOperator(root,env=process.env){
 if(env.VERCEL||!/^\/tmp\/bob-hosted-network-[A-Za-z0-9_-]+$/.test(root??''))throw Error('owned_local_fixture_required');
 const marker=JSON.parse(await readFile(root+'/SYNTHETIC-ONLY.json','utf8'));
 if(marker.data!==root+'/workflow-validation/pg-data'||marker.bin!=='/usr/local/Cellar/postgresql@17/17.11/bin'||marker.kind!=='owned-hosted-network-fixture'||!/^\/tmp\/bob-workflow-pg-[A-Za-z0-9_-]+$/.test(marker.socket)||marker.socket!==env.BOB_LOCAL_WORKFLOW_TEST_SOCKET||String(marker.port)!==env.BOB_HOSTED_NETWORK_PORT)throw Error('fixture_binding_denied');
 const bin='/usr/local/Cellar/postgresql@17/17.11/bin';
 const clean={PATH:'/usr/bin:/bin',LC_ALL:'C',PGPASSFILE:'/nonexistent',PGSERVICEFILE:'/dev/null'};
 async function sql(text,database='postgres'){
  if(!['postgres','bob_bootstrap_empty','bob_bootstrap_restored'].includes(database))throw Error('local_database_denied');
  const r=await exec(bin+'/psql',['-X','-At','-v','ON_ERROR_STOP=1','-h',marker.socket,'-p',String(marker.port),'-U','bob_workflow_test_admin','-d',database,'-c',text],{env:clean,maxBuffer:4*1024*1024});return r.stdout.trim();
 }
 if(await sql("SELECT current_setting('data_directory')")!==marker.data||await sql('SELECT inet_server_addr() IS NULL')!=='t')throw Error('local_cluster_identity_denied');
 const manifest=JSON.parse(await readFile(new URL('./private-bootstrap-manifest.json',import.meta.url),'utf8'));
 if(manifest.version!==1||manifest.localOnly!==true||manifest.migrations.length!==8)throw Error('bootstrap_manifest_denied');
 const migrations=[];for(const f of manifest.migrations){const data=await readFile(new URL('../migrations/'+f.path,import.meta.url),'utf8');if(createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('migration_hash_mismatch');migrations.push(data.replace(/^BEGIN;$/m,'').replace(/COMMIT;\s*$/,''));}
 async function bootstrap(database,injectFailure=false){
  if(database!=='bob_bootstrap_empty')throw Error('disposable_empty_database_required');
  if(await sql("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",database)!=='0')throw Error('target_not_empty');
  // Only hash-pinned reviewed migration bodies; one transaction owns the bundle.
  const roleSQL=`CREATE ROLE rehearsal_workflow NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   CREATE ROLE rehearsal_registry NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   CREATE ROLE rehearsal_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   GRANT USAGE ON SCHEMA public,bob_workflow TO rehearsal_workflow,rehearsal_registry;
   GRANT SELECT ON ALL TABLES IN SCHEMA bob_workflow TO rehearsal_workflow;
   GRANT INSERT,UPDATE ON bob_workflow.packets TO rehearsal_workflow;
   GRANT INSERT ON bob_workflow.records,bob_workflow.receipts,bob_workflow.history TO rehearsal_workflow;
   GRANT USAGE ON ALL SEQUENCES IN SCHEMA bob_workflow TO rehearsal_workflow;
   GRANT SELECT ON public.bob_projects,public.bob_tasks,public.bob_events TO rehearsal_workflow;
   GRANT SELECT ON public.bob_projects,bob_workflow.grants TO rehearsal_registry;
   GRANT USAGE ON SCHEMA public,bob_owner_delegation TO rehearsal_auth;
   GRANT SELECT,INSERT,UPDATE ON bob_owner_delegation.proofs TO rehearsal_auth;
   GRANT SELECT,INSERT,UPDATE,DELETE ON public.bob_auth_user,public.bob_auth_session,public.bob_auth_account,public.bob_auth_verification,public.bob_auth_passkey,public.bob_auth_rate_limit TO rehearsal_auth;`;
  await sql('BEGIN;'+migrations.join('\n')+roleSQL+(injectFailure?'SELECT nonexistent_rehearsal_function();':'')+'COMMIT;',database);
 }
 return {sql,bootstrap,marker,manifest,bin,clean};
}
