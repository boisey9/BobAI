// Synthetic owner-session authority only; NOT a live Better Auth fallback.
import {createHmac,timingSafeEqual} from "node:crypto";
import {fixtureAdmin,fixtureOwner,fixtureRegistry} from "./workflow-adapter-fixture.js";
import {createOwnerDelegation,postgresOwnerProofStore,type DelegationConfiguration} from "../../src/workflow/owner-delegation.js";
const secret="synthetic-workflow-session-secret-at-least-32-characters";
export function syntheticOwnerCookie(){const payload=Buffer.from(JSON.stringify({sub:"owner",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");return `bob_control_session=${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}`;}
async function currentSession(id:string){const r=(await fixtureAdmin(`SELECT u.id,u.email,u."emailVerified",s.id AS session_id,s."userId",s."expiresAt",s."updatedAt" FROM bob_auth_session s JOIN bob_auth_user u ON u.id=s."userId" WHERE s.id=$1`,[id])).rows[0];return r?{user:{id:r.id,email:r.email,emailVerified:r.emailVerified},session:{id:r.session_id,userId:r.userId,expiresAt:r.expiresAt,updatedAt:r.updatedAt}}:null;}
export function fixtureDelegation(lifetime=60000,overrides:Partial<DelegationConfiguration>={}){return createOwnerDelegation({issuer:"http://127.0.0.1:3433",audience:"http://127.0.0.1:3431",owner:fixtureOwner,proofLifetimeMs:lifetime,...overrides},
 {currentSession,api:{async getSession({headers}){const cookie=/(?:^|;\s*)bob_control_session=([^;]+)/.exec(headers.get("cookie")??"")?.[1];if(!cookie)return null;
  try{const [payload,signature,...extra]=cookie.split(".");if(!payload||!signature||extra.length)return null;const expected=createHmac("sha256",secret).update(payload).digest("base64url");if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
   const data=JSON.parse(Buffer.from(payload,"base64url").toString());if(data.sub!=="owner"||data.exp*1000<=Date.now())return null;return currentSession("synthetic-session");}catch{return null;}}}},fixtureRegistry,postgresOwnerProofStore(fixtureAdmin));}
