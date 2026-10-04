// Intentionally terminates only this synthetic child after its transaction commits.
import {configure,target} from "./local-memory-transport.mjs";
configure();
import assert from "node:assert/strict";
import { NeonSharedContextStore } from "../src/context/neon-store.ts";
import { SharedContextService } from "../src/context/service.ts";

assert(process.env.BOB_LOCAL_MEMORY_DRILL === "true");
assert(process.env.BOB_TEST_OWNER?.startsWith("continuity-test-"));
const service = new SharedContextService(
  new NeonSharedContextStore(target),
  process.env.BOB_TEST_OWNER,
);
await service.createSyncedTask({
  projectKey: "test-project",
  operationId: "killed-after-commit",
  title: "Persist despite a lost response",
  actor: { interfaceId: "crash-fixture", surface: "codex" },
});
// No result is returned to the parent/client. It must retry the original ID.
process.kill(process.pid, "SIGKILL");
