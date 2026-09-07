import { NextResponse } from "next/server";
import {
  ownerAuthEnabled,
  ownerEmail,
  ownerPasswordLoginEnabled,
  withOwnerAuth,
} from "@/lib/owner-auth";
import {
  createSessionToken,
  ownerSessionCookie,
  verifyOwnerPassword,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    ownerAuthEnabled() &&
    request.headers.get("origin") !==
      new URL(process.env.BOB_AUTH_BASE_URL!).origin
  ) {
    return new Response("Untrusted sign-in origin.", { status: 403 });
  }
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const oauthQuery = String(form.get("oauth_query") ?? "");

  if (ownerAuthEnabled()) {
    if (!ownerPasswordLoginEnabled())
      return new Response("Password sign-in is disabled.", { status: 403 });
    try {
      const authURL = new URL(
        "/api/auth/sign-in/email",
        process.env.BOB_AUTH_BASE_URL,
      );
      const authHeaders = new Headers(request.headers);
      authHeaders.set("content-type", "application/json");
      // This server-side adapter consumes the provider response before sending
      // the native form's redirect. Ask for its fetch response explicitly.
      authHeaders.set("accept", "application/json");
      authHeaders.set("sec-fetch-mode", "cors");
      authHeaders.delete("content-length");
      const result = await withOwnerAuth((auth) =>
        auth.handler(
          new Request(authURL, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              email: ownerEmail(),
              password,
              ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
            }),
          }),
        ),
      );
      const responseData = result.ok
        ? await result
            .clone()
            .json()
            .catch(() => null)
        : null;
      const continuation =
        result.ok &&
        oauthQuery &&
        responseData?.redirect &&
        typeof responseData.url === "string"
          ? responseData.url
          : null;
      const response = NextResponse.redirect(
        new URL(
          continuation ?? (result.ok ? "/account" : "/login?error=invalid"),
          process.env.BOB_AUTH_BASE_URL,
        ),
        303,
      );
      for (const cookie of result.headers.getSetCookie())
        response.headers.append("set-cookie", cookie);
      response.headers.set("cache-control", "no-store");
      return response;
    } catch {
      return new Response("Owner authentication is temporarily unavailable.", {
        status: 503,
      });
    }
  }

  if (!password || !verifyOwnerPassword(password)) {
    return NextResponse.redirect(
      new URL("/login?error=invalid", request.url),
      303,
    );
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(
    ownerSessionCookie.name,
    createSessionToken(),
    ownerSessionCookie.options,
  );
  return response;
}
