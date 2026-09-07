// Intentionally terminates only this synthetic child after its transaction commits.
import assert from "node:assert/strict";
import { NeonSharedContextStore } from "../src/context/neon-store.ts";
import { SharedContextService } from "../src/context/service.ts";

assert(process.env.BOB_TEST_BRANCH_ID === "br-crimson-truth-ayza0tdz");
assert(process.env.BOB_TEST_OWNER?.startsWith("continuity-test-"));
const service = new SharedContextService(
  new NeonSharedContextStore(process.env.BOB_TEST_DATABASE_URL),
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
