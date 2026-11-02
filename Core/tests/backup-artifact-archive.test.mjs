import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { extractArtifactCiphertext } from "../scripts/lib/backup-artifact-archive.mjs";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";

const header = Buffer.from("age-encryption.org/v1\n");
const content = Buffer.concat([header, Buffer.from("synthetic encrypted envelope, not a real recovery record")]);
const filename = Buffer.from("recovery.json.age");
// Independent bit-at-a-time reference implementation for generated ZIP fixtures.
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function zip({ data = content, method = 8, descriptor = "signed", utf8 = true,
  localPopulated = false, name = filename, localName = name, extra = Buffer.alloc(0),
  localExtra = Buffer.alloc(0), comment = Buffer.alloc(0), archiveComment = Buffer.alloc(0),
  compressed = method === 0 ? data : deflateRawSync(data), checksum = crc32(data),
  outputSize = data.length, attributes = 0o100600 << 16, madeBy = (3 << 8) | 45 } = {}) {
  const flags = (descriptor ? 8 : 0) | (utf8 ? 0x800 : 0), version = method === 0 && !descriptor ? 10 : 20;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(version, 4);
  local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0x1234, 10); local.writeUInt16LE(0x5678, 12);
  if (!descriptor || localPopulated) {
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(outputSize, 22);
  }
  local.writeUInt16LE(localName.length, 26); local.writeUInt16LE(localExtra.length, 28);
  const tail = Buffer.alloc(descriptor ? descriptor === "signed" ? 16 : 12 : 0);
  if (descriptor) {
    const offset = descriptor === "signed" ? 4 : 0;
    if (offset) tail.writeUInt32LE(0x08074b50);
    tail.writeUInt32LE(checksum, offset); tail.writeUInt32LE(compressed.length, offset + 4); tail.writeUInt32LE(outputSize, offset + 8);
  }
  const central = 30 + localName.length + localExtra.length + compressed.length + tail.length;
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(madeBy, 4); directory.writeUInt16LE(version, 6);
  directory.writeUInt16LE(flags, 8); directory.writeUInt16LE(method, 10);
  directory.writeUInt16LE(0x1234, 12); directory.writeUInt16LE(0x5678, 14);
  directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(outputSize, 24);
  directory.writeUInt16LE(name.length, 28); directory.writeUInt16LE(extra.length, 30); directory.writeUInt16LE(comment.length, 32);
  directory.writeUInt32LE(attributes >>> 0, 38);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length + extra.length + comment.length, 12); end.writeUInt32LE(central, 16);
  end.writeUInt16LE(archiveComment.length, 20);
  const bytes = Buffer.concat([local, localName, localExtra, compressed, tail, directory, name, extra, comment, end, archiveComment]);
  return { bytes, central, end: bytes.length - archiveComment.length - 22, payload: 30 + localName.length + localExtra.length,
    compressedSize: compressed.length, descriptor: central - tail.length };
}

