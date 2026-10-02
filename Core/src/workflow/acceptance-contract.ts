import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const principalSchema = z.object({ ownerId: id, actorId: id, projectKey: id }).strict();
const requestSchema = z.object({ projectKey: id, candidateId: id, approvalId: id }).strict();
export const candidateSchema = z.object({ id, ownerId: id, projectKey: id, specificationDigest: digest,
  sourceDigest: digest, configurationDigest: digest, regressionDigest: digest, policyDigest: digest,
  predecessors: z.array(z.object({ packetId: id, candidateDigest: digest, approvalId: id }).strict()).max(30)
    .refine(v => v.every((p,i) => i === 0 || v[i-1]!.packetId < p.packetId), "predecessors must be unique and sorted") }).strict();
const policySchema = z.object({ digest, requiredChecks: z.array(id).min(1).max(100),
  trustedIssuers: z.array(id).min(1).max(100), accepted: z.literal(true) }).strict();
const checkSchema = z.object({ id, ownerId: id, projectKey: id, candidateDigest: digest,
  issuer: id, outcome: z.enum(["pass", "fail", "not_run"]), expiresAt: z.number().int().positive() }).strict();
const approvalSchema = z.object({ id, ownerId: id, projectKey: id, actorId: id,
  candidateDigest: digest, decision: z.enum(["approve", "changes_requested"]),
  expiresAt: z.number().int().positive(), revoked: z.boolean(), consumed: z.boolean() }).strict();
export type CandidateBinding = z.infer<typeof candidateSchema>;
export type WorkflowPrincipal = z.infer<typeof principalSchema>;
export function candidateDigest(value: CandidateBinding): string {
  const c = candidateSchema.parse(value);
  return createHash("sha256").update(JSON.stringify([c.id, c.ownerId, c.projectKey,
    c.specificationDigest, c.sourceDigest, c.configurationDigest, c.regressionDigest, c.policyDigest, c.predecessors])).digest("hex");
}
// Adapter results must come from authenticated, immutable authoritative records,
// never from the request body or ordinary project memory. No adapter is wired here.
export interface AcceptanceAuthority {
  ownerAuthorized(principal: WorkflowPrincipal): Promise<boolean>;
  currentCandidate(principal: WorkflowPrincipal, id: string): Promise<unknown>;
  policy(principal: WorkflowPrincipal): Promise<unknown>;
  specificationAccepted(principal: WorkflowPrincipal, digest: string): Promise<boolean>;
  predecessorsAccepted(principal: WorkflowPrincipal, candidate: CandidateBinding): Promise<boolean>;
  regressionAccepted(principal: WorkflowPrincipal, digest: string): Promise<boolean>;
  checks(principal: WorkflowPrincipal, candidate: CandidateBinding): Promise<unknown>;
  approval(principal: WorkflowPrincipal, id: string): Promise<unknown>;
}
export type Eligibility = { allowed: false; reason: string } | { allowed: true; candidateDigest: string; approvalId: string };
const denied = (reason: string): Eligibility => ({ allowed: false, reason });

// Eligibility only: a future durable transition must revalidate all inputs and
// consume approval/operation receipts in one scoped transaction. This does not
// advance a task, consume approval, grant permission or authorize deployment.
export async function evaluateAcceptance(principalValue: unknown, requestValue: unknown,
  authority?: AcceptanceAuthority, now = Date.now()): Promise<Eligibility> {
  const parsedPrincipal = principalSchema.safeParse(principalValue);
  const parsedRequest = requestSchema.safeParse(requestValue);
  if (!parsedPrincipal.success || !parsedRequest.success || !Number.isSafeInteger(now) || now < 0) return denied("invalid_request");
  const p = parsedPrincipal.data, request = parsedRequest.data;
  if (p.projectKey !== request.projectKey || p.projectKey === "personal") return denied("project_denied");
  if (!authority) return denied("authority_unavailable");
  try {
    if (!await authority.ownerAuthorized(p)) return denied("owner_approval_required");
    const c = candidateSchema.parse(await authority.currentCandidate(p, request.candidateId));
    if (c.id !== request.candidateId || c.ownerId !== p.ownerId || c.projectKey !== p.projectKey) return denied("candidate_scope_mismatch");
    const policy = policySchema.parse(await authority.policy(p));
    if (policy.digest !== c.policyDigest || new Set(policy.requiredChecks).size !== policy.requiredChecks.length) return denied("policy_mismatch");
    if (!await authority.specificationAccepted(p, c.specificationDigest)) return denied("specification_required");
    if (!await authority.predecessorsAccepted(p, c)) return denied("predecessor_required");
    if (!await authority.regressionAccepted(p, c.regressionDigest)) return denied("regression_baseline_required");
    const fingerprint = candidateDigest(c);
    const checks = z.array(checkSchema).max(1000).parse(await authority.checks(p, c));
    for (const required of policy.requiredChecks) {
      const matches = checks.filter(v => v.id === required);
      if (matches.length !== 1) return denied("evidence_missing_or_ambiguous");
      const v = matches[0]!;
      if (v.ownerId !== p.ownerId || v.projectKey !== p.projectKey || v.candidateDigest !== fingerprint) return denied("evidence_scope_mismatch");
      if (!policy.trustedIssuers.includes(v.issuer)) return denied("evidence_issuer_untrusted");
      if (v.outcome !== "pass" || v.expiresAt <= now) return denied("evidence_not_current_pass");
    }
    const approval = approvalSchema.parse(await authority.approval(p, request.approvalId));
    if (approval.id !== request.approvalId || approval.ownerId !== p.ownerId || approval.projectKey !== p.projectKey || approval.actorId !== p.actorId) return denied("approval_scope_mismatch");
    if (approval.candidateDigest !== fingerprint || approval.revoked || approval.consumed || approval.expiresAt <= now || approval.decision !== "approve") return denied("approval_not_current");
    const current = candidateSchema.parse(await authority.currentCandidate(p, c.id));
    if (candidateDigest(current) !== fingerprint || !await authority.predecessorsAccepted(p, current) || !await authority.ownerAuthorized(p)) return denied("candidate_or_authority_changed");
    return { allowed: true, candidateDigest: fingerprint, approvalId: approval.id };
  } catch { return denied("authority_record_unavailable_or_invalid"); }
}
