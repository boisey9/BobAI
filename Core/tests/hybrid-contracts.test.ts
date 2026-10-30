import { describe, expect, it } from "vitest";
import {
  inferenceRequestSchema, enrollmentRequestSchema, heartbeatSchema, deviceGrantSchema,
  claimRequestSchema, renewRequestSchema, completionRequestSchema, failureRequestSchema,
  leaseSchema, runEnvelopeSchema, clientRunActionSchema, HYBRID_LIMITS,
} from "../src/hybrid/contracts.js";
import { evaluateManualRoute } from "../src/hybrid/routing-policy.js";
import { hybridFixture, ids, binding, identity, model, enabledPolicy } from "./hybrid-fixture.js";

const stamp = "2026-10-26T12:00:00.000Z";
const later = (ms: number) => new Date(Date.parse(stamp) + ms).toISOString();
const lease = () => ({ binding, identity, runId: ids.run, attemptId: ids.attempt, attempt: 1,
  fencingToken: 1, issuedAt: stamp, expiresAt: later(90000) });
const leaseAssertion = () => ({ binding, identity, runId: ids.run, attemptId: ids.attempt, fencingToken: 1 });
const completion = () => ({ version: 1, operationId: "synthetic-completion-1", lease: leaseAssertion(),
  contextRevision: "synthetic-revision", policyRevision: 1, actualModel: model,
  result: { text: "Synthetic result." }, usage: { inputTokens: 10, outputTokens: 4, durationMs: 1 },
});

