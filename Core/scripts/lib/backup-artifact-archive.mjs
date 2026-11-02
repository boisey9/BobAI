import { inflateRawSync } from "node:zlib";
import { BackupCoverageError } from "./backup-coverage.mjs";

const MAX_ARCHIVE_BYTES = 64 * 1024, MAX_CIPHERTEXT_BYTES = 16 * 1024;
const NAME = Buffer.from("recovery.json.age"), AGE_HEADER = Buffer.from("age-encryption.org/v1\n");
const invalid = () => { throw new BackupCoverageError("artifact_archive_invalid"); };
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

// This is intentionally a one-file artifact envelope, not a general ZIP reader.
// Admit classic stored/deflated ZIPs and coherent streamed data descriptors.
// ZIP64, extras, comments, unusual flags/attributes and creator platforms fail
// closed. No archive path is ever written to disk or passed to an extractor.
// A hosted upload-action archive must still be qualified against this profile.
export function extractArtifactCiphertext(archive) {
  try {
    if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) invalid();
    const bytes = Buffer.from(archive), end = bytes.length - 22;
    if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) !== 0 ||
        bytes.readUInt16LE(end + 6) !== 0 || bytes.readUInt16LE(end + 8) !== 1 ||
        bytes.readUInt16LE(end + 10) !== 1 || bytes.readUInt16LE(end + 20) !== 0) invalid();
    const centralSize = bytes.readUInt32LE(end + 12), central = bytes.readUInt32LE(end + 16);
    if (centralSize !== 46 + NAME.length || central < 30 + NAME.length || central + centralSize !== end ||
        bytes.readUInt32LE(central) !== 0x02014b50) invalid();
    const madeBy = bytes.readUInt16LE(central + 4), version = bytes.readUInt16LE(central + 6);
    const flags = bytes.readUInt16LE(central + 8), method = bytes.readUInt16LE(central + 10);
    const checksum = bytes.readUInt32LE(central + 16), compressedSize = bytes.readUInt32LE(central + 20);
    const outputSize = bytes.readUInt32LE(central + 24), attributes = bytes.readUInt32LE(central + 38);
    const unixMode = attributes >>> 16, dosAttributes = attributes & 0xffff;
    // Only DOS/Unix creators and regular-file (or absent) Unix type metadata.
    // No directory, volume, symlink/device type, privileged mode or extra-field
    // hard-link convention can enter this bounded, single regular-file profile.
    if (![0, 3].includes(madeBy >>> 8) || (madeBy & 255) < 10 || (madeBy & 255) > 63 ||
        ![10, 20].includes(version) || (method === 8 && version !== 20) ||
        ![0, 8].includes(method) || (flags & ~0x0808) !== 0 ||
        ![0, 0o100000].includes(unixMode & 0o170000) || (unixMode & 0o7000) !== 0 ||
        (dosAttributes & ~0x21) !== 0 || bytes.readUInt16LE(central + 36) !== 0 ||
        bytes.readUInt16LE(central + 28) !== NAME.length || bytes.readUInt16LE(central + 30) !== 0 ||
        bytes.readUInt16LE(central + 32) !== 0 || bytes.readUInt16LE(central + 34) !== 0 ||
        bytes.readUInt32LE(central + 42) !== 0 ||
        !bytes.subarray(central + 46, central + centralSize).equals(NAME) ||
        compressedSize < 1 || compressedSize > MAX_ARCHIVE_BYTES || outputSize < 1 || outputSize > MAX_CIPHERTEXT_BYTES)
      invalid();

    if (bytes.readUInt32LE(0) !== 0x04034b50 || bytes.readUInt16LE(4) !== version ||
        bytes.readUInt16LE(6) !== flags || bytes.readUInt16LE(8) !== method ||
        bytes.readUInt16LE(10) !== bytes.readUInt16LE(central + 12) ||
        bytes.readUInt16LE(12) !== bytes.readUInt16LE(central + 14) ||
        bytes.readUInt16LE(26) !== NAME.length || bytes.readUInt16LE(28) !== 0 ||
        !bytes.subarray(30, 30 + NAME.length).equals(NAME)) invalid();
    const localValues = [bytes.readUInt32LE(14), bytes.readUInt32LE(18), bytes.readUInt32LE(22)];
    const expected = [checksum, compressedSize, outputSize], payloadStart = 30 + NAME.length;
    const payloadEnd = payloadStart + compressedSize;
    if (payloadEnd > central) invalid();
    if (flags & 8) {
      // Some producers fill the local values despite using a descriptor. Only
      // the complete zero tuple or complete matching tuple is unambiguous.
      if (!localValues.every(value => value === 0) && !localValues.every((value, index) => value === expected[index])) invalid();
      const descriptorSize = central - payloadEnd;
      if (![12, 16].includes(descriptorSize)) invalid();
      const descriptor = payloadEnd + (descriptorSize === 16 ? 4 : 0);
      if ((descriptorSize === 16 && bytes.readUInt32LE(payloadEnd) !== 0x08074b50) ||
          !expected.every((value, index) => bytes.readUInt32LE(descriptor + index * 4) === value)) invalid();
    } else if (payloadEnd !== central || !localValues.every((value, index) => value === expected[index])) invalid();

    const compressed = bytes.subarray(payloadStart, payloadEnd);
    let ciphertext;
    if (method === 0) {
      if (compressedSize !== outputSize) invalid();
      ciphertext = compressed;
    } else {
      const inflated = inflateRawSync(compressed, { maxOutputLength: MAX_CIPHERTEXT_BYTES, info: true });
      // zlib otherwise permits trailing compressed input, including a second
      // stream. Admit exactly one stream that consumes every supplied byte.
      if (inflated.engine.bytesWritten !== compressed.length) invalid();
      ciphertext = inflated.buffer;
    }
    if (ciphertext.length !== outputSize || crc32(ciphertext) !== checksum ||
        !ciphertext.subarray(0, AGE_HEADER.length).equals(AGE_HEADER)) invalid();
    return Buffer.from(ciphertext);
  } catch { invalid(); }
}
