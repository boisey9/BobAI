import { z } from "zod";
import type { BobCoreConfig } from "../config.js";
import { fingerprint } from "../context/operations.js";
import { CONTEXT_SURFACES, type SharedContextPackage } from "../context/types.js";
import { prepareHybridContext, fresh } from "./context.js";
import {
  HYBRID_LIMITS, hybridBindingSchema, hybridPolicySchema, inferenceRequestSchema,
  deviceGrantSchema, heartbeatRecordSchema,
  type HybridBinding, type DeviceGrant, type HeartbeatRecord,
} from "./contracts.js";

// Server-derived facts only. These are proposed internal permissions, not newly
// registered interface/OAuth scopes or a substitute for live authorization.
export const liveAuthorizationSchema = z.object({
  binding: hybridBindingSchema, principalId: z.string().min(1).max(120),
  surface: z.enum(CONTEXT_SURFACES), status: z.enum(["active", "revoked"]),
  checkedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
  permissions: z.array(z.enum(["inference:cloud", "inference:local"])).max(2),
}).strict().refine(value => Date.parse(value.expiresAt) > Date.parse(value.checkedAt), "Invalid authorization interval.");
export type RoutingFacts = {
  binding: HybridBinding;
  authorization: z.infer<typeof liveAuthorizationSchema> | null;
  context: SharedContextPackage | null;
  cloud: Pick<BobCoreConfig, "aiProvider" | "aiModel" | "maxOutputTokens">;
  device?: { grant: DeviceGrant; heartbeat: HeartbeatRecord };
  now: number;
};
const cloudSchema = z.object({
  aiProvider: z.enum(["openai", "zai"]), aiModel: z.string().trim().min(1).max(120),
  maxOutputTokens: z.number().int().min(64).max(4096),
}).strict();
const same = (a: unknown, b: unknown) => fingerprint(a) === fingerprint(b);
const deny = <T extends string>(code: T) => ({ allowed: false as const, code });

/** Pure preflight planning only. No reads, writes, dispatch, retries or fallback.
 * No runtime imports this module. Omitting policy always means disabled.
 * A successful plan is content-bearing internal data, never an access grant.
 */
export function evaluateManualRoute(raw: unknown, facts: RoutingFacts, policyInput: unknown = {}) {
  const policy = hybridPolicySchema.safeParse(policyInput);
  if (!policy.success) return deny("invalid_policy");
  if (!policy.data.enabled) return deny("hybrid_disabled");
  const parsed = inferenceRequestSchema.safeParse(raw);
  if (!parsed.success) return deny("invalid_request");
  const request = parsed.data;
  if (request.processingMode !== "hosted-hybrid") return deny("local_only_unavailable");
  const binding = hybridBindingSchema.safeParse(facts.binding);
  if (!binding.success || !Number.isSafeInteger(facts.now) || !Number.isFinite(new Date(facts.now).getTime())) return deny("invalid_core_facts");
  if (!same(request.binding, binding.data)) return deny("binding_mismatch");
  const authorization = liveAuthorizationSchema.safeParse(facts.authorization);
  if (!authorization.success || !same(authorization.data.binding, binding.data)
    || authorization.data.status !== "active" || !fresh(authorization.data.checkedAt, facts.now, HYBRID_LIMITS.authorizationFreshMs)
    || Date.parse(authorization.data.expiresAt) <= facts.now) return deny("authorization_required");
  if (!authorization.data.permissions.includes(request.route.kind === "local" ? "inference:local" : "inference:cloud"))
    return deny("route_forbidden");
  if (!facts.context) return deny("context_unavailable");
  try {
    const prepared = prepareHybridContext(facts.context, binding.data, authorization.data.surface, facts.now);
    if (!prepared.ok) return deny(prepared.code);
    // Include the same complete Core instructions/context on either route. Never
    // drop decisions or memory to make a smaller model fit.
    const payload = { instructions: prepared.instructions, messages: request.messages };
    const inputBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    if (inputBytes > HYBRID_LIMITS.maxInputBytes) return deny("input_capacity_exceeded");
    const cloud = cloudSchema.safeParse(facts.cloud);
    if (!cloud.success) return deny("invalid_core_facts");
    const common = {
      version: 1 as const, operationId: request.operationId, binding: binding.data,
      requestFingerprint: fingerprint(request), processingMode: "hosted-hybrid" as const,
      policyRevision: policy.data.revision, context: prepared.capture,
      crossRouteFallback: false as const, inputBytes, maxOutputTokens: cloud.data.maxOutputTokens,
      payload,
    };
    if (request.route.kind === "cloud") return { allowed: true as const, plan: { ...common,
      target: { kind: "cloud" as const, provider: cloud.data.aiProvider, configuredModel: cloud.data.aiModel },
    } };
    const grant = deviceGrantSchema.safeParse(facts.device?.grant);
    const heartbeat = heartbeatRecordSchema.safeParse(facts.device?.heartbeat);
    if (!grant.success || !heartbeat.success) return deny("device_unavailable");
    if (!same(grant.data.binding, binding.data) || !same(heartbeat.data.binding, binding.data)
      || request.route.deviceId !== grant.data.identity.deviceId || !same(grant.data.identity, heartbeat.data.identity)) return deny("device_binding_mismatch");
    if (grant.data.status !== "approved" || Date.parse(grant.data.approvedAt) > facts.now
      || Date.parse(grant.data.expiresAt) <= facts.now) return deny("device_revoked_or_expired");
    if (!grant.data.capabilities.includes("health:report") || !grant.data.capabilities.includes("inference:ollama")
      || !heartbeat.data.report.capabilities.includes("health:report") || !heartbeat.data.report.capabilities.includes("inference:ollama"))
      return deny("capability_forbidden");
    if (!fresh(heartbeat.data.receivedAt, facts.now, HYBRID_LIMITS.heartbeatFreshMs)
      || !fresh(heartbeat.data.report.observedAt, facts.now, HYBRID_LIMITS.heartbeatFreshMs)) return deny("device_offline");
    if (heartbeat.data.report.health.busy) return deny("device_busy");
    if (!heartbeat.data.report.ollama || heartbeat.data.report.ollama.transport !== "loopback"
      || !heartbeat.data.report.ollama.cloudDisabled) return deny("local_transport_unverified");
    const selected = request.route.model;
    const approved = grant.data.models.find(item => same(item.model, selected));
    const installed = heartbeat.data.report.models.find(item => same(item.model, selected));
    if (!approved || !installed) return deny("model_unavailable");
    if (inputBytes > Math.min(approved.maxInputBytes, installed.maxInputBytes)
      || common.maxOutputTokens > Math.min(approved.maxOutputTokens, installed.maxOutputTokens)) return deny("model_capacity_exceeded");
    return { allowed: true as const, plan: { ...common,
      target: { kind: "local" as const, identity: grant.data.identity, model: approved.model },
    } };
  } catch {
    return deny("context_unavailable");
  }
}
