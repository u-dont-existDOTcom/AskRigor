import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import {
  RESEARCH_SESSION_ABSOLUTE_TTL_MS,
  RESEARCH_SESSION_IDLE_TTL_MS,
} from "../config.js";
import {
  assertResearchSessionTransition,
  reconcileRestoredResearchSessionState,
  researchSessionStateSchema,
  type ResearchSessionState,
} from "./research-session-controller.js";
import {
  isResearchSessionId,
  ResearchSessionUnavailableError,
  type ResearchSessionStore,
} from "./research-session-store.js";

const SESSION_PREFIX = "ars1_";
const SESSION_RANDOM_BYTES = 24;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CLAIM_RANDOM_BYTES = 24;
const DEFAULT_CLAIM_LEASE_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 1_024;
const DEFAULT_MAX_PLAINTEXT_BYTES = 16 * 1_024 * 1_024;
const DEFAULT_MAX_STORED_BYTES = 24 * 1_024 * 1_024;
const MAX_CHECKPOINT_FILE_BYTES = 24 * 1_024 * 1_024;

const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/u);
const optionalClaimFields = z.object({
  claim_token: z.string().regex(/^[A-Za-z0-9_-]{32}$/u).optional(),
  claim_expires_at_ms: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, context) => {
  if ((value.claim_token === undefined) !== (value.claim_expires_at_ms === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Checkpoint claim token and expiry must travel together",
    });
  }
});

const checkpointEnvelopeSchema = z.object({
  envelope_version: z.literal("askrigor_research_session_checkpoint_v1"),
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  created_at_ms: z.number().int().nonnegative(),
  last_touched_at_ms: z.number().int().nonnegative(),
  idle_expires_at_ms: z.number().int().nonnegative(),
  absolute_expires_at_ms: z.number().int().nonnegative(),
  generation: z.number().int().nonnegative(),
  claim_token: optionalClaimFields.shape.claim_token,
  claim_expires_at_ms: optionalClaimFields.shape.claim_expires_at_ms,
  key_id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/u),
  algorithm: z.literal("AES-256-GCM"),
  nonce: base64UrlSchema,
  ciphertext: base64UrlSchema,
  auth_tag: base64UrlSchema,
}).strict().superRefine((value, context) => {
  if ((value.claim_token === undefined) !== (value.claim_expires_at_ms === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Checkpoint claim token and expiry must travel together",
    });
  }
  if (
    value.created_at_ms > value.last_touched_at_ms ||
    value.last_touched_at_ms > value.idle_expires_at_ms ||
    value.idle_expires_at_ms > value.absolute_expires_at_ms
  ) {
    context.addIssue({
      code: "custom",
      message: "Checkpoint lifecycle timestamps are inconsistent",
    });
  }
});

type CheckpointEnvelope = z.output<typeof checkpointEnvelopeSchema>;

interface DecodedCheckpoint {
  envelope: CheckpointEnvelope;
  state: ResearchSessionState;
  plaintextBytes: number;
  storedBytes: number;
}

export interface FileResearchSessionStoreOptions {
  rootDirectory: string;
  encryptionKey: Uint8Array;
  keyId: string;
  now?: () => number;
  random?: (size: number) => Uint8Array;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
  claimLeaseMs?: number;
  maxEntries?: number;
  maxPlaintextBytes?: number;
  maxStoredBytes?: number;
  reconcileRestoredState?: (state: ResearchSessionState) => ResearchSessionState;
}

/**
 * A bounded single-host checkpoint store. It persists only encrypted controller
 * state; raw transcripts, discussions, publications, and provider artifacts
 * remain in their separate ephemeral stores.
 */
