import { afterEach, describe, expect, it, vi } from "vitest";
import { fingerprint } from "../src/context/operations.js";
import { buildBobInstructions } from "../src/prompts/bob.js";
import { DEFAULT_HYBRID_POLICY, HYBRID_LIMITS } from "../src/hybrid/contracts.js";
import { evaluateManualRoute } from "../src/hybrid/routing-policy.js";
import { hybridFixture, ids, enabledPolicy, type HybridFixture } from "./hybrid-fixture.js";

afterEach(() => vi.unstubAllGlobals());
const run = (f: HybridFixture) => evaluateManualRoute(f.request, f.facts, enabledPolicy);
function allow(f: HybridFixture) {
  const result = run(f); expect(result.allowed).toBe(true);
  if (!result.allowed) throw Error(result.code);
  return result.plan;
}

describe("default-off pure manual hybrid policy", () => {
  it.each([undefined, {}, { enabled: false }, DEFAULT_HYBRID_POLICY])("is disabled with default policy %j", async policy => {
    const f = await hybridFixture(); expect(evaluateManualRoute(f.request, f.facts, policy)).toEqual({ allowed: false, code: "hybrid_disabled" });
  });
  it.each([{ enabled: "true" }, { enabled: true, routing: "automatic" }, { enabled: true, fallback: "cloud" }])("rejects invalid enabling policy %j", async policy => {
    const f = await hybridFixture(); expect(evaluateManualRoute(f.request, f.facts, policy)).toEqual({ allowed: false, code: "invalid_policy" });
  });
  it("preserves Core identity, approved context, revision and exact model for both choices without side effects", async () => {
    const f = await hybridFixture(); const before = structuredClone(f.facts);
    const network = vi.fn(() => { throw Error("Unexpected network"); }); vi.stubGlobal("fetch", network);
    const local = allow(f); f.request.route = { kind: "cloud" }; const cloud = allow(f);
    expect(local.target).toMatchObject({ kind: "local", identity: f.grant.identity, model: f.grant.models[0]!.model });
    expect(cloud.target).toEqual({ kind: "cloud", provider: "openai", configuredModel: "synthetic-cloud" });
    expect(local.payload).toEqual(cloud.payload);
    expect(local.payload.instructions).toBe(buildBobInstructions(undefined, f.context));
    expect(local.payload.instructions).toContain("Synthetic approved project fact.");
    expect(local.payload.instructions).toContain("Keep one Bob identity.");
    expect(local.context.revision).toBe(f.context.revision); expect(local.context).toEqual(cloud.context);
    expect(local.processingMode).toBe("hosted-hybrid"); expect(local.crossRouteFallback).toBe(false);
    expect(local.policyRevision).toBe(1); expect(f.facts).toEqual(before); expect(network).not.toHaveBeenCalled();
  });
  it("uses the configured Z.AI adapter selection without changing the provider or promising its model fallback is disabled", async () => {
    const f = await hybridFixture(); f.facts.cloud.aiProvider = "zai"; f.facts.cloud.aiModel = "synthetic-zai"; f.request.route = { kind: "cloud" };
    expect(allow(f).target).toEqual({ kind: "cloud", provider: "zai", configuredModel: "synthetic-zai" });
  });
  it.each(["cloud", "local"] as const)("rejects genuinely local-only content processing on %s", async kind => {
    const f = await hybridFixture(); f.request.processingMode = "local-only"; if (kind === "cloud") f.request.route = { kind };
    expect(run(f)).toEqual({ allowed: false, code: "local_only_unavailable" });
  });
  it.each(["projectId", "projectKey", "ownerId", "environment", "instanceId"] as const)("cannot widen the caller binding via %s", async field => {
    const f = await hybridFixture(); Object.assign(f.request.binding, { [field]: field === "environment" ? "production" : field.endsWith("Id") && field !== "ownerId" ? ids.other : "other" });
    expect(run(f)).toEqual({ allowed: false, code: "binding_mismatch" });
  });
  const authCases: [string, (f: HybridFixture) => void][] = [
    ["missing", f => { f.facts.authorization = null; }],
    ["revoked", f => { f.facts.authorization!.status = "revoked"; }],
    ["expired", f => { f.facts.authorization!.expiresAt = new Date(f.facts.now).toISOString(); }],
    ["stale", f => { f.facts.authorization!.checkedAt = new Date(f.facts.now - HYBRID_LIMITS.authorizationFreshMs).toISOString(); }],
    ["future", f => { f.facts.authorization!.checkedAt = new Date(f.facts.now + 30001).toISOString(); }],
    ["wrong project", f => { f.facts.authorization!.binding.projectId = ids.other; }],
    ["wrong instance", f => { f.facts.authorization!.binding.instanceId = ids.other; }],
  ];
  it.each(authCases)("requires current Core authorization: %s", async (_name, mutate) => {
    const f = await hybridFixture(); mutate(f); expect(run(f)).toEqual({ allowed: false, code: "authorization_required" });
  });
  it("does not turn cloud permission into local permission", async () => {
    const f = await hybridFixture(); f.facts.authorization!.permissions = ["inference:cloud"];
    expect(run(f)).toEqual({ allowed: false, code: "route_forbidden" });
  });
  it.each(["project", "surface", "record", "memory"])("rejects mismatched context %s", async change => {
    const f = await hybridFixture();
    if (change === "project") f.context.project.id = ids.other;
    if (change === "surface") f.context.request.surface = "codex";
    if (change === "record") f.context.decisions[0]!.projectId = ids.other;
    if (change === "memory") f.context.memories[0]!.projectKey = "personal";
    expect(run(f)).toEqual({ allowed: false, code: "context_binding_mismatch" });
  });
  it.each(["decisions", "tasks", "memories", "handoffs"] as const)("rejects unavailable or stale required %s", async name => {
    const f = await hybridFixture(); f.context.sources[name].status = "unavailable";
    expect(run(f)).toEqual({ allowed: false, code: "context_unavailable" });
    f.context.sources[name].status = "available"; f.context.sources[name].checkedAt = new Date(f.facts.now - HYBRID_LIMITS.contextFreshMs).toISOString();
    expect(run(f)).toEqual({ allowed: false, code: "context_unavailable" });
  });
  it("discloses truncation and optional activity unavailability without dropping required context", async () => {
    const f = await hybridFixture(); f.context.sources.memories.truncated = true; f.context.sources.events.status = "unavailable";
    const plan = allow(f); expect(plan.context).toMatchObject({ partial: true, truncatedSources: ["memories"] });
    expect(plan.payload.instructions).toContain('"truncated":true');
  });
  it("keeps relevant state stable across operational events but changes it for decisions or completeness", async () => {
    const f = await hybridFixture(); const first = allow(f);
    await f.store.recordEvent({ ownerId: f.facts.binding.ownerId, projectId: ids.project, eventType: "synthetic.operation",
      summary: "Synthetic operational event", source: "web" });
    const next = await f.service.build({ projectKey: "bobai", surface: "web" }); f.facts.context = next;
    const second = allow(f); expect(second.context.revision).not.toBe(first.context.revision);
    expect(second.context.stateHash).toBe(first.context.stateHash);
    next.decisions[0]!.decision = "Changed synthetic approved decision";
    expect(allow(f).context.stateHash).not.toBe(second.context.stateHash);
    next.decisions[0]!.decision = "Keep one Bob identity."; next.sources.tasks.truncated = true;
    expect(allow(f).context.stateHash).not.toBe(second.context.stateHash);
  });
  it("uses existing canonical fingerprints for identical retries and changed payload/target conflicts", async () => {
    const f = await hybridFixture(); const first = allow(f);
    expect(first.requestFingerprint).toBe(fingerprint(f.request)); expect(allow(f).requestFingerprint).toBe(first.requestFingerprint);
    f.request.messages[0]!.content = "Changed synthetic input"; expect(allow(f).requestFingerprint).not.toBe(first.requestFingerprint);
    f.request.route = { kind: "cloud" }; expect(allow(f).requestFingerprint).not.toBe(first.requestFingerprint);
  });
  const deviceCases: [string, (f: HybridFixture) => void, string][] = [
    ["absent", f => { delete f.facts.device; }, "device_unavailable"],
    ["revoked", f => { f.grant.status = "revoked"; }, "device_revoked_or_expired"],
    ["expired", f => { f.grant.expiresAt = new Date(f.facts.now).toISOString(); f.grant.approvedAt = new Date(f.facts.now - 1000).toISOString(); }, "device_revoked_or_expired"],
    ["wrong project", f => { f.grant.binding.projectId = ids.other; }, "device_binding_mismatch"],
    ["wrong environment", f => { f.heartbeat.binding.environment = "production"; }, "device_binding_mismatch"],
    ["restored instance", f => { f.heartbeat.binding.instanceId = ids.other; }, "device_binding_mismatch"],
    ["old grant", f => { f.heartbeat.identity.grantGeneration = 2; }, "device_binding_mismatch"],
    ["wrong device", f => { f.heartbeat.identity.deviceId = ids.other; }, "device_binding_mismatch"],
    ["no capability", f => { f.grant.capabilities = ["health:report"]; }, "capability_forbidden"],
    ["stale receipt", f => { f.heartbeat.receivedAt = new Date(f.facts.now - 90000).toISOString(); }, "device_offline"],
    ["stale report", f => { f.heartbeat.report.observedAt = new Date(f.facts.now - 90000).toISOString(); }, "device_offline"],
    ["future heartbeat", f => { f.heartbeat.receivedAt = new Date(f.facts.now + 30001).toISOString(); }, "device_offline"],
    ["busy", f => { f.heartbeat.report.health.busy = true; }, "device_busy"],
    ["no Ollama", f => { f.heartbeat.report.ollama = null; }, "local_transport_unverified"],
    ["unverified transport", f => { f.heartbeat.report.ollama!.transport = "unverified"; }, "local_transport_unverified"],
    ["cloud enabled", f => { f.heartbeat.report.ollama!.cloudDisabled = false; }, "local_transport_unverified"],
    ["model not approved", f => { f.grant.models = []; }, "model_unavailable"],
    ["changed model digest", f => { f.heartbeat.report.models[0]!.model.digest = `sha256:${"b".repeat(64)}`; }, "model_unavailable"],
    ["input capacity", f => { f.grant.models[0]!.maxInputBytes = 1; }, "model_capacity_exceeded"],
    ["output capacity", f => { f.heartbeat.report.models[0]!.maxOutputTokens = 64; }, "model_capacity_exceeded"],
  ];
  it.each(deviceCases)("denies local selection with %s without offering fallback", async (_name, mutate, code) => {
    const f = await hybridFixture(); mutate(f); expect(run(f)).toEqual({ allowed: false, code });
  });
  it("contains malformed internal context and denies over-capacity inputs without echoing content", async () => {
    const f = await hybridFixture(); f.context.authority = null as never;
    expect(run(f)).toEqual({ allowed: false, code: "context_unavailable" });
    const large = await hybridFixture(); large.context.memories[0]!.content = "private synthetic".repeat(30000);
    expect(run(large)).toEqual({ allowed: false, code: "input_capacity_exceeded" });
  });
});
