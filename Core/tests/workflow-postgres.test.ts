import { beforeAll,beforeEach,describe,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PostgresPacketStore,type WorkflowTransaction } from "../src/workflow/postgres-store.js";
import { GovernedPacketService } from "../src/workflow/packet-service.js";
import { createGovernedWorkflowRouter } from "../src/workflow/routes.js";
import { WorkflowError, governedPolicyDigest } from "../src/workflow/packet-contract.js";

import { socket,enabled,bin,env,execute,syntheticConnection,syntheticRunner } from "../scripts/lib/workflow-synthetic-postgres.js";
import { fixtureTransaction,fixtureAccess,fixturePool,fixtureOwner,fixtureRegistry,fixtureAdmin } from "../scripts/lib/workflow-adapter-fixture.js";
import { createPinnedWorkflowTransaction } from "../src/workflow/pinned-transaction.js";
import {fixtureDelegation,syntheticOwnerCookie} from "../scripts/lib/workflow-delegation-fixture.js";
import {createOwnerDelegation,postgresOwnerProofStore,type OwnerProof,actionBinding} from "../src/workflow/owner-delegation.js";
import {ownerVerifierRouter,coreOwnerVerifierClient} from "../src/workflow/delegation-transport.js";
async function admin(sql:string,params:unknown[]=[]) {const c=syntheticConnection();try{return await c.query(sql,params);}finally{c.close();}}
const owner={ownerId:"synthetic-owner",actorId:"synthetic-owner-actor",projectKey:"bobai"};
const editor={...owner,actorId:"synthetic-editor"};
const service=()=>new GovernedPacketService(new PostgresPacketStore(fixtureTransaction()));
const digest="a".repeat(64),config="b".repeat(64);
const policy={versionId:"synthetic-policy-v1",digest:"",regressionDigest:"d".repeat(64),requiredChecks:["durability","isolation"],trustedIssuers:["synthetic-ci"],approvalLifetimeMs:600000,accepted:true as const};
policy.digest=governedPolicyDigest(policy);
async function command(s:GovernedPacketService,input:Record<string,unknown>,p=owner){return s.command(p,{operationId:randomUUID(),packetId:"packet-1",...input});}
async function candidate(s=service(),packetId="packet-1",predecessors:string[]=[]) {
  let r=await command(s,{packetId,action:"capture",expectedVersion:0,title:"Synthetic governed packet",specification:"Retain the same project state after restart",predecessors});
  r=await command(s,{packetId,action:"accept_specification",expectedVersion:r.packet.version,specificationDigest:r.packet.specificationDigest});
  r=await command(s,{packetId,action:"candidate",expectedVersion:r.packet.version,sourceDigest:digest,configurationDigest:config});
  return r.packet;
}
async function evidence(s:GovernedPacketService,p:Awaited<ReturnType<typeof candidate>>,outcome:"pass"|"fail"="pass"){
  for(const checkId of policy.requiredChecks)await s.recordEvidence(owner,"synthetic-ci",{id:randomUUID(),packetId:p.id,candidateDigest:p.candidateDigest,checkId,outcome,
    expiresAt:Date.now()+600000,sourceTimestamp:new Date(Date.now()-1000).toISOString(),sourceRecordId:"synthetic-run-1"});
}
async function ready(s=service(),packetId="packet-1",predecessors:string[]=[]) {
  const p=await candidate(s,packetId,predecessors);await evidence(s,p);
  return (await command(s,{packetId,action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest})).packet;
}

