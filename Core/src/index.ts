import { loadConfig } from "./config.js";
import { createBobCoreRuntime } from "./runtime.js";
import { createInterfaceCredentialGateway } from "./security/interface-credential.js";
import { createOAuthGateway } from "./security/oauth.js";

const config = loadConfig();
const { app } = createBobCoreRuntime(config);

const appHandler = app.fetch.bind(app);
app.fetch = createOAuthGateway(
  appHandler,
  createInterfaceCredentialGateway(appHandler, config),
  config,
) as typeof app.fetch;

export default app;
