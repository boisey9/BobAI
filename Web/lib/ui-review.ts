import type { DashboardData, TaskView } from "./types";
export const reviewProjects = ["demo-manufacturing", "demo-planning"];
export { reviewEnabled } from "./ui-review-enabled";
const stamp = () => new Date().toISOString();
export function reviewProjectId(project: string) { return project === "demo-manufacturing" ? "22222222-2222-4222-8222-222222222222" : "44444444-4444-4444-8444-444444444444"; }
export function initialTasks(project: string): TaskView[] {
  const now=Date.now();
  return ["Review production handover instructions","Resolve missing inspection sign-off","Prepare next week's capacity review","Completed: document approval checklist"].map((title,i)=>({
    id:`11111111-1111-4111-8111-${String(i+1).padStart(12,"0")}`,projectId:reviewProjectId(project),version:1,title:project==='demo-planning'?title.replace('production','planning'):title,
    description:"Synthetic review task. No company or Production records are used.",status:i===3?'done':i===1?'blocked':'open',priority:i===0?'high':'normal',source:'web',dueAt:i===0?new Date(now-3600000).toISOString():null,
    createdAt:stamp(),updatedAt:stamp(),completedAt:i===3?stamp():null,editable:true,requiresApproval:false
  }));
}
export function reviewDashboard(project:string,scenario:string,tasks:TaskView[]):DashboardData {
  const now=stamp(); const failed=scenario==='offline'; const partial=scenario==='partial';
  const projects=reviewProjects.map(projectKey=>({projectKey,name:projectKey==='demo-manufacturing'?'Manufacturing demo':'Planning demo',description:'Synthetic project',repository:null,status:'active' as const,updatedAt:now}));
  const selected={...projects.find(p=>p.projectKey===project)!,id:reviewProjectId(project)};
  const activity=[{id:'demo-event',projectKey:project,projectName:selected.name,eventType:'context.retrieved',summary:'Synthetic context read for browser review.',source:'codex',details:{},createdAt:now}];
  return {
    status:failed?null:{status:'degraded',service:'bob-core',version:'0.2.0',provider:'example-provider',model:'Example configured cloud model',requestId:'synthetic-review',
      memory:{enabled:true,storage:'neon',capture:'explicit-only',retrieval:'automatic'},sharedContext:{enabled:true,version:'0.2',storage:'neon'},checks:{
        process:{status:'available',checkedAt:now},database:{status:'available',checkedAt:now},context:{status:partial?'stale':'available',checkedAt:now},
        provider:{status:scenario==='connected'?'available':scenario==='failed-inference'?'unavailable':'not_checked',checkedAt:scenario==='connected'||scenario==='failed-inference'?now:null},
        backup:{status:'not_configured',checkedAt:null,detail:'Backup monitoring is not configured. Protection and independent restore readiness are unverified.'},scheduler:{status:'not_configured',checkedAt:null,detail:'Scheduled delivery has not been enabled.'}}},
    context:failed?null:{revision:'synthetic-context-v1',partial,authority:{source:'bob-core',version:'0.2',rule:'Synthetic review only'},request:{projectKey:project,task:null,surface:'web'},project:selected,decisions:[],tasks:tasks.map(t=>({...t,metadata:{}})),recentEvents:activity,memories:[],generatedAt:now,
      sources:Object.fromEntries(['tasks','decisions','memories','events','handoffs'].map(s=>[s,{status:partial&&s==='memories'?'unavailable':'available',checkedAt:now,latestChangeAt:now,truncated:partial}]))},
    activity:failed?[]:activity,controlCenter:failed?null:{projects,selectedProject:selected,interfaces:[{id:'demo-codex',surface:'codex',enabled:true,scopes:['context:read','tasks:write'],createdAt:now}],legacyCredentialCount:0,approvals:[],releaseEvents:[],generatedAt:now,requestId:'synthetic-review',oauthConnections:{status:partial?'unavailable':'available',checkedAt:now,truncated:false,grants:partial?[]:[{id:'33333333-3333-4333-8333-333333333333',surface:'chatgpt',scopes:['mcp:context:read'],createdAt:now,revokedAt:null}]}},errors:failed?['Core status: unavailable.','Activity: unavailable.']:partial?['Some context sources are unavailable.']:[]
  };
}
// Ephemeral synthetic state only. Never imports Core clients, auth, database or providers.
const globalReview = globalThis as typeof globalThis & { bobUIReviewTasks?: Map<string,TaskView[]>; bobUIReviewReceipts?: Map<string,{fingerprint:string;response:unknown}> };
export const reviewTasks: Map<string,TaskView[]> = globalReview.bobUIReviewTasks ??= new Map();
export const reviewReceipts: Map<string,{fingerprint:string;response:unknown}> = globalReview.bobUIReviewReceipts ??= new Map();
export function tasksFor(project:string) { if(!reviewTasks.has(project))reviewTasks.set(project,initialTasks(project));return reviewTasks.get(project)!; }
