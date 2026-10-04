import {it,expect} from 'vitest';
import {createGovernedWorkflowRouter} from '../src/workflow/routes.js';
import {GovernedPacketService} from '../src/workflow/packet-service.js';
import {WorkflowError} from '../src/workflow/packet-contract.js';
const owner={ownerId:'synthetic-owner',actorId:'synthetic-actor',projectKey:'sample'};
const codes=['workflow_packet_capacity','packet_already_exists_or_version_conflict','invalid_predecessor_scope','released_packet_immutable'];
it.each(codes)('real command prewrite failure %s clears uncertainty',async code=>{
 let writes=0,receiptReads=0;
 const packet={id:'existing',state:code==='released_packet_immutable'?'released':'draft',version:1};
 const packets=code==='workflow_packet_capacity'?Array.from({length:500},(_,i)=>({...packet,id:'p'+i})):code==='packet_already_exists_or_version_conflict'||code==='released_packet_immutable'?[packet]:[];
 const store={scoped:async(_p:unknown,_permission:unknown,run:Function)=>run({packets,records:[],query:async()=>{receiptReads++;return {rows:[]}},savePacket:async()=>{writes++},insertRecord:async()=>{writes++}})};
 const service=new GovernedPacketService(store as never),api=createGovernedWorkflowRouter(service,async()=>owner);
 const capture={operationId:'op',packetId:code==='packet_already_exists_or_version_conflict'?'existing':'new',action:'capture',expectedVersion:0,title:'Synthetic',specification:'',predecessors:code==='invalid_predecessor_scope'?['missing']:[]};
 const command=code==='released_packet_immutable'?{operationId:'op',packetId:'existing',action:'revise',expectedVersion:1,specification:'Revision'}:capture;
 const response=await api.request('/sample/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)});
 expect(response.status).toBe(409);expect(await response.json()).toEqual({error:{code},outcome:'rejected'});expect(receiptReads).toBe(1);expect(writes).toBe(0);
});
it.each(['workflow_write_outcome_unconfirmed','workflow_rollback_outcome_unconfirmed','workflow_access_denied','operation_id_conflict','workflow_unavailable'])('uncertain failure %s remains uncertain',async code=>{
 const api=createGovernedWorkflowRouter({command:async()=>{throw new WorkflowError(code,code==='workflow_access_denied'?403:503)}} as never,async()=>owner);
 const response=await api.request('/sample/commands',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});expect((await response.json()).outcome).toBe('unconfirmed');
});
