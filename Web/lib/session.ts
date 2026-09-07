import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { ownerAuthEnabled, ownerEmail, withOwnerAuth } from "./owner-auth";

const SESSION_COOKIE = "bob_control_session";
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const CSRF_PURPOSE = "bob-control-owner-action";

type SessionPayload = {
  sub: "owner";
  exp: number;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Control Center configuration is missing ${name}.`);
  }
  return value;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function safeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function sessionSecret(): string {
  const secret = requiredEnvironment(
    ownerAuthEnabled()
      ? "BOB_AUTH_SECRET"
      : "BOB_CONTROL_CENTER_SESSION_SECRET",
  );
  if (secret.length < 32) {
    throw new Error(
      "BOB_CONTROL_CENTER_SESSION_SECRET must be at least 32 characters.",
    );
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", sessionSecret())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

function csrfForSession(sessionToken: string): string {
  return createHmac("sha256", sessionSecret())
    .update(`${CSRF_PURPOSE}:${sessionToken}`, "utf8")
    .digest("base64url");
}

export function verifyOwnerPassword(candidate: string): boolean {
  const expected = requiredEnvironment("BOB_CONTROL_CENTER_OWNER_PASSWORD");
  return timingSafeEqual(digest(candidate), digest(expected));
}

export function createSessionToken(now = Date.now()): string {
  const payload: SessionPayload = {
    sub: "owner",
    exp: Math.floor(now / 1_000) + SESSION_LIFETIME_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${sign(encoded)}`;
}

export function validateSessionToken(
  token: string | undefined,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [encodedPayload, providedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra.length > 0) return false;

  const expectedSignature = sign(encodedPayload);
  if (!safeTextEqual(providedSignature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    return (
      payload.sub === "owner" &&
      typeof payload.exp === "number" &&
      payload.exp > Math.floor(now / 1_000)
    );
  } catch {
    return false;
  }
}

const currentSessionToken = cache(async (): Promise<string | undefined> => {
  if (ownerAuthEnabled()) {
    // Read the session from PostgreSQL on every request so revocation is immediate.
    const requestHeaders = await headers();
    const result = await withOwnerAuth((auth) =>
      auth.api.getSession({ headers: requestHeaders }),
    );
    return result?.user.email.toLowerCase() === ownerEmail()
      ? result.session.token
      : undefined;
  }
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return validateSessionToken(token) ? token : undefined;
});

export async function hasOwnerSession(): Promise<boolean> {
  return Boolean(await currentSessionToken());
}

export async function getOwnerCsrfToken(): Promise<string | null> {
  const token = await currentSessionToken();
  if (!token) return null;
  return csrfForSession(token as string);
}

export async function validateOwnerCsrfToken(
  candidate: string | undefined,
): Promise<boolean> {
  if (!candidate) return false;
  const token = await currentSessionToken();
  if (!token) return false;
  return safeTextEqual(candidate, csrfForSession(token as string));
}

export const ownerSessionCookie = {
  name: SESSION_COOKIE,
  maxAge: SESSION_LIFETIME_SECONDS,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  },
};
