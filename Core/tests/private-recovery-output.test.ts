import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { writePrivateRecoveryOutput } from "../../Web/scripts/private-recovery-output.js";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("owner recovery artifact custody", () => {
  it("creates a private file and refuses to overwrite an existing credential", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bob-owner-artifact-"));
    const file = join(directory, "recovery.txt");
    try {
      await writePrivateRecoveryOutput(file, "synthetic secret", repository);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      await expect(writePrivateRecoveryOutput(file, "replacement", repository)).rejects.toThrow();
      expect(await readFile(file, "utf8")).toBe("synthetic secret");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("rejects repository output even through an external symlink or dot-prefixed directory", async () => {
    const inside = await mkdtemp(join(repository, "..recovery-fixture-"));
    const outside = await mkdtemp(join(tmpdir(), "bob-owner-link-"));
    try {
      await expect(writePrivateRecoveryOutput(join(inside, "secret"), "synthetic", repository)).rejects.toThrow("outside");
      await symlink(inside, join(outside, "link"));
      await expect(writePrivateRecoveryOutput(join(outside, "link", "secret"), "synthetic", repository)).rejects.toThrow("outside");
      await expect(writePrivateRecoveryOutput("relative-secret", "synthetic", repository)).rejects.toThrow("absolute");
    } finally {
      await rm(outside, { recursive: true, force: true });
      await rm(inside, { recursive: true, force: true });
    }
  });
});
