// Actual Better Auth/Neon driver, isolated SQL fixture; no provider/account calls.
import {Pool,neonConfig} from "@neondatabase/serverless";
import {createOwnerAuth} from "../lib/owner-auth";
import {configureLocalRealAuthDriver} from "../lib/local-real-auth-driver";
import type {SessionAuthority} from "../../Core/src/workflow/owner-delegation";
export async function createRealAuthFixture():Promise<{pool:Pool;authority:SessionAuthority;userId:string;close:()=>Promise<void>}> {
 if(process.env.BOB_LOCAL_REAL_AUTH_FIXTURE!=="true"||process.env.VERCEL)throw new Error("isolated_real_auth_fixture_required");
 configureLocalRealAuthDriver(neonConfig);neonConfig.webSocketConstructor=WebSocket;
 const pool=new Pool({connectionString:process.env.BOB_AUTH_DATABASE_URL,max:3});pool.on("error",()=>{});
 const auth=createOwnerAuth(pool,true);
 await pool.query("TRUNCATE bob_auth_user CASCADE; TRUNCATE bob_auth_rate_limit");
 const result=await auth.api.signUpEmail({body:{name:"Synthetic library owner",email:"owner@example.invalid",password:"synthetic-workflow-password"}});
 await pool.query('UPDATE bob_auth_user SET "emailVerified"=true WHERE id=$1',[result.user.id]);
 return {pool,userId:result.user.id,close:()=>pool.end(),authority:{api:{getSession:input=>auth.api.getSession(input)},async currentSession(id){const row=(await pool.query('SELECT u.id,u.email,u."emailVerified",s.id AS session_id,s."userId",s."expiresAt",s."updatedAt" FROM bob_auth_session s JOIN bob_auth_user u ON u.id=s."userId" WHERE s.id=$1',[id])).rows[0];return row?{user:{id:row.id,email:row.email,emailVerified:row.emailVerified},session:{id:row.session_id,userId:row.userId,expiresAt:row.expiresAt,updatedAt:row.updatedAt}}:null;}}};
}
