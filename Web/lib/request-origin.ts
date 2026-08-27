function headerHosts(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function configuredHost(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

function configuredHosts(): string[] {
  return [
    process.env.BOB_CONTROL_CENTER_PUBLIC_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ].flatMap((value) => {
    const host = configuredHost(value);
    return host ? [host] : [];
  });
}

export function isTrustedSameOrigin(headers: Headers): boolean {
  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();

  // Fetch Metadata headers are browser-controlled and cannot be set by
  // ordinary cross-origin JavaScript. Prefer this signal when available so
  // Vercel proxy host rewriting cannot reject a legitimate owner form POST.
  if (fetchSite === "cross-site") return false;
  if (fetchSite === "same-origin") return true;

  const origin = headers.get("origin");
  if (!origin) {
    // Legacy clients may omit Origin. The signed owner session and SameSite
    // Strict cookie remain required before this guard is evaluated.
    return true;
  }

  let originHost: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    originHost = url.host.toLowerCase();
  } catch {
    return false;
  }

  const trustedHosts = new Set([
    ...headerHosts(headers.get("host")),
    ...headerHosts(headers.get("x-forwarded-host")),
    ...configuredHosts(),
  ]);

  return trustedHosts.has(originHost);
}
