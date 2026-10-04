import { privateWorkflowRuntime } from './workflow/private-runtime.js';

// Do not initialize unrelated credentials/services in the explicit private
// preview runtime. Invalid private configuration throws; never legacy fallback.
const app = privateWorkflowRuntime() ?? await (async () => {
  const [{loadConfig},{createBobCoreRuntime},{createInterfaceCredentialGateway},{createOAuthGateway}] = await Promise.all([
    import('./config.js'), import('./runtime.js'), import('./security/interface-credential.js'), import('./security/oauth.js'),
  ]);
  const config = loadConfig();
  const {app} = createBobCoreRuntime(config);
  const handler = app.fetch.bind(app);
  app.fetch = createOAuthGateway(handler, createInterfaceCredentialGateway(handler, config), config) as typeof app.fetch;
  return app;
})();

export default app;
