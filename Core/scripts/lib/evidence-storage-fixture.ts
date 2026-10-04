// Synthetic fixture only: no accepted owner baseline, live issuer or producer.
import {generateKeyPairSync,sign,randomUUID,createHash} from 'node:crypto';
import {candidateDigest,type CandidateBinding} from '../../src/workflow/acceptance-contract.js';
import {localOwnerDirectionDigest} from '../../src/workflow/owner-policy-direction.js';
import {evidenceSigningBytes,type EvidenceClaims} from '../../src/workflow/verified-evidence.js';
import {evidenceBodyDigest,type AuthenticatedScopedEvidenceReader,type EvidenceRecordKind} from '../../src/workflow/scoped-evidence-source.js';
import type {PacketPrincipal} from '../../src/workflow/packet-contract.js';
export const fixturePrincipal={ownerId:'synthetic-owner',actorId:'synthetic-owner-actor',projectKey:'bobai'};
export const fixtureSource={version:1,repository:'synthetic/bobcore',baseCommit:'a'.repeat(40),patchDigest:'b'.repeat(64),files:[{path:'Core/synthetic.ts',sha256:'c'.repeat(64)}]};
export const fixtureDefinition={version:1,id:'durability',reportType:'vitest-v1',procedureDigest:'e'.repeat(64),environmentDigest:'f'.repeat(64),minimumCases:1,requiredCaseNames:['synthetic durable case']};
export function syntheticEvidence(candidate?:CandidateBinding,policyDigest='a'.repeat(64)){
 const p=fixturePrincipal,now=Date.now(),keys=generateKeyPairSync('ed25519');
 const c=candidate??{id:'synthetic-candidate',ownerId:p.ownerId,projectKey:p.projectKey,specificationDigest:'a'.repeat(64),sourceDigest:evidenceBodyDigest(fixtureSource),configurationDigest:'b'.repeat(64),regressionDigest:'d'.repeat(64),policyDigest,predecessors:[]};
 const report=Buffer.from(JSON.stringify({numTotalTests:1,numPassedTests:1,numFailedTests:0,numPendingTests:0,success:true,testResults:[{assertionResults:[{fullName:'synthetic durable case',status:'passed'}]}]}));
 const claims:EvidenceClaims={version:1,id:randomUUID(),ownerId:p.ownerId,projectKey:p.projectKey,packetId:'evidence-packet',candidateId:c.id,candidateDigest:candidateDigest(c),specificationDigest:c.specificationDigest,sourceDigest:c.sourceDigest,configurationDigest:c.configurationDigest,regressionDigest:c.regressionDigest,policyDigest:c.policyDigest,directionDigest:localOwnerDirectionDigest,issuer:'synthetic-ci',keyId:'synthetic-key',checkId:'durability',checkDefinitionDigest:evidenceBodyDigest(fixtureDefinition),runId:randomUUID(),sourceRecordId:randomUUID(),reportDigest:createHash('sha256').update(report).digest('hex'),sourceTimestamp:new Date(now-1000).toISOString(),outcome:'pass'};
 const context={principal:p,importerAuthorized:true,authorizationVersion:randomUUID(),candidate:c,policy:{digest:c.policyDigest,directionDigest:localOwnerDirectionDigest,requiredChecks:[{id:'durability',definitionDigest:claims.checkDefinitionDigest}],trustedIssuerIds:['synthetic-ci']},baseline:{id:'explicit-synthetic-baseline',digest:c.regressionDigest,acceptedByOwner:true}};
 const issuer={id:claims.issuer,keyId:claims.keyId,ownerId:p.ownerId,projectKey:p.projectKey,approvalVersion:randomUUID(),enabled:true,revoked:false,algorithm:'ed25519',publicKeyPem:keys.publicKey.export({type:'spki',format:'pem'}).toString(),checks:[{id:'durability',definitionDigest:claims.checkDefinitionDigest}],expiresAt:now+86400000};
 const records=new Map<string,unknown>();
 const wrap=(kind:EvidenceRecordKind,id:string,body:unknown)=>({ownerId:p.ownerId,projectKey:p.projectKey,kind,id,version:randomUUID(),bodyDigest:evidenceBodyDigest(body),body});
 function put(kind:EvidenceRecordKind,id:string,body:unknown){records.set(kind+':'+id,wrap(kind,id,body));}
 function resign(){put('envelope',claims.sourceRecordId,{claims:{...claims},signature:sign(null,evidenceSigningBytes(claims),keys.privateKey).toString('base64url')});}
 put('context',claims.packetId,context);put('source',c.id,fixtureSource);put('check','durability',fixtureDefinition);
 put('report',claims.sourceRecordId,{runId:claims.runId,environmentDigest:fixtureDefinition.environmentDigest,bytesBase64:report.toString('base64')});put('issuer',claims.issuer+'_'+claims.keyId,issuer);resign();
 const reader:AuthenticatedScopedEvidenceReader={authorized:async (v:PacketPrincipal)=>JSON.stringify(v)===JSON.stringify(p),read:async(_p,k,id)=>records.get(k+':'+id)};
 return {p,c,claims,context,issuer,report,records,reader,wrap,put,resign};
}