export function createFileResearchSessionStore(
  options: FileResearchSessionStoreOptions,
): ResearchSessionStore {
  const root = prepareOwnedRoot(options.rootDirectory);
  const encryptionKey = Buffer.from(options.encryptionKey);
  if (encryptionKey.byteLength !== 32) {
    throw new Error("Research session encryption key must contain exactly 32 bytes");
  }
  const keyId = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/u).parse(options.keyId);
  const now = options.now ?? Date.now;
  const createRandom = options.random ?? randomBytes;
  const idleTtlMs = positiveSafeInteger(
    options.idleTtlMs ?? RESEARCH_SESSION_IDLE_TTL_MS,
    "idle TTL",
  );
  const absoluteTtlMs = positiveSafeInteger(
    options.absoluteTtlMs ?? RESEARCH_SESSION_ABSOLUTE_TTL_MS,
    "absolute TTL",
  );
  const claimLeaseMs = positiveSafeInteger(
    options.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS,
    "claim lease",
  );
  const maxEntries = positiveSafeInteger(
    options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    "entry limit",
  );
  const maxPlaintextBytes = positiveSafeInteger(
    options.maxPlaintextBytes ?? DEFAULT_MAX_PLAINTEXT_BYTES,
    "plaintext byte limit",
  );
  const maxStoredBytes = positiveSafeInteger(
    options.maxStoredBytes ?? DEFAULT_MAX_STORED_BYTES,
    "stored byte limit",
  );
  if (idleTtlMs > absoluteTtlMs) {
    throw new Error("Research session idle TTL cannot exceed its absolute TTL");
  }
  const reconcileRestoredState = options.reconcileRestoredState ??
    reconcileRestoredResearchSessionState;
  const observedInThisProcess = new Set<string>();
  const localClaims = new Map<string, string>();

  return Object.freeze({
    issue(rawState: ResearchSessionState): string {
      const state = researchSessionStateSchema.parse(rawState);
      const currentTime = readNow(now);
      const inventory = inventoryAndPrune(currentTime);
      const plaintextBytes = stateBytes(state);
      if (plaintextBytes > maxPlaintextBytes) {
        throw new Error("Research session exceeds store capacity");
      }
      if (inventory.length >= maxEntries) {
        throw new Error("Research session store cannot admit another unexpired session");
      }
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const sessionId = randomSessionId(createRandom);
        const destination = checkpointPath(root, sessionId);
        if (existsSync(destination)) continue;
        const absoluteExpiresAt = safeAdd(currentTime, absoluteTtlMs);
        const encoded = encodeCheckpoint({
          state,
          metadata: {
            sessionId,
            createdAt: currentTime,
            lastTouchedAt: currentTime,
            idleExpiresAt: Math.min(safeAdd(currentTime, idleTtlMs), absoluteExpiresAt),
            absoluteExpiresAt,
            generation: 0,
          },
          encryptionKey,
          keyId,
          createRandom,
        });
        assertCapacity(inventory, encoded, plaintextBytes);
        try {
          writeCheckpointAtomically(root, destination, encoded, true);
        } catch (error) {
          if (existsSync(destination)) continue;
          throw error;
        }
        observedInThisProcess.add(sessionId);
        return sessionId;
      }
      throw new Error("Research session identifier collision limit exceeded");
    },

    read(sessionId: string): ResearchSessionState {
      const currentTime = readNow(now);
      let decoded = readAvailable(sessionId, currentTime, false);
      decoded = reconcileIfRestored(sessionId, decoded, currentTime);
      const refreshed = encodeFromDecoded(decoded, decoded.state, currentTime, {
        generation: decoded.envelope.generation + 1,
      });
      writeCheckpointAtomically(root, checkpointPath(root, sessionId), refreshed, false);
      observedInThisProcess.add(sessionId);
      return structuredClone(decoded.state);
    },

    claim(sessionId: string): ResearchSessionState {
      const currentTime = readNow(now);
      let decoded = readAvailable(sessionId, currentTime, true);
      decoded = reconcileIfRestored(sessionId, decoded, currentTime);
      const claimToken = randomToken(createRandom, CLAIM_RANDOM_BYTES);
      const claimed = encodeFromDecoded(decoded, decoded.state, currentTime, {
        generation: decoded.envelope.generation + 1,
        claimToken,
        claimExpiresAt: Math.min(
          safeAdd(currentTime, claimLeaseMs),
          decoded.envelope.absolute_expires_at_ms,
        ),
      });
      const path = checkpointPath(root, sessionId);
      writeCheckpointAtomically(root, path, claimed, false);
      const confirmed = decodeCheckpoint(readBoundedRegularFile(path), sessionId);
      if (confirmed.envelope.claim_token !== claimToken) {
        throw new ResearchSessionUnavailableError();
      }
      localClaims.set(sessionId, claimToken);
      observedInThisProcess.add(sessionId);
      return structuredClone(decoded.state);
    },

    replace(sessionId: string, rawState: ResearchSessionState): void {
      const state = researchSessionStateSchema.parse(rawState);
      const currentTime = readNow(now);
      const claimToken = localClaims.get(sessionId);
      if (claimToken === undefined) throw new ResearchSessionUnavailableError();
      const decoded = readClaimedBy(sessionId, claimToken, currentTime);
      assertResearchSessionTransition(decoded.state, state);
      const plaintextBytes = stateBytes(state);
      if (plaintextBytes > maxPlaintextBytes) {
        throw new Error("Research session replacement exceeds store capacity");
      }
      const encoded = encodeFromDecoded(decoded, state, currentTime, {
        generation: decoded.envelope.generation + 1,
      });
      const inventory = inventoryAndPrune(currentTime, sessionId);
      assertCapacity(inventory, encoded, plaintextBytes);
      writeCheckpointAtomically(
        root,
        checkpointPath(root, sessionId),
        encoded,
        false,
      );
      localClaims.delete(sessionId);
      observedInThisProcess.add(sessionId);
    },

    rollback(sessionId: string): void {
      const claimToken = localClaims.get(sessionId);
      if (claimToken === undefined || !isResearchSessionId(sessionId)) return;
      const currentTime = readNow(now);
      try {
        const decoded = readClaimedBy(sessionId, claimToken, currentTime);
        const encoded = encodeFromDecoded(decoded, decoded.state, currentTime, {
          generation: decoded.envelope.generation + 1,
        });
        writeCheckpointAtomically(
          root,
          checkpointPath(root, sessionId),
          encoded,
          false,
        );
      } catch (error) {
        if (!(error instanceof ResearchSessionUnavailableError)) throw error;
      } finally {
        localClaims.delete(sessionId);
      }
    },

    delete(sessionId: string): void {
      if (!isResearchSessionId(sessionId)) throw new ResearchSessionUnavailableError();
      const path = checkpointPath(root, sessionId);
      try {
        unlinkSync(path);
        syncDirectory(root);
      } catch (error) {
        if (isMissing(error)) throw new ResearchSessionUnavailableError();
        throw error;
      }
      localClaims.delete(sessionId);
      observedInThisProcess.delete(sessionId);
    },
  });

  function readAvailable(
    sessionId: string,
    currentTime: number,
    allowExpiredClaim: boolean,
  ): DecodedCheckpoint {
    if (!isResearchSessionId(sessionId)) throw new ResearchSessionUnavailableError();
    const path = checkpointPath(root, sessionId);
    let decoded: DecodedCheckpoint;
    try {
      decoded = decodeCheckpoint(readBoundedRegularFile(path), sessionId);
    } catch (error) {
      if (isMissing(error)) throw new ResearchSessionUnavailableError();
      throw error;
    }
    if (checkpointExpired(decoded.envelope, currentTime)) {
      deleteExpired(path, sessionId);
      throw new ResearchSessionUnavailableError();
    }
    if (
      decoded.envelope.claim_token !== undefined &&
      currentTime < decoded.envelope.claim_expires_at_ms!
    ) {
      throw new ResearchSessionUnavailableError();
    }
    if (decoded.envelope.claim_token !== undefined && !allowExpiredClaim) {
      return clearExpiredClaim(decoded, currentTime);
    }
    return decoded.envelope.claim_token === undefined
      ? decoded
      : clearExpiredClaim(decoded, currentTime);
  }

  function readClaimedBy(
    sessionId: string,
    claimToken: string,
    currentTime: number,
  ): DecodedCheckpoint {
    if (!isResearchSessionId(sessionId)) throw new ResearchSessionUnavailableError();
    let decoded: DecodedCheckpoint;
    try {
      decoded = decodeCheckpoint(
        readBoundedRegularFile(checkpointPath(root, sessionId)),
        sessionId,
      );
    } catch (error) {
      if (isMissing(error)) throw new ResearchSessionUnavailableError();
      throw error;
    }
    if (
      checkpointExpired(decoded.envelope, currentTime) ||
      decoded.envelope.claim_token !== claimToken ||
      currentTime >= decoded.envelope.claim_expires_at_ms!
    ) {
      throw new ResearchSessionUnavailableError();
    }
    return decoded;
  }

  function clearExpiredClaim(
    decoded: DecodedCheckpoint,
    currentTime: number,
  ): DecodedCheckpoint {
    const encoded = encodeFromDecoded(decoded, decoded.state, currentTime, {
      generation: decoded.envelope.generation + 1,
    });
    const path = checkpointPath(root, decoded.envelope.session_id);
    writeCheckpointAtomically(root, path, encoded, false);
    return decodeCheckpoint(encoded, decoded.envelope.session_id);
  }

  function reconcileIfRestored(
    sessionId: string,
    decoded: DecodedCheckpoint,
    currentTime: number,
  ): DecodedCheckpoint {
    if (observedInThisProcess.has(sessionId)) return decoded;
    const reconciled = researchSessionStateSchema.parse(
      reconcileRestoredState(structuredClone(decoded.state)),
    );
    const encoded = encodeFromDecoded(decoded, reconciled, currentTime, {
      generation: decoded.envelope.generation + 1,
    });
    writeCheckpointAtomically(root, checkpointPath(root, sessionId), encoded, false);
    return decodeCheckpoint(encoded, sessionId);
  }

  function inventoryAndPrune(
    currentTime: number,
    excludeSessionId?: string,
  ): DecodedCheckpoint[] {
    const inventory: DecodedCheckpoint[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const sessionId = entry.name.slice(0, -5);
      if (!isResearchSessionId(sessionId) || sessionId === excludeSessionId) continue;
      const path = checkpointPath(root, sessionId);
      const decoded = decodeCheckpoint(readBoundedRegularFile(path), sessionId);
      if (checkpointExpired(decoded.envelope, currentTime)) {
        deleteExpired(path, sessionId);
        continue;
      }
      inventory.push(decoded);
    }
    return inventory;
  }

  function assertCapacity(
    inventory: readonly DecodedCheckpoint[],
    encoded: Buffer,
    plaintextBytes: number,
  ): void {
    const totalPlaintext = inventory.reduce((total, entry) =>
      total + entry.plaintextBytes, plaintextBytes);
    const totalStored = inventory.reduce((total, entry) =>
      total + entry.storedBytes, encoded.byteLength);
    if (totalPlaintext > maxPlaintextBytes || totalStored > maxStoredBytes) {
      throw new Error("Research session store cannot satisfy its bounds");
    }
  }

  function encodeFromDecoded(
    decoded: DecodedCheckpoint,
    state: ResearchSessionState,
    currentTime: number,
    mutation: {
      generation: number;
      claimToken?: string;
      claimExpiresAt?: number;
    },
  ): Buffer {
    const idleExpiresAt = Math.min(
      safeAdd(currentTime, idleTtlMs),
      decoded.envelope.absolute_expires_at_ms,
    );
    return encodeCheckpoint({
      state,
      metadata: {
        sessionId: decoded.envelope.session_id,
        createdAt: decoded.envelope.created_at_ms,
        lastTouchedAt: currentTime,
        idleExpiresAt,
        absoluteExpiresAt: decoded.envelope.absolute_expires_at_ms,
        generation: mutation.generation,
        ...(mutation.claimToken === undefined
          ? {}
          : {
            claimToken: mutation.claimToken,
            claimExpiresAt: mutation.claimExpiresAt,
          }),
      },
      encryptionKey,
      keyId,
      createRandom,
    });
  }

  function decodeCheckpoint(bytes: Buffer, expectedSessionId: string): DecodedCheckpoint {
    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("Research session checkpoint is malformed");
    }
    const envelope = checkpointEnvelopeSchema.parse(raw);
    if (envelope.session_id !== expectedSessionId || envelope.key_id !== keyId) {
      throw new Error("Research session checkpoint identity or key is unavailable");
    }
    const nonce = strictBase64Url(envelope.nonce, NONCE_BYTES, "nonce");
    const authTag = strictBase64Url(envelope.auth_tag, AUTH_TAG_BYTES, "authentication tag");
    const ciphertext = strictBase64Url(envelope.ciphertext, undefined, "ciphertext");
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, nonce);
      decipher.setAAD(metadataBytes(envelope));
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error("Research session checkpoint authentication failed");
    }
    if (plaintext.byteLength > maxPlaintextBytes) {
      throw new Error("Research session checkpoint plaintext exceeds its bound");
    }
    let stateRaw: unknown;
    try {
      stateRaw = JSON.parse(plaintext.toString("utf8"));
    } catch {
      throw new Error("Research session checkpoint state is malformed");
    }
    return {
      envelope,
      state: researchSessionStateSchema.parse(stateRaw),
      plaintextBytes: plaintext.byteLength,
      storedBytes: bytes.byteLength,
    };
  }

  function deleteExpired(path: string, sessionId: string): void {
    try {
      unlinkSync(path);
      syncDirectory(root);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    localClaims.delete(sessionId);
    observedInThisProcess.delete(sessionId);
  }
}

