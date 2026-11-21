import { createHash, randomBytes, randomUUID } from "node:crypto";
import { constants, closeSync, existsSync, fsyncSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync,
  readSync, realpathSync, rmdirSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

import { workbenchLayoutReviewEnabled } from "../ui-review-enabled";
import { layoutRevisionLimit, layoutVersion, parseLayoutBoard, sampleLayoutScope } from "./layout-contract";

const cookieName = "bob_workbench_layout_preview";
const cookiePath = "/api/review/workbench/layout";
const lifetime = 24 * 60 * 60 * 1_000;
const profileLimit = 32;
const revisionLimit = layoutRevisionLimit;
const inputLimit = 16_384;
const fileLimit = 32_768;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
type Scope = NonNullable<ReturnType<typeof sampleLayoutScope>>;
type Board = NonNullable<ReturnType<typeof parseLayoutBoard>>;
type Identity = { dev: number; ino: number };
type Store = { path: string; identity: Identity };
type Profile = { schema: 1; publicationId: string; id: string; host: string; createdAt: number; expiresAt: number };
type Revision = { schema: 1; publicationId: string; ownerId: string; host: string; projectKey: string; projectId: string;
  fixture: string; version: number; operationId: string; expectedVersion: number; board: Board };
type ReadFile = { value: unknown; identity: Identity };

class Refusal extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
function refuse(status = 503, code = "layout_unavailable"): never { throw new Refusal(status, code); }
const same = (a: Identity, b: Identity) => a.dev === b.dev && a.ino === b.ino;
const identity = (info: Stats): Identity => ({ dev: info.dev, ino: info.ino });
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value &&
  typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const privateDirectory = (info: Stats) => info.isDirectory() && info.uid === process.getuid?.() && (info.mode & 0o7777) === 0o700;
const privateFile = (info: Stats, linked = false) => info.isFile() && info.uid === process.getuid?.() &&
  (info.nlink === 1 || linked && info.nlink === 2) && (info.mode & 0o7777) === 0o600;

function checkoutRoot() {
  let directory = realpathSync(process.cwd());
  // Next runs from Web, and local qualification runs from Core or the checkout.
  // Locate the declared source root without relying on bundled module filenames.
  for (let depth = 0; depth < 6; depth++) {
    if (existsSync(join(directory, ".bob/project.yml")) && existsSync(join(directory, "Web/package.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  refuse();
}

function json(value: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
  if (cookie) headers.set("set-cookie", cookie);
  return Response.json(value, { status, headers });
}

function openStore(): Store {
  const path = process.env.BOB_WORKBENCH_LAYOUT_REVIEW_DIRECTORY;
  if (!path || !isAbsolute(path) || typeof process.getuid !== "function" || realpathSync(path) !== path) refuse();
  const within = relative(checkoutRoot(), path);
  if (within !== ".." && !within.startsWith("../") && !isAbsolute(within)) refuse();
  const info = lstatSync(path);
  if (!privateDirectory(info)) refuse();
  return { path, identity: identity(info) };
}

function checkStore(store: Store) {
  const info = lstatSync(store.path);
  if (!privateDirectory(info) || !same(info, store.identity) || realpathSync(store.path) !== store.path) refuse();
}

// Only controlled same-UID preview storage is supported. Identity checks are
// fail-closed diagnostics, not an atomic defense against a hostile local process.
function readStored(store: Store, name: string): ReadFile | null {
  checkStore(store);
  const path = join(store.path, name);
  let before: Stats;
  try { before = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!privateFile(before, true) || before.size < 1 || before.size > fileLimit) refuse();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (!privateFile(opened, true) || !same(opened, before) || opened.size !== before.size) refuse();
    const bytes = Buffer.alloc(before.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, size);
      if (!count) break;
      size += count;
    }
    const after = fstatSync(fd), named = lstatSync(path);
    if (size !== before.size || !privateFile(after, true) || !privateFile(named, true) || !same(after, before) ||
        !same(named, before) || after.size !== before.size || named.size !== before.size ||
        after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) refuse();
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
    if (!value || typeof value !== "object" || !("publicationId" in value) || typeof value.publicationId !== "string" || !uuid.test(value.publicationId)) refuse();
    if (after.nlink === 2 || named.nlink === 2) {
      // A crash after exclusive publication can leave exactly the known staging
      // alias. Accept only that same private inode, never an arbitrary hard link.
      const alias = lstatSync(join(store.path, `.layout-${value.publicationId}.tmp`));
      if (!privateFile(alias, true) || alias.nlink !== 2 || !same(alias, after)) refuse();
    }
    checkStore(store);
    return { value, identity: identity(after) };
  } finally { closeSync(fd); }
}

function syncStore(store: Store) {
  checkStore(store);
  const fd = openSync(store.path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { if (!same(fstatSync(fd), store.identity)) refuse(); fsyncSync(fd); }
  finally { closeSync(fd); }
}

// The destination is never overwritten. A revision becomes visible only after
// its complete private file is synced; competing writers lose link(EEXIST).
function publish(store: Store, name: string, value: Profile | Revision, beforeLink: () => void = () => {}): boolean {
  checkStore(store);
  const path = join(store.path, `.layout-${value.publicationId}.tmp`);
  let owned: Identity | undefined, fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    owned = identity(fstatSync(fd));
    writeFileSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); closeSync(fd); fd = undefined;
    checkStore(store); beforeLink();
    try { linkSync(path, join(store.path, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
    // Normal completion removes its alias; readback also recognizes the exact
    // same-inode alias if a publisher was interrupted between link and unlink.
    unlinkSync(path); owned = undefined; syncStore(store);
    const readback = readStored(store, name);
    if (!readback || JSON.stringify(readback.value) !== JSON.stringify(value)) refuse();
    return true;
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (owned) {
      checkStore(store);
      const info = lstatSync(path);
      if (!info.isFile() || !same(info, owned)) refuse();
      unlinkSync(path);
    }
  }
}

const profileName = (slot: number) => `profile-${String(slot).padStart(2, "0")}.json`;
const revisionName = (id: string, scope: Scope, version: number) =>
  `layout-${id}-${scope.projectKey}-${scope.fixture}-${String(version).padStart(2, "0")}.json`;

function profileValue(input: unknown): Profile {
  if (!exact(input, ["schema", "publicationId", "id", "host", "createdAt", "expiresAt"]) || input.schema !== 1 ||
      typeof input.publicationId !== "string" || !uuid.test(input.publicationId) ||
      typeof input.id !== "string" || !/^[a-f0-9]{64}$/.test(input.id) || typeof input.host !== "string" || !validHost(input.host) ||
      !Number.isSafeInteger(input.createdAt) || !Number.isSafeInteger(input.expiresAt) ||
      (input.createdAt as number) < 0 || input.expiresAt !== (input.createdAt as number) + lifetime) refuse();
  return input as Profile;
}

function profiles(store: Store) {
  return Array.from({ length: profileLimit }, (_, slot) => {
    const file = readStored(store, profileName(slot));
    return file ? { slot, profile: profileValue(file.value), identity: file.identity } : null;
  });
}

function readRevisions(store: Store, profile: Profile, scope: Scope): Revision[] {
  const revisions: Revision[] = [];
  const operations = new Set<string>();
  let gap = false;
  for (let version = 1; version <= revisionLimit; version++) {
    const file = readStored(store, revisionName(profile.id, scope, version));
    if (!file) { gap = true; continue; }
    const value = file.value;
    if (gap || !exact(value, ["schema", "publicationId", "ownerId", "host", "projectKey", "projectId", "fixture", "version", "operationId", "expectedVersion", "board"]) ||
        typeof value.publicationId !== "string" || !uuid.test(value.publicationId) ||
        value.schema !== 1 || value.ownerId !== profile.id || value.host !== profile.host || value.projectKey !== scope.projectKey ||
        value.projectId !== scope.projectId || value.fixture !== scope.fixture || value.version !== version ||
        value.expectedVersion !== version - 1 || typeof value.operationId !== "string" || !uuid.test(value.operationId) ||
        operations.has(value.operationId)) refuse();
    const board = parseLayoutBoard(value.board, scope.sourceIds);
    if (!board) refuse();
    operations.add(value.operationId);
    revisions.push({ ...(value as Revision), board });
  }
  return revisions;
}

function removeOwned(store: Store, name: string, expected: Identity) {
  checkStore(store);
  let info = lstatSync(join(store.path, name));
  if (info.nlink === 2) {
    const checked = readStored(store, name);
    if (!checked || !same(checked.identity, expected)) refuse();
    const publicationId = (checked.value as Profile | Revision).publicationId;
    const path = join(store.path, `.layout-${publicationId}.tmp`), alias = lstatSync(path);
    if (!privateFile(alias, true) || alias.nlink !== 2 || !same(alias, expected)) refuse();
    unlinkSync(path); info = lstatSync(join(store.path, name));
  }
  if (!privateFile(info) || !same(info, expected)) refuse();
  unlinkSync(join(store.path, name));
}

// Only profile allocation and expired-profile GC share this short synchronous
// lock. A crashed allocation leaves a visible fail-closed maintenance condition;
// there is no guessed stale-lock takeover and no eviction of active profiles.
function allocateProfile(store: Store, host: string, now: number): { profile: Profile; token: string } {
  const lock = join(store.path, ".profile-allocation.lock");
  mkdirSync(lock, { mode: 0o700 });
  const lockIdentity = identity(lstatSync(lock));
  try {
    checkStore(store);
    const current = profiles(store);
    let slot = current.findIndex(value => value === null);
    if (slot < 0) {
      const expired = current.find(value => value && value.profile.expiresAt <= now);
      if (!expired) refuse(429, "layout_capacity");
      for (const key of ["demo-rfq", "demo-bobai"]) for (const fixture of ["standard", "stress"]) {
        const scope = sampleLayoutScope(key, fixture);
        if (!scope) refuse();
        // Reverse order keeps a valid prefix if expired cleanup is interrupted.
        for (const revision of readRevisions(store, expired.profile, scope).reverse()) {
          const name = revisionName(expired.profile.id, scope, revision.version), file = readStored(store, name);
          if (!file) refuse();
          removeOwned(store, name, file.identity);
        }
      }
      removeOwned(store, profileName(expired.slot), expired.identity);
      slot = expired.slot;
    }
    const token = randomBytes(32).toString("hex");
    const profile: Profile = { schema: 1, publicationId: randomUUID(), id: digest(token), host, createdAt: now, expiresAt: now + lifetime };
    if (!publish(store, profileName(slot), profile)) refuse();
    return { profile, token };
  } finally {
    checkStore(store);
    const info = lstatSync(lock);
    if (!privateDirectory(info) || !same(info, lockIdentity)) refuse();
    rmdirSync(lock); syncStore(store);
  }
}

function validHost(host: string) {
  if (!/^(?:127\.0\.0\.1|localhost)(?::[1-9][0-9]{0,4})?$/.test(host)) return false;
  const port = host.split(":")[1];
  return !port || Number(port) <= 65535;
}

function cookieToken(request: Request): string | null {
  const values = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim())
    .filter(value => value.split("=", 1)[0] === cookieName);
  if (!values.length) return null;
  if (values.length !== 1 || !new RegExp(`^${cookieName}=[a-f0-9]{64}$`).test(values[0]!)) refuse(403, "layout_binding_changed");
  return values[0]!.slice(cookieName.length + 1);
}

function bindingFor(profile: Profile, scope: Scope) {
  return digest(JSON.stringify(["workbench-layout-v1", profile.id, profile.host, scope.projectKey, scope.projectId, scope.fixture]));
}

function liveProfile(store: Store, profile: Profile) {
  if (profile.expiresAt <= Date.now() || !profiles(store).some(value => value?.profile.id === profile.id &&
      value.profile.host === profile.host && value.profile.createdAt === profile.createdAt)) refuse(403, "layout_binding_changed");
}

function confirmReadback(store: Store, profile: Profile) {
  // A concurrent reader can observe a complete link before its publisher's
  // directory sync. Confirm durability before acknowledging that visible state.
  syncStore(store); liveProfile(store, profile);
}

function envelope(scope: Scope, profile: Profile, revision: Revision | undefined, replayed = false) {
  return { projectKey: scope.projectKey, projectId: scope.projectId, fixture: scope.fixture,
    binding: bindingFor(profile, scope), expiresAt: new Date(profile.expiresAt).toISOString(),
    version: revision?.version ?? 0, board: revision?.board ?? null, replayed };
}

async function readInput(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && !/^(?:0|[1-9][0-9]*)$/.test(length)) refuse(400, "invalid_request");
  if (length !== null && Number(length) > inputLimit) refuse(413, "invalid_request");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" ||
      ![null, "identity"].includes(request.headers.get("content-encoding"))) refuse(400, "invalid_request");
  const reader = request.body?.getReader();
  if (!reader) refuse(400, "invalid_request");
  let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    abort = () => reject(new Refusal(408, "invalid_request"));
    request.signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, 5000);
    if (request.signal.aborted) abort();
  });
  try {
    const chunks: Uint8Array[] = []; let bytes = 0, count = 0;
    for (;;) {
      const chunk = await Promise.race([reader.read(), stop]);
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array) || ++count > 1024) refuse(400, "invalid_request");
      bytes += chunk.value.byteLength;
      if (bytes > inputLimit) refuse(413, "invalid_request");
      chunks.push(chunk.value);
    }
    if (length !== null && bytes !== Number(length)) refuse(400, "invalid_request");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof Refusal) throw error;
    refuse(400, "invalid_request");
  } finally { clearTimeout(timer); if (abort) request.signal.removeEventListener("abort", abort); reader.releaseLock(); }
}

