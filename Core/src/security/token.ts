export async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function tokenMatches(
  providedToken: string,
  expectedToken: string,
): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    sha256(providedToken),
    sha256(expectedToken),
  ]);

  if (providedHash.length !== expectedHash.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < providedHash.length; index += 1) {
    difference |=
      providedHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }

  return difference === 0;
}
