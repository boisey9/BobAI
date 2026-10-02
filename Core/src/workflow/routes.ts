import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { WorkflowError, workflowPrincipal, type PacketPrincipal } from "./packet-contract.js";
import type { GovernedPacketService } from "./packet-service.js";

// The host must verify a dedicated credential/owner-session attestation and
// its requested project. Device-token possession or request headers/body are
// not owner authority. No production authenticator is supplied by this slice.
export type WorkflowAuthenticator=(request:Request, requestedProject:string)=>Promise<PacketPrincipal|null>;
export function createGovernedWorkflowRouter(service:GovernedPacketService, authenticate?:WorkflowAuthenticator, directoryAuthenticate?:(request:Request)=>Promise<PacketPrincipal[]|null>) {
  const app=new Hono();
  app.use("*",async(c,next)=>{c.header("cache-control","no-store");await next();});
  app.use("*",bodyLimit({maxSize:16384,onError:c=>c.json({error:{code:"workflow_payload_too_large"}},413)}));
  async function principal(request:Request, project:string) {
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(project)) throw new WorkflowError("invalid_project",400);
    const result=workflowPrincipal.safeParse(await authenticate?.(request,project));
    if (!result.success || result.data.projectKey!==project) throw new WorkflowError("workflow_access_denied",403);
    return result.data;
  }
  app.get("/_directory",async c=>{const principals=await directoryAuthenticate?.(c.req.raw);if(!principals)throw new WorkflowError("workflow_access_denied",403);return c.json(await service.directory(principals));});
  app.get("/:project/receipts/:operation",async c=>c.json(await service.reconcile(await principal(c.req.raw,c.req.param("project")),c.req.param("operation"))));
  app.get("/:project",async c=>c.json(await service.workspace(await principal(c.req.raw,c.req.param("project")),c.req.query("operation"))));
  app.get("/:project/history",async c=>{
    const before=c.req.query("before");
    return c.json(await service.history(await principal(c.req.raw,c.req.param("project")),before===undefined?undefined:Number(before)));
  });
  app.post("/:project/commands",async c=>{
    const p=await principal(c.req.raw,c.req.param("project"));
    let body:unknown;try{body=await c.req.json();}catch{throw new WorkflowError("invalid_json",400);}
    return c.json(await service.command(p,body));
  });
  app.onError((error,c)=>{
    if(error instanceof WorkflowError){
      // Only failures known to occur after a no-receipt lookup can confirm that
      // this operation was rejected. Revocation/pause/transport failures cannot
      // prove an earlier unacknowledged attempt did not commit.
      const rejected=["packet_version_conflict","candidate_changed","specification_required","specification_changed_or_missing",
        "predecessor_required","evidence_missing_or_ambiguous","evidence_not_current_pass","owner_review_requires_ready",
        "invalid_state_transition","policy_mismatch","invalid_workflow_command","invalid_json"].includes(error.code);
      return c.json({error:{code:error.code},outcome:rejected?"rejected":"unconfirmed"},error.status);
    }
    if(error instanceof z.ZodError)return c.json({error:{code:"invalid_workflow_record_or_request"}},400);
    return c.json({error:{code:"workflow_unavailable"}},503);
  });
  return app;
}
