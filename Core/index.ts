import { Hono } from "hono";

import bobCore from "./src/index.js";

// Vercel's Hono framework detector expects a recognized entrypoint that
// directly imports Hono and default-exports a Hono application. Keep the
// production app implementation in src/ and mount it here at the root.
const app = new Hono();
app.route("/", bobCore);

// Hono route mounting copies routes into the parent app but does not preserve
// a custom fetch wrapper on the mounted app. Delegate production fetches to
// Bob Core so security gateways attached in src/index.ts remain authoritative.
app.fetch = bobCore.fetch.bind(bobCore) as typeof app.fetch;

export default app;
