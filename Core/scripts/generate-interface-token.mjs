import { createHash, randomBytes } from "node:crypto";

const rawName = process.argv[2]?.trim().toLowerCase();

if (!rawName || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(rawName)) {
  console.error("Usage: npm run generate:interface-token -- <interface-name>");
  console.error("Example: npm run generate:interface-token -- copilot");
  process.exit(1);
}

const token = `bobif_${rawName}_${randomBytes(32).toString("hex")}`;
const hash = createHash("sha256").update(token, "utf8").digest("hex");

console.log(`Interface: ${rawName}`);
console.log(`Token: ${token}`);
console.log(`SHA256: ${hash}`);
console.log("Store the raw token only in the interface secret store. Register only the SHA256 hash in Bob Core metadata.");
