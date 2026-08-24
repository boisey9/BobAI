import { loadConfig } from "./config.js";
import { createBobCoreRuntime } from "./runtime.js";
import { createInterfaceCredentialGateway } from "./security/interface-credential.js";

const config = loadConfig();
const { app } = createBobCoreRuntime(config);

app.fetch = createInterfaceCredentialGateway(
  app.fetch.bind(app),
  config,
) as typeof app.fetch;

export default app;
