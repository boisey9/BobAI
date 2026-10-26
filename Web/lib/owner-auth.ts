import {configureLocalRealAuthDriver,localRealAuthFixtureEnabled} from "./local-real-auth-driver";
import { observeDatabaseErrors } from "./database-errors.mjs";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { passkey } from "@better-auth/passkey";
import {hostedProfile,hostedSecret} from "../../Core/src/workflow/hosted-profile";
import {createHostedPool} from "../../Core/src/workflow/hosted-database";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { oauthEnabled } from "./oauth-grants";
import {
  projectOAuthPlugins,
  type ApprovedProjectGrant,
  type ClientProvisioning,
} from "./oauth-provider";

// Some installed adapter error paths bypass Better Auth's configured logger.
// Replace driver errors before they reach that code; never retain their cause,
// client, SQL, parameters or original message. SQLSTATE preserves error semantics.
function privateAuthError(error: unknown): Error {
  const safe = new Error("Owner authentication is temporarily unavailable.");
  try {
    const code = error && typeof error === "object" && "code" in error
      ? error.code : undefined;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code))
      Object.defineProperty(safe, "code", { value: code, enumerable: true });
  } catch { /* Inspecting an untrusted error must not expose it. */ }
  return safe;
}

// Better Auth's installed PostgreSQL adapter uses promise-based operations.
// Bind other methods to their original receiver, including the pool's emitter.
function privateAuthDatabase<T extends object>(database: T): T {
  return new Proxy(database, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property === "connect") return async (...args: unknown[]) => {
        try {
          const client = await Reflect.apply(value, target, args);
          return privateAuthDatabase(client);
        } catch (error) { throw privateAuthError(error); }
      };
      if (property === "query" || property === "end") return async (...args: unknown[]) => {
        try { return await Reflect.apply(value, target, args); }
        catch (error) { throw privateAuthError(error); }
      };
      if (property === "release") return (...args: unknown[]) => {
        try { return Reflect.apply(value, target, args); }
        catch (error) { throw privateAuthError(error); }
      };
      return value.bind(target);
    },
  });
}

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
  approvedGrant?: ApprovedProjectGrant,
  provisionClients: ClientProvisioning = false,
): BetterAuthOptions {
  const baseURL = new URL(required("BOB_AUTH_BASE_URL"));
  if (
    baseURL.protocol !== "https:" &&
    !(
      (process.env.NODE_ENV !== "production" || localRealAuthFixtureEnabled()) &&
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
    database: privateAuthDatabase(pool),
    logger: {
      level: "warn",
      log: () => {
        try { console.error("Owner authentication diagnostic."); }
        catch { /* Logging failure must not expose the original error. */ }
      },
    },
    // Throw before Better Call's independent raw-error console fallback.
    // The outer database/work boundary returns only a private error to callers.
    onAPIError: { throw: true },
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
        "/oauth2/introspect": { window: 60, max: 600 },
        "/oauth2/token": { window: 60, max: 30 },
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
      ...(oauthEnabled()
        ? projectOAuthPlugins(pool, approvedGrant, provisionClients)
        : []),
    ],
  };
}

export function createOwnerAuth(
  pool: Pool,
  bootstrap = false,
  approvedGrant?: ApprovedProjectGrant,
  provisionClients: ClientProvisioning = false,
) {
  return betterAuth(
    ownerAuthOptions(pool, bootstrap, approvedGrant, provisionClients),
  );
}

// Neon WebSocket connections must be closed within the serverless request.
export async function withOwnerDatabase<T>(
  work: (pool: Pool) => Promise<T>,
): Promise<T> {
  let pool: Pool | undefined;
  try {
    configureLocalRealAuthDriver(neonConfig);
    neonConfig.webSocketConstructor = WebSocket;
    const profile=hostedProfile();
    pool = privateAuthDatabase(observeDatabaseErrors(
      profile?createHostedPool(profile.auth,hostedSecret(process.env,"BOB_WORKFLOW_AUTH_DATABASE_PASSWORD")):new Pool({
        connectionString: required("BOB_AUTH_DATABASE_URL"),
        max: 3,
        connectionTimeoutMillis: 10_000,
      }),
    ));
    return await work(pool);
  } catch (error) {
    throw privateAuthError(error);
  } finally {
    if (pool) {
      try { await pool.end(); }
      catch (error) { throw privateAuthError(error); }
    }
  }
}

export async function withOwnerAuth<T>(
  work: (auth: ReturnType<typeof createOwnerAuth>) => Promise<T>,
): Promise<T> {
  return withOwnerDatabase((pool) => work(createOwnerAuth(pool)));
}
