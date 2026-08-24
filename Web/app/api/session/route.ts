import { NextResponse } from "next/server";
import {
  createSessionToken,
  ownerSessionCookie,
  verifyOwnerPassword,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");

  if (!password || !verifyOwnerPassword(password)) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(
    ownerSessionCookie.name,
    createSessionToken(),
    ownerSessionCookie.options,
  );
  return response;
}
