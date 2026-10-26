import { createElement } from "../../Web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../Web/node_modules/react-dom/server.node.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const seams = vi.hoisted(() => ({ password: false, handler: null, session: false }));
vi.mock("../../Web/lib/owner-auth", () => ({
  ownerAuthEnabled: () => true, ownerEmail: () => "owner@example.test",
  ownerPasswordLoginEnabled: () => seams.password,
  withOwnerAuth: async work => work({ handler: seams.handler }),
}));
vi.mock("../../Web/lib/session", () => ({
  hasOwnerSession: async () => seams.session,
  createSessionToken: () => { throw Error("Legacy session must not be minted"); },
  verifyOwnerPassword: () => { throw Error("Legacy password must not be used"); }, ownerSessionCookie: {},
}));
vi.mock("../../Web/lib/auth-client", () => ({ authClient: {} }));
vi.mock("../../Web/node_modules/next/navigation.js", () => ({ redirect: path => { throw Error(`redirect:${path}`); } }));
import { POST } from "../../Web/app/api/session/route";
import LoginPage from "../../Web/app/login/page";
import { OwnerLogin } from "../../Web/components/owner-login";

beforeEach(() => {
  vi.stubEnv("BOB_AUTH_BASE_URL", "https://owner.example");
  vi.stubEnv("BOB_GOVERNED_WORKFLOW_ENABLED", "false");
  vi.stubEnv("VERCEL", "");
  seams.password = false; seams.session = false;
  seams.handler = vi.fn(async () => Response.json({ ok: true }, { headers: {
    "set-cookie": "bob_owner.session_token=synthetic-session; Secure; HttpOnly; Path=/",
  } }));
});
afterEach(() => vi.unstubAllEnvs());
function request(fields = {}, origin = "https://owner.example") {
  return new Request("https://owner.example/api/session", { method: "POST", headers: { origin },
    body: new URLSearchParams({ password: "synthetic-password-not-used-externally", ...fields }) });
}
describe("preserved owner sign-in and governed workspace navigation", () => {
  it("requires the trusted origin and explicit password gate without legacy fallback", async () => {
    expect((await POST(request({}, "https://foreign.invalid"))).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(seams.handler).not.toHaveBeenCalled();
  });
  it("keeps workspace entry disabled by default and copies the auth session cookie", async () => {
    seams.password = true;
    const response = await POST(request({ returnTo: "/work?project=bobai" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://owner.example/account");
    expect(response.headers.get("set-cookie")).toContain("bob_owner.session_token=synthetic-session");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const forwarded = seams.handler.mock.calls[0][0];
    expect(new URL(forwarded.url).pathname).toBe("/api/auth/sign-in/email");
    expect(forwarded.headers.get("accept")).toBe("application/json");
    expect(forwarded.headers.get("sec-fetch-mode")).toBe("cors");
    expect((await forwarded.json()).email).toBe("owner@example.test");
  });
  it("preserves safe workspace destinations only when the existing gate is enabled", async () => {
    seams.password = true; vi.stubEnv("BOB_GOVERNED_WORKFLOW_ENABLED", "true");
    const response = await POST(request({ returnTo: "/work?project=bobai&packet=synthetic" }));
    expect(response.headers.get("location")).toBe("https://owner.example/work?project=bobai&packet=synthetic");
    for (const returnTo of ["https://foreign.invalid", "//foreign.invalid/work", "/work?actor=owner", "/work#secret"])
      expect((await POST(request({ returnTo }))).headers.get("location")).toBe("https://owner.example/work");
    seams.handler.mockResolvedValue(new Response(null, { status: 401 }));
    const invalid = await POST(request({ returnTo: "/work?project=bobai" }));
    expect(invalid.headers.get("location")).toBe("https://owner.example/login?returnTo=%2Fwork%3Fproject%3Dbobai&error=invalid");
  });
  it("gives validated OAuth continuation priority over workspace navigation", async () => {
    seams.password = true; vi.stubEnv("BOB_GOVERNED_WORKFLOW_ENABLED", "true");
    seams.handler.mockResolvedValue(Response.json({ redirect: true, url: "/connect?synthetic=1" }));
    expect((await POST(request({ returnTo: "/work", oauth_query: "synthetic-signed-query" }))).headers.get("location"))
      .toBe("https://owner.example/connect?synthetic=1");
  });
  it("contains sign-in failures and does not mint a replacement session", async () => {
    seams.password = true;
    seams.handler.mockRejectedValue(Error("synthetic-private-driver-error"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-private-driver-error");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("preserves login-page redirects for current sessions and keeps OAuth ahead of work", async () => {
    seams.session = true; vi.stubEnv("BOB_GOVERNED_WORKFLOW_ENABLED", "true");
    await expect(LoginPage({ searchParams: Promise.resolve({ returnTo: "/work?project=bobai" }) }))
      .rejects.toThrow("redirect:/work?project=bobai");
    await expect(LoginPage({ searchParams: Promise.resolve({ client_id: "synthetic-client", returnTo: "/work" }) }))
      .rejects.toThrow("redirect:/connect?");
  });
  it("retains passkey sign-in and gated native forms in rendered markup", () => {
    const locked = renderToStaticMarkup(createElement(OwnerLogin, { passwordEnabled: false }));
    expect(locked).toContain("passkey"); expect(locked).not.toContain('name="password"');
    const workspace = renderToStaticMarkup(createElement(OwnerLogin, { passwordEnabled: true, returnTo: "/work?project=bobai" }));
    expect(workspace).toContain('name="returnTo" value="/work?project=bobai"');
    const oauth = renderToStaticMarkup(createElement(OwnerLogin, { passwordEnabled: true, returnTo: "/work", oauthQuery: "synthetic-query" }));
    expect(oauth).toContain('name="oauth_query" value="synthetic-query"');
    expect(oauth).not.toContain('name="returnTo"');
  });
});
