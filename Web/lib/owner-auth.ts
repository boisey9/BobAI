import { betterAuth, type BetterAuthOptions } from "better-auth";
import { passkey } from "@better-auth/passkey";
import { Pool, neonConfig } from "@neondatabase/serverless";

export function ownerAuthEnabled(): boolean {
  return process.env.BOB_AUTH_ENABLED === "true";
}

export function ownerPasswordLoginEnabled(): boolean {
  return process.env.BOB_AUTH_PASSWORD_LOGIN_ENABLED === "true";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Owner authentication requires ${name}.`);
  return value;
}

export function ownerEmail(): string {
  const email = required("BOB_AUTH_OWNER_EMAIL").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Invalid owner email configuration.");
  return email;
}

export function ownerAuthOptions(
  pool: Pool,
  bootstrap = false,
): BetterAuthOptions {
  const baseURL = new URL(required("BOB_AUTH_BASE_URL"));
  if (
    baseURL.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(baseURL.hostname)
    )
  ) {
    throw new Error(
      "Owner authentication requires HTTPS outside local development.",
    );
  }
  if (baseURL.pathname !== "/" || baseURL.search || baseURL.hash)
    throw new Error("BOB_AUTH_BASE_URL must be an origin.");
  const secret = required("BOB_AUTH_SECRET");
  if (secret.length < 32)
    throw new Error("BOB_AUTH_SECRET must contain at least 32 characters.");
  const email = ownerEmail();
  return {
    appName: "Bob",
    baseURL: baseURL.origin,
    basePath: "/api/auth",
    secret,
    database: pool,
    trustedOrigins: [baseURL.origin],
    user: {
      modelName: "bob_auth_user",
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    account: {
      modelName: "bob_auth_account",
      accountLinking: { enabled: false },
    },
    verification: { modelName: "bob_auth_verification" },
    session: {
      modelName: "bob_auth_session",
      expiresIn: 12 * 60 * 60,
      updateAge: 60 * 60,
      freshAge: 15 * 60,
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: bootstrap || ownerPasswordLoginEnabled(),
      disableSignUp: !bootstrap,
      minPasswordLength: 20,
      revokeSessionsOnPasswordReset: true,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "bob_auth_rate_limit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/passkey/generate-authenticate-options": { window: 60, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: "bob_owner",
      useSecureCookies: baseURL.protocol === "https:",
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) =>
            user.email.toLowerCase() === email
              ? { data: { ...user, email } }
              : false,
        },
        update: {
          before: async (user) =>
            user.email && user.email.toLowerCase() !== email
              ? false
              : { data: user },
        },
      },
    },
    plugins: [
      passkey({
        rpID: baseURL.hostname,
        rpName: "Bob",
        origin: baseURL.origin,
        authenticatorSelection: { userVerification: "required" },
        registration: { requireSession: true },
        schema: { passkey: { modelName: "bob_auth_passkey" } },
      }),
    ],
  };
}

export function createOwnerAuth(pool: Pool, bootstrap = false) {
  return betterAuth(ownerAuthOptions(pool, bootstrap));
}

// Neon WebSocket connections must be closed within the serverless request.
export async function withOwnerDatabase<T>(
  work: (pool: Pool) => Promise<T>,
): Promise<T> {
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({
    connectionString: required("BOB_AUTH_DATABASE_URL"),
    max: 3,
    connectionTimeoutMillis: 10_000,
  });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

export async function withOwnerAuth<T>(
  work: (auth: ReturnType<typeof createOwnerAuth>) => Promise<T>,
): Promise<T> {
  return withOwnerDatabase((pool) => work(createOwnerAuth(pool)));
}
