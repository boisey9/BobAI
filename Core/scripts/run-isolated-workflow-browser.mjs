// Existing installed runtime only. Restart a stopped OWNED synthetic fixture,
// isolated actual Better Auth/DB/browser; no provider calls or hosted configuration.
import {createServer} from 'node:net';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,realpath,access,mkdir} from 'node:fs/promises';
import {createWriteStream,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile),core=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=dirname(core),web=join(root,'Web');
const args=process.argv.slice(2);
if(args.length!==1||!/^--fixture-root=\/tmp\/bob-workflow-run-[A-Za-z0-9_-]+$/.test(args[0])||process.env.VERCEL)throw new Error('owned_stopped_fixture_root_required');
const fixture=args[0].slice('--fixture-root='.length),marker=JSON.parse(await readFile(join(fixture,'SYNTHETIC-ONLY.json'),'utf8'));
const data=join(fixture,'workflow-validation/pg-data');
if(marker.kind!=='owned-disposable-workflow-fixture'||marker.data!==data||!/^\/tmp\/bob-workflow-pg-[A-Za-z0-9_-]+$/.test(marker.socket)||existsSync(join(data,'postmaster.pid')))throw new Error('owned_stopped_fixture_required');
const bin=await realpath(marker.bin);await access(join(bin,'pg_ctl'));await access('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const results=JSON.parse(await readFile(join(fixture,'workflow-validation/runner-receipt.json'),'utf8'));
if(results.syntheticOnly!==true||results.pending!==0||results.socket!==marker.socket||results.binaryDirectory!==bin)throw new Error('completed_synthetic_pg_acceptance_required');
const env={PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',LC_ALL:'C',PGPASSFILE:'/nonexistent/bob-workflow-password',PGSERVICEFILE:'/dev/null',NODE_ENV:'production',BOB_LOCAL_WORKFLOW_TEST_SOCKET:marker.socket,BOB_LOCAL_WORKFLOW_PG_BIN:bin,
 BOB_LOCAL_REAL_AUTH_FIXTURE:'true',BOB_AUTH_ENABLED:'true',BOB_AUTH_PASSWORD_LOGIN_ENABLED:'true',BOB_AUTH_OWNER_EMAIL:'owner@example.invalid',BOB_AUTH_BASE_URL:'http://127.0.0.1:3430',BOB_AUTH_SECRET:'synthetic-auth-signing-secret-not-live-20261001',BOB_AUTH_DATABASE_URL:'postgresql://bob_workflow_test_admin@bob-workflow-auth-fixture.invalid/postgres',
 BOB_GOVERNED_WORKFLOW_ENABLED:'true',BOB_WORKFLOW_WEB_ORIGIN:'http://127.0.0.1:3430',BOB_WORKFLOW_CORE_BASE_URL:'http://127.0.0.1:3431',BOB_WORKFLOW_OWNER_ISSUER:'http://127.0.0.1:3433',BOB_WORKFLOW_WEB_VERIFIER_CREDENTIAL:'synthetic-web-verifier-credential-not-live-20261001',
 BOB_E2E_REAL_AUTH:'true',BOB_E2E_CHROME_PATH:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',BOB_E2E_OUTPUT_DIR:join(root,'workflow-validation/browser-artifacts'),NEXT_TELEMETRY_DISABLED:'1'};
// Refuse occupied ports; never inspect/stop another task's server.
for(const port of [3430,3431,3433,3434])await new Promise((ok,no)=>{const probe=createServer();probe.once('error',no);probe.listen({host:'127.0.0.1',port,exclusive:true},()=>probe.close(ok));});
const children=[],streams=[];
function start(name,command,cwd){const log=createWriteStream(join(root,'workflow-validation',name+'.log'));streams.push(log);const child=spawn(process.execPath,command,{cwd,env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});children.push(child);return child;}
async function waitUrl(url,child){const until=Date.now()+30000;while(Date.now()<until){if(child.exitCode!==null||child.signalCode!==null)throw new Error('owned_fixture_process_exited');try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.status<500)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('owned_fixture_server_not_ready');}
let started=false;
try{
 await execute(join(bin,'pg_ctl'),['-D',data,'-l',join(fixture,'workflow-validation/pg-browser.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${marker.socket}' -c unix_socket_permissions=0700 -c fsync=on`,'-w','start'],{env});started=true;
 const proxy=start('auth-proxy',['scripts/local-real-auth-proxy.mjs'],core);await waitUrl('http://127.0.0.1:3434/',proxy);
 const service=start('browser-core',['--import','tsx','scripts/workflow-browser-fixture.ts'],core);await waitUrl('http://127.0.0.1:3431/fixture/state',service);
 const build=await execute(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{cwd:web,env,maxBuffer:8*1024*1024,timeout:180000});await writeFile(join(root,'workflow-validation/web-build.log'),build.stdout+'\n'+build.stderr);
 const app=start('browser-web',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3430'],web);await waitUrl('http://127.0.0.1:3430/login',app);
 // Existing Playwright performs rendered gut check/console/overlay/owner login
 // before adversarial scenarios. No agent-browser installation or live profile.
 const run=await execute(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/governed-workflow-local.spec.ts','--reporter=json'],{cwd:web,env,maxBuffer:8*1024*1024,timeout:240000});
 await writeFile(join(root,'workflow-validation/browser-final.json'),run.stdout);await writeFile(join(root,'workflow-validation/browser-final.stderr'),run.stderr);
 const result=JSON.parse(run.stdout);if(result.stats.expected!==31||result.stats.unexpected||result.stats.skipped||result.stats.flaky)throw new Error('required_actual_auth_rendered_cases_not_verified');
 await writeFile(join(root,'workflow-validation/browser-runner.json'),JSON.stringify({syntheticOnly:true,actualBetterAuth:true,expected:31,unexpected:0,skipped:0,flaky:0,fixtureRoot:fixture,tcpDisabled:true,releaseEnabled:false},null,2));
 console.log(JSON.stringify({expected:31,validation:join(root,'workflow-validation')}));
}catch(e){if(e.stdout)await writeFile(join(root,'workflow-validation/browser-failed-or-build.log'),e.stdout);if(e.stderr)await writeFile(join(root,'workflow-validation/browser-failed-or-build.stderr'),e.stderr);throw e;}
finally{
 for(const child of children.reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('close',r)),new Promise(r=>setTimeout(r,3000))]);if(child.exitCode===null)child.kill('SIGKILL');}}
 for(const s of streams)s.end();
 if(started)await execute(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env});
}
