import {Hono} from 'hono';
import {hostedProfile,hostedSecret} from './hosted-profile.js';
import {createHostedPool} from './hosted-database.js';
import {createPinnedWorkflowTransaction} from './pinned-transaction.js';
import {PostgresPacketStore} from './postgres-store.js';
import {GovernedPacketService} from './packet-service.js';
import {createGovernedWorkflowRouter} from './routes.js';
import {coreOwnerVerifierClient} from './delegation-transport.js';
export function hostedWorkflowRouter(env:Record<string,string|undefined>=process.env,dependencies:{pool?:typeof createHostedPool;network?:typeof fetch}={}):Hono|undefined{
 const p=hostedProfile(env,'core');if(!p)return;
 const password=hostedSecret(env,'BOB_WORKFLOW_DATABASE_PASSWORD'),credential=hostedSecret(env,'BOB_WORKFLOW_CORE_VERIFIER_CREDENTIAL');
 const verifier=coreOwnerVerifierClient({issuer:p.issuer,audience:p.coreOrigin,credential},dependencies.network??fetch);const app=new Hono();
 app.all('*',async c=>{const request=c.req.raw.clone();let context:Awaited<ReturnType<typeof verifier.redeem>>|null=null;const pool=(dependencies.pool??createHostedPool)(p.workflow,password);
 try{const service=new GovernedPacketService(new PostgresPacketStore(createPinnedWorkflowTransaction(pool,p.workflow,async()=>!!context&&await context.revalidate())));
 const router=createGovernedWorkflowRouter(service,async(_req,project)=>{context=await verifier.redeem(request,project);return context.principals[0]??null;},async()=>{context=await verifier.redeem(request,'_directory');return context.principals;});
 return await router.fetch(new Request(request.url.replace('/v1/governed/','/'),request.clone()));}finally{await pool.end();}});return app;
}
