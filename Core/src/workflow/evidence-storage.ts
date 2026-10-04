import {candidateSchema,candidateDigest} from './acceptance-contract.js';
import {verifyImmutableEvidence,type ImmutableEvidenceAuthority,type VerifiedEvidence} from './verified-evidence.js';
import {evidenceBodyDigest} from './scoped-evidence-source.js';
import {PostgresPacketStore} from './postgres-store.js';
import {workflowPrincipal,workflowHash,WorkflowError,type WorkflowRecord} from './packet-contract.js';
function deny(code:string):never{throw new WorkflowError(code,403);}
// Default authority absent: no producer/baseline/issuer inferred from credentials.
// Uses existing project lock, immutable records and registered transaction SQL.
export class TransactionalEvidenceImporter{
 constructor(private readonly store:PostgresPacketStore,private readonly authority?:ImmutableEvidenceAuthority,private readonly clock=Date.now){}
 async import(principal:unknown,reference:unknown){
  const p=workflowPrincipal.parse(principal);
  const admission=await verifyImmutableEvidence(p,reference,this.authority,this.clock);
  return this.store.scoped(p,'edit',async s=>{
   const fresh=await verifyImmutableEvidence(p,reference,this.authority,this.clock);
   if(workflowHash(fresh)!==workflowHash(admission))deny('evidence_authority_changed');
   const packet=s.packets.find(v=>v.id===fresh.packetId),record=s.records.find(v=>v.kind==='candidate'&&v.id===packet?.candidateId&&v.packetId===packet.id);
   if(!packet||!record||packet.candidateDigest!==fresh.candidateDigest)deny('evidence_candidate_changed');
   const candidate=candidateSchema.parse(record.content);
   if(candidateDigest(candidate)!==fresh.candidateDigest||candidate.specificationDigest!==packet.specificationDigest||candidate.policyDigest!==s.policy?.digest||candidate.regressionDigest!==s.policy?.regressionDigest)deny('evidence_candidate_or_policy_changed');
   if(!s.policy.trustedIssuers.includes(fresh.issuer)||!s.policy.requiredChecks.includes(fresh.checkId)||fresh.expiresAt<=s.now)deny('evidence_policy_denied');
   const content=this.content(fresh),existing=s.records.find(v=>v.id===fresh.id);
   if(existing){if(existing.kind!=='evidence'||existing.packetId!==packet.id||evidenceBodyDigest(existing.content)!==evidenceBodyDigest(content))deny('immutable_evidence_conflict');
    await this.revalidate(p,reference,fresh);return {record:existing,idempotent:true};}
   if(s.records.some(v=>v.kind==='evidence'&&v.content.verification&&((v.content.verification as Record<string,unknown>).attestationDigest===fresh.attestationDigest||(v.content.issuer===fresh.issuer&&v.content.sourceRecordId===fresh.sourceRecordId))))deny('evidence_source_replay');
   if(s.records.some(v=>v.kind==='evidence'&&v.packetId===packet.id&&v.content.candidateDigest===fresh.candidateDigest&&v.content.id===fresh.checkId))deny('evidence_check_already_recorded');
   const evidence:WorkflowRecord={id:fresh.id,packetId:packet.id,kind:'evidence',content,createdAt:new Date(s.now).toISOString()};
   await s.insertRecord(evidence);
   // Failure here rolls record/replay consumption back with the same transaction.
   await this.revalidate(p,reference,fresh);return {record:evidence,idempotent:false};
  });
 }
 private content(e:VerifiedEvidence){return {id:e.checkId,ownerId:e.principal.ownerId,projectKey:e.principal.projectKey,candidateDigest:e.candidateDigest,issuer:e.issuer,
 outcome:e.outcome,expiresAt:e.expiresAt,sourceRecordId:e.sourceRecordId,sourceTimestamp:e.sourceTimestamp,
 verification:{actorId:e.principal.actorId,reportDigest:e.reportDigest,attestationDigest:e.attestationDigest,checkDefinitionDigest:e.checkDefinitionDigest,contextDigest:e.contextDigest,issuerApprovalVersion:e.issuerApprovalVersion}};}
 private async revalidate(p:unknown,reference:unknown,expected:VerifiedEvidence){if(workflowHash(await verifyImmutableEvidence(p,reference,this.authority,this.clock))!==workflowHash(expected))deny('evidence_authority_changed');}
}
