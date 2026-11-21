export const ownerWorkbenchPath = "/workbench";

export function ownerWorkbenchEnabled() {
  return process.env.BOB_OWNER_WORKBENCH_PREVIEW === "true"
    && process.env.BOB_AUTH_ENABLED === "true"
    && ((!process.env.VERCEL && !process.env.VERCEL_ENV) || process.env.VERCEL_ENV === "production");
}
