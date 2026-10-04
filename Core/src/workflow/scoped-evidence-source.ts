import {createHash} from 'node:crypto';
import {z} from 'zod';
import {WorkflowError,type PacketPrincipal} from './packet-contract.js';
import {evidenceClaimsSchema,evidenceContextSchema,type ImmutableEvidenceAuthority} from './verified-evidence.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const kind=z.enum(['context','envelope','report','issuer','source','check']);
export type EvidenceRecordKind=z.infer<typeof kind>;
export interface AuthenticatedScopedEvidenceReader{
 authorized(principal:PacketPrincipal):Promise<boolean>;
 read(principal:PacketPrincipal,kind:EvidenceRecordKind,id:string):Promise<unknown>;
}
function deny(code:string):never{throw new WorkflowError(code,403);}
export function evidenceBodyDigest(value:unknown):string{
 const parsed=z.json().parse(value);
 const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable((v as Record<string,unknown>)[k])])):v;
 return createHash('sha256').update(JSON.stringify(stable(parsed))).digest('hex');
}
const record=z.object({ownerId:id,projectKey:id,kind,id,version:z.uuid(),bodyDigest:digest,body:z.json()}).strict();
const path=z.string().min(1).max(300).refine(s=>!s.startsWith('/')&&!s.includes('\\')&&!s.split('/').some(v=>v==='..'||v==='.'||v===''),'bounded repository path');
const files=z.array(z.object({path,sha256:digest}).strict()).min(1).max(2000).refine(v=>v.every((x,i)=>i===0||v[i-1]!.path<x.path),'unique sorted paths');
export const sourceIdentitySchema=z.object({version:z.literal(1),repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
 baseCommit:z.string().regex(/^[a-f0-9]{40}$/),patchDigest:digest,files}).strict();
export const checkDefinitionSchema=z.object({version:z.literal(1),id,reportType:z.literal('vitest-v1'),procedureDigest:digest,
 environmentDigest:digest,minimumCases:z.number().int().positive().max(100000),requiredCaseNames:z.array(z.string().min(1).max(1000)).min(1).max(1000)
 .refine(v=>new Set(v).size===v.length)}).strict();
const reportRecord=z.object({runId:id,environmentDigest:digest,bytesBase64:z.string().min(1).max(1400000)}).strict();
function reportOutcome(bytes:Buffer,definition:z.infer<typeof checkDefinitionSchema>):'pass'|'fail'|'not_run'{
 let raw:unknown;try{raw=JSON.parse(bytes.toString('utf8'));}catch{deny('evidence_report_invalid');}
 const assertion=z.object({fullName:z.string().max(1000),status:z.enum(['passed','failed','pending','todo','skipped'])});
 const summary=z.object({numTotalTests:z.number().int().nonnegative().max(100000),numPassedTests:z.number().int().nonnegative(),numFailedTests:z.number().int().nonnegative(),numPendingTests:z.number().int().nonnegative(),success:z.boolean(),testResults:z.array(z.object({assertionResults:z.array(assertion).max(100000)})).max(1000)}).safeParse(raw);
 if(!summary.success)deny('evidence_report_invalid');const s=summary.data,all=s.testResults.flatMap(v=>v.assertionResults);
 if(all.length!==s.numTotalTests||all.filter(v=>v.status==='passed').length!==s.numPassedTests||all.filter(v=>v.status==='failed').length!==s.numFailedTests||all.filter(v=>!['passed','failed'].includes(v.status)).length!==s.numPendingTests)deny('evidence_report_summary_mismatch');
 if(s.numFailedTests>0)return 'fail';
 if(s.numPendingTests>0||s.numTotalTests<definition.minimumCases||definition.requiredCaseNames.some(name=>all.filter(v=>v.fullName===name&&v.status==='passed').length!==1))return 'not_run';
 return s.success?'pass':'fail';
}
// No URLs/files/network fallback. Reader must authenticate and scope backend
// records; source identity truth/owner baseline acceptance remain host authority.
export function createScopedEvidenceAuthority(reader?:AuthenticatedScopedEvidenceReader):ImmutableEvidenceAuthority{
 async function read(p:PacketPrincipal,k:EvidenceRecordKind,key:string){
  if(!reader||!await reader.authorized(p))deny('authenticated_evidence_reader_unavailable');
  const parsed=record.safeParse(await reader.read(p,k,key));if(!parsed.success)deny('evidence_record_unavailable');const r=parsed.data;
  if(r.ownerId!==p.ownerId||r.projectKey!==p.projectKey||r.kind!==k||r.id!==key||r.bodyDigest!==evidenceBodyDigest(r.body))deny('evidence_record_scope_or_integrity_mismatch');return r.body;
 }
 return {
  async readContext(p,packetId){return read(p,'context',packetId);},
  async readIssuer(p,issuer,key){return read(p,'issuer',issuer+'_'+key);},
  async readEnvelope(p,sourceRecordId){
   const envelope=await read(p,'envelope',sourceRecordId),c=evidenceClaimsSchema.parse((envelope as {claims?:unknown}).claims);
   const context=evidenceContextSchema.parse(await read(p,'context',c.packetId));
   const source=sourceIdentitySchema.parse(await read(p,'source',c.candidateId));
   if(evidenceBodyDigest(source)!==c.sourceDigest||c.sourceDigest!==context.candidate.sourceDigest)deny('authenticated_source_identity_mismatch');
   const definition=checkDefinitionSchema.parse(await read(p,'check',c.checkId));
   if(evidenceBodyDigest(definition)!==c.checkDefinitionDigest||definition.id!==c.checkId)deny('authenticated_check_definition_mismatch');
   const report=reportRecord.parse(await read(p,'report',sourceRecordId));
   const bytes=Buffer.from(report.bytesBase64,'base64');if(bytes.toString('base64')!==report.bytesBase64||bytes.byteLength===0||bytes.byteLength>1048576)deny('evidence_report_invalid');
   if(report.runId!==c.runId||report.environmentDigest!==definition.environmentDigest||reportOutcome(bytes,definition)!==c.outcome)deny('evidence_report_execution_mismatch');
   return envelope;
  },
  async readReport(p,sourceRecordId,runId){const r=reportRecord.parse(await read(p,'report',sourceRecordId));if(r.runId!==runId)deny('evidence_report_execution_mismatch');const bytes=Buffer.from(r.bytesBase64,'base64');if(bytes.toString('base64')!==r.bytesBase64)deny('evidence_report_invalid');return bytes;},
 };
}