function encodeCheckpoint(input: {
  state: ResearchSessionState;
  metadata: {
    sessionId: string;
    createdAt: number;
    lastTouchedAt: number;
    idleExpiresAt: number;
    absoluteExpiresAt: number;
    generation: number;
    claimToken?: string;
    claimExpiresAt?: number;
  };
  encryptionKey: Buffer;
  keyId: string;
  createRandom: (size: number) => Uint8Array;
}): Buffer {
  const plaintext = Buffer.from(JSON.stringify(
    researchSessionStateSchema.parse(input.state),
  ), "utf8");
  const nonce = exactRandom(input.createRandom, NONCE_BYTES, "nonce");
  const metadata = {
    envelope_version: "askrigor_research_session_checkpoint_v1" as const,
    session_id: input.metadata.sessionId,
    created_at_ms: input.metadata.createdAt,
    last_touched_at_ms: input.metadata.lastTouchedAt,
    idle_expires_at_ms: input.metadata.idleExpiresAt,
    absolute_expires_at_ms: input.metadata.absoluteExpiresAt,
    generation: input.metadata.generation,
    ...(input.metadata.claimToken === undefined
      ? {}
      : {
        claim_token: input.metadata.claimToken,
        claim_expires_at_ms: input.metadata.claimExpiresAt,
      }),
    key_id: input.keyId,
    algorithm: "AES-256-GCM" as const,
  };
  const cipher = createCipheriv("aes-256-gcm", input.encryptionKey, nonce);
  cipher.setAAD(metadataBytes(metadata));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = checkpointEnvelopeSchema.parse({
    ...metadata,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    auth_tag: cipher.getAuthTag().toString("base64url"),
  });
  const encoded = Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
  if (encoded.byteLength > MAX_CHECKPOINT_FILE_BYTES) {
    throw new Error("Research session checkpoint exceeds its file bound");
  }
  return encoded;
}

