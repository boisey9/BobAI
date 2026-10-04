import {z} from 'zod';
if(typeof window!=='undefined')throw Error('server_host_only');
const origin=z.string().refine(v=>{try{const u=new URL(v);return u.origin===v&&u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}});
export const hostedTargetSchema=z.object({kind:z.literal('hosted-wss'),host:z.string().regex(/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/).refine(h=>!h.includes('-pooler.')&&!h.includes('..')),database:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/),role:z.string().regex(/^[a-z][a-z0-9_]{0,62}$/)}).strict();
export type HostedTarget=z.infer<typeof hostedTargetSchema>;
export const hostedProfileSchema=z.object({version:z.literal(1),mode:z.literal('private-test'),webOrigin:origin,coreOrigin:origin,issuer:origin,owner:z.object({ownerId:z.string().min(1).max(100),userId:z.string().min(1).max(100),actorId:z.string().min(1).max(100),email:z.email()}).strict(),workflow:hostedTargetSchema,registry:hostedTargetSchema,auth:hostedTargetSchema}).strict().superRefine((p,c)=>{if(p.webOrigin!==p.issuer||p.coreOrigin===p.webOrigin||p.workflow.host!==p.registry.host||p.workflow.database!==p.registry.database||new Set([p.workflow.role,p.registry.role,p.auth.role]).size!==3)c.addIssue({code:'custom',message:'isolated_profile_binding_required'});});
export type HostedProfile=z.infer<typeof hostedProfileSchema>;
export function hostedProfile(env:Record<string,string|undefined>=process.env,surface:'web'|'core'='web'):HostedProfile|null{
 if(env.BOB_WORKFLOW_HOSTED_ENABLED!=='true')return null;
 if(env.VERCEL_ENV!=='preview'||env.BOB_AUTH_ENABLED!=='true'||env.BOB_LOCAL_REAL_AUTH_FIXTURE==='true'||env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('hosted_profile_denied');
 try{const p=hostedProfileSchema.parse(JSON.parse(env.BOB_WORKFLOW_HOSTED_PROFILE??''));
 for(const key of surface==='core'?['BOB_WORKFLOW_DATABASE_PASSWORD','BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL']:['BOB_WORKFLOW_REGISTRY_DATABASE_PASSWORD','BOB_WORKFLOW_AUTH_DATABASE_PASSWORD','BOB_WORKFLOW_WEB_VERIFIER_CREDENTIAL','BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL','BOB_AUTH_SECRET'])hostedSecret(env,key);
 if(surface==='core')return p;
 if(env.BOB_WORKFLOW_WEB_VERIFIER_CREDENTIAL===env.BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL||env.BOB_AUTH_BASE_URL!==p.webOrigin||env.BOB_AUTH_OWNER_EMAIL?.toLowerCase()!==p.owner.email.toLowerCase())throw Error('profile_binding');
 const url=new URL(env.BOB_AUTH_DATABASE_URL??'');if(url.protocol!=='postgresql:'||url.hostname!==p.auth.host||decodeURIComponent(url.pathname.slice(1))!==p.auth.database||decodeURIComponent(url.username)!==p.auth.role||decodeURIComponent(url.password)!==env.BOB_WORKFLOW_AUTH_DATABASE_PASSWORD||url.hash||url.port&&url.port!=='5432'||Array.from(url.searchParams.keys()).some(k=>k!=='sslmode')||url.searchParams.get('sslmode')!=='require')throw Error('auth_target');
 return p;}catch{throw Error('hosted_profile_unconfigured');}
}
export function hostedSecret(env:Record<string,string|undefined>,name:string){const v=env[name];if(!v||(!name.endsWith('_PASSWORD')&&v.length<32))throw Error('hosted_credentials_unconfigured');return v;}
