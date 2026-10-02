// Test-only protecting edge. Synthetic keys, no provider issuer/JWKS calls.
// Its verified JWT models a transport permission, never owner authority.
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {request as httpsRequest,type Server,type RequestOptions} from 'node:https';
import {checkPlatformToken,type PlatformBinding} from '../../../Core/src/workflow/protected-transport.js';
import type {HostedProfile} from '../../../Core/src/workflow/hosted-profile.js';

export function syntheticEdge(server:Server,port:number,ca:Buffer,profile:HostedProfile,
  route:(request:Request)=>Promise<Response>,web:PlatformBinding,core:PlatformBinding) {
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  let mode:'normal'|'redirect'|'unavailable'='normal',accepted=0;
  function jwt(binding:PlatformBinding,changes:Record<string,unknown>={}) {
    const now=Math.floor(Date.now()/1000);
    const text=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'synthetic-only'})).toString('base64url')+'.'+
      Buffer.from(JSON.stringify({iss:binding.issuer,aud:binding.audience,owner_id:binding.teamId,project_id:binding.projectId,environment:'preview',nbf:now-1,exp:now+120,...changes})).toString('base64url');
    return text+'.'+sign('RSA-SHA256',Buffer.from(text),privateKey).toString('base64url');
  }
  server.on('request',async(req,res)=>{
    try {
      const origin='https://'+req.headers.host;
      if (![profile.issuer,profile.coreOrigin].includes(origin)) {res.writeHead(403).end();return;}
      const path=req.url??'/',identity=req.headers['x-vercel-trusted-oidc-idp-token'];
      const expected=origin===profile.coreOrigin||path==='/issue'?web:core;
      if(typeof identity!=='string')throw Error();
      checkPlatformToken(identity,expected);
      const parts=identity.split('.');
      if(!verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),publicKey,Buffer.from(parts[2]!,'base64url')))throw Error();
      if(mode==='redirect'){res.writeHead(302,{location:'https://foreign.invalid/steal'}).end();return;}
      if(mode==='unavailable'){res.writeHead(503).end();return;}
      let body=Buffer.alloc(0);for await(const chunk of req){body=Buffer.concat([body,chunk]);if(body.length>16384)throw Error();}
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
      accepted++;const response=await route(new Request(origin+path,{method:req.method??'GET',headers,...(req.method==='POST'?{body}:{} )}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(403).end();}
  });
  // Explicit test-only loopback remap. TLS peer/SNI uses the allowlisted original
  // hostname. No default fetch, live DNS, global trust or plaintext fallback.
  function transport(custom:Partial<RequestOptions>={}):typeof fetch{return (async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const request=new Request(input,init),url=new URL(request.url);
    if(url.protocol!=='https:'||![profile.issuer,profile.coreOrigin].includes(url.origin))throw Error('synthetic_target_only');
    const body=request.method==='POST'?Buffer.from(await request.arrayBuffer()):undefined;
    return new Promise<Response>((resolve,reject)=>{
      const connection=httpsRequest({hostname:'127.0.0.1',port,path:url.pathname+url.search,method:request.method,ca,servername:url.hostname,rejectUnauthorized:true,signal:request.signal,...custom,
        headers:{...Object.fromEntries(request.headers),host:url.host}},res=>{const chunks:Buffer[]=[];res.on('data',d=>chunks.push(d));res.on('error',reject);res.on('end',()=>{const headers=new Headers();for(const [k,v]of Object.entries(res.headers))if(typeof v==='string')headers.set(k,v);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode??503,headers}));});});
      connection.on('error',reject);connection.end(body);
    });
  }) as typeof fetch;}
  return {jwt,transport,setMode:(value:typeof mode)=>{mode=value;},accepted:()=>accepted};
}
