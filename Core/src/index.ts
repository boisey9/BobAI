import { loadConfig } from "./config.js";
import { createBobCoreRuntime } from "./runtime.js";

const config = loadConfig();
const { app } = createBobCoreRuntime(config);

export default app;
