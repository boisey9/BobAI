import { describe, expect, it } from "vitest";
import { candidateDigest, evaluateAcceptance, type AcceptanceAuthority, type CandidateBinding } from "../src/workflow/acceptance-contract.js";
const d = (v: string) => v.repeat(64);
const principal = { ownerId: "synthetic-owner", actorId: "owner-actor", projectKey: "sample" };
const request = { projectKey: "sample", candidateId: "candidate", approvalId: "approval" };
const c: CandidateBinding = { id: "candidate", ownerId: principal.ownerId, projectKey: "sample",
  specificationDigest: d("a"), sourceDigest: d("b"), configurationDigest: d("c"), regressionDigest: d("d"), policyDigest: d("e"), predecessors: [] };
const fingerprint = candidateDigest(c);
const evidence = { id: "regression", ownerId: principal.ownerId, projectKey: "sample", candidateDigest: fingerprint, issuer: "reviewer", outcome: "pass", expiresAt: 2000 };
const approval = { id: "approval", ownerId: principal.ownerId, actorId: principal.actorId, projectKey: "sample", candidateDigest: fingerprint, decision: "approve", expiresAt: 2000, revoked: false, consumed: false };
const fixture = (): AcceptanceAuthority => ({ ownerAuthorized: async () => true, currentCandidate: async () => c,
  policy: async () => ({ digest: c.policyDigest, requiredChecks: ["regression"], trustedIssuers: ["reviewer"], accepted: true }),
  specificationAccepted: async () => true, predecessorsAccepted: async () => true, regressionAccepted: async () => true,
  checks: async () => [evidence], approval: async () => approval });
describe("proposed candidate acceptance contract", () => {
  it("allows eligibility for one scoped exact candidate, without advancing anything", async () => {
    expect(await evaluateAcceptance(principal, request, fixture(), 1000)).toEqual({ allowed: true, candidateDigest: fingerprint, approvalId: "approval" });
  });
  it("requires an authority and rejects client-supplied approval assertions", async () => {
    expect(await evaluateAcceptance(principal, request)).toEqual({ allowed: false, reason: "authority_unavailable" });
    expect(await evaluateAcceptance(principal, { ...request, approved: true }, fixture(), 1000)).toEqual({ allowed: false, reason: "invalid_request" });
  });
  it("rejects another project before any adapter read", async () => {
    let calls = 0; const a = fixture(); a.ownerAuthorized = async () => { calls++; return true; };
    expect(await evaluateAcceptance(principal, { ...request, projectKey: "other" }, a, 1000)).toEqual({ allowed: false, reason: "project_denied" });
    expect(calls).toBe(0);
  });
  for (const [name, key, reason] of [["owner", "ownerAuthorized", "owner_approval_required"], ["specification", "specificationAccepted", "specification_required"], ["predecessor", "predecessorsAccepted", "predecessor_required"], ["baseline", "regressionAccepted", "regression_baseline_required"]] as const) {
    it(`requires authoritative ${name} acceptance`, async () => {
      const a = fixture(); a[key] = async () => false;
      expect(await evaluateAcceptance(principal, request, a, 1000)).toEqual({ allowed: false, reason });
    });
  }
  for (const values of [[], [evidence, evidence]]) it(`rejects ${values.length ? "ambiguous" : "missing"} evidence`, async () => {
    const a = fixture(); a.checks = async () => values;
    expect(await evaluateAcceptance(principal, request, a, 1000)).toEqual({ allowed: false, reason: "evidence_missing_or_ambiguous" });
  });
  it.each([{ projectKey: "other" }, { candidateDigest: d("f") }, { issuer: "worker" }, { outcome: "fail" }, { outcome: "not_run" }, { expiresAt: 1000 }])("rejects invalid evidence %j", async patch => {
    const a = fixture(); a.checks = async () => [{ ...evidence, ...patch }];
    expect((await evaluateAcceptance(principal, request, a, 1000)).allowed).toBe(false);
  });
  it.each([{ projectKey: "other" }, { ownerId: "other-owner" }, { actorId: "worker" }, { candidateDigest: d("f") }, { expiresAt: 1000 }, { revoked: true }, { consumed: true }, { decision: "changes_requested" }])("rejects forged, stale or mismatched approval %j", async patch => {
    const a = fixture(); a.approval = async () => ({ ...approval, ...patch });
    expect((await evaluateAcceptance(principal, request, a, 1000)).allowed).toBe(false);
  });
  it("invalidates eligibility when the candidate changes during verification", async () => {
    let calls = 0; const a = fixture(); a.currentCandidate = async () => calls++ ? { ...c, sourceDigest: d("f") } : c;
    expect(await evaluateAcceptance(principal, request, a, 1000)).toEqual({ allowed: false, reason: "candidate_or_authority_changed" });
  });
  it("rejects revocation during verification and malformed/unavailable records", async () => {
    let calls = 0; const a = fixture(); a.ownerAuthorized = async () => calls++ === 0;
    expect((await evaluateAcceptance(principal, request, a, 1000)).allowed).toBe(false);
    a.ownerAuthorized = async () => true; a.approval = async () => { throw new Error("offline"); };
    expect(await evaluateAcceptance(principal, request, a, 1000)).toEqual({ allowed: false, reason: "authority_record_unavailable_or_invalid" });
  });
  it("binds exact sorted dependency candidates and acceptance identities",()=>{
    const dependent={...c,predecessors:[{packetId:"prior",candidateDigest:d("a"),approvalId:"accepted-1"}]};
    expect(candidateDigest(dependent)).not.toBe(fingerprint);
    expect(candidateDigest({...dependent,predecessors:[{...dependent.predecessors[0]!,candidateDigest:d("b")}]})).not.toBe(candidateDigest(dependent));
    expect(candidateDigest({...dependent,predecessors:[{...dependent.predecessors[0]!,approvalId:"accepted-2"}]})).not.toBe(candidateDigest(dependent));
    expect(()=>candidateDigest({...c,predecessors:[{packetId:"z",candidateDigest:d("a"),approvalId:"one"},{packetId:"a",candidateDigest:d("b"),approvalId:"two"}]})).toThrow();
    expect(()=>candidateDigest({...c,predecessors:undefined} as unknown as CandidateBinding)).toThrow();
  });
  it("rechecks dependency acceptance after evidence and approval reads",async()=>{
    let calls=0;const a=fixture();a.predecessorsAccepted=async()=>calls++===0;
    expect(await evaluateAcceptance(principal,request,a,1000)).toEqual({allowed:false,reason:"candidate_or_authority_changed"});
  });
  it("binds every behavior-changing candidate input", () => {
    for (const key of ["specificationDigest", "sourceDigest", "configurationDigest", "regressionDigest", "policyDigest"] as const) expect(candidateDigest({ ...c, [key]: d("f") })).not.toBe(fingerprint);
  });
});