function refused(bytes) {
  let error;
  try { extractArtifactCiphertext(bytes); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(BackupCoverageError);
  expect(error.code).toBe("artifact_archive_invalid");
  expect(error.message).toBe("backup_coverage_artifact_archive_invalid");
  expect(Object.keys(error).sort()).toEqual(["code", "name"]);
}

describe("bounded single-file custody ZIP", () => {
  it.each([0, 8].flatMap(method => [false, "signed", "unsigned"].flatMap(descriptor =>
    [false, true].map(utf8 => ({ method, descriptor, utf8 })))))("accepts coherent classic ZIP %j", options => {
    const f = zip(options);
    expect(extractArtifactCiphertext(f.bytes)).toEqual(content);
  });
  it("accepts the synthetic archiver-style streamed deflate profile", () => {
    const f = zip();
    expect(f.bytes.readUInt16LE(6)).toBe(0x808);
    expect(f.bytes.readUInt32LE(14)).toBe(0);
    expect(f.bytes.readUInt32LE(f.descriptor)).toBe(0x08074b50);
    expect(extractArtifactCiphertext(f.bytes)).toEqual(content);
  });
  it.each(["signed", "unsigned"])("accepts a complete matching local tuple with %s descriptor", descriptor => {
    expect(extractArtifactCiphertext(zip({ descriptor, localPopulated: true }).bytes)).toEqual(content);
  });
  it("accepts absent Unix metadata from a DOS producer without trusting archive permissions", () => {
    expect(extractArtifactCiphertext(zip({ madeBy: 20, attributes: 0x20 }).bytes)).toEqual(content);
  });
  it("returns a copied buffer and does not mutate the archive", () => {
    const f = zip({ method: 0, descriptor: false }), original = Buffer.from(f.bytes);
    const result = extractArtifactCiphertext(f.bytes); result.fill(0);
    expect(f.bytes).toEqual(original);
    const second = extractArtifactCiphertext(f.bytes); f.bytes.fill(255);
    expect(second).toEqual(content);
  });
  it("admits the exact 16 KiB expanded maximum", () => {
    const data = Buffer.concat([header, Buffer.alloc(16384 - header.length, 97)]);
    expect(extractArtifactCiphertext(zip({ data }).bytes)).toEqual(data);
  });
  it("uses the expected CRC-32 fixture convention", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("malformed custody ZIP refusal", () => {
  it.each([undefined, null, "private sentinel", {}, new Uint8Array(22), Buffer.alloc(0), Buffer.alloc(21), Buffer.alloc(65537)])
  ("rejects unsupported or out-of-bound input %#", refused);
  it("rejects every truncated prefix of a valid streamed archive", () => {
    const bytes = zip().bytes;
    for (let size = 0; size < bytes.length; size++) refused(bytes.subarray(0, size));
  });
  it.each(["../recovery.json.age", "/recovery.json.age", "folder/recovery.json.age", "folder\\recovery.json.age",
    "recovery.json.age/", "recovery.json.agE", "recovery.json.age\0", "recovery.json.аge"])
  ("rejects alternate or hostile filename %j", name => refused(zip({ name: Buffer.from(name) }).bytes));
  it("rejects local/central filename disagreement", () => refused(zip({ localName: Buffer.from("Recovery.json.age") }).bytes));
  it.each(["extra", "localExtra", "comment", "archiveComment"])("rejects unsupported %s", key =>
    refused(zip({ [key]: Buffer.from("private-sentinel") }).bytes));
  it.each([0o120777 << 16, 0o040700 << 16, 0o060600 << 16, 0o020600 << 16, 0o010600 << 16,
    0o104600 << 16, 0o102600 << 16, 0o101600 << 16, 0x10, 0x08, 0x4000])
  ("rejects links, special files, directories and unsupported attributes %#", attributes => refused(zip({ attributes }).bytes));
  it.each([(7 << 8) | 20, (3 << 8) | 9, (3 << 8) | 64])("rejects unsupported creator metadata %#", madeBy => refused(zip({ madeBy }).bytes));
  it.each([
    ["EOCD signature", "end", 0, 4, 0], ["EOCD disk", "end", 4, 2, 1], ["EOCD central disk", "end", 6, 2, 1],
    ["multiple disk entries", "end", 8, 2, 2], ["multiple total entries", "end", 10, 2, 2],
    ["ZIP64 entries", "end", 10, 2, 65535], ["central size", "end", 12, 4, 46], ["central offset", "end", 16, 4, 0],
    ["EOCD comment", "end", 20, 2, 1], ["central signature", "central", 0, 4, 0],
    ["central ZIP64 version", "central", 6, 2, 45], ["central encryption", "central", 8, 2, 0x809],
    ["central unsupported method", "central", 10, 2, 12], ["central timestamp", "central", 12, 2, 0],
    ["central datestamp", "central", 14, 2, 0], ["central checksum", "central", 16, 4, 0],
    ["central ZIP64 size", "central", 20, 4, 0xffffffff], ["zero expanded size", "central", 24, 4, 0],
    ["large expanded size", "central", 24, 4, 16385], ["entry extra", "central", 30, 2, 1],
    ["entry comment", "central", 32, 2, 1], ["entry disk", "central", 34, 2, 1],
    ["internal text attribute", "central", 36, 2, 1], ["local offset", "central", 42, 4, 1],
    ["local signature", "local", 0, 4, 0], ["local version", "local", 4, 2, 10],
    ["local flags", "local", 6, 2, 0], ["local method", "local", 8, 2, 0],
    ["local timestamp", "local", 10, 2, 0], ["local date", "local", 12, 2, 0],
    ["mixed local tuple", "local", 14, 4, 1], ["local name length", "local", 26, 2, 1],
    ["local extra length", "local", 28, 2, 1], ["descriptor signature", "descriptor", 0, 4, 0],
    ["descriptor checksum", "descriptor", 4, 4, 0], ["descriptor compressed size", "descriptor", 8, 4, 0],
    ["descriptor expanded size", "descriptor", 12, 4, 0],
  ])("rejects malformed %s", (_label, section, offset, width, value) => {
    const f = zip(); f.bytes[width === 2 ? "writeUInt16LE" : "writeUInt32LE"](value, (f[section] ?? 0) + offset);
    refused(f.bytes);
  });
  it.each([1, 2, 4, 16, 32, 64, 128, 256, 512, 1024, 4096, 8192, 16384, 32768])
  ("rejects unsupported coherent general-purpose flag %i", flag => {
    const f = zip(); f.bytes.writeUInt16LE(0x808 | flag, 6); f.bytes.writeUInt16LE(0x808 | flag, f.central + 8); refused(f.bytes);
  });
  it.each(["prepend", "append", "second archive"])("rejects %s payload", kind => {
    const f = zip(), extra = kind === "second archive" ? zip().bytes : Buffer.from("private-sentinel");
    refused(Buffer.concat(kind === "prepend" ? [extra, f.bytes] : [f.bytes, extra]));
  });
  it("rejects an actual duplicate central entry and duplicate-named payload", () => {
    const f = zip(), local = f.bytes.subarray(0, f.central), directory = f.bytes.subarray(f.central, f.end);
    const second = Buffer.from(directory); second.writeUInt32LE(local.length, 42);
    const end = Buffer.from(f.bytes.subarray(f.end)); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10);
    end.writeUInt32LE(directory.length * 2, 12); end.writeUInt32LE(local.length * 2, 16);
    refused(Buffer.concat([local, local, directory, second, end]));
  });
  it("rejects a descriptor missing despite its flag", () => {
    const f = zip({ descriptor: false }); f.bytes.writeUInt16LE(0x808, 6); f.bytes.writeUInt16LE(0x808, f.central + 8);
    refused(f.bytes);
  });
  it("rejects a descriptor present without its flag", () => {
    const f = zip({ localPopulated: true }); f.bytes.writeUInt16LE(0x800, 6); f.bytes.writeUInt16LE(0x800, f.central + 8);
    refused(f.bytes);
  });
  it("rejects mixed populated/zero local descriptor values", () => {
    const f = zip({ localPopulated: true }); f.bytes.writeUInt32LE(0, 18); refused(f.bytes);
  });
  it("rejects a coherent but false checksum", () => refused(zip({ checksum: (crc32(content) ^ 1) >>> 0 }).bytes));
  it("rejects changed stored bytes even when the length matches", () => {
    const f = zip({ method: 0, descriptor: false }); f.bytes[f.payload + content.length - 1] ^= 1; refused(f.bytes);
  });
  it("rejects stored/compressed length disagreement", () => refused(zip({ method: 0, outputSize: content.length - 1 }).bytes));
  it.each([Buffer.alloc(0), Buffer.from("private plaintext sentinel"), Buffer.concat([Buffer.from("x"), header])])
  ("rejects non-age or empty expanded content %#", data => refused(zip({ data }).bytes));
  it("rejects malformed compressed data", () => refused(zip({ compressed: Buffer.from([255, 255, 255]) }).bytes));
  it("rejects a truncated compressed stream", () => refused(zip({ compressed: deflateRawSync(content).subarray(0, -1) }).bytes));
  it("rejects compressed trailing bytes and concatenated streams", () => {
    for (const tail of [Buffer.from([0]), Buffer.from("private-sentinel"), deflateRawSync(content)])
      refused(zip({ compressed: Buffer.concat([deflateRawSync(content), tail]) }).bytes);
  });
  it("bounds an expansion bomb even if the central directory understates its size", () => {
    const data = Buffer.concat([header, Buffer.alloc(1024 * 1024, 97)]);
    refused(zip({ data, outputSize: 16384 }).bytes);
  });
  it("refuses an understated expanded size within the configured bound", () => refused(zip({ outputSize: content.length - 1 }).bytes));
});