function metadataBytes(envelope: {
  envelope_version: string;
  session_id: string;
  created_at_ms: number;
  last_touched_at_ms: number;
  idle_expires_at_ms: number;
  absolute_expires_at_ms: number;
  generation: number;
  claim_token?: string;
  claim_expires_at_ms?: number;
  key_id: string;
  algorithm: string;
}): Buffer {
  return Buffer.from(JSON.stringify({
    envelope_version: envelope.envelope_version,
    session_id: envelope.session_id,
    created_at_ms: envelope.created_at_ms,
    last_touched_at_ms: envelope.last_touched_at_ms,
    idle_expires_at_ms: envelope.idle_expires_at_ms,
    absolute_expires_at_ms: envelope.absolute_expires_at_ms,
    generation: envelope.generation,
    ...(envelope.claim_token === undefined
      ? {}
      : {
        claim_token: envelope.claim_token,
        claim_expires_at_ms: envelope.claim_expires_at_ms,
      }),
    key_id: envelope.key_id,
    algorithm: envelope.algorithm,
  }), "utf8");
}

function prepareOwnedRoot(rawRoot: string): string {
  if (!isAbsolute(rawRoot)) {
    throw new Error("Research session checkpoint root must be absolute");
  }
  const normalized = resolve(rawRoot);
  if (normalized === "/") {
    throw new Error("Research session checkpoint root cannot be the filesystem root");
  }
  mkdirSync(normalized, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(normalized);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Research session checkpoint root must be a real directory");
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error("Research session checkpoint root permissions must be 0700 or stricter");
  }
  return realpathSync(normalized);
}

