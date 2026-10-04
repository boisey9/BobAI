import type {GovernedPacket,WorkflowWorkspace} from './governed-workflow';
export function packetStateLabel(packet:GovernedPacket){return packet.state==='draft'?'In preparation':packet.state==='ready'?'Ready for owner review':packet.state==='reviewed'?(packet.acceptanceCurrent?'Reviewed':'Review needs renewal'):'Released record';}
export function currentPacketSummary(data:WorkflowWorkspace,packet:GovernedPacket){return data.packetEvidence?.find(s=>s.packetId===packet.id&&s.candidateDigest===packet.candidateDigest);}
export function packetNextStep(data:WorkflowWorkspace,packet:GovernedPacket){
 const summary=currentPacketSummary(data,packet),accepted=data.records.some(r=>r.packetId===packet.id&&r.kind==='specification'&&r.content.digest===packet.specificationDigest);
 if(data.paused)return {title:'Work is paused',detail:'You can read the saved records. Transitions are currently blocked.',action:'none'};
 if(packet.state==='reviewed'&&!packet.acceptanceCurrent)return {title:'Renew this review',detail:'A prerequisite or policy changed. Preserve the historical review and prepare a new candidate with current evidence.',action:'none'};
 if(!packet.specification.trim())return {title:'Write the specification',detail:'Describe the outcome and acceptance criteria before implementation or review.',action:'edit'};
 if(!accepted)return {title:'Accept the specification',detail:'Review these exact criteria. Accepting them does not approve a candidate or release.',action:'specification'};
 if(!data.policyConfigured)return {title:'Verification policy is not accepted',detail:'The required checks and trusted issuer must be configured by the authorized operator. The UI cannot approve that policy.',action:'none'};
 if(!packet.candidateDigest||!packet.candidateId)return {title:'Awaiting implementation and evidence',detail:'The specification is saved. A trusted producer must attach an exact candidate and its check results; this page cannot invent them.',action:'none'};
 if(!summary||!summary.bindingCurrent||!summary.candidatePresent||!summary.evidenceComplete)return {title:'Resolve verification evidence',detail:'Inspect missing, expired, failed or unverified results below. All required checks must match this exact candidate before review.',action:'evidence'};
 if(packet.state==='draft')return {title:'Check readiness',detail:'Core will recheck specification, prerequisites and current evidence before moving this candidate to review.',action:'ready'};
 if(packet.state==='ready')return {title:'Review this exact candidate',detail:'Check the outcome, accepted criteria and current evidence. Your review does not authorize deployment.',action:'review'};
 return {title:'Review recorded',detail:'Resume the saved history or capture the next outcome. Release remains disabled.',action:'history'};
}
