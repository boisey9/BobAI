import { describe,it,expect } from "vitest";
import type { Pool } from "@neondatabase/serverless";
import {createVerifiedWorkflowAccess,type OwnerSessionApi} from "../src/workflow/owner-access.js";
import {createPinnedWorkflowTransaction,type PinnedPool} from "../src/workflow/pinned-transaction.js";
const owner={ownerId:"owner",userId:"user",actorId:"actor",email:"owner@example.invalid"};
const session={user:{id:"user",email:owner.email,emailVerified:true},session:{id:"session",userId:"user",expiresAt:new Date(2000)}};
const request=new Request("http://localhost/",{headers:{authorization:"Bearer synthetic", "x-bob-core-interface-id":"forged"}});
// Compile-time compatibility with the existing SDK; does not instantiate/connect.
const sdkCompatible=(pool:Pool)=>createPinnedWorkflowTransaction(pool,{kind:"isolated-local",socket:"/tmp/bob-workflow-pg-fixture",database:"postgres",role:"app"},async()=>false);void sdkCompatible;
describe("verified workflow adapter boundaries",()=>{
 it.each([null,{...session,user:{...session.user,id:"other"}},{...session,session:{...session.session,userId:"other"}},{...session,session:{...session.session,expiresAt:new Date(1000)}},{...session,session:{...session.session,revoked:true}},{...session,user:{...session.user,emailVerified:false}}])("denies missing/mismatched/expired/revoked session before project lookup",async value=>{
 let reads=0;const api:OwnerSessionApi={async getSession({headers,query}){expect(headers.has("x-bob-core-interface-id")).toBe(false);expect(query.disableCookieCache).toBe(true);return value;}};
 const access=createVerifiedWorkflowAccess(owner,api,{async project(){reads++;return null;},async directory(){reads++;return []; }},()=>1000);
 expect(await access.authenticate(request,"bobai")).toBeNull();expect(reads).toBe(0);
 });
 it("denies scope mismatches and Personal without inferring owner-wide authority",async()=>{
 const api={getSession:async()=>session};const access=createVerifiedWorkflowAccess(owner,api,{project:async()=>({ownerId:"owner",actorId:"actor",projectKey:"other",active:true,enabled:true,revoked:false}),directory:async()=>["bobai"]},()=>1000);
 expect(await access.authenticate(request,"bobai")).toBeNull();expect(await access.authenticate(request,"personal")).toBeNull();expect(await access.directory(request)).toEqual([]);
 });
 it("rejects an unapproved or mismatched configured target before connect",()=>{
 let calls=0;const pool:PinnedPool={options:{host:"/tmp/bob-workflow-pg-wrong",database:"postgres",user:"app"},connect:async()=>{calls++;throw new Error("must not connect");}};
 expect(()=>createPinnedWorkflowTransaction(pool,{kind:"isolated-local",socket:"/tmp/bob-workflow-pg-fixture",database:"postgres",role:"app"},async()=>false)).toThrow("target_not_approved");expect(calls).toBe(0);
 });
 it("does not connect when authoritative authorization is denied",async()=>{
 let calls=0;const pool:PinnedPool={options:{host:"/tmp/bob-workflow-pg-fixture",database:"postgres",user:"app"},connect:async()=>{calls++;throw new Error("must not connect");}};
 const tx=createPinnedWorkflowTransaction(pool,{kind:"isolated-local",socket:"/tmp/bob-workflow-pg-fixture",database:"postgres",role:"app"},async()=>false);
 await expect(tx(async()=>null)).rejects.toThrow("workflow_access_denied");expect(calls).toBe(0);
 });

 it("rejects actual database mismatch before BEGIN",async()=>{
 const calls:string[]=[];let released=false;
 const pool:PinnedPool={options:{host:"/tmp/bob-workflow-pg-fixture",database:"postgres",user:"app"},connect:async()=>({query:async sql=>{calls.push(sql);return {rows:[{database:"other",role:"app",session_role:"app",address:null,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,pid:1}]};},release:()=>{released=true;}})};
 const tx=createPinnedWorkflowTransaction(pool,{kind:"isolated-local",socket:"/tmp/bob-workflow-pg-fixture",database:"postgres",role:"app"},async()=>true);
 await expect(tx(async()=>null)).rejects.toThrow("workflow_database_target_mismatch");expect(calls).toHaveLength(1);expect(released).toBe(true);
 });
 it.each(["COMMIT","END","ABORT","/* comment */ COMMIT","-- comment\nEND","SET SESSION AUTHORIZATION DEFAULT","SET LOCAL ROLE app","RESET ALL","PREPARE TRANSACTION 'escape'","SELECT 1; COMMIT","DO $$ BEGIN COMMIT; END $$","SELECT malicious_function()","WITH x AS (SELECT 1) SELECT * FROM x"])("denies escaped transaction boundary %s",async sql=>{
 const calls:string[]=[];const pool:PinnedPool={options:{host:"/tmp/bob-workflow-pg-fixture",database:"postgres",user:"app"},connect:async()=>({query:async query=>{calls.push(query);return {rows:[{database:"postgres",role:"app",session_role:"app",address:null,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,pid:1}]};},release:()=>{}})};
 const tx=createPinnedWorkflowTransaction(pool,{kind:"isolated-local",socket:"/tmp/bob-workflow-pg-fixture",database:"postgres",role:"app"},async()=>true);
 await expect(tx(q=>q(sql))).rejects.toThrow("workflow_transaction_boundary_violation");expect(calls.at(-1)).toBe("ROLLBACK");expect(calls).not.toContain("COMMIT");
 });

});
