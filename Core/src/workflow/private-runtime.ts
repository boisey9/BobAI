import { Hono } from 'hono';
import { hostedProfile } from './hosted-profile.js';
import { hostedWorkflowRouter } from './hosted-mount.js';
import { platformBinding } from './protected-transport.js';

// Explicit preview-only route surface; no legacy config/provider/agent imports.
// The dependency is trusted constructor wiring, never caller authority.
export function privateWorkflowRuntime(env: Record<string, string | undefined> = process.env,
  mount: typeof hostedWorkflowRouter = hostedWorkflowRouter): Hono<{Variables:{requestId:string}}> | null {
  if (env.BOB_WORKFLOW_PRIVATE_RUNTIME_ENABLED !== 'true') return null;
  if (!hostedProfile(env, 'core')) throw Error('private_runtime_unconfigured');
  platformBinding(env);
  const router = mount(env);
  if (!router) throw Error('private_runtime_unconfigured');
  const app = new Hono<{Variables:{requestId:string}}>();
  app.use('*', async (c, next) => { c.header('cache-control', 'no-store'); await next(); });
  app.get('/health', c => c.json({ status: 'ok', mode: 'private-test', releaseEnabled: false }));
  app.route('/v1/governed', router);
  app.onError((_error, c) => c.json({ error: { code: 'workflow_unavailable' }, outcome: 'unconfirmed' }, 503));
  return app;
}
