import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { observeDatabaseErrors } from "../scripts/lib/database-errors.mjs";
import { observeDatabaseErrors as observeWebErrors } from "../../Web/lib/database-errors.mjs";

describe.each([observeDatabaseErrors,observeWebErrors])("safe PostgreSQL pool diagnostics", (observe) => {
  it("never serializes credentials attached to an idle driver error", () => {
    const output: unknown[] = [];
    const pool = observe(new EventEmitter(), record => output.push(record));
    const error = Object.assign(new Error("postgres://credential-must-not-appear"), {
      code: "57P01", client: { connectionString: "postgres://another-secret" },
    });
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(output).toEqual([{ event: "database.connection_failed", code: "57P01" }]);
    expect(JSON.stringify(output)).not.toContain("secret");
  });
  it("rejects unstructured codes and contains reporting failures", () => {
    const output: unknown[] = [];
    const pool = observe(new EventEmitter(), record => output.push(record));
    pool.emit("error", {code:"credential-must-not-appear"});
    expect(output).toEqual([{ event:"database.connection_failed",code:"unknown" }]);
    const broken = observe(new EventEmitter(), () => { throw new Error("log transport failed"); });
    expect(() => broken.emit("error",new Error("private details"))).not.toThrow();
  });
});
