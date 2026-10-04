import 'server-only';
import {hostedProfile,hostedSecret} from '../../Core/src/workflow/hosted-profile';
import {createHostedPool} from '../../Core/src/workflow/hosted-database';
import {createHostedProjectRegistry,scopedRegistryQuery} from '../../Core/src/workflow/hosted-registry';
import {createWorkflowOwnerVerifier} from './workflow-owner-verifier-host';
export async function hostedOwnerVerifierRequest(request:Request){
 let profile;try{profile=hostedProfile();}catch{return Response.json({error:'owner_verifier_unconfigured'},{status:503});}if(!profile)return new Response('Not found',{status:404});
 let auth,registry;
 try{
 if(process.env.BOB_AUTH_BASE_URL!==profile.webOrigin||process.env.BOB_AUTH_OWNER_EMAIL?.toLowerCase()!==profile.owner.email.toLowerCase())throw Error('owner_auth_profile_mismatch');
 auth=createHostedPool(profile.auth,hostedSecret(process.env,'BOB_WORKFLOW_AUTH_DATABASE_PASSWORD'));
 registry=createHostedPool(profile.registry,hostedSecret(process.env,'BOB_WORKFLOW_REGISTRY_DATABASE_PASSWORD'));
 const reader=createHostedProjectRegistry(scopedRegistryQuery(registry));
 const router=createWorkflowOwnerVerifier(auth,{issuer:profile.issuer,audience:profile.coreOrigin,owner:profile.owner,proofLifetimeMs:60000},reader,{web:hostedSecret(process.env,'BOB_WORKFLOW_WEB_VERIFIER_CREDENTIAL'),core:hostedSecret(process.env,'BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL')});
 return await router.fetch(request);
 }catch{return Response.json({error:'owner_verifier_unavailable'},{status:503});}finally{await Promise.allSettled([auth?.end(),registry?.end()]);}
}
