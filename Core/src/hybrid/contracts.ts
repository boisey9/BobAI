import { z } from "zod";
import { chatMessageSchema } from "../contracts.js";

// Draft v1 contracts only. No endpoint, credential, database, or worker is wired.
export const HYBRID_LIMITS = Object.freeze({
  heartbeatFreshMs: 90_000,
  authorizationFreshMs: 30_000,
  contextFreshMs: 300_000,
  clockSkewMs: 30_000,
  leaseMs: 90_000,
  renewAfterMs: 30_000,
  runDeadlineMs: 600_000,
  contentTtlMs: 3_600_000,
  maxAttempts: 3,
  maxInputBytes: 262_144,
  maxResultBytes: 65_536,
});
export const operationIdSchema = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const label = z.string().trim().min(1).max(120);
export const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const hybridBindingSchema = z.object({
  ownerId: z.string().trim().min(1).max(100),
  projectId: z.uuid(),
  projectKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
  environment: z.enum(["testing", "production"]),
  instanceId: z.uuid(),
}).strict();
export type HybridBinding = z.infer<typeof hybridBindingSchema>;

export const modelIdentitySchema = z.object({
  name: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?(?::[A-Za-z0-9][A-Za-z0-9_.-]*)?$/),
  digest: digestSchema,
}).strict();
const modelCapacitySchema = z.object({
  model: modelIdentitySchema,
  maxInputBytes: z.number().int().positive().max(HYBRID_LIMITS.maxInputBytes),
  maxOutputTokens: z.number().int().min(64).max(4096),
}).strict();
const capabilitiesSchema = z.array(z.enum(["health:report", "inference:ollama"])).min(1).max(2)
  .refine(values => new Set(values).size === values.length, "Capabilities must be unique.");
const modelsSchema = z.array(modelCapacitySchema).max(32)
  .refine(values => new Set(values.map(value => value.model.name)).size === values.length, "Model names must be unique.");

export const deviceIdentitySchema = z.object({
  deviceId: z.uuid(), grantId: z.uuid(), grantGeneration: version,
}).strict();
export const enrollmentRequestSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema, deviceName: label,
  requestedCapabilities: capabilitiesSchema,
}).strict();
// Core-owned grant record, never an authentication claim accepted from a worker.
export const deviceGrantSchema = z.object({
  binding: hybridBindingSchema, identity: deviceIdentitySchema,
  status: z.enum(["approved", "revoked"]), approvedAt: timestamp, expiresAt: timestamp,
  capabilities: capabilitiesSchema, models: modelsSchema,
}).strict().refine(value => Date.parse(value.expiresAt) > Date.parse(value.approvedAt), "Invalid grant lifetime.");
export type DeviceGrant = z.infer<typeof deviceGrantSchema>;

export const heartbeatSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema, sequence: version,
  observedAt: timestamp, workerVersion: label,
  capabilities: capabilitiesSchema, models: modelsSchema,
  ollama: z.object({ version: label, transport: z.enum(["loopback", "unverified"]), cloudDisabled: z.boolean() }).strict().nullable(),
  health: z.object({
    uptimeSeconds: count, memoryTotalBytes: count, memoryAvailableBytes: count,
    busy: z.boolean(),
  }).strict().refine(value => value.memoryAvailableBytes <= value.memoryTotalBytes, "Invalid memory capacity."),
}).strict();
// receivedAt and binding come from Core after authentication and replay checks.
export const heartbeatRecordSchema = z.object({
  binding: hybridBindingSchema, identity: deviceIdentitySchema,
  receivedAt: timestamp, report: heartbeatSchema,
}).strict();
export type HeartbeatRecord = z.infer<typeof heartbeatRecordSchema>;

export const manualRouteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cloud") }).strict(),
  z.object({ kind: z.literal("local"), deviceId: z.uuid(), model: modelIdentitySchema }).strict(),
]);
export const inferenceRequestSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema,
  // Assertions compared to a separately authenticated Core binding, not grants.
  binding: hybridBindingSchema,
  route: manualRouteSchema,
  processingMode: z.enum(["hosted-hybrid", "local-only"]),
  messages: z.array(chatMessageSchema.strict()).min(1).max(20),
}).strict().refine(value => value.messages.at(-1)?.role === "user", "The final message must be from the user.");
export type InferenceRequest = z.infer<typeof inferenceRequestSchema>;

