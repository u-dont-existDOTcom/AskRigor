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
  LESSON_INCIDENT_MAX_RECORD_BYTES,
  createLessonIncidentEvidence,
  lessonIncidentBytes,
  lessonIncidentEvidenceSchema,
  type LessonIncidentCaptureRequest,
  type LessonIncidentEvidence,
  type LessonIncidentProvenance,
} from "./incident-contracts.js";

const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DEFAULT_MAX_RECORDS = 10_000;
const DEFAULT_MAX_STORED_BYTES = 256 * 1_024 * 1_024;
const MAX_ENVELOPE_BYTES = 192 * 1_024;

const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/u);
const keyIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/u);

const envelopeSchema = z.strictObject({
  envelope_version: z.literal("askrigor_lesson_incident_envelope_v1"),
  incident_id: z.string().regex(/^ali_[A-Za-z0-9_-]{16,96}$/u),
  incident_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  captured_at: z.string().datetime({ offset: true }),
  key_id: keyIdSchema,
  algorithm: z.literal("AES-256-GCM"),
  nonce: base64UrlSchema,
  ciphertext: base64UrlSchema,
  auth_tag: base64UrlSchema,
});

type IncidentEnvelope = z.infer<typeof envelopeSchema>;

export class LessonIncidentVaultUnavailableError extends Error {
  constructor(message = "Lesson incident vault unavailable") {
    super(message);
    this.name = "LessonIncidentVaultUnavailableError";
  }
}

export class LessonIncidentVaultIntegrityError extends Error {
  constructor(message = "Lesson incident vault integrity check failed") {
    super(message);
    this.name = "LessonIncidentVaultIntegrityError";
  }
}

export interface FileLessonIncidentVaultOptions {
  rootDirectory: string;
  encryptionKey: Uint8Array;
  keyId: string;
  now?: () => Date;
  random?: (size: number) => Uint8Array;
  maxRecords?: number;
  maxStoredBytes?: number;
}

export interface LessonIncidentVault {
  capture(raw: unknown): LessonIncidentProvenance;
  read(incidentId: string): LessonIncidentEvidence;
  inventory(): LessonIncidentProvenance[];
}

