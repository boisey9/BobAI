// Runner-owned children only. Attach immediately after spawn, before awaiting readiness.
export function trackOwnedChild(child){
 const state={child,closed:false,error:null,output:'',listeners:new Set()};
 const notify=()=>{for(const fn of [...state.listeners])fn();};
 child.on('error',e=>{state.error=e;notify();});
 child.on('close',()=>{state.closed=true;notify();});
 child.stdout?.on('data',b=>{state.output+=b.toString();notify();});
 return state;
}
function settled(s){return s.closed||s.child.exitCode!==null||s.child.signalCode!==null||(!s.child.pid&&s.error!==null);}
function waitState(s,predicate,ms){
 return new Promise(resolve=>{let timer;const inspect=()=>{if(predicate()){clearTimeout(timer);s.listeners.delete(inspect);resolve(true);}};
  timer=setTimeout(()=>{s.listeners.delete(inspect);resolve(false);},ms);s.listeners.add(inspect);inspect();});
}
export async function waitOwnedReady(s,marker,ms=5000){
 const ready=await waitState(s,()=>s.output.includes(marker)||settled(s)||s.error!==null,ms);
 if(!ready)throw Error('owned_child_readiness_timeout');
 if(settled(s)||s.error)throw Error('owned_child_exited_before_readiness');
 if(!s.output.includes(marker))throw Error('owned_child_not_ready');
}
export async function stopOwnedChild(s,{graceMs=1000,killMs=1000}={}){
 if(!s||settled(s))return;
 s.child.kill('SIGTERM');
 if(await waitState(s,()=>settled(s),graceMs))return;
 s.child.kill('SIGKILL');
 if(!await waitState(s,()=>settled(s),killMs))throw Error('owned_child_shutdown_timeout');
}
export async function cleanupOwnedResources(child,stopDatabase,options){
 // Database shutdown is attempted regardless of child timeout/error; both errors retained.
 let childError,dbError;try{await stopOwnedChild(child,options);}catch(e){childError=e;}
 try{await stopDatabase();}catch(e){dbError=e;}
 if(childError||dbError)throw new AggregateError([childError,dbError].filter(Boolean),'owned_resource_cleanup_failed');
}
