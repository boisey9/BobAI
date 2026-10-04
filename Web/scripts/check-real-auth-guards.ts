import assert from "node:assert/strict";
import type {Pool} from "@neondatabase/serverless";
import {ownerAuthOptions} from "../lib/owner-auth";
assert.equal(process.env.NODE_ENV,"production");process.env.BOB_LOCAL_REAL_AUTH_FIXTURE="";
process.env.BOB_AUTH_BASE_URL="http://127.0.0.1:3430";
assert.throws(()=>ownerAuthOptions({} as Pool),/HTTPS/);
process.env.BOB_AUTH_BASE_URL="https://owner.example.invalid";process.env.BOB_AUTH_SECRET="synthetic-auth-guard-secret-with-at-least-32-characters";process.env.BOB_AUTH_OWNER_EMAIL="owner@example.invalid";process.env.BOB_AUTH_OAUTH_ENABLED="";
const normal=ownerAuthOptions({} as Pool);assert.equal(normal.advanced?.useSecureCookies,true);assert.equal(normal.session?.cookieCache?.enabled,false);
console.log(JSON.stringify({productionHttpDenied:true,productionSecureCookies:true,sessionCookieCacheDisabled:true}));