export function createFileLessonIncidentVault(
  options: FileLessonIncidentVaultOptions,
): LessonIncidentVault {
  const root = prepareOwnedRoot(options.rootDirectory);
  const encryptionKey = Buffer.from(options.encryptionKey);
  if (encryptionKey.byteLength !== 32) {
    throw new Error("Lesson incident encryption key must contain exactly 32 bytes");
  }
  const keyId = keyIdSchema.parse(options.keyId);
  const now = options.now ?? (() => new Date());
  const createRandom = options.random ?? randomBytes;
  const maxRecords = positiveInteger(options.maxRecords ?? DEFAULT_MAX_RECORDS, "record limit");
  const maxStoredBytes = positiveInteger(
    options.maxStoredBytes ?? DEFAULT_MAX_STORED_BYTES,
    "stored byte limit",
  );

  return Object.freeze({
    capture(raw: unknown): LessonIncidentProvenance {
      const request = raw as Partial<LessonIncidentCaptureRequest>;
      const existing = request.idempotency_key === undefined
        ? undefined
        : findIdempotent(request.idempotency_key);
      const record = createLessonIncidentEvidence(raw, {
        now,
        createIncidentId: existing === undefined
          ? undefined
          : () => existing.incident_id,
      });
      const encoded = encodeIncident(record);
      if (encoded.byteLength > MAX_ENVELOPE_BYTES) {
        throw new Error("Lesson incident envelope exceeds its file bound");
      }
      const inventory = readInventory();
      const already = inventory.find((item) => item.incident_id === record.incident_id);
      if (already !== undefined) {
        if (already.incident_sha256 !== record.incident_sha256) {
          throw new LessonIncidentVaultIntegrityError("Idempotency key maps to different incident bytes");
        }
        return {
          incident_id: already.incident_id,
          incident_sha256: already.incident_sha256,
          preservation_status: already.preservation_status,
        };
      }
      const currentStoredBytes = inventory.reduce((total, item) =>
        total + item.storedBytes, 0);
      if (inventory.length >= maxRecords || currentStoredBytes + encoded.byteLength > maxStoredBytes) {
        throw new Error("Lesson incident vault cannot satisfy its bounds");
      }
      writeAtomically(root, incidentPath(root, record.incident_id), encoded, true);
      if (request.idempotency_key !== undefined) {
        writeAtomically(
          root,
          idempotencyPath(root, request.idempotency_key),
          Buffer.from(`${record.incident_id}\n`, "utf8"),
          true,
        );
      }
      return provenance(record);
    },

    read(incidentId: string): LessonIncidentEvidence {
      return decodeIncident(readBoundedRegularFile(incidentPath(root, incidentId)), incidentId);
    },

    inventory(): LessonIncidentProvenance[] {
      return readInventory().map(({ storedBytes: _storedBytes, ...item }) => item);
    },
  });

  function encodeIncident(record: LessonIncidentEvidence): Buffer {
    const plaintext = lessonIncidentBytes(record);
    if (plaintext.byteLength > LESSON_INCIDENT_MAX_RECORD_BYTES) {
      throw new Error("Lesson incident record exceeds its plaintext bound");
    }
    const nonce = exactRandom(createRandom, NONCE_BYTES, "nonce");
    const metadata = {
      envelope_version: "askrigor_lesson_incident_envelope_v1" as const,
      incident_id: record.incident_id,
      incident_sha256: record.incident_sha256,
      captured_at: record.captured_at,
      key_id: keyId,
      algorithm: "AES-256-GCM" as const,
    };
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
    cipher.setAAD(metadataBytes(metadata));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.from(`${JSON.stringify(envelopeSchema.parse({
      ...metadata,
      nonce: nonce.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      auth_tag: cipher.getAuthTag().toString("base64url"),
    }))}\n`, "utf8");
  }

  function decodeIncident(bytes: Buffer, expectedIncidentId: string): LessonIncidentEvidence {
    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new LessonIncidentVaultIntegrityError("Lesson incident envelope is malformed");
    }
    const envelope = envelopeSchema.parse(raw);
    if (envelope.incident_id !== expectedIncidentId || envelope.key_id !== keyId) {
      throw new LessonIncidentVaultIntegrityError("Lesson incident identity or key is unavailable");
    }
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        strictBase64Url(envelope.nonce, NONCE_BYTES, "nonce"),
      );
      decipher.setAAD(metadataBytes(envelope));
      decipher.setAuthTag(strictBase64Url(envelope.auth_tag, AUTH_TAG_BYTES, "authentication tag"));
      plaintext = Buffer.concat([
        decipher.update(strictBase64Url(envelope.ciphertext, undefined, "ciphertext")),
        decipher.final(),
      ]);
    } catch {
      throw new LessonIncidentVaultIntegrityError("Lesson incident authentication failed");
    }
    if (plaintext.byteLength > LESSON_INCIDENT_MAX_RECORD_BYTES) {
      throw new LessonIncidentVaultIntegrityError("Lesson incident plaintext exceeds its bound");
    }
    const record = lessonIncidentEvidenceSchema.parse(JSON.parse(plaintext.toString("utf8")));
    if (
      record.incident_id !== envelope.incident_id ||
      record.incident_sha256 !== envelope.incident_sha256
    ) {
      throw new LessonIncidentVaultIntegrityError("Lesson incident envelope and plaintext disagree");
    }
    return record;
  }

  function readInventory(): Array<LessonIncidentProvenance & { storedBytes: number }> {
    const items: Array<LessonIncidentProvenance & { storedBytes: number }> = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const incidentId = entry.name.slice(0, -5);
      if (!/^ali_[A-Za-z0-9_-]{16,96}$/u.test(incidentId)) continue;
      const path = incidentPath(root, incidentId);
      const bytes = readBoundedRegularFile(path);
      const record = decodeIncident(bytes, incidentId);
      items.push({ ...provenance(record), storedBytes: bytes.byteLength });
    }
    return items;
  }

  function findIdempotent(idempotencyKey: string): LessonIncidentProvenance | undefined {
    const path = idempotencyPath(root, idempotencyKey);
    if (!existsSync(path)) return undefined;
    const incidentId = readBoundedRegularFile(path).toString("utf8").trim();
    if (!/^ali_[A-Za-z0-9_-]{16,96}$/u.test(incidentId)) {
      throw new LessonIncidentVaultIntegrityError("Lesson incident idempotency record is malformed");
    }
    return provenance(decodeIncident(readBoundedRegularFile(incidentPath(root, incidentId)), incidentId));
  }
}

