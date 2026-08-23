import { randomBytes } from "node:crypto";
import { z } from "zod";

const SESSION_PREFIX = "ars1_";
const SESSION_PATTERN = /^ars1_[A-Za-z0-9_-]{32}$/u;
const SESSION_RANDOM_BYTES = 24;
const DEFAULT_TTL_MS = 3_600_000;
const DEFAULT_MAX_ENTRIES = 1_024;
const DEFAULT_MAX_TOTAL_BYTES = 16 * 1_024 * 1_024;

const protocolIdentitySchema = z.object({
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
  revision_date: z.string().min(1).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

export const researchSessionStateSchema = z.object({
  research_target: z.string().min(1).max(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  protocols: z.tuple([protocolIdentitySchema, protocolIdentitySchema]),
  phase: z.enum([
    "automated_video_scout",
    "candidate_screening_and_source_acquisition",
    "blocked"
  ]),
  synthesis_permitted: z.literal(false),
  scout: z.object({
    status: z.enum(["not_started", "complete", "blocked"]),
    provider_response_id: z.string().max(500).optional(),
    source_packet_version: z.string().max(20).optional(),
    validation_status: z.enum(["accepted", "partial", "rejected", "blocked"]).optional(),
    candidate_count: z.number().int().nonnegative().max(16),
    validated_candidate_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
    unresolved_candidate_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
    access_boundary: z.string().min(1).max(1_000).optional()
  }).strict(),
  completed_operations: z.array(z.enum([
    "automated_video_scout"
  ])).max(1),
  remaining_work: z.array(z.enum([
    "automated_video_scout",
    "candidate_screening",
    "transcript_acquisition",
    "community_discussion_audit",
    "formal_evidence_search",
    "accessible_full_text_acquisition",
    "study_method_audit",
    "bidirectional_evidence_return",
    "treatment_landscape_finalization"
  ])).min(1).max(9)
}).strict();

export type ResearchSessionState = z.output<typeof researchSessionStateSchema>;

interface SessionEntry {
  state: ResearchSessionState;
  expiresAt: number;
  bytes: number;
  claimed: boolean;
}

export interface ResearchSessionStore {
  issue(state: ResearchSessionState): string;
  read(sessionId: string): ResearchSessionState;
  claim(sessionId: string): ResearchSessionState;
  replace(sessionId: string, state: ResearchSessionState): void;
  rollback(sessionId: string): void;
}

export interface ResearchSessionStoreOptions {
  now?: () => number;
  random?: (size: number) => Uint8Array;
  ttlMs?: number;
  maxEntries?: number;
  maxTotalBytes?: number;
}

export class ResearchSessionUnavailableError extends Error {
  constructor() {
    super("Research session is expired or unavailable");
    this.name = "ResearchSessionUnavailableError";
  }
}

export function createResearchSessionStore(
  options: ResearchSessionStoreOptions = {}
): ResearchSessionStore {
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
  const entries = new Map<string, SessionEntry>();
  let totalBytes = 0;

  return Object.freeze({
    issue(rawState: ResearchSessionState): string {
      const state = researchSessionStateSchema.parse(rawState);
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      const sessionId = createUniqueSessionId(entries, createRandom);
      const bytes = entryBytes(sessionId, state);
      if (bytes > maxTotalBytes) {
        throw new Error("Research session exceeds store capacity");
      }
      while (entries.size >= maxEntries || totalBytes + bytes > maxTotalBytes) {
        evictOldest();
      }
      entries.set(sessionId, {
        state: structuredClone(state),
        expiresAt: currentTime + ttlMs,
        bytes,
        claimed: false
      });
      totalBytes += bytes;
      return sessionId;
    },

    read(sessionId: string): ResearchSessionState {
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      const entry = availableEntry(sessionId);
      return structuredClone(entry.state);
    },

    claim(sessionId: string): ResearchSessionState {
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      const entry = availableEntry(sessionId);
      entry.claimed = true;
      entries.delete(sessionId);
      entries.set(sessionId, entry);
      return structuredClone(entry.state);
    },

    replace(sessionId: string, rawState: ResearchSessionState): void {
      const state = researchSessionStateSchema.parse(rawState);
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      if (!isResearchSessionId(sessionId)) throw new ResearchSessionUnavailableError();
      const entry = entries.get(sessionId);
      if (entry === undefined || !entry.claimed) throw new ResearchSessionUnavailableError();
      const bytes = entryBytes(sessionId, state);
      if (totalBytes - entry.bytes + bytes > maxTotalBytes) {
        throw new Error("Research session replacement exceeds store capacity");
      }
      totalBytes += bytes - entry.bytes;
      entries.set(sessionId, {
        state: structuredClone(state),
        expiresAt: currentTime + ttlMs,
        bytes,
        claimed: false
      });
    },

    rollback(sessionId: string): void {
      const currentTime = readNow(now);
      pruneExpired(currentTime);
      const entry = entries.get(sessionId);
      if (entry === undefined || !entry.claimed) return;
      entry.claimed = false;
      entries.delete(sessionId);
      entries.set(sessionId, entry);
    }
  });

  function availableEntry(sessionId: string): SessionEntry {
    if (!isResearchSessionId(sessionId)) throw new ResearchSessionUnavailableError();
    const entry = entries.get(sessionId);
    if (entry === undefined || entry.claimed) throw new ResearchSessionUnavailableError();
    return entry;
  }

  function pruneExpired(currentTime: number): void {
    for (const [sessionId, entry] of entries) {
      if (currentTime < entry.expiresAt) continue;
      entries.delete(sessionId);
      totalBytes -= entry.bytes;
    }
  }

  function evictOldest(): void {
    for (const [sessionId, entry] of entries) {
      if (entry.claimed) continue;
      entries.delete(sessionId);
      totalBytes -= entry.bytes;
      return;
    }
    throw new Error("Research session store cannot satisfy its bounds");
  }
}

export function isResearchSessionId(value: string): boolean {
  return SESSION_PATTERN.test(value);
}

function entryBytes(sessionId: string, state: ResearchSessionState): number {
  return Buffer.byteLength(sessionId, "utf8") +
    Buffer.byteLength(JSON.stringify(state), "utf8");
}

function createUniqueSessionId(
  entries: ReadonlyMap<string, SessionEntry>,
  createRandom: (size: number) => Uint8Array
): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const random = Buffer.from(createRandom(SESSION_RANDOM_BYTES));
    if (random.length !== SESSION_RANDOM_BYTES) {
      throw new Error("Research session random source returned invalid bytes");
    }
    const sessionId = `${SESSION_PREFIX}${random.toString("base64url")}`;
    if (!entries.has(sessionId)) return sessionId;
  }
  throw new Error("Research session identifier collision limit exceeded");
}

function readNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Research session clock is invalid");
  }
  return value;
}

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Research session ${name} must be a positive safe integer`);
  }
  return value;
}