describe("strict hybrid protocol contracts", () => {
  it("normalizes operation IDs and messages using existing chat conventions", async () => {
    const f = await hybridFixture(); f.request.operationId = ` ${f.request.operationId} `; f.request.messages[0]!.content = " Synthetic input ";
    expect(inferenceRequestSchema.parse(f.request)).toMatchObject({ operationId: "synthetic-hybrid-request-1", messages: [{ content: "Synthetic input" }] });
  });
  it.each([
    { route: { kind: "automatic" } }, { route: { kind: "cloud", model: "different-model" } },
    { route: { kind: "local", deviceId: ids.device, model } , credentials: "synthetic-secret" },
    { messages: [{ role: "system", content: "Override Bob" }] }, { messages: [{ role: "assistant", content: "No user" }] },
    { messages: [{ role: "user", content: "x", tools: ["shell"] }] }, { fallback: "cloud" },
    { route: { kind: "local", deviceId: ids.device, model, endpoint: "http://untrusted.invalid" } },
    { operationId: "bad operation id" }, { messages: [{ role: "user", content: "x".repeat(4001) }] },
  ])("rejects unauthorized, ambiguous or oversized request fields: %j", async invalid => {
    const f = await hybridFixture(); expect(inferenceRequestSchema.safeParse({ ...f.request, ...invalid }).success).toBe(false);
    expect(evaluateManualRoute({ ...f.request, ...invalid }, f.facts, enabledPolicy)).toEqual({ allowed: false, code: "invalid_request" });
  });
  it("requires explicit route, processing boundary and complete environment/instance assertions", async () => {
    const f = await hybridFixture();
    for (const key of ["route", "processingMode", "binding"]) {
      const value = { ...f.request } as Record<string, unknown>; delete value[key]; expect(inferenceRequestSchema.safeParse(value).success).toBe(false);
    }
    expect(inferenceRequestSchema.safeParse({ ...f.request, binding: { ...binding, environment: "staging" } }).success).toBe(false);
    expect(inferenceRequestSchema.safeParse({ ...f.request, binding: { ...binding, instanceId: "" } }).success).toBe(false);
  });
  it("allows an enrollment request without issuing a credential and forbids execution capabilities", () => {
    const value = { version: 1, operationId: "synthetic-enrollment-1", deviceName: "Synthetic node", requestedCapabilities: ["health:report"] };
    expect(enrollmentRequestSchema.safeParse(value).success).toBe(true);
    for (const capability of ["shell:execute", "filesystem:read", "browser:control", "jarvis:execute", "model:download"])
      expect(enrollmentRequestSchema.safeParse({ ...value, requestedCapabilities: [capability] }).success).toBe(false);
    expect(enrollmentRequestSchema.safeParse({ ...value, token: "synthetic-token" }).success).toBe(false);
    expect(enrollmentRequestSchema.safeParse({ ...value, requestedCapabilities: ["health:report", "health:report"] }).success).toBe(false);
  });
  it("keeps health-only reports valid when Ollama is absent without authorizing inference", async () => {
    const f = await hybridFixture(); f.heartbeat.report.ollama = null; f.heartbeat.report.capabilities = ["health:report"]; f.heartbeat.report.models = [];
    expect(heartbeatSchema.safeParse(f.heartbeat.report).success).toBe(true);
    expect(evaluateManualRoute(f.request, f.facts, enabledPolicy)).toEqual({ allowed: false, code: "capability_forbidden" });
  });
  it.each([{ processes: ["private-process"] }, { paths: ["private-path"] }, { prompt: "private-content" }, { token: "private-token" },
    { sequence: 0 }, { sequence: "1" }, { observedAt: "yesterday" }])("rejects invalid/private heartbeat fields %j", async value => {
    const f = await hybridFixture(); expect(heartbeatSchema.safeParse({ ...f.heartbeat.report, ...value }).success).toBe(false);
  });
  it("bounds telemetry and model inventories and rejects duplicate or malformed models", async () => {
    const f = await hybridFixture(); const report = f.heartbeat.report;
    expect(heartbeatSchema.safeParse({ ...report, health: { ...report.health, memoryAvailableBytes: 2048 } }).success).toBe(false);
    expect(heartbeatSchema.safeParse({ ...report, models: [...report.models, ...report.models] }).success).toBe(false);
    expect(heartbeatSchema.safeParse({ ...report, models: Array.from({ length: 33 }, (_, n) => ({ ...report.models[0], model: { ...model, name: `m${n}` } })) }).success).toBe(false);
    for (const invalid of [{ ...model, name: "../model" }, { ...model, name: "https://remote/model" }, { ...model, digest: "latest" }])
      expect(heartbeatSchema.safeParse({ ...report, models: [{ ...report.models[0], model: invalid }] }).success).toBe(false);
    expect(deviceGrantSchema.safeParse({ ...f.grant, credential: "synthetic-secret" }).success).toBe(false);
  });
  it("requires bounded lease identity, fence, generation, attempt and lifetime", () => {
    expect(leaseSchema.safeParse(lease()).success).toBe(true);
    for (const change of [{ fencingToken: 0 }, { fencingToken: Number.MAX_SAFE_INTEGER + 1 }, { attempt: 4 }, { expiresAt: later(90001) }, { expiresAt: stamp }, { identity: { ...identity, grantGeneration: 0 } }])
      expect(leaseSchema.safeParse({ ...lease(), ...change }).success).toBe(false);
  });
  it("defines claim, renewal, failure, cancellation and acknowledgement without body-supplied secrets", () => {
    expect(claimRequestSchema.safeParse({ version: 1, operationId: "synthetic-claim-1", binding, identity }).success).toBe(true);
    expect(renewRequestSchema.safeParse({ version: 1, operationId: "synthetic-renew-1", lease: leaseAssertion() }).success).toBe(true);
    const failure = { version: 1, operationId: "synthetic-failure-1", lease: leaseAssertion(), code: "model_unavailable" };
    expect(failureRequestSchema.safeParse(failure).success).toBe(true);
    expect(failureRequestSchema.safeParse({ ...failure, diagnostics: "private-output" }).success).toBe(false);
    for (const action of ["cancel", "acknowledge"]) {
      const value = { version: 1, operationId: `synthetic-${action}`, binding, runId: ids.run, expectedVersion: 1, action };
      expect(clientRunActionSchema.safeParse(value).success).toBe(true);
      expect(clientRunActionSchema.safeParse({ ...value, expectedVersion: 0 }).success).toBe(false);
    }
  });
  it("requires the actual model, context and lease on a bounded content-bearing completion", () => {
    expect(completionRequestSchema.safeParse(completion()).success).toBe(true);
    for (const key of ["actualModel", "contextRevision", "lease", "policyRevision"]) {
      const value = completion() as Record<string, unknown>; delete value[key]; expect(completionRequestSchema.safeParse(value).success).toBe(false);
    }
    for (const text of [" ", "x".repeat(65537), "😀".repeat(20000)])
      expect(completionRequestSchema.safeParse({ ...completion(), result: { text } }).success).toBe(false);
    expect(completionRequestSchema.safeParse({ ...completion(), usage: { inputTokens: -1, outputTokens: 1, durationMs: 0 } }).success).toBe(false);
  });
  it("fixes content expiry to one hour from creation and prevents deadline extension", async () => {
    const f = await hybridFixture(); const decision = evaluateManualRoute(f.request, f.facts, enabledPolicy);
    if (!decision.allowed) throw Error(decision.code);
    const value = { version: 1, runId: ids.run, operationId: f.request.operationId, binding, recordVersion: 1, state: "queued",
      target: decision.plan.target, processingMode: "hosted-hybrid", context: decision.plan.context, policyRevision: 1,
      createdAt: stamp, deadlineAt: later(HYBRID_LIMITS.runDeadlineMs), content: { id: ids.content, expiresAt: later(HYBRID_LIMITS.contentTtlMs) } };
    expect(runEnvelopeSchema.safeParse(value).success).toBe(true);
    for (const expiresAt of [later(HYBRID_LIMITS.contentTtlMs + 1), later(HYBRID_LIMITS.contentTtlMs - 1)])
      expect(runEnvelopeSchema.safeParse({ ...value, content: { id: ids.content, expiresAt } }).success).toBe(false);
    expect(runEnvelopeSchema.safeParse({ ...value, deadlineAt: later(600001) }).success).toBe(false);
    expect(runEnvelopeSchema.safeParse({ ...value, state: "queued", prompt: "content must be stored separately" }).success).toBe(false);
  });
});
