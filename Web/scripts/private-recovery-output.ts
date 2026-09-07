import { open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

export async function writePrivateRecoveryOutput(output: string, content: string, repository: string) {
  if (!isAbsolute(output)) throw new Error("Recovery output requires an absolute path.");
  const parent = await realpath(dirname(output));
  const path = join(parent, basename(output));
  const relativePath = relative(repository, path);
  if (!(relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)))
    throw new Error("Setup/recovery output must be outside the repository.");
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(content); await file.sync(); }
  finally { await file.close(); }
  const directory = await open(parent, "r");
  try { await directory.sync(); } finally { await directory.close(); }
  return path;
}
