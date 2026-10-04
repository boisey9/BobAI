import {z} from 'zod';
import {candidateSchema,candidateDigest} from './acceptance-contract.js';
import {workflowId,workflowDigest,type PacketPrincipal,type WorkPacket} from './packet-contract.js';
import type {WorkflowSnapshot} from './postgres-store.js';
import {localOwnerDirection} from './owner-policy-direction.js';
export type EvidenceStatus='missing'|'ambiguous'|'invalid'|'policy_missing'|'candidate_changed'|'untrusted'|'expired'|'failed'|'not_run'|'verification_pending'|'pass';
const evidence=z.object({id:workflowId,ownerId:workflowId,projectKey:workflowId,candidateDigest:workflowDigest,issuer:workflowId,outcome:z.enum(['pass','fail','not_run']),expiresAt:z.number().int().positive(),sourceRecordId:workflowId,sourceTimestamp:z.iso.datetime(),verification:z.unknown().optional()}).strict();
// Shared expiry calculation, using approved source-completion freshness. A
// legacy producer cannot extend eligibility by supplying a later expiresAt.
export function evidenceEffectiveExpiry(value:{expiresAt:unknown;sourceTimestamp:unknown},now:number):number{
 const expiry=value.expiresAt,completed=typeof value.sourceTimestamp==='string'?Date.parse(value.sourceTimestamp):NaN;
 if(typeof expiry!=='number'||!Number.isSafeInteger(expiry)||expiry<=0||!Number.isFinite(completed)||completed>now)return 0;
 return Math.min(expiry,completed+localOwnerDirection.evidenceLifetimeMs);
}
// Read-only historical projection; does not select a baseline, verify a producer,
// consume evidence, advance a state or grant readiness/release authority.
export function projectEvidence(s:Pick<WorkflowSnapshot,'policy'|'records'|'now'>,p:PacketPrincipal,packet:WorkPacket){
 const policy=s.policy,current=s.records.filter(r=>r.kind==='evidence'&&r.packetId===packet.id&&r.content.candidateDigest===packet.candidateDigest);
 let bindingCurrent=false;
 try{const r=s.records.find(r=>r.kind==='candidate'&&r.packetId===packet.id&&r.id===packet.candidateId);const c=candidateSchema.parse(r?.content);bindingCurrent=c.ownerId===p.ownerId&&c.projectKey===p.projectKey&&candidateDigest(c)===packet.candidateDigest&&c.specificationDigest===packet.specificationDigest&&c.policyDigest===policy?.digest&&c.regressionDigest===policy?.regressionDigest;}catch{}
 const ids=policy?.requiredChecks??Array.from(new Set(current.map(r=>String(r.content.id))));
 const checks=ids.map(id=>{const rows=current.filter(r=>r.content.id===id);let status:EvidenceStatus='missing',expiresAt:number|null=null;
  if(!policy)status='policy_missing';else if(!bindingCurrent)status=packet.candidateDigest?'candidate_changed':'missing';else if(rows.length>1)status='ambiguous';else if(rows.length===1){
   const parsed=evidence.safeParse(rows[0]!.content);if(!parsed.success)status='invalid';else {const e=parsed.data;expiresAt=evidenceEffectiveExpiry(e,s.now);
    if(e.ownerId!==p.ownerId||e.projectKey!==p.projectKey)status='invalid';else if(!policy.trustedIssuers.includes(e.issuer))status='untrusted';
    else if(Date.parse(e.sourceTimestamp)>s.now)status='invalid';else if(expiresAt<=s.now)status='expired';else if(e.outcome==='fail')status='failed';else if(e.outcome==='not_run')status='not_run';
    // Accepted68 storage adds immutable provenance but has no mounted current
    // evidence/readiness authority. Never strip it into a legacy passing check.
    else if(Object.hasOwn(e,'verification'))status='verification_pending';else status='pass';
   }
  }
  return {id,status,recordIds:rows.map(r=>r.id),expiresAt};
 });
 return {evaluatedAt:s.now,policyConfigured:!!policy,candidatePresent:!!packet.candidateDigest,bindingCurrent,
  checks,evidenceComplete:!!policy&&bindingCurrent&&checks.length>0&&checks.every(c=>c.status==='pass')};
}
