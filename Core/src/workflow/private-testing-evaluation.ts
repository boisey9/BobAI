import {z} from 'zod';
import {workflowPrincipal,type PacketPrincipal} from './packet-contract.js';
import {localOwnerDirection} from './owner-policy-direction.js';
import {privateTestingRequirementsDigest,privateTestingCheckCatalogDigest,privateTestingDefinitions,requirementsDigest} from './private-testing-requirements.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const privateTestingContextSchema=z.object({principal:workflowPrincipal,requirementsDigest:sha,catalogDigest:sha,candidateId:id,candidateDigest:sha,environmentId:id,contextVersion:z.uuid(),implementationActorId:id,ownerActorId:id,
 validator:z.object({id,actorId:id,ownerId:id,projectKey:id,approvalVersion:z.uuid(),enabled:z.boolean(),revoked:z.boolean(),expiresAt:z.number().int().positive()}).strict().nullable(),
 independentReviewVersion:z.uuid().nullable(),ownerWalkthroughVersion:z.uuid().nullable(),candidateOwnerAccepted:z.boolean(),environmentAuthorized:z.boolean()}).strict();
const receiptSchema=z.object({ownerId:id,projectKey:id,candidateId:id,candidateDigest:sha,environmentId:id,requirementsDigest:sha,catalogDigest:sha,checkId:id,definitionDigest:sha,
 issuerId:id,actorId:id,issuerApprovalVersion:z.uuid(),method:z.enum(['automated','independent_review','owner_walkthrough']),reportType:z.string().min(1).max(80),
 sourceTimestamp:z.iso.datetime(),reportDigest:sha,provenanceVerified:z.literal(true),outcome:z.enum(['pass','fail','blocked','not_run','skipped']),
 failedCases:z.number().int().nonnegative(),skippedCases:z.number().int().nonnegative(),executedCases:z.number().int().nonnegative(),acceptanceVersion:z.uuid().nullable()}).strict();
export type PrivateTestingContext=z.infer<typeof privateTestingContextSchema>;
export type PrivateTestingReceipt=z.infer<typeof receiptSchema>;
// Server host contract, NEVER caller-supplied objects. verifyCheck must verify
// authenticated immutable reports, issuer/procedure/provenance and current
// manual acceptance records. No implementation, key or endpoint inferred here.
export interface PrivateTestingAuthority{
 readContext(principal:PacketPrincipal,candidateId:string,environmentId:string):Promise<unknown>;
 verifyCheck(principal:PacketPrincipal,candidateId:string,environmentId:string,checkId:string):Promise<unknown>;
}
export async function evaluatePrivateTestingRequirements(principal:unknown,request:unknown,authority?:PrivateTestingAuthority,clock=Date.now){
 const blocked=(reason:string)=>({eligible:false as const,reason,checks:[] as Array<{id:string;status:string}>,activationAllowed:false as const});
 const parsedP=workflowPrincipal.safeParse(principal),parsedReq=z.object({candidateId:id,environmentId:id}).strict().safeParse(request);
 if(!parsedP.success||!parsedReq.success)return blocked('invalid_requirements_request');const p=parsedP.data,r=parsedReq.data;
 if(p.projectKey==='personal')return blocked('private_testing_project_denied');if(!authority)return blocked('private_testing_authority_unconfigured');
 try{
  const first=privateTestingContextSchema.parse(await authority.readContext(p,r.candidateId,r.environmentId));
  if(JSON.stringify(first.principal)!==JSON.stringify(p)||first.candidateId!==r.candidateId||first.environmentId!==r.environmentId||first.ownerActorId!==p.actorId)return blocked('private_testing_scope_mismatch');
  if(first.requirementsDigest!==privateTestingRequirementsDigest||first.catalogDigest!==privateTestingCheckCatalogDigest)return blocked('requirements_or_catalog_changed');
  const records=new Map<string,unknown>();
  for(const check of privateTestingDefinitions){if(check.available)records.set(check.id,await authority.verifyCheck(p,r.candidateId,r.environmentId,check.id));}
  const current=privateTestingContextSchema.parse(await authority.readContext(p,r.candidateId,r.environmentId));
  if(requirementsDigest(current)!==requirementsDigest(first))return blocked('private_testing_authority_changed');
  // One final checked time for all validator/test expiry after asynchronous reads.
  const now=clock();if(!Number.isSafeInteger(now)||now<0)return blocked('invalid_requirements_clock');
  const validator=current.validator;
  if(!validator||!validator.enabled||validator.revoked||validator.expiresAt<=now||validator.ownerId!==p.ownerId||validator.projectKey!==p.projectKey||validator.actorId===current.implementationActorId)return blocked('independent_validator_unconfigured_or_invalid');
  const checks=privateTestingDefinitions.map(check=>{
   const status=(value:string)=>({id:check.id,status:value});
   if(!check.available)return status('procedure_unavailable');
   const raw=records.get(check.id);if(raw===null||raw===undefined)return status('missing');
   const result=receiptSchema.safeParse(raw);if(!result.success)return status('invalid_verified_receipt');const e=result.data;
   if(e.ownerId!==p.ownerId||e.projectKey!==p.projectKey||e.candidateId!==current.candidateId||e.candidateDigest!==current.candidateDigest||e.environmentId!==current.environmentId||e.requirementsDigest!==current.requirementsDigest||e.catalogDigest!==current.catalogDigest||e.checkId!==check.id||e.definitionDigest!==check.definitionDigest||e.method!==check.method||e.reportType!==check.reportType)return status('binding_mismatch');
   const source=Date.parse(e.sourceTimestamp);if(source>now)return status('future_receipt');
   if(e.outcome!=='pass')return status(e.outcome);if(e.failedCases||e.skippedCases)return status('failed_or_skipped_cases');
   if(check.method==='owner_walkthrough'){
    // No default approval validity/retention. Current authoritative acceptance
    // version/candidate binding is required; validator cannot stand in for owner.
    if(e.actorId!==current.ownerActorId||e.issuerId!=='owner-session-authority'||!current.ownerWalkthroughVersion||e.acceptanceVersion!==current.ownerWalkthroughVersion)return status('owner_acceptance_missing_or_wrong_actor');
   }else{
    if(e.actorId!==validator.actorId||e.issuerId!==validator.id||e.issuerApprovalVersion!==validator.approvalVersion)return status('validator_binding_mismatch');
    if(check.method==='automated'){if(e.executedCases<1)return status('check_not_executed');if(source+localOwnerDirection.evidenceLifetimeMs<=now)return status('expired');}
    else if(!current.independentReviewVersion||e.acceptanceVersion!==current.independentReviewVersion)return status('independent_review_not_current');
   }
   return status('pass');
  });
  const missing=checks.filter(check=>check.status!=='pass');
  const blockers=[...missing.map(check=>`${check.id}:${check.status}`),...(!current.candidateOwnerAccepted?['candidate_owner_acceptance_required']:[]),...(!current.environmentAuthorized?['environment_not_authorized']:[])];
  const reason=missing.length?'required_checks_incomplete':!current.candidateOwnerAccepted?'candidate_owner_acceptance_required':!current.environmentAuthorized?'environment_not_authorized':'requirements_satisfied';
  // Scope is pure prerequisite evaluation, not a state advance or deploy permit.
  return {blockers,eligible:reason==='requirements_satisfied',reason,checks,checkedAt:now,requirementsDigest:current.requirementsDigest,catalogDigest:current.catalogDigest,activationAllowed:false as const};
 }catch{return blocked('verified_requirements_records_unavailable');}
}
