// Synthetic recovery roles only. This grants no production backup authority.
import {beforeAll,describe,it,expect} from 'vitest';
import {readFile,mkdtemp,chmod,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {evidenceBodyDigest} from '../src/workflow/scoped-evidence-source.ts';
import {socket,enabled,bin,env,execute,syntheticConnection} from '../scripts/lib/workflow-synthetic-postgres.ts';
import {provisionBackupRole} from '../scripts/lib/backup-role.mjs';
import {captureInventory} from '../scripts/lib/backup.mjs';
import {fixtureDelegation,syntheticOwnerCookie} from '../scripts/lib/workflow-delegation-fixture.ts';
import {fixtureOwner} from '../scripts/lib/workflow-adapter-fixture.ts';
import {actionBinding,createOwnerDelegation,postgresOwnerProofStore} from '../src/workflow/owner-delegation.ts';
const database='workflow_backup_restore_synthetic',roles=['bob_backup_synthetic_public','bob_backup_synthetic_nobypass','bob_backup_synthetic_full'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function query(sql,params=[],role='bob_workflow_test_admin',db='postgres'){const c=syntheticConnection(role,db);try{return await c.query(sql,params);}finally{c.close();}}
const action=actionBinding('GET','/v1/governed/bobai','','bobai');let unused,directory,manifest;
async function fingerprints(client){const tables=await captureInventory(client),out=[];for(const t of tables){const r=await client.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(q) ORDER BY to_jsonb(q)::text)::text,'[]')) AS digest FROM ONLY "${t.schema}"."${t.name}" q`);out.push({...t,digest:r.rows[0].digest});}return out;}
const dumpArgs=role=>['-h',socket,'-U',role,'-d','postgres','-Fc','--no-owner','--no-acl'];
describe.skipIf(!enabled)('synthetic RLS-aware recovery completeness',()=>{
 beforeAll(async()=>{
  expect((await query("SELECT current_setting('listen_addresses') AS listening")).rows[0].listening).toBe('');
  expect((await query("SELECT current_setting('data_directory') AS directory")).rows[0].directory).toMatch(/workflow-validation\/pg-data$/);
  // This suite follows43 protocol cases on a fresh runner-owned cluster.
  await query(await readFile(new URL('../migrations/005_backup_operations.sql',import.meta.url),'utf8'));
  for(const role of roles)await provisionBackupRole({query:(s,p)=>query(s,p)},role,'synthetic_only_'+('A'.repeat(40)));
  await query('GRANT USAGE ON SCHEMA bob_workflow,bob_owner_delegation,bob_private_checks TO bob_backup_synthetic_nobypass,bob_backup_synthetic_full; GRANT SELECT ON ALL TABLES IN SCHEMA bob_workflow,bob_owner_delegation,bob_private_checks TO bob_backup_synthetic_nobypass,bob_backup_synthetic_full; GRANT SELECT ON ALL SEQUENCES IN SCHEMA bob_workflow,bob_owner_delegation,bob_private_checks TO bob_backup_synthetic_nobypass,bob_backup_synthetic_full');
  // Explicit local fixture contrast, not a production-role recommendation.
  await query('ALTER ROLE bob_backup_synthetic_full BYPASSRLS');
  await query("INSERT INTO bob_workflow.projects(owner_id,project_key,policy,paused) SELECT 'synthetic-second-owner','synthetic-other-project',policy,true FROM bob_workflow.projects WHERE owner_id='synthetic-owner' AND project_key='bobai'; INSERT INTO bob_workflow.packets(owner_id,project_key,id,document) SELECT 'synthetic-second-owner','synthetic-other-project','synthetic-other-packet',document FROM bob_workflow.packets LIMIT 1");
  // Explicit recovery seeds; do not depend on proof leftovers from another suite.
  await query('TRUNCATE bob_owner_delegation.proofs');
  unused=await fixtureDelegation().issue(new Headers({cookie:syntheticOwnerCookie()}),action);
  await fixtureDelegation().issue(new Headers({cookie:syntheticOwnerCookie()}),action);
  directory=await mkdtemp('/tmp/bob-workflow-encrypted-recovery-');await chmod(directory,0o700);
 });
 it('reproduces public-only backup permission failure without changing the provisioner',async()=>{
  await expect(query('SELECT count(*) FROM bob_workflow.packets',[],roles[0])).rejects.toThrow(/permission denied/);
  await expect(execute(bin+'pg_dump',[...dumpArgs(roles[0]),'-f',join(directory,'public-only-rejected.dump')],{env})).rejects.toThrow();
 });
 it('proves schema SELECT alone cannot dump FORCE RLS and does not widen owner scope',async()=>{
  const c=syntheticConnection(roles[1]);try{await c.query('BEGIN');await c.query("SELECT set_config('bob.workflow_owner','synthetic-owner',true),set_config('bob.workflow_project','bobai',true)");const packets=(await c.query('SELECT DISTINCT owner_id,project_key FROM bob_workflow.packets')).rows;expect(packets).toEqual([{owner_id:'synthetic-owner',project_key:'bobai'}]);await c.query('COMMIT');}finally{c.close();}
  await expect(execute(bin+'pg_dump',[...dumpArgs(roles[1]),'-f',join(directory,'nobypass-rejected.dump')],{env})).rejects.toThrow(/row-level security/);
 });
 it('captures every declared schema in one snapshot with explicit synthetic read-only backup authority',async()=>{
  const privileges=(await query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='bob_backup_synthetic_full'")).rows[0];expect(privileges).toEqual({rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:true});
  await expect(query("UPDATE bob_workflow.packets SET document='{}'::jsonb",[],roles[2])).rejects.toThrow(/permission denied/);
  await expect(query('CREATE TABLE public.synthetic_forbidden(id int)',[],roles[2])).rejects.toThrow(/permission denied/);
  const c=syntheticConnection(roles[2]);try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const snapshot=(await c.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
   const inventory=await fingerprints(c);expect([...new Set(inventory.map(t=>t.schema))].sort()).toEqual(['bob_owner_delegation','bob_private_checks','bob_workflow','public']);
   expect(inventory.filter(t=>t.schema==='bob_workflow').map(t=>t.name)).toEqual(['grants','history','packets','policy_versions','projects','receipts','records']);
   expect(inventory.find(t=>t.schema==='bob_owner_delegation'&&t.name==='proofs').rows).toBe('2');
   const plain=join(directory,'snapshot.dump');await execute(bin+'pg_dump',[...dumpArgs(roles[2]),'--snapshot='+snapshot,'-f',plain],{env});await c.query('COMMIT');
   const identity=join(directory,'synthetic-recovery-identity.age');await execute('/usr/local/bin/age-keygen',['-o',identity],{env});await chmod(identity,0o600);
   const recipient=(await execute('/usr/local/bin/age-keygen',['-y',identity],{env})).stdout.trim();
   const archive=join(directory,'snapshot.dump.age'),metadata=join(directory,'manifest.json'),encryptedMetadata=join(directory,'manifest.json.age');
   manifest={syntheticOnly:true,tables:inventory,plainSHA256:hash(await readFile(plain))};await writeFile(metadata,JSON.stringify(manifest),{mode:0o600});
   await execute('/usr/local/bin/age',['-r',recipient,'-o',archive,plain],{env});await execute('/usr/local/bin/age',['-r',recipient,'-o',encryptedMetadata,metadata],{env});
   manifest.archiveSHA256=hash(await readFile(archive));manifest.manifestSHA256=hash(await readFile(encryptedMetadata));await writeFile(join(directory,'receipt.json'),JSON.stringify(manifest),{mode:0o600});
   expect((await stat(identity)).mode&0o077).toBe(0);
  }finally{c.close();}
 });
 it('authenticates encrypted restore, matches complete content and revokes copied sessions/grants without rewriting history',async()=>{
  const archive=join(directory,'snapshot.dump.age'),encryptedMetadata=join(directory,'manifest.json.age'),identity=join(directory,'synthetic-recovery-identity.age');
  expect(hash(await readFile(archive))).toBe(manifest.archiveSHA256);expect(hash(await readFile(encryptedMetadata))).toBe(manifest.manifestSHA256);
  const corrupt=join(directory,'corrupt.dump.age');const bytes=await readFile(archive);bytes[bytes.length-1]^=1;await writeFile(corrupt,bytes,{mode:0o600});
  await expect(execute('/usr/local/bin/age',['-d','-i',identity,'-o',join(directory,'corrupt-rejected.dump'),corrupt],{env})).rejects.toThrow();
  const dump=join(directory,'authenticated.dump'),metadata=join(directory,'authenticated-manifest.json');
  await execute('/usr/local/bin/age',['-d','-i',identity,'-o',dump,archive],{env});await execute('/usr/local/bin/age',['-d','-i',identity,'-o',metadata,encryptedMetadata],{env});
  const decoded=JSON.parse(await readFile(metadata,'utf8'));expect(hash(await readFile(dump))).toBe(decoded.plainSHA256);
  await query('CREATE DATABASE '+database);await execute(bin+'pg_restore',['-h',socket,'-U','bob_workflow_test_admin','-d',database,'--exit-on-error','--single-transaction','--no-owner','--no-acl',dump],{env});
  const c=syntheticConnection('bob_workflow_test_admin',database);try{expect(await fingerprints(c)).toEqual(decoded.tables);
   expect(decoded.tables.filter(t=>t.schema==='bob_private_checks').map(t=>t.name)).toEqual(['authorities','capture_receipts','records']);
   expect(Number(decoded.tables.find(t=>t.schema==='bob_private_checks'&&t.name==='capture_receipts').rows)).toBeGreaterThan(0);
   const historyBefore=(await fingerprints(c)).filter(t=>['records','receipts','capture_receipts','history','policy_versions'].includes(t.name));
   const currentSession=async id=>{const r=(await c.query('SELECT u.id,u.email,u."emailVerified",s.id AS session_id,s."userId",s."expiresAt",s."updatedAt" FROM public.bob_auth_session s JOIN public.bob_auth_user u ON u.id=s."userId" WHERE s.id=$1',[id])).rows[0];return r?{user:{id:r.id,email:r.email,emailVerified:r.emailVerified},session:{id:r.session_id,userId:r.userId,expiresAt:r.expiresAt,updatedAt:r.updatedAt}}:null;};
   const registry={async project(owner,key){const row=(await c.query('SELECT p.owner_id,p.project_key,p.status,g.actor_id,g.enabled,g.delegation_version FROM public.bob_projects p JOIN bob_workflow.grants g ON g.owner_id=p.owner_id AND g.project_key=p.project_key WHERE p.owner_id=$1 AND p.project_key=$2 AND g.actor_id=$3 AND p.deleted_at IS NULL',[owner.ownerId,key,owner.actorId])).rows[0];return row?{ownerId:row.owner_id,actorId:row.actor_id,projectKey:row.project_key,active:row.status==='active',enabled:row.enabled,revoked:!row.enabled,authorityVersion:row.delegation_version}:null;},async directory(owner){return (await c.query('SELECT project_key FROM bob_workflow.grants WHERE owner_id=$1 AND actor_id=$2 AND enabled=true ORDER BY project_key',[owner.ownerId,owner.actorId])).rows.map(r=>r.project_key);}};
   const verifier=createOwnerDelegation({issuer:'http://127.0.0.1:3433',audience:'http://127.0.0.1:3431',owner:fixtureOwner,proofLifetimeMs:60000},{currentSession,api:{getSession:async()=>currentSession('synthetic-session')}},registry,postgresOwnerProofStore(c.query));
   // Control proves copied records still authorize before explicit fixture quarantine.
   const copiedSessionProof=await verifier.issue(new Headers(),action);
   // Test-only recovery quarantine; not a live grant/deletion policy.
   await c.query('UPDATE public.bob_auth_session SET "expiresAt"=now()-interval \'1 second\'; UPDATE bob_workflow.grants SET enabled=false; UPDATE bob_private_checks.authorities SET enabled=false');
   await expect(verifier.redeem(unused.token,action)).rejects.toThrow('owner_delegation_denied');
   await expect(verifier.redeem(copiedSessionProof.token,action)).rejects.toThrow('owner_delegation_denied');
   await c.query('UPDATE public.bob_auth_session SET "expiresAt"=now()+interval \'1 hour\'');
   expect(await verifier.revalidate(unused.token,action)).toBe(false); // revoked grant independently denies
   await expect(verifier.issue(new Headers(),action)).rejects.toThrow('owner_delegation_denied');
   await c.query('UPDATE bob_workflow.grants SET enabled=true');
   expect(await verifier.revalidate(unused.token,action)).toBe(false); // revoke/regrant changed grant version
   await c.query('UPDATE bob_workflow.grants SET enabled=false');
   expect((await c.query('SELECT count(*)::text AS n FROM bob_private_checks.authorities WHERE enabled')).rows[0].n).toBe('0');
   expect((await fingerprints(c)).filter(t=>['records','receipts','capture_receipts','history','policy_versions'].includes(t.name))).toEqual(historyBefore);
   expect((await c.query('SELECT count(*)::text AS count FROM bob_workflow.grants WHERE enabled')).rows[0].count).toBe('0');
  }finally{c.close();}
 },15000);
 it('restores imported immutable evidence and its replay metadata without restoring authority',async()=>{
  const original=(await query("SELECT id,content FROM bob_workflow.records WHERE kind='evidence' AND content ? 'verification' ORDER BY id")).rows;
  expect(original.length).toBeGreaterThan(0);
  const restored=(await query("SELECT id,content FROM bob_workflow.records WHERE kind='evidence' AND content ? 'verification' ORDER BY id",[],'bob_workflow_test_admin',database)).rows;
  expect(restored.map(r=>[r.id,evidenceBodyDigest(r.content)])).toEqual(original.map(r=>[r.id,evidenceBodyDigest(r.content)]));
  for(const row of restored)expect(row.content.verification).toMatchObject({reportDigest:expect.stringMatching(/^[a-f0-9]{64}$/),attestationDigest:expect.stringMatching(/^[a-f0-9]{64}$/),issuerApprovalVersion:expect.any(String)});
  expect(Number((await query('SELECT count(*) AS n FROM bob_workflow.grants WHERE enabled=true',[],'bob_workflow_test_admin',database)).rows[0].n)).toBe(0);
  // The prior grant-revocation probe deliberately renewed the fixture session.
  // Finish quarantine of BOTH authority sources without touching evidence.
  await query('UPDATE public.bob_auth_session SET "expiresAt"=now()-interval \'1 second\'',[],'bob_workflow_test_admin',database);
  expect(Number((await query('SELECT count(*) AS n FROM public.bob_auth_session WHERE "expiresAt">now()',[],'bob_workflow_test_admin',database)).rows[0].n)).toBe(0);
  await expect(query("UPDATE bob_workflow.records SET content='{}'::jsonb WHERE kind='evidence'",[],'bob_workflow_test_admin',database)).rejects.toThrow(/immutable/);
 });

});
