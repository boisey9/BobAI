import {Client,Pool,type ClientConfig} from '@neondatabase/serverless';
import {hostedTargetSchema,type HostedTarget} from './hosted-profile.js';
const hostedPools=new WeakMap<object,HostedTarget>();
export function boundHostedPool(pool:object,target:HostedTarget){const x=hostedPools.get(pool);return !!x&&x.host===target.host&&x.database===target.database&&x.role===target.role;}
// Direct WSS session, not HTTP or transaction-pooled endpoint. Socket TLS is
// enforced by the standard WebSocket implementation; PostgreSQL TLS is disabled
// inside that authenticated tunnel. A custom Socket is a trusted test seam only.
export function createHostedPool(input:HostedTarget,password:string,Socket:typeof WebSocket=WebSocket):Pool{
 const target=Object.freeze(hostedTargetSchema.parse(input));if(!password||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('hosted_database_credentials_required');
 class BoundClient extends Client{
  constructor(_options?:ClientConfig){super({host:target.host,port:5432,database:target.database,user:target.role,password,ssl:false,connectionTimeoutMillis:5000});const d=this.neonConfig;d.webSocketConstructor=Socket;d.useSecureWebSocket=true;d.forceDisablePgSSL=true;d.pipelineConnect=false;d.pipelineTLS=false;
   d.wsProxy=(host,port)=>{if(host!==target.host||Number(port)!==5432)throw Error('hosted_database_endpoint_denied');return target.host+'/v2';};
  }
  override connect():Promise<void>;
  override connect(callback:(err?:Error)=>void):void;
  override connect(callback?:(err?:Error)=>void):Promise<void>|void{
   const task=super.connect().then(async()=>{const r=await this.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole FROM pg_roles r WHERE r.rolname=current_user`);const x=r.rows[0];if(!x||x.database!==target.database||x.role!==target.role||x.session_role!==target.role||[x.rolsuper,x.rolbypassrls,x.rolcreatedb,x.rolcreaterole].some(v=>v!==false))throw Error('hosted_database_identity_denied');}).catch(async()=>{await Promise.race([this.end().catch(()=>{}),new Promise(r=>setTimeout(r,500))]);throw Error('hosted_database_connection_denied');});
   if(callback){void task.then(()=>callback(),e=>callback(e));return;}return task;
  }
 }
 const pool=new Pool({host:target.host,port:5432,database:target.database,user:target.role,password,ssl:false,Client:BoundClient,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:1000});// SDK1.1.0 overwrites the PoolConfig.Client option in its constructor.
 (pool as unknown as {Client:typeof Client}).Client=BoundClient;
 pool.on('error',()=>{});
 // Never use SDK global HTTP poolQueryViaFetch for auth/registry reads either.
 pool.query=((...args:unknown[])=>{const cb=typeof args.at(-1)==='function'?args.pop() as (err:unknown,result?:unknown)=>void:null;const task=(async()=>{const c=await pool.connect();try{return await (c.query as (...a:unknown[])=>Promise<unknown>)(...args);}finally{c.release();}})();if(cb){void task.then(r=>cb(null,r),e=>cb(e));return;}return task;}) as Pool['query'];
 hostedPools.set(pool,target);return pool;
}