function checkpointPath(root: string, sessionId: string): string {
  if (!isResearchSessionId(sessionId)) throw new ResearchSessionUnavailableError();
  return join(root, `${sessionId}.json`);
}

function readBoundedRegularFile(path: string): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_CHECKPOINT_FILE_BYTES) {
      throw new Error("Research session checkpoint file is invalid or oversized");
    }
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeCheckpointAtomically(
  root: string,
  destination: string,
  bytes: Buffer,
  createOnly: boolean,
): void {
  const temporary = join(root, `.${basename(destination)}.${randomUUID()}.tmp`);
  let temporaryExists = false;
  try {
    const descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    temporaryExists = true;
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (createOnly) {
      linkSync(temporary, destination);
      unlinkSync(temporary);
      temporaryExists = false;
    } else {
      renameSync(temporary, destination);
      temporaryExists = false;
    }
    syncDirectory(root);
    const finalMetadata = statSync(destination);
    if ((finalMetadata.mode & 0o077) !== 0) {
      throw new Error("Research session checkpoint file permissions are too broad");
    }
  } finally {
    if (temporaryExists) {
      try {
        unlinkSync(temporary);
      } catch {
        // Best-effort cleanup only; dot-prefixed staging files are never loaded.
      }
    }
  }
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function checkpointExpired(envelope: CheckpointEnvelope, currentTime: number): boolean {
  return currentTime >= envelope.idle_expires_at_ms ||
    currentTime >= envelope.absolute_expires_at_ms;
}

function stateBytes(state: ResearchSessionState): number {
  return Buffer.byteLength(JSON.stringify(state), "utf8");
}

function randomSessionId(createRandom: (size: number) => Uint8Array): string {
  return `${SESSION_PREFIX}${randomToken(createRandom, SESSION_RANDOM_BYTES)}`;
}

function randomToken(
  createRandom: (size: number) => Uint8Array,
  size: number,
): string {
  return exactRandom(createRandom, size, "random token").toString("base64url");
}

function exactRandom(
  createRandom: (size: number) => Uint8Array,
  size: number,
  label: string,
): Buffer {
  const value = Buffer.from(createRandom(size));
  if (value.byteLength !== size) {
    throw new Error(`Research session ${label} source returned invalid bytes`);
  }
  return value;
}

function strictBase64Url(value: string, expectedBytes: number | undefined, label: string): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    (expectedBytes !== undefined && decoded.byteLength !== expectedBytes)
  ) {
    throw new Error(`Research session checkpoint ${label} is invalid`);
  }
  return decoded;
}

function readNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Research session clock is invalid");
  }
  return value;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error("Research session lifecycle exceeds the safe timestamp range");
  }
  return result;
}

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Research session ${name} must be a positive safe integer`);
  }
  return value;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "ENOENT";
}
