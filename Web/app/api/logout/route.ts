import { NextResponse } from "next/server";
import { ownerSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(ownerSessionCookie.name, "", {
    ...ownerSessionCookie.options,
    maxAge: 0,
  });
  return response;
}
