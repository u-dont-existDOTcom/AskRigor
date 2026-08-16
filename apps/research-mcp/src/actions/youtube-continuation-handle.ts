import { randomBytes } from "node:crypto";

const HANDLE_PREFIX = "arh1_";
const HANDLE_PATTERN = /^arh1_[A-Za-z0-9_-]{32}$/u;
const HANDLE_RANDOM_BYTES = 24;
const DEFAULT_TTL_MS = 3_600_000;
const DEFAULT_MAX_ENTRIES = 2_048;
const DEFAULT_MAX_TOTAL_BYTES = 16 * 1_024 * 1_024;
const MAX_TOKEN_BYTES = 65_536;

interface HandleEntry {
  token: string;
  expiresAt: number;
  bytes: number;
}

export interface YoutubeActionContinuationHandleStore {
  issue(token: string): string;
  resolve(handle: string): string;
  revoke(handle: string): void;
}

export interface YoutubeActionContinuationHandleStoreOptions {
  now?: () => number;
  random?: (size: number) => Uint8Array;
  ttlMs?: number;
  maxEntries?: number;
  maxTotalBytes?: number;
}

export class YoutubeActionContinuationHandleError extends Error {
  constructor() {
    super("YouTube Action continuation handle is expired or unavailable");
    this.name = "YoutubeActionContinuationHandleError";
  }
}

export function createYoutubeActionContinuationHandleStore(
  options: YoutubeActionContinuationHandleStoreOptions = {}
): YoutubeActionContinuationHandleStore {
  const now = options.now ?? Date.now;
  const createRandom = options.random ?? randomBytes;
  const ttlMs = positiveSafeInteger(options.ttlMs ?? DEFAULT_TTL_MS, "TTL");
  const maxEntries = positiveSafeInteger(
    options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    "entry limit"
  );
  const maxTotalBytes = positiveSafeInteger(
    options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    "byte limit"
  );
  const entries = new Map<string, HandleEntry>();
  let totalBytes = 0;

  return Object.freeze({
    issue(token: string): string {
      const tokenBytes = Buffer.byteLength(token, "utf8");
      if (tokenBytes < 1 || tokenBytes > MAX_TOKEN_BYTES) {
        throw new Error("YouTube Action continuation token has an invalid size");
      }
      const issuedAt = readNow(now);
      pruneExpired(issuedAt);
      const handle = createUniqueHandle(entries, createRandom);
      const entryBytes = tokenBytes +
        Buffer.byteLength(handle, "utf8");
      if (entryBytes > maxTotalBytes) {
        throw new Error("YouTube Action continuation token exceeds store capacity");
      }
      while (
        entries.size >= maxEntries ||
        totalBytes + entryBytes > maxTotalBytes
      ) evictOldest();
      entries.set(handle, {
        token,
        expiresAt: issuedAt + ttlMs,
        bytes: entryBytes
      });
      totalBytes += entryBytes;
      return handle;
    },

    resolve(handle: string): string {
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      if (!isYoutubeActionContinuationHandle(handle)) {
        throw new YoutubeActionContinuationHandleError();
      }
      const entry = entries.get(handle);
      if (entry === undefined) {
        throw new YoutubeActionContinuationHandleError();
      }
      entries.delete(handle);
      entries.set(handle, entry);
      return entry.token;
    },

    revoke(handle: string): void {
      const entry = entries.get(handle);
      if (entry === undefined) return;
      entries.delete(handle);
      totalBytes -= entry.bytes;
    }
  });

  function pruneExpired(currentTime: number): void {
    for (const [handle, entry] of entries) {
      if (currentTime < entry.expiresAt) continue;
      entries.delete(handle);
      totalBytes -= entry.bytes;
    }
  }

  function evictOldest(): void {
    const oldest = entries.entries().next().value as
      [string, HandleEntry] | undefined;
    if (oldest === undefined) {
      throw new Error("YouTube Action continuation store cannot satisfy its bounds");
    }
    entries.delete(oldest[0]);
    totalBytes -= oldest[1].bytes;
  }
}

export function isYoutubeActionContinuationHandle(value: string): boolean {
  return HANDLE_PATTERN.test(value);
}

function createUniqueHandle(
  entries: ReadonlyMap<string, HandleEntry>,
  createRandom: (size: number) => Uint8Array
): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const random = Buffer.from(createRandom(HANDLE_RANDOM_BYTES));
    if (random.length !== HANDLE_RANDOM_BYTES) {
      throw new Error("YouTube Action continuation random source returned invalid bytes");
    }
    const handle = `${HANDLE_PREFIX}${random.toString("base64url")}`;
    if (!entries.has(handle)) return handle;
  }
  throw new Error("YouTube Action continuation handle collision limit exceeded");
}

function readNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("YouTube Action continuation clock is invalid");
  }
  return value;
}

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`YouTube Action continuation ${name} must be a positive safe integer`);
  }
  return value;
}
