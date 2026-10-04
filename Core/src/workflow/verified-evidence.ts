import {createHash,createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {candidateSchema,candidateDigest} from './acceptance-contract.js';
import {workflowPrincipal,WorkflowError,type PacketPrincipal} from './packet-contract.js';
import {evaluateDirectionEvidence,localOwnerDirectionDigest,localOwnerDirection} from './owner-policy-direction.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const check=z.object({id,definitionDigest:digest}).strict();
const contextSchema=z.object({principal:workflowPrincipal,importerAuthorized:z.literal(true),authorizationVersion:z.uuid(),
 candidate:candidateSchema,policy:z.object({digest,directionDigest:digest,requiredChecks:z.array(check).min(1).max(100),trustedIssuerIds:z.array(id).min(1).max(100)}).strict(),
 baseline:z.object({id,digest,acceptedByOwner:z.literal(true)}).strict()}).strict();
const issuerSchema=z.object({id,keyId:id,ownerId:id,projectKey:id,approvalVersion:z.uuid(),enabled:z.literal(true),revoked:z.literal(false),
 algorithm:z.literal('ed25519'),publicKeyPem:z.string().min(20).max(8192),checks:z.array(check).min(1).max(100),expiresAt:z.number().int().positive()}).strict();
const claimsSchema=z.object({version:z.literal(1),id,ownerId:id,projectKey:id,packetId:id,candidateId:id,candidateDigest:digest,
 specificationDigest:digest,sourceDigest:digest,configurationDigest:digest,regressionDigest:digest,policyDigest:digest,directionDigest:digest,
 issuer:id,keyId:id,checkId:id,checkDefinitionDigest:digest,runId:id,sourceRecordId:id,reportDigest:digest,
 sourceTimestamp:z.iso.datetime(),outcome:z.enum(['pass','fail','not_run'])}).strict();
const envelopeSchema=z.object({claims:claimsSchema,signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();
export type EvidenceClaims=z.infer<typeof claimsSchema>;
export function evidenceSigningBytes(value:unknown):Buffer{
 const c=claimsSchema.parse(value);
 // Fixed positional protocol; no arbitrary JSON ordering, executable text or URL.
 return Buffer.from(JSON.stringify(['bobcore-evidence-v1',c.version,c.id,c.ownerId,c.projectKey,c.packetId,c.candidateId,c.candidateDigest,
 c.specificationDigest,c.sourceDigest,c.configurationDigest,c.regressionDigest,c.policyDigest,c.directionDigest,c.issuer,c.keyId,
 c.checkId,c.checkDefinitionDigest,c.runId,c.sourceRecordId,c.reportDigest,c.sourceTimestamp,c.outcome]));
}
// Implementations must authenticate and scope immutable reads. They are NOT
// provided, instantiated or inferred from current agent/GitHub credentials.
export interface ImmutableEvidenceAuthority{
 readContext(principal:PacketPrincipal,packetId:string):Promise<unknown>;
 readEnvelope(principal:PacketPrincipal,sourceRecordId:string):Promise<unknown>;
 readReport(principal:PacketPrincipal,sourceRecordId:string,runId:string):Promise<Uint8Array>;
 readIssuer(principal:PacketPrincipal,issuerId:string,keyId:string):Promise<unknown>;
}
export type VerifiedEvidence={principal:PacketPrincipal;issuer:string;packetId:string;candidateDigest:string;
 id:string;checkId:string;outcome:'pass'|'fail'|'not_run';expiresAt:number;sourceTimestamp:string;sourceRecordId:string;
 reportDigest:string;attestationDigest:string;checkDefinitionDigest:string;contextDigest:string;issuerApprovalVersion:string};
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function fail(code:string):never{throw new WorkflowError(code,403);}
function scopedContext(value:unknown,p:PacketPrincipal){
 const s=contextSchema.safeParse(value);if(!s.success)fail('accepted_evidence_policy_unconfigured');const c=s.data;
 if(JSON.stringify(c.principal)!==JSON.stringify(p)||c.candidate.ownerId!==p.ownerId||c.candidate.projectKey!==p.projectKey||
 c.candidate.regressionDigest!==c.baseline.digest||c.candidate.policyDigest!==c.policy.digest||c.policy.directionDigest!==localOwnerDirectionDigest)fail('evidence_authority_scope_mismatch');
 if(new Set(c.policy.requiredChecks.map(v=>v.id)).size!==c.policy.requiredChecks.length||new Set(c.policy.trustedIssuerIds).size!==c.policy.trustedIssuerIds.length)fail('evidence_policy_ambiguous');return c;
}
function scopedIssuer(value:unknown,p:PacketPrincipal,c:EvidenceClaims,now:number){
 const parsed=issuerSchema.safeParse(value);if(!parsed.success)fail('evidence_issuer_unconfigured_or_revoked');const i=parsed.data;
 if(new Set(i.checks.map(v=>v.id)).size!==i.checks.length)fail('evidence_issuer_ambiguous');
 if(i.id!==c.issuer||i.keyId!==c.keyId||i.ownerId!==p.ownerId||i.projectKey!==p.projectKey||i.expiresAt<=now||
 i.checks.filter(v=>v.id===c.checkId&&v.definitionDigest===c.checkDefinitionDigest).length!==1)fail('evidence_issuer_scope_mismatch');return i;
}
export async function verifyImmutableEvidence(principal:unknown,reference:unknown,authority?:ImmutableEvidenceAuthority,clock=Date.now):Promise<VerifiedEvidence>{
 const p=workflowPrincipal.parse(principal);if(p.projectKey==='personal')fail('evidence_project_denied');
 const ref=z.object({packetId:id,sourceRecordId:id}).strict().safeParse(reference);if(!ref.success)fail('invalid_evidence_reference');
 if(!authority)fail('trusted_evidence_authority_unavailable');
 const context=scopedContext(await authority.readContext(p,ref.data.packetId),p);
 const parsed=envelopeSchema.safeParse(await authority.readEnvelope(p,ref.data.sourceRecordId));if(!parsed.success)fail('invalid_evidence_envelope');const {claims:c,signature}=parsed.data;
 const expected=context.candidate;
 if(c.ownerId!==p.ownerId||c.projectKey!==p.projectKey||c.packetId!==ref.data.packetId||c.sourceRecordId!==ref.data.sourceRecordId||
 c.candidateId!==expected.id||c.candidateDigest!==candidateDigest(expected)||c.specificationDigest!==expected.specificationDigest||
 c.sourceDigest!==expected.sourceDigest||c.configurationDigest!==expected.configurationDigest||c.regressionDigest!==expected.regressionDigest||
 c.policyDigest!==expected.policyDigest||c.directionDigest!==context.policy.directionDigest)fail('evidence_candidate_binding_mismatch');
 if(context.policy.requiredChecks.filter(v=>v.id===c.checkId&&v.definitionDigest===c.checkDefinitionDigest).length!==1)fail('evidence_check_definition_mismatch');
 if(!context.policy.trustedIssuerIds.includes(c.issuer))fail('evidence_issuer_untrusted');
 const now=clock();if(!Number.isSafeInteger(now)||now<0)fail('invalid_evidence_clock');
 const issuer=scopedIssuer(await authority.readIssuer(p,c.issuer,c.keyId),p,c,now);
 let signatureValid=false;try{const key=createPublicKey(issuer.publicKeyPem),bytes=Buffer.from(signature,'base64url');signatureValid=issuer.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')&&key.asymmetricKeyType==='ed25519'&&bytes.toString('base64url')===signature&&verify(null,evidenceSigningBytes(c),key,bytes);}catch{}
 if(!signatureValid)fail('evidence_signature_invalid');
 const report=await authority.readReport(p,c.sourceRecordId,c.runId);if(!(report instanceof Uint8Array)||report.byteLength===0||report.byteLength>1_048_576||sha(report)!==c.reportDigest)fail('immutable_evidence_report_mismatch');
 const current=scopedContext(await authority.readContext(p,ref.data.packetId),p);
 const latestIssuerValue=await authority.readIssuer(p,c.issuer,c.keyId);
 // One validated acceptance timestamp after asynchronous reads. Issuer and
 // evidence expiry must agree at this instant; this is not commit-time revocation.
 const finalNow=clock();if(!Number.isSafeInteger(finalNow)||finalNow<0)fail('invalid_evidence_clock');
 const latest=scopedIssuer(latestIssuerValue,p,c,finalNow);
 if(sha(JSON.stringify(current))!==sha(JSON.stringify(context))||sha(JSON.stringify(latest))!==sha(JSON.stringify(issuer)))fail('evidence_authority_changed');
 const expiresAt=Date.parse(c.sourceTimestamp)+localOwnerDirection.evidenceLifetimeMs;
 if(Date.parse(c.sourceTimestamp)>finalNow||expiresAt<=finalNow)fail('evidence_not_current');
 const checked=evaluateDirectionEvidence({ownerId:c.ownerId,projectKey:c.projectKey,candidateDigest:c.candidateDigest,policyDigest:c.policyDigest,
 baselineDigest:c.regressionDigest,issuer:c.issuer,sourceTimestamp:c.sourceTimestamp,outcome:c.outcome},
 {ownerId:p.ownerId,projectKey:p.projectKey,candidateDigest:candidateDigest(current.candidate),policyDigest:current.policy.digest,
 directionDigest:current.policy.directionDigest,acceptedBaselineDigest:current.baseline.digest,trustedIssuerIds:current.policy.trustedIssuerIds},finalNow);
 // Failed/not-run signed outcomes are preserved as such; they never become pass.
 if(!checked.allowed&&checked.reason!=='evidence_not_pass')fail(checked.reason);
 return Object.freeze({principal:Object.freeze(p),issuer:c.issuer,packetId:c.packetId,candidateDigest:c.candidateDigest,id:c.id,checkId:c.checkId,
 outcome:c.outcome,expiresAt,sourceTimestamp:c.sourceTimestamp,sourceRecordId:c.sourceRecordId,reportDigest:c.reportDigest,
 attestationDigest:sha(evidenceSigningBytes(c)),checkDefinitionDigest:c.checkDefinitionDigest,contextDigest:sha(JSON.stringify(current)),issuerApprovalVersion:latest.approvalVersion});
}

// Shared strict schemas for authenticated immutable record adapters; no route or grant.
export {claimsSchema as evidenceClaimsSchema,contextSchema as evidenceContextSchema};
