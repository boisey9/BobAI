import {platformBinding} from "../../Core/src/workflow/protected-transport";
import {hostedProfile} from "../../Core/src/workflow/hosted-profile";
// Navigation only: destination never supplies owner/project authority.
export function workspaceEntryEnabled(){
 if(!process.env.VERCEL)return process.env.BOB_GOVERNED_WORKFLOW_ENABLED==='true';
 try{if(!hostedProfile())return false;platformBinding();return true;}catch{return false;}
}
export function safeWorkspaceDestination(value:unknown):string|null{
 if(typeof value!=='string'||value.length>600||!/^\/work(?:\?|$)/.test(value)||/[\\\s#]/.test(value))return null;
 try{const url=new URL(value,'https://workspace.invalid');if(url.origin!=='https://workspace.invalid'||url.pathname!=='/work')return null;const seen=new Set<string>();for(const [key,val] of url.searchParams){if(seen.has(key)||!['project','packet','operation'].includes(key))return null;seen.add(key);if(key==='project'?!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(val):!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(val))return null;}return url.pathname+url.search;}catch{return null;}
}
export function workspaceLoginDestination(value:unknown){return '/login?returnTo='+encodeURIComponent(safeWorkspaceDestination(value)??'/work');}