export function lessonIncidentVaultConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FileLessonIncidentVaultOptions | undefined {
  const directory = env.ASKRIGOR_LESSON_INCIDENT_DIRECTORY?.trim();
  const key = env.ASKRIGOR_LESSON_INCIDENT_KEY?.trim();
  const keyId = env.ASKRIGOR_LESSON_INCIDENT_KEY_ID?.trim();
  if (directory === undefined && key === undefined && keyId === undefined) return undefined;
  if (directory === undefined || key === undefined || keyId === undefined) {
    throw new Error("Lesson incident vault configuration unavailable");
  }
  const decodedKey = Buffer.from(key, "base64url");
  if (
    decodedKey.byteLength !== 32 ||
    decodedKey.toString("base64url") !== key ||
    !keyIdSchema.safeParse(keyId).success
  ) {
    throw new Error("Lesson incident vault configuration unavailable");
  }
  return {
    rootDirectory: directory,
    encryptionKey: Uint8Array.from(decodedKey),
    keyId,
  };
}

function provenance(record: LessonIncidentEvidence): LessonIncidentProvenance {
  return {
    incident_id: record.incident_id,
    incident_sha256: record.incident_sha256,
    preservation_status: record.preservation_status,
  };
}

function metadataBytes(envelope: Omit<IncidentEnvelope, "nonce" | "ciphertext" | "auth_tag">): Buffer {
  return Buffer.from(JSON.stringify({
    envelope_version: envelope.envelope_version,
    incident_id: envelope.incident_id,
    incident_sha256: envelope.incident_sha256,
    captured_at: envelope.captured_at,
    key_id: envelope.key_id,
    algorithm: envelope.algorithm,
  }), "utf8");
}

function prepareOwnedRoot(rawRoot: string): string {
  if (!isAbsolute(rawRoot)) {
    throw new Error("Lesson incident vault root must be absolute");
  }
  const normalized = resolve(rawRoot);
  if (normalized === "/") {
    throw new Error("Lesson incident vault root cannot be the filesystem root");
  }
  mkdirSync(normalized, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(normalized);
  const expectedUid = process.getuid?.();
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    (Number.isSafeInteger(expectedUid) && expectedUid! >= 0 && metadata.uid !== expectedUid) ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error("Lesson incident vault root must be owner-private");
  }
  return realpathSync(normalized);
}

function incidentPath(root: string, incidentId: string): string {
  if (!/^ali_[A-Za-z0-9_-]{16,96}$/u.test(incidentId)) {
    throw new LessonIncidentVaultUnavailableError();
  }
  return join(root, `${incidentId}.json`);
}

function idempotencyPath(root: string, idempotencyKey: string): string {
  if (!/^[A-Za-z0-9_-]{16,96}$/u.test(idempotencyKey)) {
    throw new LessonIncidentVaultUnavailableError();
  }
  return join(root, `.idempotency-${idempotencyKey}.txt`);
}

function readBoundedRegularFile(path: string): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_ENVELOPE_BYTES) {
      throw new LessonIncidentVaultIntegrityError("Lesson incident file is invalid or oversized");
    }
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeAtomically(root: string, destination: string, bytes: Buffer, createOnly: boolean): void {
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
    if (createOnly && existsSync(destination)) {
      throw new LessonIncidentVaultIntegrityError("Lesson incident record already exists");
    }
    renameSync(temporary, destination);
    temporaryExists = false;
    syncDirectory(root);
    const finalMetadata = statSync(destination);
    if (!finalMetadata.isFile() || (finalMetadata.mode & 0o077) !== 0) {
      throw new LessonIncidentVaultIntegrityError("Lesson incident file permissions are too broad");
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

function strictBase64Url(value: string, expectedBytes: number | undefined, label: string): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    (expectedBytes !== undefined && decoded.byteLength !== expectedBytes)
  ) {
    throw new LessonIncidentVaultIntegrityError(`Lesson incident ${label} is invalid`);
  }
  return decoded;
}

function exactRandom(createRandom: (size: number) => Uint8Array, size: number, label: string): Buffer {
  const value = Buffer.from(createRandom(size));
  if (value.byteLength !== size) {
    throw new Error(`Lesson incident ${label} source returned invalid bytes`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Lesson incident ${label} must be a positive integer`);
  }
  return value;
}
