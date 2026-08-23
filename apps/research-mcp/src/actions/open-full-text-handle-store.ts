import { randomBytes } from "node:crypto";

import {
  auditableDocumentIndexSchema,
  type AuditableDocumentIndex
} from "@askrigor/sources";
import { z } from "zod";

const HANDLE_PREFIX = "aft1_";
const HANDLE_PATTERN = /^aft1_[A-Za-z0-9_-]{32}$/u;
const RANDOM_BYTES = 24;
const DEFAULT_TTL_MS = 3_600_000;
const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_TOTAL_BYTES = 128 * 1_024 * 1_024;

export const openFullTextCursorSchema = z.object({
  block_index: z.number().int().nonnegative(),
  character_offset: z.number().int().nonnegative(),
  segments_retrieved: z.number().int().nonnegative(),
  exhausted: z.boolean()
}).strict();

export const openFullTextHandleStateSchema = z.object({
  index: auditableDocumentIndexSchema,
  cursor: openFullTextCursorSchema
}).strict();

export type OpenFullTextHandleState = z.output<typeof openFullTextHandleStateSchema>;

interface StoreEntry {
  state: OpenFullTextHandleState;
  bytes: number;
  expiresAt: number;
  claimed: boolean;
}

export interface OpenFullTextHandleStore {
  issue(index: AuditableDocumentIndex, cursor: OpenFullTextHandleState["cursor"]): string;
  read(handle: string): OpenFullTextHandleState;
  claim(handle: string): OpenFullTextHandleState;
  replace(handle: string, state: OpenFullTextHandleState): void;
  rollback(handle: string): void;
  revoke(handle: string): void;
}

export interface OpenFullTextHandleStoreOptions {
  now?: () => number;
  random?: (size: number) => Uint8Array;
  ttlMs?: number;
  maxEntries?: number;
  maxTotalBytes?: number;
}

export class OpenFullTextHandleError extends Error {
  constructor() {
    super("Open full-text handle is invalid, expired, or busy");
    this.name = "OpenFullTextHandleError";
  }
}

export function createOpenFullTextHandleStore(
  options: OpenFullTextHandleStoreOptions = {}
): OpenFullTextHandleStore {
  const now = options.now ?? Date.now;
  const createRandom = options.random ?? randomBytes;
  const ttlMs = positive(options.ttlMs ?? DEFAULT_TTL_MS, "TTL");
  const maxEntries = positive(options.maxEntries ?? DEFAULT_MAX_ENTRIES, "entry limit");
  const maxTotalBytes = positive(
    options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    "byte limit"
  );
  const entries = new Map<string, StoreEntry>();
  let totalBytes = 0;

  return Object.freeze({
    issue(
      rawIndex: AuditableDocumentIndex,
      rawCursor: OpenFullTextHandleState["cursor"]
    ) {
      const state = openFullTextHandleStateSchema.parse({
        index: rawIndex,
        cursor: rawCursor
      });
      const current = validNow(now);
      prune(current);
      const handle = uniqueHandle(entries, createRandom);
      const bytes = entryBytes(handle, state);
      if (bytes > maxTotalBytes) throw new Error("Open full text exceeds store capacity");
      while (entries.size >= maxEntries || totalBytes + bytes > maxTotalBytes) {
        evictOldest();
      }
      entries.set(handle, {
        state: structuredClone(state),
        bytes,
        expiresAt: current + ttlMs,
        claimed: false
      });
      totalBytes += bytes;
      return handle;
    },
    read(handle: string) {
      prune(validNow(now));
      return structuredClone(available(handle).state);
    },
    claim(handle: string) {
      const current = validNow(now);
      prune(current);
      const entry = available(handle);
      entry.claimed = true;
      entry.expiresAt = current + ttlMs;
      return structuredClone(entry.state);
    },
    replace(handle: string, rawState: OpenFullTextHandleState) {
      const state = openFullTextHandleStateSchema.parse(rawState);
      const current = validNow(now);
      prune(current);
      const entry = entries.get(handle);
      if (!isOpenFullTextHandle(handle) || entry === undefined || !entry.claimed) {
        throw new OpenFullTextHandleError();
      }
      const bytes = entryBytes(handle, state);
      if (totalBytes - entry.bytes + bytes > maxTotalBytes) {
        throw new Error("Open full-text replacement exceeds store capacity");
      }
      totalBytes += bytes - entry.bytes;
      entries.set(handle, {
        state: structuredClone(state),
        bytes,
        expiresAt: current + ttlMs,
        claimed: false
      });
    },
    rollback(handle: string) {
      const entry = entries.get(handle);
      if (entry !== undefined) entry.claimed = false;
    },
    revoke(handle: string) {
      const entry = entries.get(handle);
      if (entry === undefined) return;
      entries.delete(handle);
      totalBytes -= entry.bytes;
    }
  });

  function available(handle: string): StoreEntry {
    if (!isOpenFullTextHandle(handle)) throw new OpenFullTextHandleError();
    const entry = entries.get(handle);
    if (entry === undefined || entry.claimed) throw new OpenFullTextHandleError();
    return entry;
  }

  function prune(current: number): void {
    for (const [handle, entry] of entries) {
      if (current < entry.expiresAt) continue;
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
    throw new Error("Open full-text store cannot satisfy its bounds");
  }
}

export function isOpenFullTextHandle(value: string): boolean {
  return HANDLE_PATTERN.test(value);
}

function uniqueHandle(
  entries: ReadonlyMap<string, StoreEntry>,
  createRandom: (size: number) => Uint8Array
): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const random = Buffer.from(createRandom(RANDOM_BYTES));
    if (random.byteLength !== RANDOM_BYTES) throw new Error("Invalid handle entropy");
    const handle = `${HANDLE_PREFIX}${random.toString("base64url")}`;
    if (!entries.has(handle)) return handle;
  }
  throw new Error("Open full-text handle collision limit exceeded");
}

function entryBytes(handle: string, state: OpenFullTextHandleState): number {
  return Buffer.byteLength(handle, "utf8") +
    Buffer.byteLength(JSON.stringify(state), "utf8");
}

function validNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid store clock");
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}`);
  return value;
}
