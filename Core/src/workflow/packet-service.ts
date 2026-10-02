import { randomUUID } from "node:crypto";
import { z } from "zod";
import { candidateDigest, candidateSchema, evaluateAcceptance, type CandidateBinding } from "./acceptance-contract.js";
import { packetCommand, workflowPrincipal, workflowHash, workflowDigest, workflowId, WorkflowError,
  type PacketPrincipal, type WorkPacket, type WorkflowRecord } from "./packet-contract.js";
import { PostgresPacketStore, type WorkflowSnapshot } from "./postgres-store.js";

import {projectEvidence,evidenceEffectiveExpiry} from './evidence-projection.js';

type Result = { packet: WorkPacket; idempotent: boolean; currentPacket: WorkPacket };
const evidenceInput = z.object({ id: workflowId, packetId: workflowId, candidateDigest: workflowDigest,
  checkId: workflowId, outcome: z.enum(["pass","fail","not_run"]),
  expiresAt: z.number().int().positive(), sourceTimestamp: z.iso.datetime(), sourceRecordId: workflowId }).strict();
function fail(code: string): never { throw new WorkflowError(code); }
function candidateFor(s: WorkflowSnapshot, packet: WorkPacket): CandidateBinding {
  const record = s.records.find(r => r.kind === "candidate" && r.id === packet.candidateId && r.packetId === packet.id);
  if (!record) fail("candidate_required");
  return candidateSchema.parse(record.content);
}
// Read projections never rewrite immutable approvals or historical packet state.
// Reviewed prerequisites remain usable only while their entire bound dependency chain is current.
function acceptedApproval(s:WorkflowSnapshot, packet:WorkPacket):WorkflowRecord|undefined {
  const matches=s.records.filter(r=>r.kind==="approval"&&r.packetId===packet.id&&
    r.content.candidateDigest===packet.candidateDigest&&r.content.decision==="approve"&&
    r.content.consumed===true&&r.content.revoked===false);
  return matches.length===1?matches[0]:undefined;
}
function reviewedCurrent(s:WorkflowSnapshot,packet:WorkPacket,visiting=new Set<string>(),memo=new Map<string,boolean>()):boolean {
  if(memo.has(packet.id))return memo.get(packet.id)!;
  if(packet.state!=="reviewed"||!packet.candidateDigest||visiting.has(packet.id)||!acceptedApproval(s,packet))return false;
  try {
    const c=candidateFor(s,packet);
    if(candidateDigest(c)!==packet.candidateDigest||c.policyDigest!==s.policy?.digest||
      c.specificationDigest!==packet.specificationDigest||!specAccepted(s,packet))return false;
    const valid=predecessors(s,packet,c,new Set([...visiting,packet.id]),memo);memo.set(packet.id,valid);return valid;
  }catch{return false;}
}
function predecessors(s:WorkflowSnapshot,packet:WorkPacket,candidate:CandidateBinding,visiting=new Set<string>(),memo=new Map<string,boolean>()):boolean {
  const ids=[...packet.predecessors].sort();
  return ids.length===candidate.predecessors.length&&candidate.predecessors.every((binding,index)=>{
    const prior=s.packets.find(p=>p.id===binding.packetId);
    return binding.packetId===ids[index]&&!!prior&&prior.candidateDigest===binding.candidateDigest&&
      acceptedApproval(s,prior)?.id===binding.approvalId&&reviewedCurrent(s,prior,visiting,memo);
  });
}
function projectPacket(s:WorkflowSnapshot,packet:WorkPacket) {
  return {...packet,acceptanceCurrent:reviewedCurrent(s,packet)};
}
function specAccepted(s: WorkflowSnapshot, packet: WorkPacket): boolean {
  return s.records.some(r => r.kind === "specification" && r.packetId === packet.id && r.content.digest === packet.specificationDigest);
}
export class GovernedPacketService {
  constructor(private readonly store: PostgresPacketStore) {}
  // The host supplies explicit authenticated project principals; never enumerate
  // owner-wide grants or infer authority from a browser project key.
  async directory(principals:unknown) {
    const scoped=z.array(workflowPrincipal).max(100).parse(principals);
    if(scoped.some(p=>p.ownerId!==scoped[0]?.ownerId||p.actorId!==scoped[0]?.actorId)||new Set(scoped.map(p=>p.projectKey)).size!==scoped.length)fail("invalid_directory_scope");
    const projects:Record<string,unknown>[]=[];
    for(const p of scoped){try{await this.store.scoped(p,"read",async s=>{
      const result=await s.query("SELECT project_key,name,description,status FROM public.bob_projects WHERE owner_id=$1 AND project_key=$2 AND deleted_at IS NULL AND status='active'",[p.ownerId,p.projectKey]);
      if(result.rows[0])projects.push(result.rows[0]);
    });}catch(e){if(!(e instanceof WorkflowError&&e.code==="workflow_access_denied"))throw e;}}
    return {projects};
  }
  private async receipt(s:WorkflowSnapshot,p:PacketPrincipal,id:string) {
    const result=await s.query("SELECT actor_id,result FROM bob_workflow.receipts WHERE owner_id=$1 AND project_key=$2 AND operation_id=$3",[p.ownerId,p.projectKey,id]);
    const receipt=result.rows[0];if(!receipt)return {outcome:"not_found" as const,operationId:id};
    if(receipt.actor_id!==p.actorId)throw new WorkflowError("workflow_access_denied",403);
    const packet=receipt.result as WorkPacket,current=s.packets.find(v=>v.id===packet.id);if(!current)fail("receipt_packet_missing");
    return {outcome:"committed" as const,operationId:id,packet,currentPacket:projectPacket(s,current)};
  }
  async reconcile(principal:unknown,operationId:unknown) {
    const p=workflowPrincipal.parse(principal),id=workflowId.parse(operationId);
    return this.store.scoped(p,"read",s=>this.receipt(s,p,id));
  }
  async workspace(principal:unknown,operationId?:unknown) {
    const p=workflowPrincipal.parse(principal),id=operationId===undefined?undefined:workflowId.parse(operationId);
    return this.store.scoped(p,"read",async s=>{
      const recovery=id===undefined?null:await this.receipt(s,p,id);
      const project=await s.query("SELECT id::text,project_key,name,description,status FROM public.bob_projects WHERE owner_id=$1 AND project_key=$2 AND deleted_at IS NULL",[p.ownerId,p.projectKey]);
      if (!project.rows[0]) throw new WorkflowError("project_not_found",404);
      const tasks=await s.query(`SELECT t.id::text,t.title,t.description,t.status,t.priority,t.updated_at FROM public.bob_tasks t
        JOIN public.bob_projects p ON p.id=t.project_id AND p.owner_id=t.owner_id
        WHERE t.owner_id=$1 AND p.project_key=$2 AND p.deleted_at IS NULL ORDER BY t.updated_at DESC,t.id LIMIT 101`,[p.ownerId,p.projectKey]);
      const history=await s.query(`SELECT e.id::text,e.event_type,e.summary,e.source,e.created_at FROM public.bob_events e
        JOIN public.bob_projects p ON p.id=e.project_id AND p.owner_id=e.owner_id
        WHERE e.owner_id=$1 AND p.project_key=$2 AND p.deleted_at IS NULL ORDER BY e.created_at DESC,e.id LIMIT 101`,[p.ownerId,p.projectKey]);
      const workflowHistory=await s.query(`SELECT sequence::text,packet_id,action,state,version,created_at FROM bob_workflow.history h
        WHERE owner_id=$1 AND project_key=$2 ORDER BY h.sequence DESC LIMIT 101`,[p.ownerId,p.projectKey]);
      return {recovery,project:project.rows[0],tasks:tasks.rows.slice(0,100),history:history.rows.slice(0,100),
        tasksTruncated:tasks.rows.length>100,historyTruncated:history.rows.length>100,
        workflowHistory:workflowHistory.rows.slice(0,100),workflowHistoryTruncated:workflowHistory.rows.length>100,
        packets:s.packets.map(packet=>projectPacket(s,packet)),packetEvidence:s.packets.map(packet=>({packetId:packet.id,candidateDigest:packet.candidateDigest,...projectEvidence(s,p,packet)})),records:s.records,paused:s.paused,policyConfigured:!!s.policy,releaseEnabled:false as const};
    });
  }
  async list(principal: unknown) {
    const p = workflowPrincipal.parse(principal);
    return this.store.scoped(p,"read",async s => ({ projectKey:p.projectKey, packets:s.packets.map(packet=>projectPacket(s,packet)),
      records:s.records, paused:s.paused, policyConfigured:!!s.policy, releaseEnabled:false as const }));
  }
  async history(principal: unknown, before?: number) {
    const p=workflowPrincipal.parse(principal);
    if (before !== undefined && (!Number.isSafeInteger(before) || before<1)) throw new WorkflowError("invalid_history_cursor",400);
    return this.store.scoped(p,"read",async s => {
      const result=await s.query(`SELECT sequence::text,packet_id,operation_id,actor_id,action,state,version,created_at
        FROM bob_workflow.history h WHERE owner_id=$1 AND project_key=$2 AND ($3::bigint IS NULL OR sequence<$3::bigint)
        ORDER BY h.sequence DESC LIMIT 101`,[p.ownerId,p.projectKey,before??null]);
      const items=result.rows.slice(0,100);
      return {items, nextBefore:result.rows.length>100?Number(items.at(-1)?.sequence):null};
    });
  }
  async command(principal: unknown, input: unknown): Promise<Result> {
    const p=workflowPrincipal.parse(principal);
    const parsed=packetCommand.safeParse(input);
    if (!parsed.success) throw new WorkflowError("invalid_workflow_command",400);
    const c=parsed.data;
    if (c.action==="release") throw new WorkflowError("release_policy_not_approved",403);
    const permission=c.action==="review"||c.action==="accept_specification"?"review":"edit";
    return this.store.scoped(p,permission,async s => {
      const fingerprint=workflowHash([p.actorId,c]);
      const existing=await s.query("SELECT actor_id,fingerprint,result FROM bob_workflow.receipts WHERE owner_id=$1 AND project_key=$2 AND operation_id=$3",[p.ownerId,p.projectKey,c.operationId]);
      const receipt=existing.rows[0];
      let consumedApprovalId:string|null=null;
      let packet=s.packets.find(v=>v.id===c.packetId);
      if (receipt) {
        if (receipt.actor_id!==p.actorId || receipt.fingerprint!==fingerprint) fail("operation_id_conflict");
        if (!packet) fail("receipt_packet_missing");
        return {packet:receipt.result as WorkPacket,currentPacket:projectPacket(s,packet),idempotent:true};
      }
      if (c.action==="capture") {
        if (packet || c.expectedVersion!==0) fail("packet_already_exists_or_version_conflict");
        if (s.packets.length>=500) fail("workflow_packet_capacity");
        if (new Set(c.predecessors).size!==c.predecessors.length || c.predecessors.includes(c.packetId) ||
          c.predecessors.some(id=>!s.packets.some(v=>v.id===id))) fail("invalid_predecessor_scope");
        packet={id:c.packetId,title:c.title,specification:c.specification,specificationDigest:workflowHash(c.specification),
          predecessors:c.predecessors,state:"draft",version:1,candidateId:null,candidateDigest:null,updatedAt:new Date(s.now).toISOString()};
        await s.savePacket(packet);
      } else {
        if (!packet) throw new WorkflowError("packet_not_found",404);
        if (packet.version!==c.expectedVersion) fail("packet_version_conflict");
        if (packet.state==="released") fail("released_packet_immutable");
        packet={...packet,version:packet.version+1,updatedAt:new Date(s.now).toISOString()};
        if (c.action==="revise") {
          packet.specification=c.specification;packet.specificationDigest=workflowHash(c.specification);
          packet.state="draft";packet.candidateId=null;packet.candidateDigest=null;
        } else if (c.action==="accept_specification") {
          if (!packet.specification || c.specificationDigest!==packet.specificationDigest) fail("specification_changed_or_missing");
          await this.record(s,packet,"specification",{digest:packet.specificationDigest,actorId:p.actorId});
        } else if (c.action==="candidate") {
          if (!s.policy) fail("accepted_policy_and_regression_required");
          if (!specAccepted(s,packet)) fail("specification_required");
          const bindings=[...packet.predecessors].sort().map(id=>{
            const prior=s.packets.find(v=>v.id===id);
            if(!prior||!reviewedCurrent(s,prior))fail("predecessor_required");
            return {packetId:id,candidateDigest:prior.candidateDigest!,approvalId:acceptedApproval(s,prior)!.id};
          });
          const candidate:CandidateBinding={id:randomUUID(),ownerId:p.ownerId,projectKey:p.projectKey,
            specificationDigest:packet.specificationDigest,sourceDigest:c.sourceDigest,configurationDigest:c.configurationDigest,
            regressionDigest:s.policy.regressionDigest,policyDigest:s.policy.digest,predecessors:bindings};
          await this.record(s,packet,"candidate",candidate,candidate.id);
          packet.candidateId=candidate.id;packet.candidateDigest=candidateDigest(candidate);packet.state="draft";
        } else {
          if (!packet.candidateDigest || packet.candidateDigest!==c.candidateDigest) fail("candidate_changed");
          if (!s.policy) fail("accepted_policy_and_regression_required");
          if (c.action==="ready") {
            if (packet.state!=="draft") fail("invalid_state_transition");
            await this.verify(s,p,packet);
            packet.state="ready";
          } else if (c.action==="review") {
            if (packet.state!=="ready") fail("owner_review_requires_ready");
            if (c.decision==="approve") await this.verify(s,p,packet);
            const approval=await this.record(s,packet,"approval",{ownerId:p.ownerId,projectKey:p.projectKey,
              actorId:p.actorId,candidateDigest:packet.candidateDigest,decision:c.decision,
              expiresAt:s.now+s.policy.approvalLifetimeMs,revoked:false,consumed:false});
            consumedApprovalId=approval.id;
            if (c.decision==="approve") {
              const result=await evaluateAcceptance(p,{projectKey:p.projectKey,candidateId:packet.candidateId,approvalId:approval.id},
                this.authority(s,p,packet,approval),s.now);
              if (!result.allowed) fail(result.reason);
              // Approval is consumed by this immutable operation receipt in the same transaction.
              packet.state="reviewed";
            } else packet.state="draft";
          }
        }
        await s.savePacket(packet);
      }
      await s.query("INSERT INTO bob_workflow.receipts(owner_id,project_key,operation_id,actor_id,fingerprint,result,approval_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
        [p.ownerId,p.projectKey,c.operationId,p.actorId,fingerprint,JSON.stringify(packet),consumedApprovalId]);
      await s.query("INSERT INTO bob_workflow.history(owner_id,project_key,packet_id,operation_id,actor_id,action,state,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [p.ownerId,p.projectKey,packet.id,c.operationId,p.actorId,c.action,packet.state,packet.version]);
      if(consumedApprovalId){const record=s.records.find(r=>r.id===consumedApprovalId);if(record)record.content={...record.content,consumed:true};}
      return {packet,currentPacket:projectPacket(s,packet),idempotent:false};
    });
  }
  // Trusted producer adapter only. No public/browser evidence write route exists.
  // issuer is authenticated separately and must never be copied from payload.
  async recordEvidence(principal: unknown, authenticatedIssuer: string, input: unknown) {
    const p=workflowPrincipal.parse(principal), e=evidenceInput.parse(input);
    return this.store.scoped(p,"edit",async s=>{
      if (!s.policy?.trustedIssuers.includes(authenticatedIssuer)) throw new WorkflowError("evidence_issuer_untrusted",403);
      const packet=s.packets.find(v=>v.id===e.packetId);
      if (!packet?.candidateDigest || packet.candidateDigest!==e.candidateDigest) fail("candidate_changed");
      if (e.expiresAt<=s.now || Date.parse(e.sourceTimestamp)>s.now) fail("invalid_evidence_time");
      const content={id:e.checkId,ownerId:p.ownerId,projectKey:p.projectKey,candidateDigest:e.candidateDigest,
        issuer:authenticatedIssuer,outcome:e.outcome,expiresAt:e.expiresAt,sourceRecordId:e.sourceRecordId,sourceTimestamp:e.sourceTimestamp};
      const existing=s.records.find(r=>r.id===e.id);
      if (existing) {if (existing.kind!=="evidence"||existing.packetId!==packet.id||workflowHash(existing.content)!==workflowHash(content)) fail("immutable_evidence_conflict");return existing;}
      // An exact candidate/check has one immutable outcome. A failed check requires a new candidate.
      if (s.records.some(r=>r.kind==="evidence"&&r.packetId===packet.id&&r.content.candidateDigest===e.candidateDigest&&r.content.id===e.checkId)) fail("evidence_check_already_recorded");
      return this.record(s,packet,"evidence",content,e.id);
    });
  }
  private async record(s:WorkflowSnapshot,packet:WorkPacket,kind:WorkflowRecord["kind"],content:object,id:string=randomUUID()) {
    const record:WorkflowRecord={id,packetId:packet.id,kind,content:content as Record<string,unknown>,createdAt:new Date(s.now).toISOString()};
    await s.insertRecord(record);return record;
  }
  private authority(s:WorkflowSnapshot,p:PacketPrincipal,packet:WorkPacket,approval:WorkflowRecord) {
    return {ownerAuthorized:async()=>true,currentCandidate:async()=>candidateFor(s,packet),policy:async()=>s.policy?{
      digest:s.policy.digest,requiredChecks:s.policy.requiredChecks,trustedIssuers:s.policy.trustedIssuers,accepted:true}:null,
      specificationAccepted:async()=>specAccepted(s,packet),predecessorsAccepted:async(_principal:PacketPrincipal,candidate:CandidateBinding)=>predecessors(s,packet,candidate),
      regressionAccepted:async(_principal:PacketPrincipal,digest:string)=>digest===s.policy?.regressionDigest,
      checks:async()=>s.records.filter(r=>r.kind==="evidence"&&r.packetId===packet.id&&r.content.candidateDigest===packet.candidateDigest)
        .map(r=>{const {sourceRecordId,sourceTimestamp,...check}=r.content;return {...check,expiresAt:evidenceEffectiveExpiry({expiresAt:check.expiresAt,sourceTimestamp},s.now)};}),
      approval:async()=>({id:approval.id,...approval.content})};
  }
  private async verify(s:WorkflowSnapshot,p:PacketPrincipal,packet:WorkPacket) {
    // A non-persisted approval checks prerequisites only; durable review adds a
    // separately owner-authorized immutable approval inside the same transaction.
    const approval:WorkflowRecord={id:"prerequisite-check",packetId:packet.id,kind:"approval",createdAt:new Date(s.now).toISOString(),
      content:{ownerId:p.ownerId,projectKey:p.projectKey,actorId:p.actorId,candidateDigest:packet.candidateDigest,
        decision:"approve",expiresAt:s.now+1,revoked:false,consumed:false}};
    const result=await evaluateAcceptance(p,{projectKey:p.projectKey,candidateId:packet.candidateId,approvalId:approval.id},this.authority(s,p,packet,approval),s.now);
    if (!result.allowed) fail(result.reason);
  }
}
