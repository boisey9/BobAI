// Explicit local synthetic acceptance. No hosted connection, install, secret or grant setup.
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,realpath,stat} from 'node:fs/promises';
import {isAbsolute,join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const execute=promisify(execFile),args=process.argv.slice(2),prefix='--pg-bin=';
if(args.length!==1||!args[0].startsWith(prefix)||!isAbsolute(args[0].slice(prefix.length)))throw new Error('Supply only --pg-bin=/absolute/installed/postgres/bin; nothing is installed.');
if(process.env.VERCEL)throw new Error('local_synthetic_runner_only');
const bin=await realpath(args[0].slice(prefix.length));
const core=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Do not inherit PG service/host/credentials, app credentials or arbitrary NODE_OPTIONS.
const env={PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',LC_ALL:'C',PGPASSFILE:'/nonexistent/bob-workflow-password',PGSERVICEFILE:'/dev/null'};
for(const name of ['initdb','pg_ctl','psql','pg_dump','pg_restore']){
 if(!(await stat(join(bin,name))).isFile())throw new Error('installed_postgres_binary_required');
 const result=await execute(join(bin,name),['--version'],{env});
 if(!/\b(?:17|18)\./.test(result.stdout))throw new Error('reviewed_postgres17_or18_required');
}
process.umask(0o077);
const root=await mkdtemp('/tmp/bob-workflow-run-'),validation=join(root,'workflow-validation'),data=join(validation,'pg-data');
const socket='/tmp/bob-workflow-pg-'+randomUUID();
await mkdir(validation,{mode:0o700});await mkdir(socket,{mode:0o700});
await writeFile(join(root,'SYNTHETIC-ONLY.json'),JSON.stringify({kind:'owned-disposable-workflow-fixture',data,socket,bin}),{mode:0o600});
let initialized=false;
try{
 await execute(join(bin,'initdb'),['-D',data,'-U','bob_workflow_test_admin','--auth-local=trust','--auth-host=reject','--encoding=UTF8','--no-locale'],{env});initialized=true;
 await execute(join(bin,'pg_ctl'),['-D',data,'-l',join(validation,'pg-server.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c fsync=on`,'-w','start'],{env});
 const out=await import('node:fs'),results=[];
 for(const [name,file,expected] of [['postgres','tests/workflow-postgres.test.ts',47],['evidence-storage','tests/workflow-evidence-storage.test.ts',12],['private-records','tests/private-record-postgres.test.ts',13]]){
  const receipt=join(validation,name+'.json'),errors=join(validation,name+'.stderr'),stdout=out.createWriteStream(receipt),stderr=out.createWriteStream(errors);
  const child=spawn(process.execPath,[join(core,'node_modules/vitest/vitest.mjs'),'run',file,'--reporter=json'],{cwd:core,env:{...env,BOB_LOCAL_WORKFLOW_TEST_SOCKET:socket,BOB_LOCAL_WORKFLOW_PG_BIN:bin},stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(180000)});
  child.stdout.pipe(stdout);child.stderr.pipe(stderr);
  const code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',ok);});
  await Promise.all([new Promise(r=>stdout.end(r)),new Promise(r=>stderr.end(r))]);
  const result=JSON.parse(await readFile(receipt,'utf8'));
  if(code!==0||!result.success||result.numPassedTests!==expected||result.numPendingTests!==0||result.numFailedTests!==0)throw new Error(name+'_required_cases_not_verified');
  results.push({name,passed:expected,receipt});
 }
 await writeFile(join(validation,'runner-receipt.json'),JSON.stringify({syntheticOnly:true,results,pending:0,binaryDirectory:bin,socket,tcpDisabled:true,fsync:true},null,2));
 console.log(JSON.stringify({results,validation}));
}finally{
 // No recursive cleanup/delete: preserve synthetic receipts and interrupted fixtures.
 if(initialized){try{await execute(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env});}catch{console.error('Fixture stop failed or cluster already stopped; inspect '+data);}}
}
