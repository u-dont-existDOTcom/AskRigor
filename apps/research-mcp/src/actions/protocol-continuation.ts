import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";

import type { ProtocolName } from "@askrigor/protocol";
import { z } from "zod";

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_MS = 3_600_000;
const MIN_SECRET_BYTES = 32;
const MAX_TOKEN_CHARACTERS = 2_048;
const PROTOCOL_TEXT_MAX_BYTES = 48_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const cursorStateSchema = z.object({
  version: z.literal(TOKEN_VERSION),
  kind: z.literal("askrigor_protocol_action"),
  protocol: z.enum(["hrp", "universal"]),
  sha256: z.string().regex(SHA256_PATTERN),
  next_byte_offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  chunk_index: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  expires_at_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
}).strict();

export const protocolActionManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  revisionDate: z.string(),
  sha256: z.string().regex(SHA256_PATTERN)
}).strict();

export const protocolActionChunkInputSchema = z.object({
  protocol: z.enum(["hrp", "universal"]),
  cursor: z.string().min(1).max(MAX_TOKEN_CHARACTERS).optional()
}).strict();

export const protocolActionChunkOutputSchema = z.object({
  ok: z.literal(true),
  protocol: z.enum(["hrp", "universal"]),
  manifest: protocolActionManifestSchema,
  chunk_index: z.number().int().nonnegative(),
  chunk_count: z.number().int().positive(),
  byte_start: z.number().int().nonnegative(),
  byte_end_exclusive: z.number().int().positive(),
  total_bytes: z.number().int().positive(),
  chunk_sha256: z.string().regex(SHA256_PATTERN),
  text: z.string(),
  next_cursor: z.string().min(1).max(MAX_TOKEN_CHARACTERS).optional(),
  complete: z.boolean()
}).strict();

interface ProtocolCursorState extends z.output<typeof cursorStateSchema> {}

export type ProtocolActionManifest = z.output<typeof protocolActionManifestSchema>;

export interface ProtocolActionChunkInput {
  protocol: ProtocolName;
  cursor?: string;
}

export interface ProtocolActionChunk {
  ok: true;
  protocol: ProtocolName;
  manifest: ProtocolActionManifest;
  chunk_index: number;
  chunk_count: number;
  byte_start: number;
  byte_end_exclusive: number;
  total_bytes: number;
  chunk_sha256: string;
  text: string;
  next_cursor?: string;
  complete: boolean;
}

export interface ProtocolActionChunkDependencies {
  continuationSecret: string;
  now?: () => number;
  loadProtocol(protocol: ProtocolName): Promise<string>;
  getProtocolManifest(protocol: ProtocolName): Promise<ProtocolActionManifest>;
}

export class ProtocolActionContinuationError extends Error {
  constructor(
    public readonly code:
      | "protocol_action_continuation_invalid"
      | "protocol_action_continuation_expired"
      | "protocol_action_protocol_changed",
    message: string
  ) {
    super(message);
    this.name = "ProtocolActionContinuationError";
  }
}

