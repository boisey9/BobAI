import { createHash } from "node:crypto";
import { z } from "zod";

export const workflowId = z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
export const workflowDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const workflowPrincipal = z.object({ ownerId: workflowId, actorId: workflowId,
  projectKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/) }).strict();
export type PacketPrincipal = z.infer<typeof workflowPrincipal>;
export const packetStates = ["draft", "ready", "reviewed", "released"] as const;
export type PacketState = typeof packetStates[number];
export function workflowHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
const base = { operationId: workflowId, packetId: workflowId, expectedVersion: z.number().int().nonnegative() };
export const packetCommand = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("capture"), title: z.string().trim().min(1).max(300),
    specification: z.string().trim().max(6000), predecessors: z.array(workflowId).max(30) }).strict(),
  z.object({ ...base, action: z.literal("revise"), specification: z.string().trim().min(1).max(6000) }).strict(),
  z.object({ ...base, action: z.literal("accept_specification"), specificationDigest: workflowDigest }).strict(),
  z.object({ ...base, action: z.literal("candidate"), sourceDigest: workflowDigest,
    configurationDigest: workflowDigest }).strict(),
  z.object({ ...base, action: z.literal("ready"), candidateDigest: workflowDigest }).strict(),
  z.object({ ...base, action: z.literal("review"), candidateDigest: workflowDigest,
    decision: z.enum(["approve", "changes_requested"]) }).strict(),
  z.object({ ...base, action: z.literal("release"), candidateDigest: workflowDigest }).strict(),
]);
export type PacketCommand = z.infer<typeof packetCommand>;
export type WorkPacket = { id: string; title: string; specification: string; specificationDigest: string;
  predecessors: string[]; state: PacketState; version: number; candidateId: string | null;
  candidateDigest: string | null; updatedAt: string };
export const storedPacket = z.object({ id: workflowId, title: z.string().min(1).max(300),
  specification: z.string().max(6000), specificationDigest: workflowDigest,
  predecessors: z.array(workflowId).max(30), state: z.enum(packetStates), version: z.number().int().positive(),
  candidateId: workflowId.nullable(), candidateDigest: workflowDigest.nullable(), updatedAt: z.iso.datetime() }).strict();
export type WorkflowRecord = { id: string; kind: "specification" | "candidate" | "evidence" | "approval";
  packetId: string; content: Record<string, unknown>; createdAt: string };
export const governedPolicy = z.object({ versionId:workflowId, digest: workflowDigest, regressionDigest: workflowDigest,
  requiredChecks: z.array(workflowId).min(1).max(100), trustedIssuers: z.array(workflowId).min(1).max(100),
  approvalLifetimeMs: z.number().int().positive().max(86400000), accepted: z.literal(true) }).strict();
export type GovernedPolicy = z.infer<typeof governedPolicy>;
export function governedPolicyDigest(policy:Omit<GovernedPolicy,"digest">):string {
  return workflowHash(["governed-policy-v2",policy.versionId,policy.regressionDigest,policy.requiredChecks,policy.trustedIssuers,policy.approvalLifetimeMs,policy.accepted]);
}
export class WorkflowError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 403 | 404 | 409 | 503 = 409) { super(code); }
}
