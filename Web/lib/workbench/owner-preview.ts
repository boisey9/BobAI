export const ownerWorkbenchPath = "/workbench";
export const ownerWorkbenchReadsPath = "/workbench/reads";

function ownerWorkbenchEnvironment() {
  return process.env.BOB_AUTH_ENABLED === "true"
    && ((!process.env.VERCEL && !process.env.VERCEL_ENV) || process.env.VERCEL_ENV === "production");
}

export function ownerWorkbenchEnabled() {
  return process.env.BOB_OWNER_WORKBENCH_PREVIEW === "true" && ownerWorkbenchEnvironment();
}

export function ownerWorkbenchReadsEnabled() {
  return process.env.BOB_OWNER_WORKBENCH_READS_ENABLED === "true" && ownerWorkbenchEnvironment();
}
