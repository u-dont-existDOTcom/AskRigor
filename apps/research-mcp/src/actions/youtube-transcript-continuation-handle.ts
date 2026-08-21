import { randomBytes } from "node:crypto";
import { z } from "zod";

const HANDLE_PREFIX = "art1_";
const HANDLE_PATTERN = /^art1_[A-Za-z0-9_-]{32}$/u;
const HANDLE_RANDOM_BYTES = 24;
const DEFAULT_TTL_MS = 3_600_000;
const DEFAULT_MAX_ENTRIES = 2_048;
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1_024 * 1_024;

const selectedTrackSchema = z.object({
  language_code: z.string().min(2).max(35),
  language_name: z.string().min(1).max(500),
  is_auto_generated: z.boolean()
}).strict();

export const youtubeTranscriptContinuationStateSchema = z.object({
  provider_cursor: z.string().min(1).max(4_096),
  source_video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/u),
  selected_track: selectedTrackSchema,
  snapshot_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  provider_reported_segments: z.number().int().positive(),
  page_size: z.number().int().min(1).max(200),
  page_count: z.number().int().min(1).max(9_999),
  records_returned_cumulative: z.number().int().nonnegative(),
  next_expected_index: z.number().int().nonnegative(),
  timestamps_present: z.boolean()
}).strict();

export type YoutubeTranscriptContinuationState = z.output<
  typeof youtubeTranscriptContinuationStateSchema
>;

interface HandleEntry {
  state: YoutubeTranscriptContinuationState;
  expiresAt: number;
  bytes: number;
  claimed: boolean;
}

export interface YoutubeTranscriptContinuationHandleStore {
  issue(state: YoutubeTranscriptContinuationState): string;
  claim(handle: string): YoutubeTranscriptContinuationState;
  commit(handle: string): void;
  rollback(handle: string): void;
  revoke(handle: string): void;
}

export interface YoutubeTranscriptContinuationHandleStoreOptions {
  now?: () => number;
  random?: (size: number) => Uint8Array;
  ttlMs?: number;
  maxEntries?: number;
  maxTotalBytes?: number;
}

export class YoutubeTranscriptContinuationHandleError extends Error {
  constructor() {
    super("YouTube transcript Action continuation is expired or unavailable");
    this.name = "YoutubeTranscriptContinuationHandleError";
  }
}

export function createYoutubeTranscriptContinuationHandleStore(
  options: YoutubeTranscriptContinuationHandleStoreOptions = {}
): YoutubeTranscriptContinuationHandleStore {
  const now = options.now ?? Date.now;
  const createRandom = options.random ?? randomBytes;
  const ttlMs = positiveSafeInteger(options.ttlMs ?? DEFAULT_TTL_MS, "TTL");
  const maxEntries = positiveSafeInteger(
    options.maxEntries ?? DEFAULT_MAX_ENTRIES, "entry limit"
  );
  const maxTotalBytes = positiveSafeInteger(
    options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES, "byte limit"
  );
  const entries = new Map<string, HandleEntry>();
  let totalBytes = 0;

  return Object.freeze({
    issue(rawState: YoutubeTranscriptContinuationState): string {
      const state = youtubeTranscriptContinuationStateSchema.parse(rawState);
      const issuedAt = readNow(now);
      pruneExpired(issuedAt);
      const handle = createUniqueHandle(entries, createRandom);
      const entryBytes = Buffer.byteLength(JSON.stringify(state), "utf8") +
        Buffer.byteLength(handle, "utf8");
      if (entryBytes > maxTotalBytes) {
        throw new Error("YouTube transcript Action continuation exceeds store capacity");
      }
      while (
        entries.size >= maxEntries || totalBytes + entryBytes > maxTotalBytes
      ) evictOldest();
      entries.set(handle, {
        state: structuredClone(state),
        expiresAt: issuedAt + ttlMs,
        bytes: entryBytes,
        claimed: false
      });
      totalBytes += entryBytes;
      return handle;
    },

    claim(handle: string): YoutubeTranscriptContinuationState {
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      if (!isYoutubeTranscriptContinuationHandle(handle)) {
        throw new YoutubeTranscriptContinuationHandleError();
      }
      const entry = entries.get(handle);
      if (entry === undefined || entry.claimed) {
        throw new YoutubeTranscriptContinuationHandleError();
      }
      entry.claimed = true;
      entries.delete(handle);
      entries.set(handle, entry);
      return structuredClone(entry.state);
    },

    commit(handle: string): void {
      remove(handle);
    },

    rollback(handle: string): void {
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      const entry = entries.get(handle);
      if (entry === undefined || !entry.claimed) return;
      entry.claimed = false;
      entries.delete(handle);
      entries.set(handle, entry);
    },

    revoke(handle: string): void {
      remove(handle);
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
    for (const [handle, entry] of entries) {
      if (entry.claimed) continue;
      entries.delete(handle);
      totalBytes -= entry.bytes;
      return;
    }
    throw new Error("YouTube transcript Action continuation store cannot satisfy its bounds");
  }

  function remove(handle: string): void {
    const entry = entries.get(handle);
    if (entry === undefined) return;
    entries.delete(handle);
    totalBytes -= entry.bytes;
  }
}

export function isYoutubeTranscriptContinuationHandle(value: string): boolean {
  return HANDLE_PATTERN.test(value);
}

function createUniqueHandle(
  entries: ReadonlyMap<string, HandleEntry>,
  createRandom: (size: number) => Uint8Array
): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const random = Buffer.from(createRandom(HANDLE_RANDOM_BYTES));
    if (random.length !== HANDLE_RANDOM_BYTES) {
      throw new Error("YouTube transcript Action continuation random source returned invalid bytes");
    }
    const handle = `${HANDLE_PREFIX}${random.toString("base64url")}`;
    if (!entries.has(handle)) return handle;
  }
  throw new Error("YouTube transcript Action continuation handle collision limit exceeded");
}

function readNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("YouTube transcript Action continuation clock is invalid");
  }
  return value;
}

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      `YouTube transcript Action continuation ${name} must be a positive safe integer`
    );
  }
  return value;
}
