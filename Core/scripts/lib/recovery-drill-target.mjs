// Verified from Neon's branch/compute API, not inferred from the supplied URL.
const BRANCH = "br-solitary-wind-ay86swt0";
const HOST = "ep-steep-poetry-ayo4lqz2.c-5.us-east-2.aws.neon.tech";

export function assertRecoveryDrillTarget(branchId, connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error("Invalid recovery drill connection."); }
  if (branchId !== BRANCH || url.hostname !== HOST || (url.port && url.port !== "5432") ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      [...url.searchParams.keys()].some(key => !["sslmode", "channel_binding"].includes(key)))
    throw new Error("The recovery drill connection must match its allowlisted isolated Neon endpoint.");
}
