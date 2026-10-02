// Synthetic local acceptance fixture, not a runtime entrypoint. No live credentials.
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {syntheticEvidence,fixtureSource} from './lib/evidence-storage-fixture.js';
import {candidateSchema} from '../src/workflow/acceptance-contract.js';
import {evidenceBodyDigest,createScopedEvidenceAuthority} from '../src/workflow/scoped-evidence-source.js';
import {TransactionalEvidenceImporter} from '../src/workflow/evidence-storage.js';
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { PostgresPacketStore } from "../src/workflow/postgres-store.js";
import { GovernedPacketService } from "../src/workflow/packet-service.js";
import { createGovernedWorkflowRouter } from "../src/workflow/routes.js";
import { governedPolicyDigest,type WorkPacket } from "../src/workflow/packet-contract.js";
import { enabled,syntheticConnection } from "./lib/workflow-synthetic-postgres.js";

import {fixturePool,fixtureOwner,fixtureRegistry} from "./lib/workflow-adapter-fixture.js";

import {fixtureDelegation} from "./lib/workflow-delegation-fixture.js";
import {ownerVerifierRouter,coreOwnerVerifierClient} from "../src/workflow/delegation-transport.js";
import {createPinnedWorkflowTransaction} from "../src/workflow/pinned-transaction.js";
import {socket} from "./lib/workflow-synthetic-postgres.js";

import {createRealAuthFixture} from "../../Web/scripts/real-auth-fixture.js";
import {createWorkflowOwnerVerifier} from "../../Web/lib/workflow-owner-verifier-host.js";
const realMode=process.env.BOB_LOCAL_REAL_AUTH_FIXTURE==="true";
let realFixture:Awaited<ReturnType<typeof createRealAuthFixture>>|null=null;
let actualVerifier:Hono|null=null;

