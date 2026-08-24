import { loadConfig } from "./config.js";
import { createBobCoreRuntime } from "./runtime.js";
import { createReadCredentialGateway } from "./security/read-credential.js";

const config = loadConfig();
const { app } = createBobCoreRuntime(config);
const fetch = createReadCredentialGateway(app.fetch, config);

export default {
  fetch,
};
