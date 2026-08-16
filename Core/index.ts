import { Hono } from "hono";

import bobCore from "./src/index.js";

// Vercel's Hono framework detector expects a recognized entrypoint that
// directly imports Hono and default-exports a Hono application. Keep the
// production app implementation in src/ and mount it here at the root.
const app = new Hono();
app.route("/", bobCore);

export default app;