export const hybridPolicySchema = z.object({
  version: z.literal(1).default(1), revision: version.default(1),
  enabled: z.boolean().default(false), routing: z.literal("manual").default("manual"),
}).strict();
export const DEFAULT_HYBRID_POLICY = Object.freeze(hybridPolicySchema.parse({}));

export const contextCaptureSchema = z.object({
  authority: z.literal("bob-core"), revision: z.string().min(1).max(128),
  generatedAt: timestamp, stateHash: digestSchema, partial: z.boolean(),
  truncatedSources: z.array(z.enum(["decisions", "tasks", "events", "memories", "handoffs"])).max(5),
}).strict();
export const selectedTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cloud"), provider: z.enum(["openai", "zai"]), configuredModel: label }).strict(),
  z.object({ kind: z.literal("local"), identity: deviceIdentitySchema, model: modelIdentitySchema }).strict(),
]);
export const runEnvelopeSchema = z.object({
  version: z.literal(1), runId: z.uuid(), operationId: operationIdSchema,
  binding: hybridBindingSchema, recordVersion: version,
  state: z.enum(["queued", "running", "succeeded", "failed", "cancelled", "expired"]),
  target: selectedTargetSchema, processingMode: z.literal("hosted-hybrid"),
  context: contextCaptureSchema, policyRevision: version,
  createdAt: timestamp, deadlineAt: timestamp,
  content: z.object({ id: z.uuid(), expiresAt: timestamp }).strict(),
}).strict().superRefine((value, ctx) => {
  const created = Date.parse(value.createdAt), deadline = Date.parse(value.deadlineAt);
  if (deadline <= created || deadline > created + HYBRID_LIMITS.runDeadlineMs)
    ctx.addIssue({ code: "custom", path: ["deadlineAt"], message: "Run deadline exceeds the allowed interval." });
  if (Date.parse(value.content.expiresAt) !== created + HYBRID_LIMITS.contentTtlMs)
    ctx.addIssue({ code: "custom", path: ["content", "expiresAt"], message: "Content expiry is fixed at creation plus one hour." });
});
export type RunEnvelope = z.infer<typeof runEnvelopeSchema>;

const leaseFieldsSchema = z.object({
  binding: hybridBindingSchema, identity: deviceIdentitySchema,
  runId: z.uuid(), attemptId: z.uuid(), attempt: z.number().int().min(1).max(HYBRID_LIMITS.maxAttempts),
  fencingToken: version, issuedAt: timestamp, expiresAt: timestamp,
}).strict();
export const leaseSchema = leaseFieldsSchema.refine(value => {
  const duration = Date.parse(value.expiresAt) - Date.parse(value.issuedAt);
  return duration > 0 && duration <= HYBRID_LIMITS.leaseMs;
}, "Invalid lease interval.");
const leaseAssertionSchema = leaseFieldsSchema.pick({ binding: true, identity: true, runId: true, attemptId: true, fencingToken: true });
export const claimRequestSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema, binding: hybridBindingSchema,
  identity: deviceIdentitySchema,
}).strict();
export const renewRequestSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema, lease: leaseAssertionSchema,
}).strict();
const resultText = z.string().min(1).max(HYBRID_LIMITS.maxResultBytes)
  .refine(value => value.trim().length > 0 && new TextEncoder().encode(value).byteLength <= HYBRID_LIMITS.maxResultBytes, "Result exceeds the content limit.");
// Worker/Ollama completion. Cloud adapters keep their existing AIProviderResult;
// durable acceptance and receipt mapping are a later service implementation.
export const completionRequestSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema, lease: leaseAssertionSchema,
  contextRevision: z.string().min(1).max(128), policyRevision: version,
  actualModel: modelIdentitySchema, result: z.object({ text: resultText }).strict(),
  usage: z.object({ inputTokens: count, outputTokens: count, durationMs: count }).strict(),
}).strict();
export const failureRequestSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema, lease: leaseAssertionSchema,
  code: z.enum(["model_unavailable", "capacity_exceeded", "inference_timeout", "connection_lost", "cancelled", "lease_expired"]),
}).strict();
export const clientRunActionSchema = z.object({
  version: z.literal(1), operationId: operationIdSchema, binding: hybridBindingSchema,
  runId: z.uuid(), expectedVersion: version, action: z.enum(["cancel", "acknowledge"]),
}).strict();

// Completion acceptance, replay protection and restore revocation require the
// future transactional Core service; valid JSON is never execution authority.
