// Isolated fixture transport only. No alternate database path in normal runtime.
import type {neonConfig} from "@neondatabase/serverless";
export function localRealAuthFixtureEnabled(){
 if(process.env.BOB_LOCAL_REAL_AUTH_FIXTURE!=="true")return false;
 if(process.env.VERCEL||!/^\/tmp\/bob-workflow-pg-[A-Za-z0-9_-]+$/.test(process.env.BOB_LOCAL_WORKFLOW_TEST_SOCKET??""))throw new Error("isolated_real_auth_fixture_required");
 const target=process.env.BOB_AUTH_DATABASE_URL;
 if(target!=="postgresql://bob_workflow_test_admin@bob-workflow-auth-fixture.invalid/postgres")throw new Error("isolated_auth_database_target_mismatch");
 if(process.env.BOB_AUTH_BASE_URL!=="http://127.0.0.1:3430")throw new Error("isolated_auth_origin_mismatch");
 return true;
}
export function configureLocalRealAuthDriver(driver:typeof neonConfig){
 if(!localRealAuthFixtureEnabled())return;
 driver.wsProxy=(host,port)=>{if(host!=="bob-workflow-auth-fixture.invalid"||Number(port)!==5432)throw new Error("isolated_auth_database_target_mismatch");return "127.0.0.1:3434/synthetic-auth-wire-proxy-only-20261001";};
 driver.useSecureWebSocket=false;driver.forceDisablePgSSL=true;driver.pipelineConnect=false;driver.pipelineTLS=false;driver.poolQueryViaFetch=false;
}
