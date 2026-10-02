// Only synthetic loopback transport to the existing private PostgreSQL fixture.
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{WebSocketServer}=require('../../Web/node_modules/next/dist/compiled/ws');
const directory=process.env.BOB_LOCAL_WORKFLOW_TEST_SOCKET;
if(process.env.BOB_LOCAL_REAL_AUTH_FIXTURE!=='true'||process.env.VERCEL||!/^\/tmp\/bob-workflow-pg-[A-Za-z0-9_-]+$/.test(directory??''))throw new Error('isolated_real_auth_proxy_required');
const path=directory+'/.s.PGSQL.5432';if(!existsSync(path))throw new Error('isolated_socket_missing');
const server=createServer((_req,res)=>{res.writeHead(404);res.end();}),wsServer=new WebSocketServer({noServer:true,maxPayload:1024*1024});
server.on('upgrade',(req,socket,head)=>{
 if(req.url!=='/synthetic-auth-wire-proxy-only-20261001'||(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:3430')){socket.destroy();return;}
 wsServer.handleUpgrade(req,socket,head,ws=>{
  const backend=connect({path});backend.on('data',data=>{if(ws.readyState===1)ws.send(data,{binary:true});});
  ws.on('message',(data,binary)=>{if(!binary){ws.close();return;}backend.write(data);});
  backend.on('error',()=>ws.close());backend.on('close',()=>ws.close());ws.on('close',()=>backend.destroy());ws.on('error',()=>backend.destroy());
 });
});
server.listen(3434,'127.0.0.1',()=>console.info('Isolated auth wire proxy listening on loopback3434'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const c of wsServer.clients)c.terminate();server.close(()=>process.exit(0));});
