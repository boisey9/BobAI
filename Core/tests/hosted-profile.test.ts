import {describe,it,expect} from 'vitest';
import {hostedProfile,hostedProfileSchema} from '../src/workflow/hosted-profile.js';
import {createHostedPool} from '../src/workflow/hosted-database.js';
import {createPinnedWorkflowTransaction} from '../src/workflow/pinned-transaction.js';
import {profile,profileEnv} from './fixtures/hosted-profile.js';
describe('explicit default-off private hosted profile',()=>{
 it('does not infer authority from legacy flags or URLs',()=>{expect(hostedProfile({BOB_GOVERNED_WORKFLOW_ENABLED:'true',DATABASE_URL:'ignored'})).toBeNull();});
 it('requires complete preview-only configuration',()=>{expect(hostedProfile(profileEnv())?.mode).toBe('private-test');for(const k of Object.keys(profileEnv())){if(['BOB_WORKFLOW_HOSTED_ENABLED','BOB_WORKFLOW_DATABASE_PASSWORD'].includes(k))continue;const e:Record<string,string|undefined>={...profileEnv()};delete e[k];expect(()=>hostedProfile(e)).toThrow();}});
 it('Core cannot require or receive Web authority secrets; Web does not need workflow write credentials',()=>{const core={BOB_WORKFLOW_HOSTED_ENABLED:'true',VERCEL_ENV:'preview',BOB_AUTH_ENABLED:'true',BOB_WORKFLOW_HOSTED_PROFILE:JSON.stringify(profile),BOB_WORKFLOW_DATABASE_PASSWORD:profileEnv().BOB_WORKFLOW_DATABASE_PASSWORD,BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL:profileEnv().BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL};expect(hostedProfile(core,'core')).not.toBeNull();const web={...profileEnv(),BOB_WORKFLOW_DATABASE_PASSWORD:undefined};expect(hostedProfile(web)).not.toBeNull();});
 it.each(['production','development'])('rejects environment %s',value=>expect(()=>hostedProfile({...profileEnv(),VERCEL_ENV:value})).toThrow());
 it('rejects stale auth target and aliased clients',()=>{expect(()=>hostedProfile({...profileEnv(),BOB_AUTH_DATABASE_URL:'postgresql://wrong:secret@production.invalid/db'})).toThrow();expect(()=>hostedProfile({...profileEnv(),BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL:profileEnv().BOB_WORKFLOW_WEB_VERIFIER_CREDENTIAL})).toThrow();});
 it.each(['http://owner.example.invalid','https://u:p@owner.example.invalid','https://owner.example.invalid/path','https://127.0.0.1'])('rejects origin %s',webOrigin=>expect(()=>hostedProfileSchema.parse({...profile,webOrigin,issuer:webOrigin})).toThrow());
 it.each(['127.0.0.1','prod.invalid','ep-synthetic-pooler.us-east-2.aws.neon.tech'])('rejects database host %s',host=>expect(()=>createHostedPool({...profile.workflow,host},'synthetic')).toThrow());
 it('rejects unbranded pools before callback/database access',()=>{let accessed=false;expect(()=>createPinnedWorkflowTransaction({options:{host:profile.workflow.host,user:profile.workflow.role,database:'postgres'},connect:async()=>{accessed=true;throw Error();}},profile.workflow,async()=>true)).toThrow();expect(accessed).toBe(false);});
});
