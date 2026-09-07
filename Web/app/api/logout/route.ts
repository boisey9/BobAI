import { NextResponse } from "next/server";
import { ownerSessionCookie } from "@/lib/session";
import { ownerAuthEnabled, withOwnerAuth } from "@/lib/owner-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    ownerAuthEnabled() &&
    request.headers.get("origin") !==
      new URL(process.env.BOB_AUTH_BASE_URL!).origin
  )
    return new Response("Untrusted sign-out origin.", { status: 403 });
  const response = NextResponse.redirect(
    new URL(
      "/login",
      ownerAuthEnabled() ? process.env.BOB_AUTH_BASE_URL : request.url,
    ),
    303,
  );
  if (ownerAuthEnabled()) {
    try {
      const result = await withOwnerAuth((auth) =>
        auth.handler(
          new Request(
            new URL("/api/auth/sign-out", process.env.BOB_AUTH_BASE_URL),
            { method: "POST", headers: request.headers },
          ),
        ),
      );
      if (!result.ok)
        return new Response("Sign-out could not be confirmed. Retry.", {
          status: 503,
        });
      for (const cookie of result.headers.getSetCookie())
        response.headers.append("set-cookie", cookie);
    } catch {
      return new Response("Sign-out could not be confirmed. Retry.", {
        status: 503,
      });
    }
  }
  response.cookies.set(ownerSessionCookie.name, "", {
    ...ownerSessionCookie.options,
    maxAge: 0,
  });
  return response;
}
