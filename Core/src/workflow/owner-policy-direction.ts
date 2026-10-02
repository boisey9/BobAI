import {createHash} from 'node:crypto';
import {z} from 'zod';
// Owner-approved local design direction, NOT a live accepted governance policy,
// grant, issuer designation, retention executor or hosted activation.
export const localOwnerDirection=Object.freeze({
 versionId:'bobcore-private-v1-direction-2026-10-01',approvalAuthority:'owner_only',
 proofLifetimeMs:60_000,evidenceLifetimeMs:86_400_000,decisionHistory:'permanent',evidenceHistory:'permanent',
 temporarySecurityDiagnosticsDays:7,encryptedBackupIntervalMs:86_400_000,
 encryptedBackupRetentionDays:30,recoveryTargetMs:7_200_000,
 decisionEvidence:'Sentinel_2ac517e28c208191af4c94f2f659031b',activationAllowed:false,
} as const);
export const localOwnerDirectionDigest=createHash('sha256').update(JSON.stringify(localOwnerDirection)).digest('hex');
const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const evidence=z.object({ownerId:id,projectKey:id,candidateDigest:digest,policyDigest:digest,
 baselineDigest:digest,issuer:id,sourceTimestamp:z.iso.datetime(),outcome:z.enum(['pass','fail','not_run'])}).strict();
// Host supplies this only from authenticated immutable policy/baseline/candidate
// records. No client authority, default issuer or synthetic policy fallback.
export type DirectionEvidenceContext={ownerId:string;projectKey:string;candidateDigest:string;policyDigest:string;
 directionDigest:string;acceptedBaselineDigest?:string;trustedIssuerIds?:readonly string[]};
export function evaluateDirectionEvidence(input:unknown,context?:DirectionEvidenceContext,now=Date.now()):
 {allowed:false;reason:string}|{allowed:true;expiresAt:number;directionDigest:string}{
 const deny=(reason:string)=>({allowed:false as const,reason});
 if(!context)return deny('authoritative_policy_unavailable');
 if(context.directionDigest!==localOwnerDirectionDigest)return deny('owner_direction_version_mismatch');
 if(!context.acceptedBaselineDigest)return deny('accepted_baseline_unconfigured');
 if(!context.trustedIssuerIds?.length)return deny('trusted_issuer_unconfigured');
 const parsed=evidence.safeParse(input);if(!parsed.success||!Number.isSafeInteger(now)||now<0)return deny('invalid_evidence');
 const value=parsed.data;
 if(value.ownerId!==context.ownerId||value.projectKey!==context.projectKey||value.projectKey==='personal')return deny('evidence_scope_mismatch');
 if(value.candidateDigest!==context.candidateDigest||value.policyDigest!==context.policyDigest||value.baselineDigest!==context.acceptedBaselineDigest)return deny('candidate_or_policy_changed');
 if(!context.trustedIssuerIds.includes(value.issuer))return deny('evidence_issuer_untrusted');
 if(value.outcome!=='pass')return deny('evidence_not_pass');
 const producedAt=Date.parse(value.sourceTimestamp),expiresAt=producedAt+localOwnerDirection.evidenceLifetimeMs;
 if(producedAt>now||expiresAt<=now)return deny('evidence_not_current');
 return {allowed:true,expiresAt,directionDigest:localOwnerDirectionDigest};
}
