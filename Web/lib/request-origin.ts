function headerHosts(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isTrustedSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;

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
  ]);

  return trustedHosts.has(originHost);
}