describe.skipIf(!enabled)("isolated PostgreSQL governed packet acceptance",()=>{
  beforeAll(async()=>{
    expect((await admin("SELECT current_setting('listen_addresses') AS listening")).rows[0]?.listening).toBe("");
    expect(String((await admin("SELECT current_setting('data_directory') AS directory")).rows[0]?.directory)).toMatch(/workflow-validation\/pg-data$/);
    await admin("DROP SCHEMA IF EXISTS bob_owner_delegation CASCADE; DROP SCHEMA IF EXISTS bob_workflow CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP ROLE IF EXISTS bob_workflow_test_app; DROP ROLE IF EXISTS bob_workflow_adapter_app");
    await admin(await readFile(new URL("../migrations/001_memory_v0_1.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/002_shared_context_v0_2.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/004_owner_auth.sql",import.meta.url),"utf8"));
    const migration=await readFile(new URL("../migrations/governed/001_work_packets.sql",import.meta.url),"utf8");
    await admin(migration);
    // Empty rollback/reapply is tested without touching legacy schemas.
    await admin(await readFile(new URL("../migrations/governed/001_work_packets.down.sql",import.meta.url),"utf8"));
    await admin(migration);
    await admin(await readFile(new URL("../migrations/governed/002_policy_versions.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/governed/002_policy_versions.down.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/governed/002_policy_versions.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/owner-delegation/001_proofs.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/owner-delegation/001_proofs.down.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/owner-delegation/001_proofs.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/owner-delegation/002_project_versions.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/owner-delegation/002_project_versions.down.sql",import.meta.url),"utf8"));
    await admin(await readFile(new URL("../migrations/owner-delegation/002_project_versions.sql",import.meta.url),"utf8"));
    await admin("CREATE ROLE bob_workflow_test_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE");
    await admin("GRANT USAGE ON SCHEMA bob_workflow,public TO bob_workflow_test_app; GRANT SELECT ON ALL TABLES IN SCHEMA bob_workflow TO bob_workflow_test_app; GRANT INSERT,UPDATE ON bob_workflow.packets TO bob_workflow_test_app; GRANT INSERT ON bob_workflow.records,bob_workflow.receipts,bob_workflow.history TO bob_workflow_test_app; GRANT USAGE ON ALL SEQUENCES IN SCHEMA bob_workflow TO bob_workflow_test_app; GRANT SELECT ON public.bob_projects,public.bob_tasks,public.bob_events TO bob_workflow_test_app");
    await admin("CREATE ROLE bob_workflow_adapter_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE");
    await admin("GRANT USAGE ON SCHEMA bob_workflow,public TO bob_workflow_adapter_app; GRANT SELECT ON ALL TABLES IN SCHEMA bob_workflow TO bob_workflow_adapter_app; GRANT INSERT,UPDATE ON bob_workflow.packets TO bob_workflow_adapter_app; GRANT INSERT ON bob_workflow.records,bob_workflow.receipts,bob_workflow.history TO bob_workflow_adapter_app; GRANT USAGE ON ALL SEQUENCES IN SCHEMA bob_workflow TO bob_workflow_adapter_app; GRANT SELECT ON public.bob_projects,public.bob_tasks,public.bob_events TO bob_workflow_adapter_app");
  });
  beforeEach(async()=>{
    await admin("TRUNCATE bob_owner_delegation.proofs");
    await admin("TRUNCATE bob_auth_user CASCADE; INSERT INTO bob_auth_user(id,name,email,\"emailVerified\") VALUES('synthetic-owner-user','Synthetic owner','owner@example.invalid',true); INSERT INTO bob_auth_session(id,\"userId\",token,\"expiresAt\",\"updatedAt\") VALUES('synthetic-session','synthetic-owner-user','synthetic-owner-workflow-fixture',now()+interval '1 hour',now())");
    await admin("TRUNCATE bob_workflow.history,bob_workflow.receipts,bob_workflow.records,bob_workflow.packets,bob_workflow.grants,bob_workflow.projects,public.bob_events,public.bob_tasks,public.bob_decisions,public.bob_projects CASCADE");
    await admin("INSERT INTO bob_workflow.projects(owner_id,project_key,policy,paused) VALUES($1,'bobai',$2::jsonb,false),($1,'sample',$2::jsonb,false)",[owner.ownerId,JSON.stringify(policy)]);
    await admin("INSERT INTO bob_workflow.policy_versions(owner_id,project_key,version_id,policy) VALUES($1,'bobai',$2,$3::jsonb),($1,'sample',$2,$3::jsonb)",[owner.ownerId,policy.versionId,JSON.stringify(policy)]);
    await admin("INSERT INTO bob_workflow.grants(owner_id,project_key,actor_id,can_edit,can_review,enabled) VALUES($1,'bobai',$2,true,true,true),($1,'bobai',$3,true,false,true),($1,'sample',$2,true,true,true)",[owner.ownerId,owner.actorId,editor.actorId]);
    await admin("INSERT INTO public.bob_projects(id,owner_id,project_key,name) VALUES('11111111-1111-4111-8111-111111111111',$1,'bobai','Synthetic Bob Core'),('22222222-2222-4222-8222-222222222222',$1,'sample','Synthetic sample')",[owner.ownerId]);
    await admin("INSERT INTO public.bob_tasks(id,owner_id,project_id,title,status) VALUES('33333333-3333-4333-8333-333333333333',$1,'11111111-1111-4111-8111-111111111111','Ordinary completed task','done')",[owner.ownerId]);
    await admin("INSERT INTO public.bob_events(id,owner_id,project_id,event_type,summary) VALUES('44444444-4444-4444-8444-444444444444',$1,'11111111-1111-4111-8111-111111111111','synthetic.history','Synthetic project history')",[owner.ownerId]);
  });
  it("delegates exact action once through authenticated verifier and rejects replay/request confusion",async()=>{
    const verifier=fixtureDelegation(), action=actionBinding("POST","/v1/governed/bobai/commands",JSON.stringify({operationId:"delegated",action:"capture"}),"bobai");
    const issued=await verifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action);
    await expect(verifier.redeem(issued.token,{...action,project:"sample"})).rejects.toThrow("owner_delegation_denied");
    await expect(verifier.redeem(issued.token,action)).rejects.toThrow("owner_delegation_denied");
    const next=await verifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action);
    expect(await verifier.redeem(next.token,action)).toEqual([owner]);
    await expect(verifier.redeem(next.token,action)).rejects.toThrow("owner_delegation_denied");
    expect(await verifier.revalidate(next.token,action)).toBe(true);
    await admin("DELETE FROM bob_auth_session");expect(await verifier.revalidate(next.token,action)).toBe(false);
  });
  it("denies changed session version, proof expiry and revoked project and preserves immutable proof claims",async()=>{
    const action=actionBinding("GET","/v1/governed/bobai","","bobai"),verifier=fixtureDelegation();
    const proof=await verifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action);
    await expect(admin("UPDATE bob_owner_delegation.proofs SET claims='{}'::jsonb")).rejects.toThrow("immutable_owner_proof");
    await admin("UPDATE bob_auth_session SET \"updatedAt\"=\"updatedAt\"+interval '1 second'");await expect(verifier.redeem(proof.token,action)).rejects.toThrow("owner_delegation_denied");
    const expired=fixtureDelegation(1);let old:{token:string}|undefined;try{old=await expired.issue(new Headers({cookie:syntheticOwnerCookie()}),action);}catch(e){expect((e as Error).message).toBe("owner_delegation_denied");}if(old){await new Promise(r=>setTimeout(r,5));await expect(expired.redeem(old.token,action)).rejects.toThrow("owner_delegation_denied");}
    const revoked=await verifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action);await admin("UPDATE bob_workflow.grants SET enabled=false WHERE project_key='bobai'");await expect(verifier.redeem(revoked.token,action)).rejects.toThrow("owner_delegation_denied");
  });
  it("rejects foreign issuer/audience/actor and exact method/body/path confusion",async()=>{
    const action=actionBinding("POST","/v1/governed/bobai/commands",JSON.stringify({operationId:"exact-action"}),"bobai"),ownerVerifier=fixtureDelegation();
    for(const override of [{issuer:"https://foreign-issuer.invalid"},{audience:"https://foreign-core.invalid"},{owner:{ownerId:owner.ownerId,actorId:"foreign-actor",userId:"synthetic-owner-user",email:"owner@example.invalid"}}]){
      const issued=await ownerVerifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action);await expect(fixtureDelegation(60000,override).redeem(issued.token,action)).rejects.toThrow("owner_delegation_denied");
    }
    for(const altered of [{...action,method:"GET" as const},{...action,path:"/v1/governed/sample/commands"},{...action,bodyDigest:"f".repeat(64)}]){
      const issued=await ownerVerifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action);await expect(ownerVerifier.redeem(issued.token,altered)).rejects.toThrow("owner_delegation_denied");
    }
    await expect(ownerVerifier.issue(new Headers({"x-owner-id":owner.ownerId}),action)).rejects.toThrow("owner_delegation_denied");
  });
  it("redeems concurrently once and rolls back actual workflow writes after session revocation",async()=>{
    const verifier=fixtureDelegation(),input={operationId:randomUUID(),packetId:"delegated-rollback",action:"capture",expectedVersion:0,title:"Exact delegated work",specification:"Must roll back",predecessors:[]},action=actionBinding("POST","/v1/governed/bobai/commands",JSON.stringify(input),"bobai");
    const issued=await verifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action),results=await Promise.allSettled([verifier.redeem(issued.token,action),verifier.redeem(issued.token,action)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const pinned=createPinnedWorkflowTransaction(fixturePool(),{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},()=>verifier.revalidate(issued.token,action));
    const transaction:WorkflowTransaction=run=>pinned(q=>run(async(sql,params)=>{const r=await q(sql,params);if(sql.startsWith("INSERT INTO bob_workflow.history"))await admin("DELETE FROM bob_auth_session");return r;}));
    await expect(new GovernedPacketService(new PostgresPacketStore(transaction)).command(owner,input)).rejects.toThrow("workflow_access_denied");
    for(const table of ["packets","receipts","history"])expect((await admin(`SELECT count(*)::int AS count FROM bob_workflow.${table}`)).rows[0]?.count).toBe(0);
    expect((await admin("SELECT redeemed_at FROM bob_owner_delegation.proofs")).rows[0]?.redeemed_at).not.toBeNull();
  });
  it.each(["proof","session"])("rolls back packet/receipt/history when %s expires during final awaited grant read",async kind=>{
    let clock=Date.now(),expireDuringGrant=false,inserted:OwnerProof|null=null;const store=postgresOwnerProofStore(fixtureAdmin);
    const currentSession=async(id:string)=>{const r=(await fixtureAdmin(`SELECT u.id,u.email,u."emailVerified",s.id AS session_id,s."userId",s."expiresAt",s."updatedAt" FROM bob_auth_session s JOIN bob_auth_user u ON u.id=s."userId" WHERE s.id=$1`,[id])).rows[0];return r?{user:{id:r.id,email:r.email,emailVerified:r.emailVerified},session:{id:r.session_id,userId:r.userId,expiresAt:r.expiresAt,updatedAt:r.updatedAt}}:null;};
    let expiry=0;
    const verifier=createOwnerDelegation({issuer:"http://127.0.0.1:3433",audience:"http://127.0.0.1:3431",owner:fixtureOwner,proofLifetimeMs:60000},{currentSession,api:{getSession:async()=>currentSession("synthetic-session")}},
      {directory:fixtureRegistry.directory,project:async(o,key)=>{const grant=await fixtureRegistry.project(o,key);if(expireDuringGrant)clock=expiry;return grant;}},
      {...store,insert:async(h,p)=>{inserted=p;await store.insert(h,p);}},()=>clock);
    const input={operationId:randomUUID(),packetId:"await-expiry-"+kind,action:"capture",expectedVersion:0,title:"Expiry rollback",specification:"No committed advancement after last grant read",predecessors:[]},action=actionBinding("POST","/v1/governed/bobai/commands",JSON.stringify(input),"bobai");
    const issued=await verifier.issue(new Headers(),action);await verifier.redeem(issued.token,action);expiry=(inserted as OwnerProof|null)!.expiresAt;
    if(kind==="session"){expiry=clock+30000;await admin(`UPDATE bob_auth_session SET "expiresAt"=to_timestamp($1/1000.0) WHERE id='synthetic-session'`,[expiry]);expect(expiry).toBeLessThan((inserted as OwnerProof|null)!.expiresAt);}
    const pinned=createPinnedWorkflowTransaction(fixturePool(),{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},()=>verifier.revalidate(issued.token,action));
    const transaction:WorkflowTransaction=run=>pinned(q=>run(async(sql,params)=>{const r=await q(sql,params);if(sql.startsWith("INSERT INTO bob_workflow.history"))expireDuringGrant=true;return r;}));
    await expect(new GovernedPacketService(new PostgresPacketStore(transaction)).command(owner,input)).rejects.toThrow("workflow_access_denied");
    expect(clock).toBe(expiry);for(const table of ["packets","receipts","history"])expect((await admin(`SELECT count(*)::int AS count FROM bob_workflow.${table}`)).rows[0]?.count).toBe(0);
    expect((await admin("SELECT redeemed_at FROM bob_owner_delegation.proofs")).rows[0]?.redeemed_at).not.toBeNull();
  });
  it("cannot revive an unused proof after project revoke/regrant and rejects destructive rollback",async()=>{
    const verifier=fixtureDelegation(),action=actionBinding("GET","/v1/governed/bobai","","bobai"),issued=await verifier.issue(new Headers({cookie:syntheticOwnerCookie()}),action);
    await admin("UPDATE bob_workflow.grants SET enabled=false WHERE project_key='bobai'; UPDATE bob_workflow.grants SET enabled=true WHERE project_key='bobai'");
    await expect(verifier.redeem(issued.token,action)).rejects.toThrow("owner_delegation_denied");
    await expect(admin(await readFile(new URL("../migrations/owner-delegation/001_proofs.down.sql",import.meta.url),"utf8"))).rejects.toThrow("owner_proof_history_requires_review");
  });
  it("requires separate service identities and fails closed on verifier outage",async()=>{
    const verifier=fixtureDelegation(),api=ownerVerifierRouter(verifier,{web:"synthetic-web-verifier-credential-not-live-20261001",core:"synthetic-core-verifier-credential-not-live-20261001"});
    const action=actionBinding("GET","/v1/governed/bobai","","bobai");
    expect((await api.request("/issue",{method:"POST",headers:{authorization:"Bearer synthetic-core-verifier-credential-not-live-20261001","content-type":"application/json",cookie:syntheticOwnerCookie()},body:JSON.stringify({action})})).status).toBe(403);
    const client=coreOwnerVerifierClient({issuer:"http://127.0.0.1:3433",audience:"http://127.0.0.1:3431",credential:"synthetic-core-verifier-credential-not-live-20261001"},async()=>{throw new Error("synthetic outage");});
    await expect(client.redeem(new Request("http://127.0.0.1:3431/v1/governed/bobai",{headers:{authorization:"Bearer "+"a".repeat(64)}}),"bobai")).rejects.toThrow("synthetic outage");
  });
  it.each(["END","/* callback comment */ COMMIT","-- callback comment\nEND","ABORT","SET SESSION AUTHORIZATION DEFAULT","INSERT INTO bob_workflow.history DEFAULT VALUES; COMMIT"])("cannot persist callback writes via %s even if denial is caught",async control=>{
    let checks=0;const tx=createPinnedWorkflowTransaction(fixturePool(),{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},async()=>++checks===1);
    await expect(tx(async q=>{
      await q("SELECT set_config('bob.workflow_owner',$1,true), set_config('bob.workflow_project',$2,true)",[owner.ownerId,owner.projectKey]);
      await q("INSERT INTO bob_workflow.packets(owner_id,project_key,id,document) VALUES($1,$2,$3,$4::jsonb)\n            ON CONFLICT(owner_id,project_key,id) DO UPDATE SET document=EXCLUDED.document",[owner.ownerId,owner.projectKey,"escape-attempt",JSON.stringify({synthetic:true,text:control})]);
      try{await q(control);}catch{/* callback cannot undo adapter taint */}
    })).rejects.toThrow("workflow_transaction_boundary_violation");
    for(const table of ["packets","receipts","history"])expect((await admin(`SELECT count(*)::int AS count FROM bob_workflow.${table}`)).rows[0]?.count).toBe(0);
  });
  it("resolves verified owner projects and denies missing, expired, revoked and foreign scope",async()=>{
    const access=fixtureAccess(), request=new Request("http://localhost/",{headers:{authorization:"Bearer synthetic-owner-workflow-fixture","x-owner-id":"forged"}});
    expect(await access.authenticate(request,"bobai")).toEqual(owner);
    expect(await access.authenticate(new Request("http://localhost/"),"bobai")).toBeNull();
    expect(await access.authenticate(request,"foreign")).toBeNull();
    await admin("UPDATE bob_auth_session SET \"expiresAt\"=now()-interval '1 second'");
    expect(await access.authenticate(request,"bobai")).toBeNull();
    await admin("UPDATE bob_auth_session SET \"expiresAt\"=now()+interval '1 hour'");
    await admin("UPDATE bob_workflow.grants SET enabled=false WHERE project_key='sample'");
    expect(await access.authenticate(request,"sample")).toBeNull();
    expect((await access.directory(request))?.map(p=>p.projectKey)).toEqual(["bobai"]);
    await admin("DELETE FROM bob_auth_session");expect(await access.authenticate(request,"bobai")).toBeNull();
    await expect(service().workspace(owner)).rejects.toThrow("workflow_access_denied");
  });
  it("rolls back a command when the authoritative session is revoked before commit",async()=>{
    let checks=0;const pool=fixturePool();const tx=createPinnedWorkflowTransaction(pool,{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},async()=>{
      if(++checks===2)await admin("DELETE FROM bob_auth_session");
      return !!await fixtureAccess().verifyOwner(new Request("http://localhost/",{headers:{authorization:"Bearer synthetic-owner-workflow-fixture"}}));
    });
    await expect(command(new GovernedPacketService(new PostgresPacketStore(tx)),{action:"capture",expectedVersion:0,title:"Revoked",specification:"No advancement",predecessors:[]})).rejects.toThrow("workflow_access_denied");
    expect((await admin("SELECT id FROM bob_workflow.packets")).rows).toHaveLength(0);
    expect((await admin("SELECT operation_id FROM bob_workflow.receipts")).rows).toHaveLength(0);
  });
  it("rejects actual service failures without durable changes and replays an existing receipt",async()=>{
    const s=service(),seed=(await command(s,{action:'capture',expectedVersion:0,title:'Seed',specification:'',predecessors:[]})).packet;
    const api=createGovernedWorkflowRouter(s,async()=>owner);
    const send=async(input:Record<string,unknown>)=>api.request('/bobai/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    const snapshot=async()=>JSON.stringify((await admin("SELECT (SELECT jsonb_agg(document ORDER BY id) FROM bob_workflow.packets) AS packets,(SELECT count(*) FROM bob_workflow.records) AS records,(SELECT count(*) FROM bob_workflow.receipts) AS receipts,(SELECT count(*) FROM bob_workflow.history) AS history")).rows);
    for(const code of ['packet_already_exists_or_version_conflict','invalid_predecessor_scope','released_packet_immutable','workflow_packet_capacity']){
      if(code==='released_packet_immutable')await admin("UPDATE bob_workflow.packets SET document=jsonb_set(document,'{state}','\"released\"'::jsonb) WHERE id=$1",[seed.id]);
      if(code==='workflow_packet_capacity')await admin("INSERT INTO bob_workflow.packets(owner_id,project_key,id,document) SELECT $1,$2,'bulk-'||g,($3::jsonb)||jsonb_build_object('id','bulk-'||g) FROM generate_series(1,499) g",[owner.ownerId,owner.projectKey,JSON.stringify({...seed,state:'draft'})]);
      const input=code==='released_packet_immutable'?{operationId:randomUUID(),packetId:seed.id,action:'revise',expectedVersion:seed.version,specification:'Blocked'}:{operationId:randomUUID(),packetId:code==='packet_already_exists_or_version_conflict'?seed.id:'new',action:'capture',expectedVersion:0,title:'Blocked',specification:'',predecessors:code==='invalid_predecessor_scope'?['missing']:[]};
      const before=await snapshot(),r=await send(input);expect(r.status).toBe(409);expect(await r.json()).toEqual({error:{code},outcome:'rejected'});expect(await snapshot()).toBe(before);
    }
    const receipt=(await admin('SELECT operation_id,result FROM bob_workflow.receipts LIMIT 1')).rows[0]!;
    const replay={operationId:receipt.operation_id,packetId:seed.id,action:'capture',expectedVersion:0,title:'Seed',specification:'',predecessors:[]};
    const before=await snapshot(),r=await send(replay);expect(r.status).toBe(200);expect((await r.json()).idempotent).toBe(true);expect(await snapshot()).toBe(before);
  });
  it("routes known rollback rejections without writes and preserves uncertain rollback",async()=>{
    const original=fixturePool();
    for(const code of ["workflow_packet_capacity","packet_already_exists_or_version_conflict","invalid_predecessor_scope","released_packet_immutable"]){
      const tx=createPinnedWorkflowTransaction(original,{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},async()=>true);
      const fake={command:async()=>tx(async()=>{throw new WorkflowError(code);})};
      const api=createGovernedWorkflowRouter(fake as never,async()=>owner);
      const r=await api.request('/bobai/commands',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
      expect((await r.json()).outcome).toBe('rejected');
    }
    const pool={options:original.options,async connect(){const c=await original.connect();return {...c,query:async(sql:string,params?:unknown[])=>{const r=await c.query(sql,params);if(sql==='ROLLBACK')throw Error('synthetic_lost_rollback_ack');return r;}};}};
    const tx=createPinnedWorkflowTransaction(pool,{kind:'isolated-local',socket:socket!,database:'postgres',role:'bob_workflow_adapter_app'},async()=>true);
    const api=createGovernedWorkflowRouter({command:async()=>tx(async()=>{throw new WorkflowError('invalid_predecessor_scope');})} as never,async()=>owner);
    expect((await (await api.request('/bobai/commands',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json()).outcome).toBe('unconfirmed');
    expect((await admin('SELECT operation_id FROM bob_workflow.receipts')).rows).toHaveLength(0);
  });
  it("reconciles commit acknowledgement loss and retries without duplicate advancement",async()=>{
    const original=fixturePool(), pool={options:original.options,async connect(){const c=await original.connect();return {...c,query:async(sql:string,params?:unknown[])=>{const result=await c.query(sql,params);if(sql==="COMMIT")throw new Error("synthetic lost acknowledgement");return result;}};}};
    const tx=createPinnedWorkflowTransaction(pool,{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},async()=>true);
    const input={operationId:randomUUID(),packetId:"unknown-commit",action:"capture",expectedVersion:0,title:"Committed once",specification:"Reconcile durable receipt",predecessors:[]};
    await expect(new GovernedPacketService(new PostgresPacketStore(tx)).command(owner,input)).rejects.toThrow("workflow_write_outcome_unconfirmed");
    const stable=service();expect((await stable.workspace(owner,input.operationId)).recovery?.outcome).toBe("committed");
    await stable.command(owner,input);expect((await admin("SELECT id FROM bob_workflow.packets")).rows).toHaveLength(1);
    expect((await admin("SELECT operation_id FROM bob_workflow.receipts")).rows).toHaveLength(1);
  });
  it("orders immutable history numerically across the ninth and tenth sequence",async()=>{
    const s=service();for(let i=0;i<12;i++)await command(s,{packetId:`order-${i}`,action:"capture",expectedVersion:0,title:`Order ${i}`,specification:"Numeric history",predecessors:[]});
    const rows=(await s.workspace(owner)).workflowHistory;expect(rows).toHaveLength(12);
    const sequences=rows.map(r=>Number(r.sequence));expect(sequences).toEqual([...sequences].sort((a,b)=>b-a));
    expect(sequences[0]!-sequences[11]!).toBe(11);
  });
  it("lists only explicitly authenticated active project grants and rechecks revocation",async()=>{
    const s=service();expect((await s.directory([owner])).projects.map(p=>p.project_key)).toEqual(["bobai"]);
    expect((await s.directory([owner,{...owner,projectKey:"sample"}])).projects).toHaveLength(2);
    await admin("UPDATE bob_workflow.grants SET enabled=false WHERE project_key='sample'");
    expect((await s.directory([owner,{...owner,projectKey:"sample"}])).projects).toHaveLength(1);
    await expect(s.directory([owner,{...owner,actorId:"other",projectKey:"sample"}])).rejects.toThrow("invalid_directory_scope");
    const api=createGovernedWorkflowRouter(s,async()=>owner);
    expect((await api.request("/_directory")).status).toBe(403);
  });
  it("reconciles committed receipts actor/project-scoped without writing or replaying",async()=>{
    const s=service(),p=await ready(s);const input={operationId:"uncertain-review",packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"};
    await s.command(owner,input);const before=await s.history(owner);
    const recovered=await service().reconcile(owner,input.operationId);expect(recovered.outcome).toBe("committed");
    expect((await s.reconcile({...owner,projectKey:"sample"},input.operationId)).outcome).toBe("not_found");
    await expect(s.reconcile(editor,input.operationId)).rejects.toThrow("workflow_access_denied");
    expect(await s.history(owner)).toEqual(before);expect((await s.command(owner,input)).idempotent).toBe(true);
    await admin("UPDATE bob_workflow.grants SET enabled=false WHERE actor_id=$1",[owner.actorId]);
    await expect(s.reconcile(owner,input.operationId)).rejects.toThrow("workflow_access_denied");
  });
  it.each(["capture","revise"] as const)("returns a coherent recovery workspace while %s commits concurrently",async action=>{
    const s=service();const prior=action==="revise"?await ready(s):null;
    let entered!:()=>void,release!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
    const held:WorkflowTransaction=run=>syntheticRunner(q=>run(async(sql,params)=>{const result=await q(sql,params);if(sql.startsWith("SELECT document")){entered();await gate;}return result;}));
    const reading=new GovernedPacketService(new PostgresPacketStore(held)).workspace(owner,"racing-operation");await started;
    const input=action==="capture"?{operationId:"racing-operation",packetId:"new-packet",action:"capture",expectedVersion:0,title:"Concurrent capture",specification:"Criteria",predecessors:[]}:{operationId:"racing-operation",packetId:prior!.id,action:"revise",expectedVersion:prior!.version,specification:"Concurrent revision"};
    let committed=false;const writing=s.command(owner,input).then(r=>{committed=true;return r;});await new Promise(r=>setTimeout(r,80));expect(committed).toBe(false);
    release();const before=await reading;expect(before.recovery?.outcome).toBe("not_found");
    const afterCommit=await writing;const after=await s.workspace(owner,"racing-operation");expect(after.recovery?.outcome).toBe("committed");
    expect(after.recovery?.currentPacket).toEqual(after.packets.find(p=>p.id===afterCommit.packet.id));
    expect(after.records).toEqual((await s.list(owner)).records);expect(after.workflowHistory[0]?.action).toBe(action);
    await expect(s.workspace({...owner,actorId:"synthetic-editor"},"racing-operation")).rejects.toThrow("workflow_access_denied");
  });
  it("keeps immutable policy versions and invalidates acceptance even for identical checks in a new version",async()=>{
    const s=service(),p=await ready(s);const reviewed=(await command(s,{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).packet;
    const old=(await s.list(owner)).records;
    await expect(admin("UPDATE bob_workflow.policy_versions SET policy='{}'::jsonb")).rejects.toThrow("immutable record");
    await expect(syntheticRunner(q=>q("INSERT INTO bob_workflow.policy_versions(owner_id,project_key,version_id,policy) VALUES('synthetic-owner','bobai','forged','{}')"))).rejects.toThrow("permission denied");
    const next={...policy,versionId:"synthetic-policy-v2"};next.digest=governedPolicyDigest(next);
    await admin("INSERT INTO bob_workflow.policy_versions(owner_id,project_key,version_id,policy) VALUES($1,'bobai',$2,$3::jsonb)",[owner.ownerId,next.versionId,JSON.stringify(next)]);
    await admin("UPDATE bob_workflow.projects SET policy=$1::jsonb WHERE project_key='bobai'",[JSON.stringify(next)]);
    expect((await s.list(owner)).packets.find(p=>p.id===reviewed.id)?.acceptanceCurrent).toBe(false);
    expect((await s.list(owner)).records).toEqual(old);
    await expect(admin(await readFile(new URL("../migrations/governed/002_policy_versions.down.sql",import.meta.url),"utf8"))).rejects.toThrow("immutable policy history exists");
  });
  it("reads real legacy project/task/history tables without promoting task.done",async()=>{
    const data=await service().workspace(owner);expect(data.project.name).toBe("Synthetic Bob Core");expect(data.tasks[0]?.status).toBe("done");expect(data.history).toHaveLength(1);expect(data.packets).toHaveLength(0);
  });
  it("durably captures, accepts specification, verifies and owner-reviews one exact candidate",async()=>{
    const s=service(),p=await ready(s);const r=await command(s,{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"});
    expect(r.packet.state).toBe("reviewed");expect((await service().list(owner)).packets[0]).toEqual(r.currentPacket);
    expect((await service().list(owner)).records.find(r=>r.kind==="approval")?.content.consumed).toBe(true);
    await expect(admin(`INSERT INTO bob_workflow.receipts(owner_id,project_key,operation_id,actor_id,fingerprint,result,approval_id)
      SELECT owner_id,project_key,'forged-second-consumption',actor_id,fingerprint,result,approval_id FROM bob_workflow.receipts WHERE approval_id IS NOT NULL`)).rejects.toThrow("duplicate key");
    expect((await service().history(owner)).items).toHaveLength(5);
    expect((await service().workspace(owner)).tasks[0]?.status).toBe("done");
  });
  it("serializes concurrent same-operation retries into one approval and one history entry",async()=>{
    const s=service(),p=await ready(s);const input={operationId:"same-review",packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"};
    const results=await Promise.all(Array.from({length:8},()=>service().command(owner,input)));
    expect(results.filter(v=>!v.idempotent)).toHaveLength(1);expect((await s.list(owner)).records.filter(r=>r.kind==="approval")).toHaveLength(1);expect((await s.history(owner)).items).toHaveLength(5);
  });
  it("rejects competing transitions, reused IDs with changed payload and replay using a new ID",async()=>{
    const s=service(),p=await ready(s);const base={packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"};
    const results=await Promise.allSettled([s.command(owner,{...base,operationId:"review-a"}),s.command(owner,{...base,operationId:"review-b"})]);
    expect(results.filter(v=>v.status==="fulfilled")).toHaveLength(1);
    const success=results.find(v=>v.status==="fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof s.command>>>;
    await expect(command(s,{...base,expectedVersion:success.value.packet.version})).rejects.toThrow("owner_review_requires_ready");
    const operation=results[0]?.status==="fulfilled"?"review-a":"review-b";
    await expect(s.command(owner,{...base,operationId:operation,decision:"changes_requested"})).rejects.toThrow("operation_id_conflict");
  });
  it("distinguishes historical retry receipt from a changed current packet",async()=>{
    const s=service(),p=await ready(s);const input={operationId:"review-original",packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"};
    const r=await s.command(owner,input);await command(s,{action:"revise",expectedVersion:r.packet.version,specification:"Changed accepted criteria"});
    const retry=await s.command(owner,input);expect(retry.packet.state).toBe("reviewed");expect(retry.currentPacket.state).toBe("draft");expect(retry.currentPacket.candidateDigest).toBeNull();
  });
  it("blocks missing specification, predecessors and evidence",async()=>{
    const s=service();let p=(await command(s,{action:"capture",expectedVersion:0,title:"Draft",specification:"Criteria",predecessors:[]})).packet;
    await expect(command(s,{action:"candidate",expectedVersion:p.version,sourceDigest:digest,configurationDigest:config})).rejects.toThrow("specification_required");
    await command(s,{action:"capture",packetId:"predecessor",expectedVersion:0,title:"Prior",specification:"Prior criteria",predecessors:[]});
    await expect(candidate(s,"dependent",["predecessor"])).rejects.toThrow("predecessor_required");
    p=await candidate(s,"missing-evidence");await expect(command(s,{packetId:p.id,action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest})).rejects.toThrow("evidence_missing_or_ambiguous");
  });
  it("rejects wrong-project dependency/approval, unknown actors and editor owner-review",async()=>{
    const s=service(),p=await ready(s);
    await expect(command(s,{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"},editor)).rejects.toThrow("workflow_access_denied");
    await expect(s.command({...owner,projectKey:"sample"},{operationId:randomUUID(),packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).rejects.toThrow("packet_not_found");
    await expect(s.list({...owner,actorId:"unknown"})).rejects.toThrow("workflow_access_denied");
    expect((await s.workspace({...owner,projectKey:"sample"})).tasks).toHaveLength(0);
    await expect(s.command({...owner,projectKey:"sample"},{operationId:randomUUID(),packetId:"bad-dependency",action:"capture",expectedVersion:0,title:"Bad",specification:"Spec",predecessors:[p.id]})).rejects.toThrow("invalid_predecessor_scope");
  });
  it("invalidates old candidate evidence on change and rechecks evidence at owner review",async()=>{
    const s=service(),p=await ready(s);const next=(await command(s,{action:"candidate",expectedVersion:p.version,sourceDigest:"e".repeat(64),configurationDigest:config})).packet;
    await expect(command(s,{action:"review",expectedVersion:next.version,candidateDigest:p.candidateDigest,decision:"approve"})).rejects.toThrow("candidate_changed");
    await expect(command(s,{action:"ready",expectedVersion:next.version,candidateDigest:next.candidateDigest})).rejects.toThrow("evidence_missing_or_ambiguous");
  });
  it("binds accepted policy contents and rejects a changed regression policy",async()=>{
    const s=service(),p=await ready();
    await admin("UPDATE bob_workflow.projects SET policy=jsonb_set(policy,'{requiredChecks}','[\"weakened\"]'::jsonb) WHERE project_key='bobai'");
    await expect(command(s,{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).rejects.toThrow("workflow_policy_digest_mismatch");
    const changed={...policy,versionId:"synthetic-policy-v2",regressionDigest:"f".repeat(64)};changed.digest=governedPolicyDigest(changed);
    await admin("INSERT INTO bob_workflow.policy_versions(owner_id,project_key,version_id,policy) VALUES($1,'bobai',$2,$3::jsonb)",[owner.ownerId,changed.versionId,JSON.stringify(changed)]);
    await admin("UPDATE bob_workflow.projects SET policy=$1::jsonb WHERE project_key='bobai'",[JSON.stringify(changed)]);
    await expect(command(s,{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).rejects.toThrow("policy_mismatch");
  });
  it("rechecks an upstream candidate that changes after dependent readiness",async()=>{
    const s=service(),prior=await ready(s,"prior");const reviewed=(await command(s,{packetId:prior.id,action:"review",expectedVersion:prior.version,candidateDigest:prior.candidateDigest,decision:"approve"})).packet;
    const dependent=await ready(s,"dependent",[prior.id]);
    await command(s,{packetId:prior.id,action:"revise",expectedVersion:reviewed.version,specification:"Updated predecessor criteria"});
    await expect(command(s,{packetId:dependent.id,action:"review",expectedVersion:dependent.version,candidateDigest:dependent.candidateDigest,decision:"approve"})).rejects.toThrow("predecessor_required");
  });
  async function approve(s:GovernedPacketService,p:Awaited<ReturnType<typeof candidate>>){return (await command(s,{packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).packet;}
  async function replace(s:GovernedPacketService,p:Awaited<ReturnType<typeof candidate>>){
    let n=(await command(s,{packetId:p.id,action:"revise",expectedVersion:p.version,specification:"Changed upstream behavior"})).packet;
    n=(await command(s,{packetId:p.id,action:"accept_specification",expectedVersion:n.version,specificationDigest:n.specificationDigest})).packet;
    n=(await command(s,{packetId:p.id,action:"candidate",expectedVersion:n.version,sourceDigest:"f".repeat(64),configurationDigest:config})).packet;
    await evidence(s,n);n=(await command(s,{packetId:p.id,action:"ready",expectedVersion:n.version,candidateDigest:n.candidateDigest})).packet;return approve(s,n);
  }
  it("rejects old dependent approval after upstream re-review and requires fresh dependent evidence",async()=>{
    const s=service(),a=await approve(s,await ready(s,"a")),b=await ready(s,"b",[a.id]);
    const old=(await s.list(owner)).records.find(r=>r.id===b.candidateId)!;
    expect(old.content.predecessors).toEqual([{packetId:a.id,candidateDigest:a.candidateDigest,approvalId:(await s.list(owner)).records.find(r=>r.kind==="approval"&&r.packetId===a.id)!.id}]);
    await replace(s,a);await expect(approve(s,b)).rejects.toThrow("predecessor_required");
    expect((await s.list(owner)).records.filter(r=>r.kind==="approval"&&r.packetId===b.id)).toHaveLength(0);
    const rebuilt=(await command(s,{packetId:b.id,action:"candidate",expectedVersion:b.version,sourceDigest:digest,configurationDigest:config})).packet;
    expect(rebuilt.candidateDigest).not.toBe(b.candidateDigest);
    await expect(command(s,{packetId:b.id,action:"ready",expectedVersion:rebuilt.version,candidateDigest:rebuilt.candidateDigest})).rejects.toThrow("evidence_missing_or_ambiguous");
    await evidence(s,rebuilt);const fresh=(await command(s,{packetId:b.id,action:"ready",expectedVersion:rebuilt.version,candidateDigest:rebuilt.candidateDigest})).packet;
    expect((await approve(s,fresh)).state).toBe("reviewed");expect((await s.list(owner)).records.find(r=>r.id===old.id)).toEqual(old);
  });
  it("propagates transitive stale acceptance without rewriting reviewed history",async()=>{
    const s=service(),a=await approve(s,await ready(s,"a")),b=await approve(s,await ready(s,"b",[a.id])),c=await approve(s,await ready(s,"c",[b.id]));
    const old=(await s.list(owner)).records.filter(r=>r.kind==="approval");await replace(s,a);const view=await s.workspace(owner);
    expect(view.packets.find(p=>p.id===a.id)?.acceptanceCurrent).toBe(true);
    for(const id of [b.id,c.id]){expect(view.packets.find(p=>p.id===id)?.state).toBe("reviewed");expect(view.packets.find(p=>p.id===id)?.acceptanceCurrent).toBe(false);}
    for(const r of old)expect(view.records.find(v=>v.id===r.id)).toEqual(r);
    await expect(candidate(s,"downstream",[c.id])).rejects.toThrow("predecessor_required");
  });
  it("serializes upstream replacement behind dependent review and retry reports stale current acceptance",async()=>{
    const s=service(),a=await approve(s,await ready(s,"a")),b=await ready(s,"b",[a.id]);
    let enter!:()=>void,release!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>enter=r);
    const held:WorkflowTransaction=run=>syntheticRunner(q=>run(async(sql,params)=>{const result=await q(sql,params);if(sql.startsWith("SELECT p.policy")){enter();await gate;}return result;}));
    const input={operationId:"held-dependent-review",packetId:b.id,action:"review",expectedVersion:b.version,candidateDigest:b.candidateDigest,decision:"approve"};
    const reviewing=new GovernedPacketService(new PostgresPacketStore(held)).command(owner,input);await started;
    let changed=false;const replacing=replace(s,a).then(()=>changed=true);await new Promise(r=>setTimeout(r,80));expect(changed).toBe(false);
    release();expect((await reviewing).packet.state).toBe("reviewed");await replacing;
    const retry=await s.command(owner,input);expect(retry.idempotent).toBe(true);expect(retry.packet.state).toBe("reviewed");expect((retry.currentPacket as {acceptanceCurrent?:boolean}).acceptanceCurrent).toBe(false);
    expect((await s.list(owner)).records.filter(r=>r.kind==="approval"&&r.packetId===b.id)).toHaveLength(1);
  });
  it("holds governance revocation behind the project transaction then rejects retry",async()=>{
    const p=await ready();let entered!:()=>void,release!:()=>void;
    const gate=new Promise<void>(r=>{release=r;}),readyGate=new Promise<void>(r=>{entered=r;});
    const held:WorkflowTransaction=run=>syntheticRunner(q=>run(async(sql,params)=>{const result=await q(sql,params);if(sql.startsWith("SELECT p.policy")){entered();await gate;}return result;}));
    const change=command(new GovernedPacketService(new PostgresPacketStore(held)),{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"});
    await readyGate;let revoked=false;const revoke=admin("UPDATE bob_workflow.grants SET enabled=false WHERE actor_id=$1",[owner.actorId]).then(()=>{revoked=true;});
    await new Promise(r=>setTimeout(r,80));expect(revoked).toBe(false);release();await change;await revoke;
    await expect(service().list(owner)).rejects.toThrow("workflow_access_denied");
  });
  it("fails closed on evidence expiry at review and missing database scope",async()=>{
    const s=service(),p=await ready();
    const expired:WorkflowTransaction=run=>syntheticRunner(q=>run(async(sql,params)=>{const result=await q(sql,params);if(sql.startsWith("SELECT p.policy"))result.rows[0]!.now=Number(result.rows[0]!.now)+600001;return result;}));
    await expect(command(new GovernedPacketService(new PostgresPacketStore(expired)),{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).rejects.toThrow("evidence_not_current_pass");
    expect((await syntheticRunner(q=>q("SELECT id FROM bob_workflow.packets"))).rows).toHaveLength(0);
    expect((await s.list(owner)).packets[0]?.state).toBe("ready");
  });
  it("blocks failed, expired, untrusted and ambiguous evidence without trusting payload",async()=>{
    const s=service(),p=await candidate(s);await evidence(s,p,"fail");
    await expect(command(s,{action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest})).rejects.toThrow("evidence_not_current_pass");
    const input={id:"new-record",packetId:p.id,candidateDigest:p.candidateDigest,checkId:"durability",outcome:"pass",expiresAt:Date.now()+10000,sourceTimestamp:new Date(Date.now()-1000).toISOString(),sourceRecordId:"run-2"};
    await expect(s.recordEvidence(owner,"untrusted",input)).rejects.toThrow("evidence_issuer_untrusted");
    await expect(s.recordEvidence(owner,"synthetic-ci",input)).rejects.toThrow("evidence_check_already_recorded");
    await expect(s.recordEvidence(owner,"synthetic-ci",{...input,expiresAt:1})).rejects.toThrow("invalid_evidence_time");
    await expect(command(s,{action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest,approved:true})).rejects.toThrow("invalid_workflow_command");
  });
  it("fails closed on absent policy, pause, revoked grant and unapproved release",async()=>{
    const s=service(),p=await ready(s);await admin("UPDATE bob_workflow.projects SET policy=NULL WHERE project_key='bobai'");
    await expect(command(s,{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).rejects.toThrow("accepted_policy_and_regression_required");
    await admin("UPDATE bob_workflow.projects SET paused=true WHERE project_key='bobai'");
    await expect(command(s,{action:"revise",expectedVersion:p.version,specification:"Change"})).rejects.toThrow("workflow_paused");
    expect((await s.list(owner)).paused).toBe(true);
    await admin("UPDATE bob_workflow.grants SET enabled=false WHERE actor_id=$1",[owner.actorId]);await expect(s.list(owner)).rejects.toThrow("workflow_access_denied");
    await expect(command(s,{action:"release",expectedVersion:p.version,candidateDigest:p.candidateDigest})).rejects.toThrow("release_policy_not_approved");
  });
  it("rolls back packet, evidence, approval, receipt and history together on interrupted final write",async()=>{
    const s=service(),p=await ready(s);
    const broken:WorkflowTransaction=run=>syntheticRunner(q=>run(async(sql,params)=>{if(sql.startsWith("INSERT INTO bob_workflow.history"))throw new Error("synthetic_interruption");return q(sql,params);}));
    await expect(command(new GovernedPacketService(new PostgresPacketStore(broken)),{action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"})).rejects.toThrow("synthetic_interruption");
    expect((await s.list(owner)).packets[0]?.state).toBe("ready");expect((await s.list(owner)).records.filter(v=>v.kind==="approval")).toHaveLength(0);expect((await s.history(owner)).items).toHaveLength(4);
  });
  it("rejects immutable-record changes and role privilege widening",async()=>{
    await ready();await expect(admin("UPDATE bob_workflow.records SET content='{}'::jsonb")).rejects.toThrow("immutable record");
    await expect(syntheticRunner(q=>q("UPDATE bob_workflow.grants SET can_review=true"))).rejects.toThrow("permission denied");
    await expect(syntheticRunner(q=>q("DELETE FROM bob_workflow.receipts"))).rejects.toThrow("permission denied");
  });
  it("refuses destructive rollback while durable work exists",async()=>{
    await candidate();await expect(admin(await readFile(new URL("../migrations/governed/001_work_packets.down.sql",import.meta.url),"utf8"))).rejects.toThrow("immutable policy history exists");
    expect((await service().list(owner)).packets).toHaveLength(1);
  });
  it("authenticates API project scope and rejects forged client authority",async()=>{
    const s=service(),p=await ready();const denied=createGovernedWorkflowRouter(s);
    expect((await denied.request("/bobai")).status).toBe(403);
    const api=createGovernedWorkflowRouter(s,async request=>request.headers.get("authorization")==="Bearer synthetic-only"?owner:null);
    expect((await api.request("/sample",{headers:{authorization:"Bearer synthetic-only"}})).status).toBe(403);
    const response=await api.request("/bobai/commands",{method:"POST",headers:{authorization:"Bearer synthetic-only","content-type":"application/json"},body:JSON.stringify({operationId:"forged",packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve",actorId:owner.actorId})});
    expect(response.status).toBe(400);expect((await api.request("/bobai",{headers:{authorization:"Bearer synthetic-only"}})).status).toBe(200);
  });
  it("survives actual server crash/restart and restores a real pg_dump without losing receipts",async()=>{
    const s=service(),p=await ready();const input={operationId:"restart-review",packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"};await s.command(owner,input);
    const proofVerifier=fixtureDelegation(),proofAction=actionBinding("GET","/v1/governed/bobai","","bobai"),usedProof=await proofVerifier.issue(new Headers({cookie:syntheticOwnerCookie()}),proofAction);await proofVerifier.redeem(usedProof.token,proofAction);
    const data=String((await admin("SELECT current_setting('data_directory') AS directory")).rows[0]?.directory);
    const c=syntheticConnection();await c.query("BEGIN");await c.query("UPDATE bob_workflow.packets SET document='{}'::jsonb");
    await execute(bin+"pg_ctl",["-D",data,"-m","immediate","-w","stop"],{env});
    await execute(bin+"pg_ctl",["-D",data,"-l",data+"/../pg-server.log","-o",`-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c fsync=on`,"-w","start"],{env});
    await expect(fixtureDelegation().redeem(usedProof.token,proofAction)).rejects.toThrow("owner_delegation_denied");
    expect((await service().list(owner)).packets[0]?.state).toBe("reviewed");
    expect((await service().reconcile(owner,"restart-review")).outcome).toBe("committed");
    expect((await service().command(owner,input)).idempotent).toBe(true);
    const backup=data+"/../workflow-synthetic.dump";
    await execute(bin+"pg_dump",["-h",socket!,"-U","bob_workflow_test_admin","-d","postgres","-Fc","-f",backup],{env});
    await admin("CREATE DATABASE workflow_restore_synthetic");
    try{await execute(bin+"pg_restore",["-h",socket!,"-U","bob_workflow_test_admin","-d","workflow_restore_synthetic",backup],{env});
      const result=await execute(bin+"psql",["-X","-q","-A","-t","-h",socket!,"-U","bob_workflow_test_admin","-d","workflow_restore_synthetic","-c","SELECT count(*) || ':' || (SELECT count(*) FROM bob_workflow.receipts) || ':' || (SELECT count(*) FROM bob_owner_delegation.proofs WHERE redeemed_at IS NOT NULL) FROM bob_workflow.packets"],{env});expect(result.stdout.trim()).toBe("1:5:1");
    }finally{await admin("DROP DATABASE workflow_restore_synthetic");}
  },15000);
  it("enforces approved24h source freshness for legacy evidence despite a later producer expiry",async()=>{
    const s=service(),p=await candidate(s);
    for(const checkId of policy.requiredChecks)await s.recordEvidence(owner,"synthetic-ci",{id:randomUUID(),packetId:p.id,candidateDigest:p.candidateDigest,checkId,outcome:"pass",expiresAt:Date.now()+86400000,sourceTimestamp:new Date(Date.now()-86400000).toISOString(),sourceRecordId:randomUUID()});
    expect((await s.workspace(owner)).packetEvidence[0]?.checks.every(c=>c.status==='expired')).toBe(true);
    await expect(command(s,{action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest})).rejects.toThrow("evidence_not_current_pass");expect((await s.list(owner)).packets[0]?.state).toBe("draft");
  });
  it("denies malformed future source completion inserted by a synthetic operator before readiness",async()=>{
    const s=service(),p=await candidate(s);
    for(const id of policy.requiredChecks)await admin("INSERT INTO bob_workflow.records(owner_id,project_key,id,packet_id,kind,content) VALUES($1,$2,$3,$4,'evidence',$5::jsonb)",[owner.ownerId,owner.projectKey,randomUUID(),p.id,JSON.stringify({id,ownerId:owner.ownerId,projectKey:owner.projectKey,candidateDigest:p.candidateDigest,issuer:"synthetic-ci",outcome:"pass",expiresAt:Date.now()+86400000,sourceTimestamp:new Date(Date.now()+100000).toISOString(),sourceRecordId:randomUUID()})]);
    expect((await s.workspace(owner)).packetEvidence[0]?.checks.every(c=>c.status==='invalid')).toBe(true);await expect(command(s,{action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest})).rejects.toThrow();expect((await s.list(owner)).packets[0]?.state).toBe("draft");
  });

});