export async function createProtocolActionChunk(
  input: ProtocolActionChunkInput,
  dependencies: ProtocolActionChunkDependencies
): Promise<ProtocolActionChunk> {
  validateSecret(dependencies.continuationSecret);
  const nowMs = readNow(dependencies.now);
  const [text, rawManifest] = await Promise.all([
    dependencies.loadProtocol(input.protocol),
    dependencies.getProtocolManifest(input.protocol)
  ]);
  const manifest = protocolActionManifestSchema.parse(rawManifest);
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length === 0) {
    throw new Error("Canonical protocol text must not be empty");
  }
  const actualSha256 = digest(bytes);
  if (manifest.sha256 !== actualSha256) {
    throw new ProtocolActionContinuationError(
      "protocol_action_protocol_changed",
      "Canonical protocol bytes changed or did not match the manifest"
    );
  }

  const boundaries = protocolChunkBoundaries(bytes);
  let byteStart = 0;
  let chunkIndex = 0;
  let expiresAtMs = nowMs + TOKEN_LIFETIME_MS;
  if (input.cursor !== undefined) {
    const state = decodeCursor(
      input.cursor,
      dependencies.continuationSecret,
      nowMs
    );
    if (state.protocol !== input.protocol) {
      throw invalidContinuation("Protocol continuation token names another protocol");
    }
    if (state.sha256 !== actualSha256) {
      throw new ProtocolActionContinuationError(
        "protocol_action_protocol_changed",
        "Canonical protocol changed during Action continuation"
      );
    }
    byteStart = state.next_byte_offset;
    chunkIndex = state.chunk_index;
    expiresAtMs = state.expires_at_ms;
  }

  if (
    boundaries[chunkIndex] !== byteStart ||
    chunkIndex >= boundaries.length - 1
  ) {
    throw invalidContinuation("Protocol continuation token has an invalid chunk offset");
  }
  const byteEnd = boundaries[chunkIndex + 1]!;
  const chunkBytes = bytes.subarray(byteStart, byteEnd);
  const complete = byteEnd === bytes.length;
  const nextCursor = complete
    ? undefined
    : encodeCursor({
        version: TOKEN_VERSION,
        kind: "askrigor_protocol_action",
        protocol: input.protocol,
        sha256: actualSha256,
        next_byte_offset: byteEnd,
        chunk_index: chunkIndex + 1,
        expires_at_ms: expiresAtMs
      }, dependencies.continuationSecret);

  return {
    ok: true,
    protocol: input.protocol,
    manifest,
    chunk_index: chunkIndex,
    chunk_count: boundaries.length - 1,
    byte_start: byteStart,
    byte_end_exclusive: byteEnd,
    total_bytes: bytes.length,
    chunk_sha256: digest(chunkBytes),
    text: chunkBytes.toString("utf8"),
    ...(nextCursor === undefined ? {} : { next_cursor: nextCursor }),
    complete
  };
}

function protocolChunkBoundaries(bytes: Buffer): number[] {
  const boundaries = [0];
  while (boundaries.at(-1)! < bytes.length) {
    const start = boundaries.at(-1)!;
    let end = Math.min(start + PROTOCOL_TEXT_MAX_BYTES, bytes.length);
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end -= 1;
    }
    if (end <= start) {
      throw new Error("Protocol chunk boundary did not advance");
    }
    boundaries.push(end);
  }
  return boundaries;
}

function encodeCursor(state: ProtocolCursorState, secret: string): string {
  const parsed = cursorStateSchema.parse(state);
  const payload = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingKey(secret))
    .update(payload)
    .digest("base64url");
  const token = `${payload}.${signature}`;
  if (token.length > MAX_TOKEN_CHARACTERS) {
    throw new Error("Protocol continuation token is too large");
  }
  return token;
}

function decodeCursor(
  token: string,
  secret: string,
  nowMs: number
): ProtocolCursorState {
  if (token.length > MAX_TOKEN_CHARACTERS) {
    throw invalidContinuation("Protocol continuation token is too large");
  }
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    !BASE64URL_PATTERN.test(parts[0]) ||
    !BASE64URL_PATTERN.test(parts[1])
  ) {
    throw invalidContinuation("Invalid protocol continuation token");
  }
  const [payload, suppliedSignature] = parts;
  const expectedSignature = createHmac("sha256", signingKey(secret))
    .update(payload)
    .digest();
  const suppliedBytes = Buffer.from(suppliedSignature, "base64url");
  if (
    suppliedBytes.toString("base64url") !== suppliedSignature ||
    suppliedBytes.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedBytes, expectedSignature)
  ) {
    throw invalidContinuation("Invalid protocol continuation token signature");
  }
  const payloadBytes = Buffer.from(payload, "base64url");
  if (payloadBytes.toString("base64url") !== payload) {
    throw invalidContinuation("Invalid protocol continuation token payload");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw invalidContinuation("Invalid protocol continuation token payload");
  }
  const parsed = cursorStateSchema.safeParse(decoded);
  if (!parsed.success) {
    throw invalidContinuation("Invalid protocol continuation token state");
  }
  if (nowMs >= parsed.data.expires_at_ms) {
    throw new ProtocolActionContinuationError(
      "protocol_action_continuation_expired",
      "Protocol continuation token expired"
    );
  }
  return parsed.data;
}

function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("askrigor:protocol-action:v1")
    .digest();
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("Protocol continuation secret must contain at least 32 UTF-8 bytes");
  }
}

function readNow(now: (() => number) | undefined): number {
  const value = now?.() ?? Date.now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Protocol continuation clock is invalid");
  }
  return value;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function invalidContinuation(message: string): ProtocolActionContinuationError {
  return new ProtocolActionContinuationError(
    "protocol_action_continuation_invalid",
    message
  );
}
