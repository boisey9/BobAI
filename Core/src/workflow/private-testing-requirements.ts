import {createHash} from 'node:crypto';
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
export const requirementsDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Exact approval summary, not all unseen PB details or acceptance of an artifact.
export const privateTestingRequirements=freeze({
 versionId:'bobcore-private-testing-requirements-v1',scope:'core-web-private-testing',
 requirementsApproved:true,candidateAccepted:false,liveSetupApproved:false,
 approval:{proposalMessage:'Sentinel_49eac4f88b048191b7d8a41180162314',ownerMessage:'Sentinel_6b322d5e11888191be6f3fb99fdc5eec'},
 statements:[
  'Preservation of existing memory, project isolation, task compatibility, audit history and approved UI behavior',
  'Passing code, database, login/browser, memory-continuity and encrypted-recovery tests',
  'Independent security review and owner final walkthrough',
  'A separately designated validator certifies test results; final approval remains with the owner',
  'Missing or skipped required checks block readiness',
 ],
 requirements:[
  {id:'preserve-memory',description:'Preserve existing memory'},
  {id:'preserve-isolation',description:'Preserve existing project isolation'},
  {id:'preserve-tasks',description:'Preserve task compatibility'},
  {id:'preserve-audit',description:'Preserve audit history'},
  {id:'preserve-ui',description:'Preserve approved UI behavior'},
  {id:'passing-code',description:'Passing code tests'},
  {id:'passing-database',description:'Passing database tests'},
  {id:'passing-login-browser',description:'Passing login/browser tests'},
  {id:'passing-memory-continuity',description:'Passing memory-continuity tests'},
  {id:'passing-encrypted-recovery',description:'Passing encrypted-recovery tests'},
  {id:'independent-security-review',description:'Independent security review'},
  {id:'owner-walkthrough',description:'Owner final walkthrough'},
  {id:'independent-validator',description:'Separately designated validator certifies test results'},
  {id:'owner-final-approval',description:'Final approval remains with owner'},
  {id:'no-missing-skipped-checks',description:'Missing or skipped required checks block readiness'},
 ],
 validator:{approach:'separately-designated-independent-validator',identity:null,publicKey:null,access:null},
 protectedPBDetailsAccepted:false,
} as const);
export const privateTestingRequirementsDigest=requirementsDigest(privateTestingRequirements);
const r=(...ids:string[])=>ids;
// Declarative procedures, never executable instructions supplied by a report.
// Exact procedure definitions are local implementation mapping, not approval of
// every unseen PB description. Future changes create a new catalog digest.
export const privateTestingCheckCatalog=freeze({versionId:'bobcore-private-testing-checks-v3',requirementsDigest:privateTestingRequirementsDigest,
 checks:[
  {id:'core-types-build',requirements:r('passing-code'),method:'automated',reportType:'process-results-v1',available:true,
   procedure:{cwd:'Core',commands:[['node','node_modules/typescript/bin/tsc','--noEmit'],['node','node_modules/typescript/bin/tsc']],criteria:['Both commands run on exact candidate and exit0'],limitations:['Compilation does not prove runtime behavior']}},
  {id:'core-regression',requirements:r('passing-code','preserve-memory','preserve-isolation','preserve-tasks','preserve-audit'),method:'automated',reportType:'vitest-v1',available:true,
   procedure:{cwd:'Core',commands:[['node','node_modules/vitest/vitest.mjs','run','--exclude','**/dist/**','--exclude','scripts/**','--exclude','tests/workflow-postgres.test.ts','--exclude','tests/workflow-recovery.test.mjs','--exclude','tests/workflow-evidence-storage.test.ts','--exclude','tests/private-record-postgres.test.ts','--reporter=json']],criteria:['Nonempty source-only suite, no failed/pending/skipped cases','Include all selected Core Vitest test files; separately execute excluded database fixtures and owned child node:test lifecycle suite through memory drill'],limitations:['Mocks/unit memory tests are not actual durable memory acceptance']}},
  {id:'web-types-build',requirements:r('passing-code','preserve-ui'),method:'automated',reportType:'process-results-v1',available:true,
   procedure:{cwd:'Web',commands:[['node','node_modules/typescript/bin/tsc','--noEmit'],['node','node_modules/next/dist/bin/next','build','--webpack']],criteria:['Both commands run on exact candidate and exit0'],limitations:['Build alone does not prove rendered UX']}},
  {id:'governed-postgres',requirements:r('passing-database','preserve-isolation','preserve-tasks','preserve-audit'),method:'automated',reportType:'postgres-runner-v2',available:true,
   procedure:{cwd:'Core',runner:'scripts/run-isolated-workflow-postgres.mjs',arguments:'explicit installed --pg-bin path; owned new synthetic fixture only',criteria:['All workflow/storage/private-records/recovery cases execute with0failed/0pending','Include transaction rollback, concurrent/idempotent/replay, stale/future/expired and wrong-project/revoked tests'],limitations:['Synthetic roles and fixtures, no production permissions acceptance']}},
  {id:'actual-auth-web',requirements:r('passing-login-browser','preserve-isolation','preserve-ui'),method:'automated',reportType:'playwright-runner-v1',available:true,
   procedure:{cwd:'Core',runner:'scripts/run-isolated-workflow-browser.mjs',arguments:'explicit stopped owned completed --fixture-root only',criteria:['Actual Better Auth/Core/Web/PG rendered suite,0unexpected/skipped/flaky','Owner session/origin/CSRF/project/recovery/blocked-evidence/mobile/keyboard cases run'],limitations:['Synthetic account/email verification, no hosted/passkey/provider acceptance']}},
  {id:'memory-continuity',requirements:r('passing-memory-continuity','preserve-memory','preserve-isolation'),method:'automated',reportType:'memory-continuity-v1',available:true,
   procedure:{cwd:'Core',runner:'scripts/run-isolated-memory-continuity.mjs',arguments:'explicit installed --pg-bin path; owned new synthetic fixture only',cleanupRunner:'scripts/check-local-memory-cleanup.mjs',cleanupArguments:'explicit already-stopped marker-owned root only',review:'task-3/REVIEW-MEMORY-CONTINUITY-P2-REREVIEW.md',criteria:['All fourteen reviewed continuity groups execute and pass','Cold database/process exact-ID comparison passes','Private TCP-off/socket/fsync and final stopped resources observed','Eight child lifecycle and three actual PG adverse-cleanup cases pass'],limitations:['Synthetic admin/local Neon transport; no hosted RLS/AI obedience/power-loss proof']}},
  {id:'encrypted-recovery',requirements:r('passing-encrypted-recovery','preserve-memory','preserve-audit','preserve-isolation'),method:'automated',reportType:'recovery-runner-v1',available:true,
   procedure:{cwd:'Core',runner:'scripts/run-isolated-workflow-postgres.mjs',arguments:'same owned synthetic run; recovery suite follows stored evidence',criteria:['Actual encrypted full snapshot/restore and corruption rejection','Compare all included content and evidence/replay metadata','Quarantine restored sessions/grants/proofs without rewriting history'],limitations:['Does not prove production custody or full hosted-service recovery target']}},
  {id:'independent-security-review',requirements:r('independent-security-review'),method:'independent_review',reportType:'current-review-record-v1',available:true,
   procedure:{cwd:'review',commands:[],criteria:['Reviewer distinct from implementation actor','Exact candidate/requirements/catalog and evidence hashes inspected','Blocking findings resolved; rerun/inspection limits explicit'],limitations:['Review record is not automatically a registered issuer or owner acceptance']}},
  {id:'owner-walkthrough',requirements:r('owner-walkthrough','preserve-ui','owner-final-approval'),method:'owner_walkthrough',reportType:'current-owner-record-v1',available:true,
   procedure:{cwd:'Web',commands:[],criteria:['Verified owner walkthrough of exact candidate/environment','Project selection, capture/resume/spec/evidence/review and blocked/recovery paths','Current candidate-bound owner decision; visual praise alone is insufficient'],limitations:['Owner record is separate from validator certification; no approval lifetime inferred']}},
 ],
 globalRequirements:r('independent-validator','no-missing-skipped-checks'),everyCheckRequired:true,missingOrSkippedBlocks:true,validatorIdentity:null,activationAllowed:false,
} as const);
export const privateTestingCheckCatalogDigest=requirementsDigest(privateTestingCheckCatalog);
export const privateTestingDefinitions=Object.freeze(privateTestingCheckCatalog.checks.map(check=>Object.freeze({...check,definitionDigest:requirementsDigest(check)})));
