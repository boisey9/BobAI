import {afterEach,describe,it,expect,vi} from "vitest";
import {configureLocalRealAuthDriver,localRealAuthFixtureEnabled} from "../../Web/lib/local-real-auth-driver.js";
import type {neonConfig} from "@neondatabase/serverless";
function fixture(){vi.stubEnv("BOB_LOCAL_REAL_AUTH_FIXTURE","true");vi.stubEnv("VERCEL","");vi.stubEnv("BOB_LOCAL_WORKFLOW_TEST_SOCKET","/tmp/bob-workflow-pg-20260930");vi.stubEnv("BOB_AUTH_DATABASE_URL","postgresql://bob_workflow_test_admin@bob-workflow-auth-fixture.invalid/postgres");vi.stubEnv("BOB_AUTH_BASE_URL","http://127.0.0.1:3430");}
afterEach(()=>vi.unstubAllEnvs());
describe("actual-library fixture remains isolated",()=>{
 it("does not mutate the normal driver's settings",()=>{vi.stubEnv("BOB_LOCAL_REAL_AUTH_FIXTURE","");const driver={forceDisablePgSSL:false,useSecureWebSocket:true};configureLocalRealAuthDriver(driver as typeof neonConfig);expect(driver).toEqual({forceDisablePgSSL:false,useSecureWebSocket:true});});
 it.each([["VERCEL","1"],["BOB_LOCAL_WORKFLOW_TEST_SOCKET","/tmp/unreviewed"],["BOB_AUTH_DATABASE_URL","postgresql://foreign@foreign.invalid/live"],["BOB_AUTH_BASE_URL","https://foreign.invalid"]])("rejects mismatched %s before driver mutation",(key,value)=>{fixture();vi.stubEnv(key,value);const driver={forceDisablePgSSL:false};expect(()=>configureLocalRealAuthDriver(driver as typeof neonConfig)).toThrow();expect(driver.forceDisablePgSSL).toBe(false);});
 it("permits only the explicit synthetic host/port",()=>{fixture();const driver={} as typeof neonConfig;configureLocalRealAuthDriver(driver);expect(typeof driver.wsProxy).toBe("function");const proxy=driver.wsProxy as (host:string,port:number)=>string;expect(proxy("bob-workflow-auth-fixture.invalid",5432)).toContain("127.0.0.1:3434/");expect(()=>proxy("foreign.invalid",5432)).toThrow();expect(()=>proxy("bob-workflow-auth-fixture.invalid",5433)).toThrow();});
 it("retains production HTTPS requirement when fixture is disabled",()=>{fixture();vi.stubEnv("BOB_LOCAL_REAL_AUTH_FIXTURE","");vi.stubEnv("NODE_ENV","production");expect(localRealAuthFixtureEnabled()).toBe(false);});
});
