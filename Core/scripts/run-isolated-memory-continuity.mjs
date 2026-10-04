import {trackOwnedChild,waitOwnedReady,cleanupOwnedResources} from './lib/owned-child-lifecycle.mjs';
import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';import {join,resolve,dirname,isAbsolute} from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
const execute=promisify(execFile),args=process.argv.slice(2);if(args.length!==1||!args[0].startsWith('--pg-bin=')||!isAbsolute(args[0].slice(9))||process.env.VERCEL)throw Error('Explicit installed local PostgreSQL required');
const bin=await realpath(args[0].slice(9)),core=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env={PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',LC_ALL:'C',PGPASSFILE:'/nonexistent/bob-memory-password',PGSERVICEFILE:'/dev/null'};
for(const name of ['initdb','pg_ctl','psql']){const r=await execute(join(bin,name),['--version'],{env});if(!/\b(?:17|18)\./.test(r.stdout))throw Error('PG17or18required');}
process.umask(0o077);const root=await mkdtemp('/tmp/bob-memory-run-'),data=join(root,'pg-data'),socket='/tmp/bob-workflow-pg-'+randomUUID();await mkdir(socket,{mode:0o700});await writeFile(join(root,'SYNTHETIC-ONLY.json'),JSON.stringify({data,socket,bin}));
let started=false,proxy;
try{
 // Refuse occupied proxy port; never stop another task's service.
 const {createServer}=await import('node:net');const probe=createServer();await new Promise((ok,no)=>{probe.once('error',no);probe.listen(3434,'127.0.0.1',ok);});await new Promise(r=>probe.close(r));
 await execute(join(bin,'initdb'),['-D',data,'-U','bob_workflow_test_admin','--auth-local=trust','--auth-host=reject','--encoding=UTF8','--no-locale'],{env});
 started=true;await execute(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'pg-server.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c fsync=on`,'-w','start'],{env,timeout:15000});
 const settings=async()=>{const r=await execute(join(bin,'psql'),['-h',socket,'-U','bob_workflow_test_admin','-d','postgres','-At','-c',"SELECT current_setting('listen_addresses')='' AND current_setting('unix_socket_directories')='"+socket+"' AND current_setting('fsync')='on'"],{env});if(r.stdout.trim()!=='t')throw Error('private_fixture_settings_required');};await settings();
 const local={...env,BOB_LOCAL_MEMORY_DRILL:'true',BOB_LOCAL_REAL_AUTH_FIXTURE:'true',BOB_LOCAL_WORKFLOW_TEST_SOCKET:socket};
 proxy=trackOwnedChild(spawn(process.execPath,['scripts/local-real-auth-proxy.mjs'],{cwd:core,env:local,stdio:['ignore','pipe','pipe']}));await waitOwnedReady(proxy,'Isolated auth wire proxy listening on loopback3434');
 const r=await execute(process.execPath,['--import','tsx','scripts/check-local-memory-continuity.mjs'],{cwd:core,env:local,timeout:60000,maxBuffer:1024*1024});await writeFile(join(root,'continuity.json'),r.stdout);await writeFile(join(root,'continuity.stderr'),r.stderr);
 // Stop and restart the database, then use a fresh process for the persisted read.
 await execute(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env,timeout:15000});started=false;
 started=true;await execute(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'pg-server.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c fsync=on`,'-w','start'],{env,timeout:15000});
 await settings();
 const owner=JSON.parse(r.stdout).owner;const cold=await execute(process.execPath,['--import','tsx','scripts/local-memory-cold-read.mjs'],{cwd:core,env:{...local,BOB_TEST_OWNER:owner,BOB_MEMORY_EXPECTED:JSON.stringify(JSON.parse(r.stdout).persisted)},timeout:30000});await writeFile(join(root,'cold-restart.json'),cold.stdout);console.log(JSON.stringify({root,continuity:JSON.parse(r.stdout),cold:JSON.parse(cold.stdout)}));
}catch(e){await writeFile(join(root,'failure.json'),JSON.stringify({message:e.message,stdout:e.stdout,stderr:e.stderr}));throw e;}
finally{try{await cleanupOwnedResources(proxy,async()=>{if(started)await execute(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env,timeout:15000});});}finally{console.error('Preserved synthetic fixture '+root);}}
