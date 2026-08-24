import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "bob_control_session";
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

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

function sign(encodedPayload: string): string {
  const secret = requiredEnvironment("BOB_CONTROL_CENTER_SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error("BOB_CONTROL_CENTER_SESSION_SECRET must be at least 32 characters.");
  }
  return createHmac("sha256", secret)
    .update(encodedPayload, "utf8")
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
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function validateSessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [encodedPayload, providedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra.length > 0) return false;

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
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

export async function hasOwnerSession(): Promise<boolean> {
  const store = await cookies();
  return validateSessionToken(store.get(SESSION_COOKIE)?.value);
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
