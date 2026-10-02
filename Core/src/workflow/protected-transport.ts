import { getContext, getVercelOidcTokenSync } from '@vercel/oidc';
import { z } from 'zod';
import type { HostedProfile } from './hosted-profile.js';

if (typeof window !== 'undefined') throw Error('server_host_only');
const bindingSchema = z.object({
  issuer: z.string().url().refine(s => new URL(s).protocol === 'https:'),
  audience: z.string().min(1), teamId: z.string().min(1), projectId: z.string().min(1),
  environment: z.literal('preview'),
}).strict();
export type PlatformBinding = z.infer<typeof bindingSchema>;
export function platformBinding(env: Record<string, string | undefined> = process.env): PlatformBinding {
  if (env.BOB_WORKFLOW_PROTECTED_TRANSPORT_ENABLED !== 'true' || env.VERCEL_ENV !== 'preview' || env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    throw Error('protected_transport_unconfigured');
  try { return bindingSchema.parse(JSON.parse(env.BOB_WORKFLOW_PLATFORM_BINDING ?? '')); }
  catch { throw Error('platform_binding_unconfigured'); }
}

// This is a rejection preflight, NOT JWT authentication. The protected receiving
// platform must verify the signature and its independently configured trust rule.
// No refresh, CLI credential lookup, audience exchange or identity issuance.
export function checkPlatformToken(token: string, binding: PlatformBinding, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error();
    const [h, p] = token.split('.');
    const header = JSON.parse(Buffer.from(h!, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString('utf8'));
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (header.alg !== 'RS256' || header.typ !== 'JWT' || claims.iss !== binding.issuer || !audiences.includes(binding.audience) ||
        claims.owner_id !== binding.teamId || claims.project_id !== binding.projectId || claims.environment !== binding.environment ||
        !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.nbf) || claims.exp * 1000 <= now || claims.nbf * 1000 > now)
      throw Error();
    return token;
  } catch { throw Error('platform_identity_unavailable'); }
}

function allowed(url: URL, method: string, profile: HostedProfile) {
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  if (url.origin === profile.issuer) return method === 'POST' && /^\/(issue|redeem|revalidate)$/.test(url.pathname) && !url.search;
  if (url.origin !== profile.coreOrigin) return false;
  if (method === 'POST') return /^\/v1\/governed\/[a-z0-9][a-z0-9_-]{0,99}\/commands$/.test(url.pathname) && !url.search;
  if (method !== 'GET') return false;
  if (url.pathname === '/v1/governed/_directory') return !url.search;
  if (!/^\/v1\/governed\/[a-z0-9][a-z0-9_-]{0,99}(\/history|\/receipts\/[A-Za-z0-9][A-Za-z0-9._:-]{0,119})?$/.test(url.pathname)) return false;
  const keys = Array.from(url.searchParams.keys());
  if (!keys.length) return true;
  if (keys.length !== 1) return false;
  if (url.pathname.endsWith('/history')) return keys[0] === 'before' && /^\d+$/.test(url.searchParams.get('before') ?? '');
  return !url.pathname.includes('/receipts/') && keys[0] === 'operation' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(url.searchParams.get('operation') ?? '');
}

function requestPlatformToken(){
  // Require the platform's server request context. Do not use build/local-env
  // tokens as an ambient fallback in a hosted owner request.
  if(!getContext().headers?.['x-vercel-oidc-token'])throw Error('platform_request_context_required');
  return getVercelOidcTokenSync();
}

// Token/transport injection is trusted server-code test wiring, never a request
// parameter. Tokens are acquired per call; owner proofs remain distinct.
export function protectedWorkflowFetch(profile: HostedProfile, binding: PlatformBinding,
  token: () => string | Promise<string> = requestPlatformToken, network: typeof fetch = fetch): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init);
    if (!allowed(new URL(request.url), request.method, profile)) throw Error('protected_target_denied');
    const headers = new Headers(request.headers);
    if (!(new URL(request.url).origin === profile.issuer && new URL(request.url).pathname === '/issue')) headers.delete('cookie');
    for (const h of ['x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie', 'x-vercel-oidc-token', 'x-vercel-trusted-oidc-idp-token']) headers.delete(h);
    const identity = checkPlatformToken(await token(), binding);
    headers.set('x-vercel-trusted-oidc-idp-token', identity);
    const signal = request.signal.aborted ? request.signal : AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
    const response = await network(new Request(request, { headers, signal, cache: 'no-store', redirect: 'error' }));
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw Error('protected_redirect_denied');
    return response;
  }) as typeof fetch;
}
