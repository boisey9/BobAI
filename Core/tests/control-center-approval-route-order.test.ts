import { Hono } from "hono";
import { describe, expect, it } from "vitest";

describe("Control Center approval route precedence", () => {
  it("uses the first registered exact POST route", async () => {
    const app = new Hono();

    app.post("/v1/control-center/approvals/:taskId", (context) =>
      context.json({ handler: "transaction-v2" }),
    );
    app.post("/v1/control-center/approvals/:taskId", (context) =>
      context.json({ handler: "legacy" }),
    );

    const response = await app.request(
      "/v1/control-center/approvals/11111111-1111-4111-8111-111111111111",
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ handler: "transaction-v2" });
  });
});
