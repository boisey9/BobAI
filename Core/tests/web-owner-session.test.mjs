import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ enabled: true, email: "owner@example.test", session: null, cookie: undefined, failure: null }));
vi.mock("../../Web/lib/owner-auth", () => ({
  ownerAuthEnabled: () => auth.enabled, ownerEmail: () => auth.email,
  withOwnerAuth: async work => {
    if (auth.failure) throw auth.failure;
    return work({ api: { getSession: async () => auth.session } });
  },
}));
vi.mock("../../Web/node_modules/next/headers.js", () => ({
  headers: async () => new Headers(), cookies: async () => ({ get: () => ({ value: auth.cookie }) }),
}));
import * as session from "../../Web/lib/session";

const task = { projectKey: "bobai", projectId: "synthetic-project-id", coreBaseURL: "https://core.example", coreCredential: "synthetic-core-credential" };
const project = { anchorId: "synthetic-personal-anchor", coreBaseURL: task.coreBaseURL, coreCredential: task.coreCredential };
const review = { payload: "synthetic-checkpoint", coreBaseURL: task.coreBaseURL, coreCredential: task.coreCredential };
beforeEach(() => {
  auth.enabled = true; auth.email = "owner@example.test"; auth.cookie = undefined; auth.failure = null;
  auth.session = { user: { email: auth.email }, session: { token: "synthetic-session-one" } };
  vi.stubEnv("BOB_AUTH_SECRET", "synthetic-owner-secret-000000000000000");
  vi.stubEnv("BOB_CONTROL_CENTER_SESSION_SECRET", "synthetic-legacy-secret-0000000000000");
});
afterEach(() => vi.unstubAllEnvs());

describe("owner session and consistency bindings", () => {
  it("requires the live owner session and binds CSRF to that session", async () => {
    const csrf = await session.getOwnerCsrfToken();
    expect(await session.validateOwnerCsrfToken(csrf)).toBe(true);
    expect(await session.validateOwnerCsrfToken("forged")).toBe(false);
    auth.session.session.token = "synthetic-session-two";
    expect(await session.validateOwnerCsrfToken(csrf)).toBe(false);
    auth.session.user.email = "outsider@example.test";
    expect(await session.hasOwnerSession()).toBe(false);
    expect(await session.getOwnerCsrfToken()).toBeNull();
    auth.session = null;
    expect(await session.validateOwnerCsrfToken(csrf)).toBe(false);
  });

  it("never falls back to a legacy cookie while database authentication is enabled or unavailable", async () => {
    auth.enabled = false; auth.cookie = session.createSessionToken();
    expect(await session.hasOwnerSession()).toBe(true);
    auth.enabled = true; auth.session = null;
    expect(await session.hasOwnerSession()).toBe(false);
    auth.failure = Error("synthetic unavailable");
    await expect(session.hasOwnerSession()).rejects.toThrow("unavailable");
  });

  it("retains legacy signature/expiry validation when explicitly configured", () => {
    auth.enabled = false;
    const now = 1000000, token = session.createSessionToken(now);
    expect(session.validateSessionToken(token, now)).toBe(true);
    expect(session.validateSessionToken(`${token}x`, now)).toBe(false);
    expect(session.validateSessionToken(`${token}.extra`, now)).toBe(false);
    expect(session.validateSessionToken(token, now + 43200000)).toBe(false);
  });

  it("makes recovery proofs deterministic across owner sessions but separate by purpose", async () => {
    const a = await session.getOwnerTaskBinding(task);
    const b = await session.getOwnerProjectBinding(project);
    const c = await session.signOwnerCheckpointReview(review);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.taskBindingMatches(a, a)).toBe(true);
    expect(session.projectBindingMatches(b, b)).toBe(true);
    expect(session.taskBindingMatches(b, a)).toBe(false);
    expect(session.projectBindingMatches(`${b}=`, b)).toBe(false);
    auth.session.session.token = "synthetic-reconnected-owner";
    expect(await session.getOwnerTaskBinding(task)).toBe(a);
    expect(await session.validateOwnerCsrfToken(a)).toBe(false);
    expect(session.validateSessionToken(a)).toBe(false);
  });

  it.each(Object.keys(task))("invalidates a task proof when %s changes", async key => {
    expect(await session.getOwnerTaskBinding({ ...task, [key]: `${task[key]}-changed` }))
      .not.toBe(await session.getOwnerTaskBinding(task));
  });
  it.each(Object.keys(project))("invalidates a project proof when %s changes", async key => {
    expect(await session.getOwnerProjectBinding({ ...project, [key]: `${project[key]}-changed` }))
      .not.toBe(await session.getOwnerProjectBinding(project));
  });
  it.each(Object.keys(review))("invalidates a review proof when %s changes", async key => {
    expect(await session.signOwnerCheckpointReview({ ...review, [key]: `${review[key]}-changed` }))
      .not.toBe(await session.signOwnerCheckpointReview(review));
  });
  it("binds proofs to owner and signing authority and refuses a revoked session", async () => {
    const first = await session.getOwnerTaskBinding(task);
    auth.email = "another@example.test"; auth.session.user.email = auth.email;
    expect(await session.getOwnerTaskBinding(task)).not.toBe(first);
    auth.email = "owner@example.test"; auth.session.user.email = auth.email;
    vi.stubEnv("BOB_AUTH_SECRET", "synthetic-rotated-secret-0000000000000000");
    expect(await session.getOwnerTaskBinding(task)).not.toBe(first);
    auth.session = null;
    for (const work of [() => session.getOwnerTaskBinding(task), () => session.getOwnerProjectBinding(project), () => session.signOwnerCheckpointReview(review)])
      await expect(work()).rejects.toThrow("Owner session required");
  });
});
