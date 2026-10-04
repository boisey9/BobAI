import {beforeAll,beforeEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {enabled,syntheticConnection,socket} from '../scripts/lib/workflow-synthetic-postgres.js';
import {fixtureTransaction,fixtureAccess,fixturePool,fixtureAdmin as admin} from '../scripts/lib/workflow-adapter-fixture.js';
import {syntheticEvidence,fixtureSource,fixtureDefinition,fixturePrincipal as p} from '../scripts/lib/evidence-storage-fixture.js';
import {createScopedEvidenceAuthority,evidenceBodyDigest,type EvidenceRecordKind,type AuthenticatedScopedEvidenceReader} from '../src/workflow/scoped-evidence-source.js';
import {TransactionalEvidenceImporter} from '../src/workflow/evidence-storage.js';
import {createPinnedWorkflowTransaction} from '../src/workflow/pinned-transaction.js';
import {PostgresPacketStore,type WorkflowTransaction} from '../src/workflow/postgres-store.js';
import {GovernedPacketService} from '../src/workflow/packet-service.js';
import {candidateSchema} from '../src/workflow/acceptance-contract.js';
import {governedPolicyDigest,workflowHash,type PacketPrincipal} from '../src/workflow/packet-contract.js';
const policy={versionId:'synthetic-policy-evidence',digest:'',regressionDigest:'d'.repeat(64),requiredChecks:['durability'],trustedIssuers:['synthetic-ci'],approvalLifetimeMs:600000,accepted:true as const};policy.digest=governedPolicyDigest(policy);
const request=new Request('http://localhost/',{headers:{authorization:'Bearer synthetic-owner-workflow-fixture'}});
let f:ReturnType<typeof syntheticEvidence>;
async function command(input:Record<string,unknown>){return new GovernedPacketService(new PostgresPacketStore(fixtureTransaction())).command(p,{operationId:randomUUID(),packetId:'evidence-packet',...input});}
async function catalog(kind:EvidenceRecordKind,id:string,body:unknown){const r=f.wrap(kind,id,body);await admin('INSERT INTO public.synthetic_evidence_catalog(owner_id,project_key,kind,id,record) VALUES($1,$2,$3,$4,$5::jsonb)',[p.ownerId,p.projectKey,kind,id,JSON.stringify(r)]);}
async function authorized(v:PacketPrincipal){const found=await fixtureAccess().authenticate(request,v.projectKey);return !!found&&workflowHash(found)===workflowHash(v)&&((await admin('SELECT can_edit FROM bob_workflow.grants WHERE owner_id=$1 AND project_key=$2 AND actor_id=$3 AND enabled=true',[v.ownerId,v.projectKey,v.actorId])).rows[0]?.can_edit===true);}
const reader:AuthenticatedScopedEvidenceReader={authorized,async read(v,k,id){
 // Real restricted role and FORCE RLS, fixed owned socket only; no hosted fallback.
 const c=syntheticConnection('bob_evidence_synthetic_reader');try{await c.query('BEGIN READ ONLY');await c.query("SELECT set_config('bob.workflow_owner',$1,true),set_config('bob.workflow_project',$2,true)",[v.ownerId,v.projectKey]);
  if(k==='context'){
   const result=(await c.query(`SELECT r.content AS candidate,g.delegation_version FROM bob_workflow.packets a JOIN bob_workflow.records r ON r.owner_id=a.owner_id AND r.project_key=a.project_key AND r.id=a.document->>'candidateId' JOIN bob_workflow.grants g ON g.owner_id=a.owner_id AND g.project_key=a.project_key WHERE a.owner_id=$1 AND a.project_key=$2 AND a.id=$3 AND g.actor_id=$4 AND g.enabled=true`,[v.ownerId,v.projectKey,id,v.actorId])).rows[0];
   if(!result)return null;return f.wrap(k,id,{...f.context,principal:v,candidate:result.candidate,authorizationVersion:result.delegation_version});
  }
  return (await c.query('SELECT record FROM public.synthetic_evidence_catalog WHERE owner_id=$1 AND project_key=$2 AND kind=$3 AND id=$4',[v.ownerId,v.projectKey,k,id])).rows[0]?.record;
 }finally{try{await c.query('ROLLBACK');}finally{c.close();}}
}};
const authority=()=>createScopedEvidenceAuthority(reader);
const importer=(tx:WorkflowTransaction=fixtureTransaction())=>new TransactionalEvidenceImporter(new PostgresPacketStore(tx),authority());
const ref=()=>({packetId:f.claims.packetId,sourceRecordId:f.claims.sourceRecordId});
const evidenceCount=async()=>Number((await admin("SELECT count(*) AS n FROM bob_workflow.records WHERE kind='evidence'")).rows[0]?.n);
async function seedCatalog(){for(const [key,value] of f.records){const split=key.indexOf(':'),kind=key.slice(0,split) as EvidenceRecordKind;if(kind!=='context')await catalog(kind,key.slice(split+1),(value as {body:unknown}).body);}}
function afterInsert(effect:()=>Promise<void>):WorkflowTransaction{const base=fixtureTransaction();return run=>base(q=>run(async(sql,params)=>{const result=await q(sql,params);if(sql.startsWith('INSERT INTO bob_workflow.records')&&params?.[4]==='evidence')await effect();return result;}));}
describe.skipIf(!enabled)('actual PostgreSQL authenticated evidence source and atomic consumption',{timeout:30000},()=>{
 beforeAll(async()=>{
  await admin('CREATE ROLE bob_evidence_synthetic_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');
  await admin('CREATE TABLE public.synthetic_evidence_catalog(owner_id text NOT NULL,project_key text NOT NULL,kind text NOT NULL,id text NOT NULL,record jsonb NOT NULL,PRIMARY KEY(owner_id,project_key,kind,id)); ALTER TABLE public.synthetic_evidence_catalog ENABLE ROW LEVEL SECURITY; ALTER TABLE public.synthetic_evidence_catalog FORCE ROW LEVEL SECURITY');
  await admin("CREATE POLICY synthetic_evidence_scope ON public.synthetic_evidence_catalog USING(owner_id=current_setting('bob.workflow_owner',true) AND project_key=current_setting('bob.workflow_project',true))");
  await admin("CREATE FUNCTION public.synthetic_immutable_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.kind IN ('envelope','report','source','check') THEN RAISE EXCEPTION 'immutable_synthetic_source'; END IF; RETURN NEW; END $$; CREATE TRIGGER immutable_synthetic_source BEFORE UPDATE OR DELETE ON public.synthetic_evidence_catalog FOR EACH ROW EXECUTE FUNCTION public.synthetic_immutable_source()");
  await admin('GRANT USAGE ON SCHEMA bob_workflow,public TO bob_evidence_synthetic_reader; GRANT SELECT ON ALL TABLES IN SCHEMA bob_workflow TO bob_evidence_synthetic_reader; GRANT SELECT ON public.synthetic_evidence_catalog TO bob_evidence_synthetic_reader');
 });
 beforeEach(async()=>{
  await admin('TRUNCATE public.synthetic_evidence_catalog; TRUNCATE bob_owner_delegation.proofs; TRUNCATE bob_auth_user CASCADE; TRUNCATE bob_workflow.history,bob_workflow.receipts,bob_workflow.records,bob_workflow.packets,bob_workflow.grants,bob_workflow.projects,public.bob_events,public.bob_tasks,public.bob_decisions,public.bob_projects CASCADE');
  await admin("INSERT INTO bob_auth_user(id,name,email,\"emailVerified\") VALUES('synthetic-owner-user','Synthetic owner','owner@example.invalid',true); INSERT INTO bob_auth_session(id,\"userId\",token,\"expiresAt\",\"updatedAt\") VALUES('synthetic-session','synthetic-owner-user','synthetic-owner-workflow-fixture',now()+interval '1 hour',now())");
  await admin("INSERT INTO bob_workflow.projects(owner_id,project_key,policy,paused) VALUES($1,'bobai',$2::jsonb,false)",[p.ownerId,JSON.stringify(policy)]);
  await admin("INSERT INTO bob_workflow.policy_versions(owner_id,project_key,version_id,policy) VALUES($1,'bobai',$2,$3::jsonb)",[p.ownerId,policy.versionId,JSON.stringify(policy)]);
  await admin("INSERT INTO bob_workflow.grants(owner_id,project_key,actor_id,can_edit,can_review,enabled) VALUES($1,'bobai',$2,true,true,true)",[p.ownerId,p.actorId]);
  await admin("INSERT INTO public.bob_projects(id,owner_id,project_key,name) VALUES('11111111-1111-4111-8111-111111111111',$1,'bobai','Synthetic Bob Core')",[p.ownerId]);
  let r=await command({action:'capture',expectedVersion:0,title:'Synthetic verified evidence',specification:'Exact candidate survives isolated storage',predecessors:[]});
  r=await command({action:'accept_specification',expectedVersion:r.packet.version,specificationDigest:r.packet.specificationDigest});
  r=await command({action:'candidate',expectedVersion:r.packet.version,sourceDigest:evidenceBodyDigest(fixtureSource),configurationDigest:'b'.repeat(64)});
  const candidate=(await admin("SELECT content FROM bob_workflow.records WHERE id=$1",[r.packet.candidateId])).rows[0]?.content;
  f=syntheticEvidence(candidateSchema.parse(candidate));await seedCatalog();
 });
 it('persists immutable exact binding, idempotent retry and new importer process instance',async()=>{
  const first=await importer().import(p,ref());expect(first.idempotent).toBe(false);expect((await importer().import(p,ref())).idempotent).toBe(true);expect(await evidenceCount()).toBe(1);
  expect(first.record.content.verification).toMatchObject({reportDigest:f.claims.reportDigest,checkDefinitionDigest:evidenceBodyDigest(fixtureDefinition)});
  await expect(admin("UPDATE bob_workflow.records SET content='{}' WHERE kind='evidence'")).rejects.toThrow(/immutable/);
  await expect(admin("UPDATE public.synthetic_evidence_catalog SET record='{}' WHERE kind='report'")).rejects.toThrow(/immutable_synthetic_source/);
 });
 it('serializes concurrent identical imports once with advisory lock',async()=>{const results=await Promise.all([importer().import(p,ref()),importer().import(p,ref())]);expect(results.map(v=>v.idempotent).sort()).toEqual([false,true]);expect(await evidenceCount()).toBe(1);});
 it('consumes signed source durably and rejects source replay with another evidence ID',async()=>{await importer().import(p,ref());f.claims.id=randomUUID();f.resign();const wrapped=f.records.get('envelope:'+f.claims.sourceRecordId); // Immutable catalog cannot replace original attestation.
  await expect(admin('UPDATE public.synthetic_evidence_catalog SET record=$1::jsonb WHERE kind=\'envelope\'',[JSON.stringify(wrapped)])).rejects.toThrow(/immutable_synthetic_source/);
  const altered={...reader,read:async(v:PacketPrincipal,k:EvidenceRecordKind,id:string)=>k==='envelope'?wrapped:reader.read(v,k,id)};
  await expect(new TransactionalEvidenceImporter(new PostgresPacketStore(fixtureTransaction()),createScopedEvidenceAuthority(altered)).import(p,ref())).rejects.toThrow('evidence_source_replay');expect(await evidenceCount()).toBe(1);
 });
 it('rejects a second distinct signed run for the already recorded candidate/check',async()=>{await importer().import(p,ref());f.claims.id=randomUUID();f.claims.sourceRecordId=randomUUID();f.claims.runId=randomUUID();f.resign();await catalog('envelope',f.claims.sourceRecordId,(f.records.get('envelope:'+f.claims.sourceRecordId) as {body:unknown}).body);await catalog('report',f.claims.sourceRecordId,{runId:f.claims.runId,environmentDigest:fixtureDefinition.environmentDigest,bytesBase64:f.report.toString('base64')});await expect(importer().import(p,ref())).rejects.toThrow('evidence_check_already_recorded');expect(await evidenceCount()).toBe(1);});
 it('denies wrong project/actor, revoked grant and missing baseline before writes',async()=>{for(const bad of [{...p,projectKey:'sample'},{...p,actorId:'foreign'}])await expect(importer().import(bad,ref())).rejects.toThrow();f.context.baseline.acceptedByOwner=false;await expect(importer().import(p,ref())).rejects.toThrow();f.context.baseline.acceptedByOwner=true;await admin("UPDATE bob_workflow.grants SET enabled=false WHERE project_key='bobai'");await expect(importer().import(p,ref())).rejects.toThrow();expect(await evidenceCount()).toBe(0);});
 it('denies changed candidate between admission and scoped lock',async()=>{let once=false;const base=fixtureTransaction();const tx:WorkflowTransaction=async run=>{if(!once){once=true;const packet=(await admin('SELECT document FROM bob_workflow.packets')).rows[0]?.document as {version:number};await command({action:'candidate',expectedVersion:packet.version,sourceDigest:'c'.repeat(64),configurationDigest:'b'.repeat(64)});}return base(run);};await expect(importer(tx).import(p,ref())).rejects.toThrow();expect(await evidenceCount()).toBe(0);});
 it('rolls back after issuer revoked between insert and final authoritative read',async()=>{const tx=afterInsert(async()=>{f.issuer.revoked=true;f.issuer.approvalVersion=randomUUID();await admin("UPDATE public.synthetic_evidence_catalog SET record=$1::jsonb WHERE kind='issuer'",[JSON.stringify(f.wrap('issuer','synthetic-ci_synthetic-key',f.issuer))]);});await expect(importer(tx).import(p,ref())).rejects.toThrow();expect(await evidenceCount()).toBe(0);f.issuer.revoked=false;f.issuer.approvalVersion=randomUUID();await admin("UPDATE public.synthetic_evidence_catalog SET record=$1::jsonb WHERE kind='issuer'",[JSON.stringify(f.wrap('issuer','synthetic-ci_synthetic-key',f.issuer))]);expect((await importer().import(p,ref())).idempotent).toBe(false);});
 it('rolls back record and source consumption after actual session revocation',async()=>{await expect(importer(afterInsert(async()=>{await admin('DELETE FROM bob_auth_session');})).import(p,ref())).rejects.toThrow();expect(await evidenceCount()).toBe(0);});
 it('rejects report digest mismatch and restricted reader writes',async()=>{const malformed={...reader,read:async(v:PacketPrincipal,k:EvidenceRecordKind,id:string)=>k==='report'?f.wrap(k,id,{runId:f.claims.runId,environmentDigest:fixtureDefinition.environmentDigest,bytesBase64:Buffer.from(f.report.toString()+' ').toString('base64')}):reader.read(v,k,id)};
  await expect(new TransactionalEvidenceImporter(new PostgresPacketStore(fixtureTransaction()),createScopedEvidenceAuthority(malformed)).import(p,ref())).rejects.toThrow('immutable_evidence_report_mismatch');expect(await evidenceCount()).toBe(0);
  const c=syntheticConnection('bob_evidence_synthetic_reader');try{await expect(c.query("UPDATE public.synthetic_evidence_catalog SET record='{}'" )).rejects.toThrow(/permission denied/);}finally{c.close();}
 });
 it('keeps normal authority absent and does not silently use verified records for legacy ready',async()=>{await expect(new TransactionalEvidenceImporter(new PostgresPacketStore(fixtureTransaction())).import(p,ref())).rejects.toThrow('trusted_evidence_authority_unavailable');await importer().import(p,ref());const packet=(await admin('SELECT document FROM bob_workflow.packets')).rows[0]?.document as {version:number,candidateDigest:string};await expect(command({action:'ready',expectedVersion:packet.version,candidateDigest:packet.candidateDigest})).rejects.toThrow();expect(await evidenceCount()).toBe(1);});
 it('rolls back if report freshness expires after INSERT and before final acceptance',async()=>{f.issuer.expiresAt=Date.now()+2*86400000;await admin("UPDATE public.synthetic_evidence_catalog SET record=$1::jsonb WHERE kind='issuer'",[JSON.stringify(f.wrap('issuer','synthetic-ci_synthetic-key',f.issuer))]);let inserted=false;const clock=()=>inserted?Date.parse(f.claims.sourceTimestamp)+86400000:Date.now();const tx=afterInsert(async()=>{inserted=true;});await expect(new TransactionalEvidenceImporter(new PostgresPacketStore(tx),authority(),clock).import(p,ref())).rejects.toThrow('evidence_not_current');expect(await evidenceCount()).toBe(0);});
 it('reconciles actual committed storage after lost COMMIT response without consuming again',async()=>{const original=fixturePool();const pool={options:original.options,async connect(){const client=await original.connect();return {release:client.release,async query(sql:string,params?:unknown[]){const result=await client.query(sql,params);if(sql==='COMMIT')throw new Error('synthetic_lost_commit_response');return result;}};}};const tx=createPinnedWorkflowTransaction(pool,{kind:'isolated-local',socket:socket!,database:'postgres',role:'bob_workflow_adapter_app'},async()=>!!await fixtureAccess().authenticate(request,p.projectKey));await expect(importer(tx).import(p,ref())).rejects.toThrow('workflow_write_outcome_unconfirmed');expect(await evidenceCount()).toBe(1);expect((await importer().import(p,ref())).idempotent).toBe(true);expect(await evidenceCount()).toBe(1);});

});
