import { test,expect,type APIRequestContext,type Page } from "@playwright/test";
import {createHash} from "node:crypto";
import path from "node:path";
const base="http://127.0.0.1:3430",fixture="http://127.0.0.1:3431";
const controlHeaders={authorization:"Bearer synthetic-workflow-test-control"};
const screen=(name:string)=>path.resolve("../workflow-validation/screens",name+".png");
async function reset(request:APIRequestContext,scenario="ready",page?:Page){
  const r=await request.post(fixture+"/fixture/reset",{headers:controlHeaders,data:{scenario}});expect(r.ok()).toBe(true);
  if(process.env.BOB_E2E_REAL_AUTH==="true"&&page){const login=await page.context().request.post(base+"/api/session",{form:{password:"synthetic-workflow-password"},headers:{origin:base},maxRedirects:0});expect(login.status()).toBe(303);}
}
async function control(request:APIRequestContext,data:Record<string,unknown>){
  const r=await request.post(fixture+"/fixture/control",{headers:controlHeaders,data});expect(r.ok()).toBe(true);
}
async function state(request:APIRequestContext){return (await request.get(fixture+"/fixture/state",{headers:controlHeaders})).json();}
async function open(page:Page,project="bobai"){
  await page.goto(base+"/work?project="+project);
  await expect(page.getByRole("heading",{name:project==="bobai"?"Synthetic Bob Core":"Synthetic sample",exact:true})).toBeVisible();
}
async function ownerCore(page:Page,path:string,command?:Record<string,unknown>){
 const request=page.context().request,body=command?JSON.stringify(command):"",method=command?"POST":"GET";
 const project=path.split("/")[3]!;
 const cookie=(await page.context().cookies()).map(c=>`${c.name}=${c.value}`).join("; ");
 const issue=await request.post("http://127.0.0.1:3433/issue",{headers:{authorization:"Bearer synthetic-web-verifier-credential-not-live-20261001",cookie},data:{audience:fixture,action:{method,path,bodyDigest:createHash("sha256").update(body).digest("hex"),project}}});expect(issue.ok()).toBe(true);
 const {token}=await issue.json();return request.fetch(fixture+path,{method,headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},...(command?{data:body}:{})});
}
test.beforeEach(async({page,context,request})=>{
  await reset(request);
  await page.route("**/*",route=>{
    if(new URL(route.request().url()).origin!==base)throw new Error("workflow_browser_attempted_external_request");
    return route.continue();
  });
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  page.on("close",()=>expect(errors).toEqual([]));
  const login=await context.request.post(base+"/api/session",{form:{password:"synthetic-workflow-password"},headers:{origin:base},maxRedirects:0});
  expect(login.status()).toBe(303);
});
test("rendered integration gut check and real owner review without release authority",async({page,request})=>{
  await page.setViewportSize({width:1440,height:1080});await open(page);
  expect(await page.locator("body").innerText()).toContain("Verify project resumption");
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeEnabled();
  await page.screenshot({path:screen("governed-desktop-ready"),fullPage:true});
  await page.getByRole("button",{name:"Approve exact candidate"}).click();
  await expect(page.getByRole("heading",{name:"Candidate reviewed"})).toBeVisible();
  const result=await state(request);expect(result.workspace.packets[0].state).toBe("reviewed");
  expect(result.history.items.filter((v:{action:string})=>v.action==="review")).toHaveLength(1);
  expect(result.workspace.releaseEnabled).toBe(false);
  await page.getByRole("button",{name:"History",exact:true}).click();
  await expect(page.getByText("review · reviewed · v5",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:/release|deploy/i})).toHaveCount(0);
  const release=await ownerCore(page,"/v1/governed/bobai/commands",{operationId:"release-probe",packetId:"packet-1",action:"release",expectedVersion:result.workspace.packets[0].version,candidateDigest:result.workspace.packets[0].candidateDigest});
  expect(release.status()).toBe(403);expect((await release.json()).error.code).toBe("release_policy_not_approved");
});
test("actual empty capture to specification to trusted fixture candidate to owner review survives reload",async({page,request})=>{
  await reset(request,"empty",page);await open(page);
  await expect(page.getByRole("heading",{name:"This project has no governed packet yet."})).toBeVisible();
  const capture=page.getByLabel("Capture a governed work packet");await capture.fill("A durable browser work packet");await capture.press("Enter");
  await expect(page.getByRole("heading",{name:"A durable browser work packet",exact:true})).toBeVisible();
  const id=(await state(request)).workspace.packets[0].id;
  await page.getByLabel("Specification · acceptance criteria").fill("The same packet is available after reload and cannot cross projects.");
  await page.getByRole("button",{name:"Save specification revision"}).click();
  await expect(page.getByRole("button",{name:"Save specification revision"})).toBeDisabled();
  await page.getByRole("button",{name:"Accept exact specification"}).click();
  await expect.poll(async()=> (await state(request)).workspace.records.filter((r:{kind:string})=>r.kind==="specification").length).toBe(1);
  // Explicit fixture producer, not UI-authoritative evidence or a live source.
  await control(request,{prepareCandidate:true,packetId:id});await page.reload();
  await expect(page.getByText("durability · pass",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Verify readiness"}).click();
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeEnabled();
  await page.getByRole("button",{name:"Approve exact candidate"}).click();
  await expect(page.getByRole("heading",{name:"Candidate reviewed"})).toBeVisible();await page.reload();
  await expect(page.getByRole("heading",{name:"Candidate reviewed"})).toBeVisible();expect((await state(request)).workspace.packets[0].id).toBe(id);
});
test("actual history/task read wiring preserves ordinary done semantics and project isolation",async({page,request})=>{
  await open(page);await page.getByRole("button",{name:"History",exact:true}).click();
  await expect(page.getByText("Synthetic project history",{exact:true})).toBeVisible();
  await expect(page.getByText("Ordinary completed task · done · normal",{exact:true})).toBeVisible();
  await page.getByLabel("Project",{exact:true}).selectOption("sample");await page.getByRole("button",{name:"Open project"}).click();
  await expect(page.getByRole("heading",{name:"Synthetic sample",exact:true})).toBeVisible();
  await expect(page.getByText("Verify project resumption",{exact:true})).toHaveCount(0);
  const denied=await request.get(fixture+"/v1/governed/private-project",{headers:{authorization:"Bearer synthetic-owner-workflow-fixture"}});expect(denied.status()).toBe(403);
  await page.goto(base+"/work?project=private-project");
  await expect(page.getByRole("heading",{name:"Current project records are unavailable."})).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toHaveCount(0);
});
test("changed server candidate rejects stale approval, focuses error and refreshes current state",async({page,request})=>{
  await open(page);await control(request,{changeCandidate:true});
  await page.getByRole("button",{name:"Approve exact candidate"}).click();
  await expect(page.locator("section[role=alert]")).toContainText("This work packet changed.");await expect(page.locator("section[role=alert]")).toBeFocused();
  await expect(page.getByRole("button",{name:"Retry same request"})).toHaveCount(0);
  await page.getByRole("button",{name:"Retry project refresh"}).click();
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeDisabled();
  await expect(page.getByText("No current immutable verification evidence.",{exact:true})).toBeVisible();
  expect((await state(request)).workspace.records.filter((r:{kind:string})=>r.kind==="approval")).toHaveLength(0);
  await page.screenshot({path:screen("governed-changed-candidate"),fullPage:true});
});
test("unsaved and saved specification changes block approval and preserve changed draft",async({page,request})=>{
  await open(page);await page.getByLabel("Specification · acceptance criteria").fill("Updated owner criteria");
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeDisabled();
  await page.getByRole("button",{name:"Save specification revision"}).click();
  await expect(page.getByText("No current immutable verification evidence.",{exact:true})).toBeVisible();
  const p=(await state(request)).workspace.packets[0];expect(p.state).toBe("draft");expect(p.candidateDigest).toBeNull();
});
test("lost receipt response retains request, then actual idempotent retry captures exactly once",async({page,request})=>{
  await open(page);await control(request,{loseResponseOnce:true});
  await page.getByLabel("Capture a governed work packet").fill("Recover this exact capture");
  await page.getByRole("button",{name:"Capture",exact:true}).click();
  await expect(page.locator("section[role=alert]")).toContainText("Core could not confirm this save.");
  await expect(page.getByRole("button",{name:"Capture",exact:true})).toBeDisabled();
  await page.screenshot({path:screen("governed-unconfirmed-recovery"),fullPage:true});
  await page.getByRole("button",{name:"Retry same request"}).click();
  await expect(page.getByRole("heading",{name:"Recover this exact capture",exact:true})).toBeVisible();
  const result=await state(request);expect(result.workspace.packets.filter((p:{title:string})=>p.title==="Recover this exact capture")).toHaveLength(1);
  const attempts=result.commands.filter((c:{action:string})=>c.action==="capture");expect(attempts).toHaveLength(2);expect(attempts[0].operationId).toBe(attempts[1].operationId);
  expect(result.history.items.filter((h:{action:string})=>h.action==="capture")).toHaveLength(2); // initial fixture packet + one recovered capture
});
test("request changes returns packet to draft without granting reviewed or release state",async({page,request})=>{
  await open(page);await page.getByRole("button",{name:"Request changes",exact:true}).click();
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeDisabled();
  await expect.poll(async()=> (await state(request)).workspace.packets[0].state).toBe("draft");
  const result=await state(request);expect(result.workspace.packets[0].state).toBe("draft");expect(result.workspace.records.find((r:{kind:string})=>r.kind==="approval").content.decision).toBe("changes_requested");
});
test("paused, failed evidence and absent policy expose honest blocked states",async({page,request})=>{
  await reset(request,"paused",page);await open(page);await expect(page.getByText("Workflow is paused.",{exact:false})).toBeVisible();await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeDisabled();await page.screenshot({path:screen("governed-paused"),fullPage:true});
  await reset(request,"failed",page);await page.reload();await expect(page.getByText("durability · failed",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Verify readiness"})).toBeDisabled();
  const failedPacket=(await state(request)).workspace.packets[0];const denied=await ownerCore(page,"/v1/governed/bobai/commands",{operationId:crypto.randomUUID(),packetId:failedPacket.id,action:"ready",expectedVersion:failedPacket.version,candidateDigest:failedPacket.candidateDigest});expect(denied.ok()).toBe(false);expect((await denied.json()).error.code).toBe("evidence_not_current_pass");
  await reset(request,"policy_missing",page);await page.reload();await expect(page.getByText("Trusted evidence, regression and review policy have not been accepted.",{exact:false})).toBeVisible();
});
test("source error and actual delayed read show error/loading then recover",async({page,request})=>{
  await reset(request,"read_error",page);await page.goto(base+"/work?project=bobai");await expect(page.getByRole("heading",{name:"Current project records are unavailable."})).toBeVisible();
  await page.screenshot({path:screen("governed-source-error"),fullPage:true});
  await control(request,{readFailure:false});await page.getByRole("button",{name:"Retry project refresh"}).click();
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeEnabled();
  await reset(request,"loading",page);await page.getByLabel("Project",{exact:true}).selectOption("sample");await page.getByRole("button",{name:"Open project"}).click();
  await expect(page.getByRole("status").filter({hasText:"Retrieving project work…"})).toBeVisible();await expect(page.getByRole("button",{name:"Open project"})).toBeDisabled();await page.screenshot({path:screen("governed-loading"),fullPage:true});
  await expect(page.getByRole("heading",{name:"Synthetic sample",exact:true})).toBeVisible();
});
test("keyboard and narrow mobile layouts stay usable with no horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await expect(page.getByRole("button",{name:"work",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:screen("governed-mobile-ready"),fullPage:true});
  await page.getByRole("button",{name:"review",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(page.getByLabel("Capture a governed work packet")).toHaveCount(0);
  await page.getByRole("button",{name:"Approve exact candidate"}).focus();await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeFocused();
  await page.setViewportSize({width:320,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:screen("governed-mobile-320-review"),fullPage:true});
});
test("Web boundary denies anonymous mutation, invalid CSRF and forged authority",async({page,request})=>{
  const anonymous=await request.post(base+"/api/workflow",{data:{project:"bobai",command:{action:"capture"}},headers:{origin:base}});expect(anonymous.status()).toBe(401);
  await open(page);
  const csrf=await page.evaluate(async()=>{const r=await fetch("/api/workflow",{method:"POST",headers:{"content-type":"application/json","x-bob-owner-csrf":"forged"},body:JSON.stringify({project:"bobai",command:{action:"capture"}})});return r.status;});expect(csrf).toBe(403);
  const forged=await ownerCore(page,"/v1/governed/bobai/commands",{operationId:"forged-owner",packetId:"packet-1",action:"review",expectedVersion:4,candidateDigest:"a".repeat(64),decision:"approve",actorId:"synthetic-owner-actor"});expect(forged.status()).toBe(400);
});
test("valid owner session cannot bypass trusted origin and browser receives no Core bearer token",async({page,request})=>{
  await open(page);expect(await page.content()).not.toContain("synthetic-owner-workflow-fixture");
  // Browser networking can regenerate Origin after route.continue. Forward the
  // actual signed owner action through the authenticated test HTTP client with
  // an adversarial Origin, then expose the real server response to the page.
  await page.route("**/api/workflow",async route=>{
    const response=await page.request.post(base+"/api/workflow",{headers:{...route.request().headers(),origin:"https://outside.invalid"},data:route.request().postDataJSON()});
    await route.fulfill({response});
  });
  await page.getByRole("button",{name:"Approve exact candidate"}).click();
  await expect(page.locator("section[role=alert]")).toContainText("Same-origin request required");
  expect((await state(request)).workspace.records.filter((r:{kind:string})=>r.kind==="approval")).toHaveLength(0);
});
test("actual owner action boundary bounds payload bytes before parsing",async({page,request})=>{
  await open(page);
  await page.route("**/api/workflow",route=>route.continue({postData:JSON.stringify({project:"bobai",command:{title:"x".repeat(20000)}})}));
  await page.getByRole("button",{name:"Approve exact candidate"}).click();
  await expect(page.locator("section[role=alert]")).toContainText("Request too large");
  expect((await state(request)).workspace.records.filter((r:{kind:string})=>r.kind==="approval")).toHaveLength(0);
});

test("upstream re-review cannot resurrect old dependent evidence in the rendered workflow",async({page,request})=>{
  await reset(request,"dependency_ready",page);await page.goto(base+"/work?project=bobai&packet=packet-1");
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeEnabled();
  await control(request,{replacePrior:true});await page.getByRole("button",{name:"Approve exact candidate"}).click();
  await expect(page.getByText("Complete and review the required earlier work first.",{exact:true})).toBeVisible();
  const view=(await state(request)).workspace;expect(view.packets.find((p:{id:string})=>p.id==="packet-1").state).toBe("ready");
  expect(view.records.filter((r:{kind:string;packetId:string})=>r.kind==="approval"&&r.packetId==="packet-1")).toHaveLength(0);
});
test("reviewed dependent exposes stale historical acceptance after upstream replacement",async({page,request})=>{
  await reset(request,"dependency_reviewed",page);await control(request,{replacePrior:true});
  await page.goto(base+"/work?project=bobai&packet=packet-1");
  await expect(page.getByText(/Historical review retained/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeDisabled();
  await page.screenshot({path:screen("governed-stale-dependency"),fullPage:true});
});

test("reload reconciles a timeout-after-commit using only the retained operation identifier",async({page,request})=>{
  await reset(request,"empty",page);await open(page);await control(request,{responseDelayMs:17000});
  await page.getByLabel("Capture a governed work packet").fill("Recovered after reload");await page.getByLabel("Capture a governed work packet").press("Enter");
  await expect(page.getByRole("button",{name:"Retry same request"})).toBeVisible({timeout:25000});
  await control(request,{responseDelayMs:0});
  const operation=new URL(page.url()).searchParams.get("operation");expect(operation).toBeTruthy();await page.reload();
  await expect(page.getByRole("heading",{name:"Original operation confirmed"})).toBeVisible();
  expect((await state(request)).workspace.packets).toHaveLength(1);
  expect((await state(request)).history.items).toHaveLength(1);
  await expect(page.getByLabel("Project",{exact:true}).locator("option")).toHaveCount(2);
  expect(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}))).toEqual({local:[],session:[]});
});

test("revoked project vanishes from directory and cannot recover or select its records",async({page,request})=>{
  await open(page);await expect(page.getByLabel("Project",{exact:true}).locator("option[value=sample]")).toHaveCount(1);
  await control(request,{revokeProject:"sample"});await page.reload();
  await expect(page.getByLabel("Project",{exact:true}).locator("option[value=sample]")).toHaveCount(0);
  await page.goto(base+"/work?project=sample&operation=unknown-operation");
  await expect(page.getByText("This connection is not authorized for the selected project.",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Capture a governed work packet")).toHaveCount(0);
  const status=await page.evaluate(async()=>{const response=await fetch("/api/workflow?project=sample&operation=unknown-operation",{cache:"no-store"});return response.status;});expect(status).toBe(409);
});

for(const mode of ["capture","revise"] as const)test(`coherent recovery renders ${mode} committed between old workspace and reconciliation`,async({page,request})=>{
  await reset(request,mode==="capture"?"empty":"ready",page);await control(request,{recoveryRace:mode});
  await page.goto(base+"/work?project=bobai&operation=race-"+mode);
  await expect(page.getByRole("heading",{name:"Original operation confirmed"})).toBeVisible();
  const result=await state(request),packet=result.raceObservation.committedPacket;
  expect(result.raceObservation.oldPackets.length).toBe(mode==="capture"?0:1);
  if(mode==="revise")expect(result.raceObservation.oldPackets[0].version).toBeLessThan(packet.version);
  await expect(page.getByRole("heading",{name:packet.title,exact:true})).toBeVisible();
  await expect(page.getByText(`In preparation · version ${packet.version}`,{exact:true})).toBeVisible();
  await expect(page.getByLabel("Specification · acceptance criteria")).toHaveValue(packet.specification);
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Verify readiness"})).toBeDisabled();
  await expect(page.getByText("No current immutable verification evidence.",{exact:true})).toBeVisible();
  expect(result.workspace.packets.find((p:{id:string})=>p.id===packet.id).version).toBe(packet.version);
});
test("workspace failure never claims recovered current state even when standalone receipt is available",async({page,request})=>{
  await open(page);await page.getByRole("button",{name:"Approve exact candidate"}).click();
  await expect(page.getByRole("heading",{name:"Candidate reviewed"})).toBeVisible();
  const op=(await state(request)).history.items.find((h:{action:string})=>h.action==="review").operation_id;
  await control(request,{workspaceFailureOnly:true});
  const receipt=await ownerCore(page,"/v1/governed/bobai/receipts/"+op);expect((await receipt.json()).outcome).toBe("committed");
  await page.goto(base+"/work?project=bobai&operation="+op);
  await expect(page.getByRole("heading",{name:"Original operation confirmed"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Current project records are unavailable."})).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve exact candidate"})).toHaveCount(0);
});

test("owner verifier outage retains original request and fresh proof retry advances once",async({page,request})=>{
 await open(page);await control(request,{verifierFailure:true});await page.getByRole("button",{name:"Approve exact candidate"}).click();
 await expect(page.getByRole("button",{name:"Retry same request"})).toBeVisible();expect((await state(request)).workspace.packets[0].state).toBe("ready");
 await control(request,{verifierFailure:false});await page.getByRole("button",{name:"Retry same request"}).click();
 await expect(page.getByRole("heading",{name:"Candidate reviewed"})).toBeVisible();expect((await state(request)).history.items.filter((h:{action:string})=>h.action==="review")).toHaveLength(1);
});

test("actual Better Auth rejects forged and expired owner cookies without cached authority",async({page,context,request})=>{
 test.skip(process.env.BOB_E2E_REAL_AUTH!=="true","actual-library fixture only");await open(page);
 const cookie=(await context.cookies()).find(c=>c.name.endsWith("session_token"));expect(cookie).toBeTruthy();
 const suffix=cookie!.value.endsWith("a")?"b":"a";await context.addCookies([{...cookie!,value:cookie!.value.slice(0,-1)+suffix}]);
 expect((await context.request.get(base+"/api/workflow?project=bobai")).status()).toBe(401);
 await context.addCookies([cookie!]);expect((await context.request.get(base+"/api/workflow?project=bobai")).status()).toBe(200);
 await control(request,{expireOwnerSessions:true});expect((await context.request.get(base+"/api/workflow?project=bobai")).status()).toBe(401);
});
test("actual Better Auth logout revokes both held cookie and unredeemed owner proof",async({page,context})=>{
 test.skip(process.env.BOB_E2E_REAL_AUTH!=="true","actual-library fixture only");await open(page);
 const cookies=await context.cookies(),cookie=cookies.find(c=>c.name.endsWith("session_token"));expect(cookie).toBeTruthy();
 const path="/v1/governed/bobai",issue=await context.request.post("http://127.0.0.1:3433/issue",{headers:{authorization:"Bearer synthetic-web-verifier-credential-not-live-20261001",cookie:cookies.map(c=>`${c.name}=${c.value}`).join("; ")},data:{audience:fixture,action:{method:"GET",path,bodyDigest:createHash("sha256").update("").digest("hex"),project:"bobai"}}});expect(issue.ok()).toBe(true);const {token}=await issue.json();
 const logout=await context.request.post(base+"/api/auth/sign-out",{headers:{origin:base},data:{}});expect(logout.ok()).toBe(true);
 await context.addCookies([cookie!]);expect((await context.request.get(base+"/api/workflow?project=bobai")).status()).toBe(401);
 expect((await context.request.get(fixture+path,{headers:{authorization:`Bearer ${token}`}})).status()).toBe(403);
});
test("actual Better Auth denies foreign login/origin and legacy cookie authority",async({page,context})=>{
 test.skip(process.env.BOB_E2E_REAL_AUTH!=="true","actual-library fixture only");await open(page);
 const origin=await context.request.post(base+"/api/auth/sign-in/email",{headers:{origin:"https://foreign-origin.invalid"},data:{email:"owner@example.invalid",password:"synthetic-workflow-password"}});expect(origin.status()).toBe(403);
 const foreign=await context.request.post(base+"/api/auth/sign-in/email",{headers:{origin:base},data:{email:"foreign@example.invalid",password:"synthetic-workflow-password"}});expect(foreign.ok()).toBe(false);
 await context.clearCookies();await context.addCookies([{name:"bob_control_session",value:"forged-legacy-session",domain:"127.0.0.1",path:"/"}]);expect((await context.request.get(base+"/api/workflow?project=bobai")).status()).toBe(401);
});

test("actual Better Auth retains configured password rate limiting",async({context})=>{
 test.skip(process.env.BOB_E2E_REAL_AUTH!=="true","actual-library fixture only");
 const statuses:number[]=[];for(let i=0;i<6;i++){const r=await context.request.post(base+"/api/auth/sign-in/email",{headers:{origin:base},data:{email:"owner@example.invalid",password:"wrong-synthetic-password"}});statuses.push(r.status());}
 expect(statuses).toContain(429);
});

for(const [scenario,label] of [['evidence_aged','expired evidence'],['evidence_missing','missing evidence'],['evidence_expired','expired evidence'],['evidence_untrusted','untrusted issuer'],['evidence_stored','stored · verification pending']] as const){
 test(`actual evidence ${scenario} is truthfully projected and cannot advance`,async({page,request})=>{
  await reset(request,scenario,page);await page.setViewportSize({width:scenario==='evidence_stored'?390:1440,height:900});await open(page);
  await expect(page.getByText('durability · '+label,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Verify readiness'})).toBeDisabled();await expect(page.getByRole('button',{name:'Approve exact candidate'})).toBeDisabled();
  const before=await state(request),packet=before.workspace.packets.find((p:{id:string})=>p.id==='packet-1');expect(before.workspace.packetEvidence.find((s:{packetId:string})=>s.packetId===packet.id).evidenceComplete).toBe(false);
  const response=await ownerCore(page,'/v1/governed/bobai/commands',{operationId:crypto.randomUUID(),packetId:packet.id,action:'ready',expectedVersion:packet.version,candidateDigest:packet.candidateDigest});expect(response.ok()).toBe(false);
  expect((await state(request)).workspace.packets.find((p:{id:string})=>p.id==='packet-1').state).toBe('draft');
  if(scenario==='evidence_stored'){await expect(page.getByText('Immutable evidence is saved. Current issuer and baseline verification is not connected; readiness remains blocked.',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('durability · '+label,{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:screen('governed-saved-evidence-mobile-blocked'),fullPage:true});}
 });
}
test('missing accepted policy blocks readiness and owner review in rendered UI and Core',async({page,request})=>{
 await reset(request,'policy_missing',page);await open(page);await expect(page.getByText('durability · policy not accepted',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Verify readiness'})).toBeDisabled();await expect(page.getByRole('button',{name:'Approve exact candidate'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Request changes'})).toBeDisabled();const packet=(await state(request)).workspace.packets[0];const response=await ownerCore(page,'/v1/governed/bobai/commands',{operationId:crypto.randomUUID(),packetId:packet.id,action:'review',expectedVersion:packet.version,candidateDigest:packet.candidateDigest,decision:'approve'});expect(response.ok()).toBe(false);expect((await state(request)).workspace.records.filter((r:{kind:string})=>r.kind==='approval')).toHaveLength(0);
});