if(!enabled||process.env.VERCEL)throw new Error("isolated_workflow_fixture_required");
async function admin(sql:string,parameters:unknown[]=[]){const c=syntheticConnection();try{return await c.query(sql,parameters);}finally{c.close();}}
const destination=(await admin("SELECT current_setting('listen_addresses') AS listening,current_setting('data_directory') AS directory")).rows[0];
const fixtureDirectory=String(destination?.directory);
let ownedFixture=false;
if(/^\/tmp\/bob-workflow-run-[A-Za-z0-9_-]+\/workflow-validation\/pg-data$/.test(fixtureDirectory)){
 const marker=JSON.parse(await readFile(resolve(dirname(fixtureDirectory),'../SYNTHETIC-ONLY.json'),'utf8'));
 ownedFixture=marker.kind==='owned-disposable-workflow-fixture'&&marker.data===fixtureDirectory&&marker.socket===socket;
}
if(destination?.listening!==""||!(ownedFixture||fixtureDirectory.endsWith("/bobcore-workflow-prototype/workflow-validation/pg-data")))throw new Error("fixture_destination_mismatch");
const service=new GovernedPacketService(new PostgresPacketStore(createPinnedWorkflowTransaction(fixturePool(),{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},async()=>true)));
const owner={ownerId:"synthetic-owner",actorId:"synthetic-owner-actor",projectKey:"bobai"};
const token="synthetic-owner-workflow-fixture",controlToken="synthetic-workflow-test-control";
const policy={versionId:"synthetic-policy-v1",digest:"",regressionDigest:"d".repeat(64),requiredChecks:["durability","isolation"],trustedIssuers:["synthetic-ci"],approvalLifetimeMs:600000,accepted:true as const};
policy.digest=governedPolicyDigest(policy);
let controls={readDelayMs:0,writeDelayMs:0,responseDelayMs:0,readFailure:false,loseResponseOnce:false,verifierFailure:false};
let recoveryRace:"capture"|"revise"|null=null;
let raceObservation:Record<string,unknown>|null=null;
let workspaceFailureOnly=false;
let commands:Array<{operationId:string;action:string;project:string;confirmed:boolean}>=[];
async function command(input:Record<string,unknown>){return service.command(owner,{operationId:randomUUID(),packetId:"packet-1",...input});}
async function prepareCandidate(packet:WorkPacket,outcome:"pass"|"fail"="pass",mode="legacy"){
  let result=await command({packetId:packet.id,action:"accept_specification",expectedVersion:packet.version,specificationDigest:packet.specificationDigest});
  result=await command({packetId:packet.id,action:"candidate",expectedVersion:result.packet.version,sourceDigest:mode==="stored"?evidenceBodyDigest(fixtureSource):"a".repeat(64),configurationDigest:"b".repeat(64)});
  if(mode==='missing')return result.packet;
  if(mode==='stored'){
   const record=(await admin('SELECT content FROM bob_workflow.records WHERE id=$1',[result.packet.candidateId])).rows[0]?.content;
   const f=syntheticEvidence(candidateSchema.parse(record));f.claims.packetId=packet.id;f.resign();f.put('context',packet.id,f.context);
   await new TransactionalEvidenceImporter(new PostgresPacketStore(createPinnedWorkflowTransaction(fixturePool(),{kind:'isolated-local',socket:socket!,database:'postgres',role:'bob_workflow_adapter_app'},async()=>true)),createScopedEvidenceAuthority(f.reader)).import(owner,{packetId:packet.id,sourceRecordId:f.claims.sourceRecordId});
   return result.packet;
  }
  if(['expired','untrusted','aged'].includes(mode)){
   for(const id of policy.requiredChecks)await admin("INSERT INTO bob_workflow.records(owner_id,project_key,id,packet_id,kind,content) VALUES($1,$2,$3,$4,'evidence',$5::jsonb)",[owner.ownerId,owner.projectKey,randomUUID(),packet.id,JSON.stringify({id,ownerId:owner.ownerId,projectKey:owner.projectKey,candidateDigest:result.packet.candidateDigest,issuer:mode==='untrusted'?'foreign-fixture-issuer':'synthetic-ci',outcome:'pass',expiresAt:Date.now()+(mode==='expired'?-1:600000),sourceTimestamp:new Date(Date.now()-(mode==='aged'?86400000:1000)).toISOString(),sourceRecordId:randomUUID()})]);
   return result.packet;
  }
  for(const checkId of policy.requiredChecks)await service.recordEvidence(owner,"synthetic-ci",{id:randomUUID(),packetId:packet.id,candidateDigest:result.packet.candidateDigest,checkId,outcome,
    expiresAt:Date.now()+600000,sourceTimestamp:new Date(Date.now()-1000).toISOString(),sourceRecordId:"synthetic-ci-run"});
  return result.packet;
}
async function reset(scenario:string){
  await admin("TRUNCATE bob_owner_delegation.proofs");
  await admin("TRUNCATE bob_auth_user CASCADE; INSERT INTO bob_auth_user(id,name,email,\"emailVerified\") VALUES('synthetic-owner-user','Synthetic owner','owner@example.invalid',true); INSERT INTO bob_auth_session(id,\"userId\",token,\"expiresAt\",\"updatedAt\") VALUES('synthetic-session','synthetic-owner-user','synthetic-owner-workflow-fixture',now()+interval '1 hour',now())");
  controls={readDelayMs:0,writeDelayMs:0,responseDelayMs:0,readFailure:false,loseResponseOnce:false,verifierFailure:false};commands=[];recoveryRace=null;raceObservation=null;workspaceFailureOnly=false;
  await admin("TRUNCATE bob_workflow.history,bob_workflow.receipts,bob_workflow.records,bob_workflow.packets,bob_workflow.grants,bob_workflow.projects,public.bob_events,public.bob_tasks,public.bob_decisions,public.bob_projects CASCADE");
  await admin("INSERT INTO bob_workflow.projects(owner_id,project_key,policy,paused) VALUES($1,'bobai',$2::jsonb,false),($1,'sample',$2::jsonb,false)",[owner.ownerId,JSON.stringify(policy)]);
    await admin("INSERT INTO bob_workflow.policy_versions(owner_id,project_key,version_id,policy) VALUES($1,'bobai',$2,$3::jsonb),($1,'sample',$2,$3::jsonb)",[owner.ownerId,policy.versionId,JSON.stringify(policy)]);
  await admin("INSERT INTO bob_workflow.grants(owner_id,project_key,actor_id,can_edit,can_review,enabled) VALUES($1,'bobai',$2,true,true,true),($1,'sample',$2,true,true,true)",[owner.ownerId,owner.actorId]);
  await admin("INSERT INTO public.bob_projects(id,owner_id,project_key,name,description) VALUES('11111111-1111-4111-8111-111111111111',$1,'bobai','Synthetic Bob Core','Keep governed work dependable across interfaces.'),('22222222-2222-4222-8222-222222222222',$1,'sample','Synthetic sample','Separate project for isolation acceptance.')",[owner.ownerId]);
  await admin("INSERT INTO public.bob_tasks(id,owner_id,project_id,title,status) VALUES('33333333-3333-4333-8333-333333333333',$1,'11111111-1111-4111-8111-111111111111','Ordinary completed task','done')",[owner.ownerId]);
  await admin("INSERT INTO public.bob_events(id,owner_id,project_id,event_type,summary) VALUES('44444444-4444-4444-8444-444444444444',$1,'11111111-1111-4111-8111-111111111111','synthetic.history','Synthetic project history')",[owner.ownerId]);
  if(scenario.startsWith("dependency_")){
    let prior=(await command({packetId:"prior",action:"capture",expectedVersion:0,title:"Prerequisite",specification:"Upstream criteria",predecessors:[]})).packet;
    prior=await prepareCandidate(prior);prior=(await command({packetId:prior.id,action:"ready",expectedVersion:prior.version,candidateDigest:prior.candidateDigest})).packet;
    await command({packetId:prior.id,action:"review",expectedVersion:prior.version,candidateDigest:prior.candidateDigest,decision:"approve"});
  }
  if(scenario!=="empty"){
    let p=(await command({action:"capture",expectedVersion:0,title:"Verify project resumption",specification:"Retain the same accepted project records after restart.",predecessors:scenario.startsWith("dependency_")?["prior"]:[]})).packet;
    p=await prepareCandidate(p,scenario==="failed"?"fail":"pass",scenario.startsWith("evidence_")?scenario.slice(9):"legacy");
    if(scenario!=="failed"&&!scenario.startsWith("evidence_"))p=(await command({action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest})).packet;
  }
  if(scenario==="dependency_reviewed"){const p=(await service.list(owner)).packets.find(v=>v.id==="packet-1")!;await command({action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"});}
  if(scenario==="paused")await admin("UPDATE bob_workflow.projects SET paused=true WHERE project_key='bobai'");
  if(scenario==="policy_missing")await admin("UPDATE bob_workflow.projects SET policy=NULL WHERE project_key='bobai'");
  if(scenario==="read_error")controls.readFailure=true;
  if(scenario==="loading")controls.readDelayMs=1500;
  if(realMode){
    if(realFixture)await realFixture.close();realFixture=await createRealAuthFixture();fixtureOwner.userId=realFixture.userId;
    actualVerifier=createWorkflowOwnerVerifier(realFixture.pool,{issuer:"http://127.0.0.1:3433",audience:"http://127.0.0.1:3431",owner:fixtureOwner,proofLifetimeMs:60000},fixtureRegistry,{web:"synthetic-web-verifier-credential-not-live-20261001",core:"synthetic-core-verifier-credential-not-live-20261001"});
  }
}
const app=new Hono();
app.use("/fixture/*",async(c,next)=>{if(c.req.header("authorization")!==`Bearer ${controlToken}`)return c.json({error:"fixture_control_denied"},403);await next();});
app.post("/fixture/reset",async c=>{const {scenario}=await c.req.json();if(!["ready","empty","failed","paused","policy_missing","read_error","loading","dependency_ready","dependency_reviewed","evidence_missing","evidence_expired","evidence_untrusted","evidence_stored","evidence_aged"].includes(scenario))return c.json({error:"invalid_fixture"},400);await reset(scenario);return c.json({ready:true});});
app.post("/fixture/control",async c=>{
  const body=await c.req.json();
  if(body.expireOwnerSessions===true)await admin("UPDATE bob_auth_session SET \"expiresAt\"=now()-interval '1 second'");
  if(["capture","revise"].includes(body.recoveryRace))recoveryRace=body.recoveryRace;
  if(typeof body.workspaceFailureOnly==="boolean")workspaceFailureOnly=body.workspaceFailureOnly;
  if(["bobai","sample"].includes(body.revokeProject))await admin("UPDATE bob_workflow.grants SET enabled=false WHERE project_key=$1",[body.revokeProject]);
  if(body.changeCandidate){const p=(await service.list(owner)).packets.find(v=>v.id===(body.packetId??"packet-1"));if(!p)return c.json({error:"fixture_packet_missing"},404);
    await command({packetId:p.id,action:"revise",expectedVersion:p.version,specification:"Changed server candidate criteria."});}
  if(body.replacePrior){
    let p:WorkPacket=(await service.list(owner)).packets.find(v=>v.id==="prior")!;
    p=(await command({packetId:p.id,action:"revise",expectedVersion:p.version,specification:"Upstream version two"})).packet;
    p=await prepareCandidate(p);p=(await command({packetId:p.id,action:"ready",expectedVersion:p.version,candidateDigest:p.candidateDigest})).packet;
    await command({packetId:p.id,action:"review",expectedVersion:p.version,candidateDigest:p.candidateDigest,decision:"approve"});
  }
  if(body.prepareCandidate){const p=(await service.list(owner)).packets.find(v=>v.id===body.packetId);if(!p)return c.json({error:"fixture_packet_missing"},404);await prepareCandidate(p);}
  if(typeof body.responseDelayMs==="number"&&body.responseDelayMs>=0&&body.responseDelayMs<=20000)controls.responseDelayMs=body.responseDelayMs;
  for(const key of ["readDelayMs","writeDelayMs"] as const)if(typeof body[key]==="number"&&body[key]>=0&&body[key]<=2000)controls[key]=body[key];
  for(const key of ["readFailure","loseResponseOnce","verifierFailure"] as const)if(typeof body[key]==="boolean")controls[key]=body[key];
  return c.json({ok:true});
});
app.get("/fixture/state",async c=>c.json({workspace:await service.workspace(owner),history:await service.history(owner),commands,raceObservation}));
app.use("/v1/governed/*",async(c,next)=>{
  if(c.req.method==="GET"&&c.req.query("operation")&&recoveryRace){
    const mode=recoveryRace;recoveryRace=null;
    // Actual old read then actual commit, immediately before the coherent recovery read.
    const old=await service.workspace(owner);let result;
    if(mode==="capture")result=await command({operationId:c.req.query("operation"),packetId:"race-packet",action:"capture",expectedVersion:0,title:"Created during recovery",specification:"New criteria",predecessors:[]});
    else {const packet=old.packets.find(p=>p.id==="packet-1")!;result=await command({operationId:c.req.query("operation"),packetId:packet.id,action:"revise",expectedVersion:packet.version,specification:"Revised during recovery"});}
    raceObservation={oldPackets:old.packets.map(p=>({id:p.id,version:p.version,state:p.state})),committedPacket:result.packet};
  }
  if(c.req.method==="GET"&&workspaceFailureOnly&&!c.req.path.includes("/receipts/")&&!c.req.path.endsWith("/_directory"))return c.json({error:{code:"synthetic_workspace_unavailable"}},503);

  if(c.req.method==="GET"){if(controls.readDelayMs)await new Promise(r=>setTimeout(r,controls.readDelayMs));if(controls.readFailure)return c.json({error:{code:"synthetic_read_unavailable"}},503);}
  if(c.req.method==="POST"&&controls.writeDelayMs)await new Promise(r=>setTimeout(r,controls.writeDelayMs));
  const body=c.req.method==="POST"?await c.req.raw.clone().json():null;
  await next();
  if(body&&c.res.ok&&controls.responseDelayMs)await new Promise(r=>setTimeout(r,controls.responseDelayMs));
  if(body){commands.push({operationId:String(body.operationId),action:String(body.action),project:c.req.path.split("/")[3]??"",confirmed:c.res.ok});
    if(c.res.ok&&controls.loseResponseOnce){controls.loseResponseOnce=false;c.res=c.json({error:{code:"synthetic_receipt_response_lost"}},503);return c.res;}}
});
const verifier=fixtureDelegation();
const verifierServer=serve({fetch:request=>controls.verifierFailure?Response.json({error:"synthetic_verifier_outage"},{status:503}):realMode?(actualVerifier?actualVerifier.fetch(request):Response.json({error:"real_auth_not_ready"},{status:503})):ownerVerifierRouter(verifier,{web:"synthetic-web-verifier-credential-not-live-20261001",core:"synthetic-core-verifier-credential-not-live-20261001"}).fetch(request),hostname:"127.0.0.1",port:3433});
const coreVerifier=coreOwnerVerifierClient({issuer:"http://127.0.0.1:3433",audience:"http://127.0.0.1:3431",credential:"synthetic-core-verifier-credential-not-live-20261001"});
app.all("/v1/governed/*",async c=>{
 const original=c.req.raw.clone();
 let context:Awaited<ReturnType<typeof coreVerifier.redeem>>|null=null;
 const guarded=new GovernedPacketService(new PostgresPacketStore(createPinnedWorkflowTransaction(fixturePool(),{kind:"isolated-local",socket:socket!,database:"postgres",role:"bob_workflow_adapter_app"},async()=>!!context&&await context.revalidate())));
 const router=createGovernedWorkflowRouter(guarded,async(request,project)=>{context=await coreVerifier.redeem(original,project);return context.principals[0]??null;},async request=>{context=await coreVerifier.redeem(original,"_directory");return context.principals;});
 return router.fetch(new Request(c.req.raw.url.replace("/v1/governed/","/"),c.req.raw));
});
await reset("ready");
const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:3431});
console.info("Synthetic workflow fixture listening on private loopback port 3431");
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{void realFixture?.close();verifierServer.close();server.close(()=>process.exit(0));});