/** Synthetic layout preferences only. No owner session, Core, provider, or SQL client is used. */
export async function workbenchLayoutReviewAPI(request: Request) {
  try {
    const host = request.headers.get("host");
    if (!host || !validHost(host) || !workbenchLayoutReviewEnabled(host) || request.headers.get("x-bob-layout-review") !== "1")
      refuse(404, "not_found");
    const url = new URL(request.url);
    // Next may normalize Request.url's host. The exact guarded Host header is
    // the scope and Origin authority, matching the other local review routes.
    if (url.protocol !== "http:" || url.pathname !== cookiePath) refuse(404, "not_found");
    if (!["GET", "POST"].includes(request.method)) refuse(405, "method_not_allowed");
    if (request.method === "POST" && request.headers.get("origin") !== `http://${host}`) refuse(403, "invalid_origin");
    if (url.searchParams.getAll("project").length !== 1 || url.searchParams.getAll("fixture").length !== 1 ||
        [...url.searchParams.keys()].some(key => !["project", "fixture"].includes(key))) refuse(400, "invalid_request");
    const scope = sampleLayoutScope(url.searchParams.get("project")!, url.searchParams.get("fixture")!);
    if (!scope) refuse(400, "invalid_request");
    if (request.signal.aborted) refuse(408, "invalid_request");
    const store = openStore(), token = cookieToken(request), requestedBinding = request.headers.get("x-bob-layout-binding");
    let profile = token ? profiles(store).find(value => value?.profile.id === digest(token))?.profile : undefined;
    const usable = profile && profile.host === host && profile.expiresAt > Date.now();
    if (requestedBinding !== null && (!usable || requestedBinding !== bindingFor(profile!, scope))) refuse(403, "layout_binding_changed");
    if (request.method === "POST" && (!usable || requestedBinding === null)) refuse(403, "layout_binding_changed");
    let cookie: string | undefined;
    if (!usable) {
      const allocated = allocateProfile(store, host, Date.now()); profile = allocated.profile;
      cookie = `${cookieName}=${allocated.token}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=${lifetime / 1000}`;
    }
    if (!profile) refuse();
    if (request.method === "GET") {
      const revisions = readRevisions(store, profile, scope); confirmReadback(store, profile);
      return json(envelope(scope, profile, revisions.at(-1)), 200, cookie);
    }
    const input = await readInput(request);
    // The body yields control; revalidate profile lifetime and the durable
    // revision chain before comparing or appending any state.
    if (request.signal.aborted) refuse(408, "invalid_request");
    liveProfile(store, profile);
    if (!exact(input, ["operationId", "expectedVersion", "board"]) || typeof input.operationId !== "string" ||
        !uuid.test(input.operationId) || !layoutVersion(input.expectedVersion)) refuse(400, "invalid_request");
    const board = parseLayoutBoard(input.board, scope.sourceIds);
    if (!board) refuse(400, "invalid_request");
    const compare = (revisions: Revision[]) => {
      const replay = revisions.find(value => value.operationId === input.operationId);
      if (replay) {
        if (replay.expectedVersion !== input.expectedVersion || JSON.stringify(replay.board) !== JSON.stringify(board))
          refuse(409, "layout_operation_conflict");
        return replay;
      }
      if ((revisions.at(-1)?.version ?? 0) !== input.expectedVersion) refuse(409, "layout_conflict");
      return undefined;
    };
    const current = readRevisions(store, profile, scope), replay = compare(current);
    if (replay) { confirmReadback(store, profile); return json(envelope(scope, profile, replay, true)); }
    if (input.expectedVersion >= revisionLimit) refuse(429, "layout_capacity");
    const revision: Revision = { schema: 1, publicationId: randomUUID(), ownerId: profile.id, host, projectKey: scope.projectKey,
      projectId: scope.projectId, fixture: scope.fixture, version: input.expectedVersion + 1,
      operationId: input.operationId, expectedVersion: input.expectedVersion, board };
    liveProfile(store, profile);
    if (!publish(store, revisionName(profile.id, scope, revision.version), revision, () => liveProfile(store, profile!))) {
      const matching = compare(readRevisions(store, profile, scope));
      if (!matching) refuse(409, "layout_conflict");
      confirmReadback(store, profile); return json(envelope(scope, profile, matching, true));
    }
    liveProfile(store, profile);
    return json(envelope(scope, profile, revision));
  } catch (error) {
    return json({ error: { code: error instanceof Refusal ? error.code : "layout_unavailable" } }, error instanceof Refusal ? error.status : 503);
  }
}
