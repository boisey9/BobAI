import { loadConfig } from "./config.js";
import { createBobCoreRuntime } from "./runtime.js";
import { createReadCredentialGateway } from "./security/read-credential.js";

const config = loadConfig();
const { app } = createBobCoreRuntime(config);

app.fetch = createReadCredentialGateway(
  app.fetch.bind(app),
  config,
) as typeof app.fetch;

export default app;
