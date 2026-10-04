// Reuse only our already-stopped synthetic fixture; exercise actual PG stop on failure.
import {readFile} from 'node:fs/promises';import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {trackOwnedChild,waitOwnedReady,cleanupOwnedResources} from './lib/owned-child-lifecycle.mjs';
const execute=promisify(execFile),root=process.argv[2];assert.match(root??'',/^\/tmp\/bob-memory-run-[A-Za-z0-9_-]+$/);assert.equal(process.env.VERCEL,undefined);
const {data,socket,bin}=JSON.parse(await readFile(root+'/SYNTHETIC-ONLY.json'));assert.equal(data,root+'/pg-data');assert.match(socket,/^\/tmp\/bob-workflow-pg-[A-Za-z0-9_-]+$/);assert.equal(bin,'/usr/local/Cellar/postgresql@17/17.11/bin');
const env={PATH:'/usr/local/bin:/usr/bin:/bin',LC_ALL:'C',PGPASSFILE:'/nonexistent/bob-memory-password',PGSERVICEFILE:'/dev/null'},ctl=bin+'/pg_ctl';
async function stopped(){try{await execute(ctl,['-D',data,'status'],{env,timeout:5000});assert.fail('owned_cluster_still_running');}catch(e){assert.equal(e.code,3);}}
await stopped();let running=false;const checks=[];
try{for(const mode of ['already-exited','failed-start','child-timeout']){
 running=true;await execute(ctl,['-D',data,'-l',root+'/cleanup-pg.log','-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c fsync=on`,'-w','start'],{env,timeout:15000});
 let s;if(mode==='already-exited'){s=trackOwnedChild(spawn(process.execPath,['-e','process.exit(1)']));await new Promise(r=>s.child.once('close',r));}
 else if(mode==='failed-start'){s=trackOwnedChild(spawn('/nonexistent/bob-owned-fixture'));await assert.rejects(waitOwnedReady(s,'READY',500));}
 else{const fake=new EventEmitter();Object.assign(fake,{pid:999,exitCode:null,signalCode:null,kill:()=>true});s=trackOwnedChild(fake);}
 const stop=async()=>{await execute(ctl,['-D',data,'-m','fast','-w','stop'],{env,timeout:15000});running=false;};
 if(mode==='child-timeout')await assert.rejects(cleanupOwnedResources(s,stop,{graceMs:10,killMs:10}),AggregateError);else await cleanupOwnedResources(s,stop);
 await stopped();checks.push({mode,databaseStopped:true});
}console.log(JSON.stringify({passed:true,checks,syntheticOnly:true}));}
finally{if(running)await execute(ctl,['-D',data,'-m','fast','-w','stop'],{env,timeout:15000});}
