import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_MS = 3_600_000;
const MIN_SECRET_BYTES = 32;
const MAX_TOKEN_CHARACTERS = 4_096;
const MAX_CHUNK_BYTES = 40_000;
const DIGEST = /^[a-f0-9]{64}$/u;
const SESSION = /^ars1_[A-Za-z0-9_-]{32}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

const cursorSchema = z.object({
  version: z.literal(TOKEN_VERSION),
  kind: z.literal("askrigor_controlled_worker_payload"),
  session_id: z.string().regex(SESSION),
  state_digest: z.string().regex(DIGEST),
  work_digest: z.string().regex(DIGEST),
  payload_digest: z.string().regex(DIGEST),
  chunk_index: z.number().int().nonnegative(),
  expires_at_ms: z.number().int().nonnegative()
}).strict();

const receiptSchema = z.object({
  receipt_version: z.literal("askrigor_controlled_worker_payload_receipt_v1"),
  session_id: z.string().regex(SESSION),
  state_digest: z.string().regex(DIGEST),
  work_digest: z.string().regex(DIGEST),
  payload_digest: z.string().regex(DIGEST),
  chunk_count: z.number().int().positive(),
  expires_at_ms: z.number().int().nonnegative(),
  signature: z.string().regex(BASE64URL)
}).strict();

export type ControlledWorkerPayloadReceipt = z.output<typeof receiptSchema>;

export interface ControlledWorkerPayloadPage {
  chunk_index: number;
  chunk_count: number;
  chunk_sha256: string;
  worker_input_json_chunk: string;
  next_cursor?: string;
  complete: boolean;
  terminal_receipt?: ControlledWorkerPayloadReceipt;
}

export interface ControlledWorkerPayloadIdentity {
  sessionId: string;
  stateDigest: string;
  workDigest: string;
}

export class ControlledWorkerPayloadError extends Error {
  constructor(
    public readonly code:
      | "controlled_worker_payload_invalid"
      | "controlled_worker_payload_expired"
      | "controlled_worker_payload_changed",
    message: string
  ) {
    super(message);
    this.name = "ControlledWorkerPayloadError";
  }
}

export function createControlledWorkerPayloadPage(input: {
  identity: ControlledWorkerPayloadIdentity;
  workerInput: unknown;
  signingSecret: string;
  cursor?: string;
  now?: () => number;
}): ControlledWorkerPayloadPage {
  validateSecret(input.signingSecret);
  const now = readNow(input.now);
  const payload = Buffer.from(canonicalJson(input.workerInput), "utf8");
  const payloadDigest = sha256(payload);
  const boundaries = chunkBoundaries(payload);
  let chunkIndex = 0;
  let expiresAtMs = now + TOKEN_LIFETIME_MS;
  if (input.cursor !== undefined) {
    const cursor = decodeSigned(input.cursor, input.signingSecret, now);
    if (
      cursor.session_id !== input.identity.sessionId ||
      cursor.state_digest !== input.identity.stateDigest ||
      cursor.work_digest !== input.identity.workDigest
    ) throw invalid("Worker payload continuation does not match current work");
    if (cursor.payload_digest !== payloadDigest) {
      throw new ControlledWorkerPayloadError(
        "controlled_worker_payload_changed",
        "Worker payload changed during continuation"
      );
    }
    chunkIndex = cursor.chunk_index;
    expiresAtMs = cursor.expires_at_ms;
  }
  if (chunkIndex >= boundaries.length - 1) {
    throw invalid("Worker payload continuation has an invalid chunk index");
  }
  const chunk = payload.subarray(boundaries[chunkIndex], boundaries[chunkIndex + 1]);
  const complete = chunkIndex === boundaries.length - 2;
  const common = {
    session_id: input.identity.sessionId,
    state_digest: input.identity.stateDigest,
    work_digest: input.identity.workDigest,
    payload_digest: payloadDigest
  };
  return {
    chunk_index: chunkIndex,
    chunk_count: boundaries.length - 1,
    chunk_sha256: sha256(chunk),
    worker_input_json_chunk: chunk.toString("utf8"),
    complete,
    ...(complete
      ? {
          terminal_receipt: signReceipt({
            receipt_version: "askrigor_controlled_worker_payload_receipt_v1",
            ...common,
            chunk_count: boundaries.length - 1,
            expires_at_ms: expiresAtMs
          }, input.signingSecret)
        }
      : {
          next_cursor: encodeSigned({
            version: TOKEN_VERSION,
            kind: "askrigor_controlled_worker_payload",
            ...common,
            chunk_index: chunkIndex + 1,
            expires_at_ms: expiresAtMs
          }, input.signingSecret)
        })
  };
}

export function verifyControlledWorkerPayloadReceipt(input: {
  receipt: unknown;
  identity: ControlledWorkerPayloadIdentity;
  workerInput: unknown;
  signingSecret: string;
  now?: () => number;
}): ControlledWorkerPayloadReceipt {
  validateSecret(input.signingSecret);
  const now = readNow(input.now);
  const receipt = receiptSchema.safeParse(input.receipt);
  if (!receipt.success) throw invalid("Worker payload receipt is invalid");
  const payload = Buffer.from(canonicalJson(input.workerInput), "utf8");
  const boundaries = chunkBoundaries(payload);
  const expected = receipt.data;
  if (
    expected.session_id !== input.identity.sessionId ||
    expected.state_digest !== input.identity.stateDigest ||
    expected.work_digest !== input.identity.workDigest ||
    expected.payload_digest !== sha256(payload) ||
    expected.chunk_count !== boundaries.length - 1
  ) throw invalid("Worker payload receipt does not match current work");
  if (now >= expected.expires_at_ms) {
    throw new ControlledWorkerPayloadError(
      "controlled_worker_payload_expired",
      "Worker payload receipt expired"
    );
  }
  const { signature, ...unsigned } = expected;
  verifySignature(canonicalJson(unsigned), signature, input.signingSecret);
  return expected;
}

export function controlledWorkerWorkDigest(work: unknown): string {
  return sha256(Buffer.from(canonicalJson(work), "utf8"));
}

function chunkBoundaries(bytes: Buffer): number[] {
  const boundaries = [0];
  if (bytes.length === 0) return [0, 0];
  while (boundaries.at(-1)! < bytes.length) {
    const start = boundaries.at(-1)!;
    let end = Math.min(start + MAX_CHUNK_BYTES, bytes.length);
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    if (end <= start) throw new Error("Worker payload chunk boundary did not advance");
    boundaries.push(end);
  }
  return boundaries;
}

function encodeSigned(state: z.output<typeof cursorSchema>, secret: string): string {
  const payload = Buffer.from(canonicalJson(cursorSchema.parse(state)), "utf8")
    .toString("base64url");
  const signature = sign(payload, secret);
  const token = `${payload}.${signature}`;
  if (token.length > MAX_TOKEN_CHARACTERS) throw new Error("Worker payload token is too large");
  return token;
}

function decodeSigned(token: string, secret: string, now: number) {
  if (token.length > MAX_TOKEN_CHARACTERS) throw invalid("Worker payload token is too large");
  const parts = token.split(".");
  if (parts.length !== 2 || !BASE64URL.test(parts[0] ?? "") || !BASE64URL.test(parts[1] ?? "")) {
    throw invalid("Worker payload token is invalid");
  }
  verifySignature(parts[0]!, parts[1]!, secret);
  const bytes = Buffer.from(parts[0]!, "base64url");
  if (bytes.toString("base64url") !== parts[0]) throw invalid("Worker payload token is invalid");
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); } catch { throw invalid("Worker payload token is invalid"); }
  const state = cursorSchema.safeParse(raw);
  if (!state.success) throw invalid("Worker payload token is invalid");
  if (now >= state.data.expires_at_ms) {
    throw new ControlledWorkerPayloadError(
      "controlled_worker_payload_expired",
      "Worker payload continuation expired"
    );
  }
  return state.data;
}

function signReceipt(
  unsigned: Omit<ControlledWorkerPayloadReceipt, "signature">,
  secret: string
): ControlledWorkerPayloadReceipt {
  return receiptSchema.parse({
    ...unsigned,
    signature: sign(canonicalJson(unsigned), secret)
  });
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", signingKey(secret)).update(payload).digest("base64url");
}

function verifySignature(payload: string, supplied: string, secret: string): void {
  const expected = createHmac("sha256", signingKey(secret)).update(payload).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (
    actual.toString("base64url") !== supplied ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) throw invalid("Worker payload signature is invalid");
}

function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("askrigor.controlled.worker-payload.v1", "utf8")
    .digest();
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("Controlled worker payload secret must contain at least 32 UTF-8 bytes");
  }
}

function readNow(now: (() => number) | undefined): number {
  const value = (now ?? Date.now)();
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Controlled worker clock is invalid");
  return value;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sort(value));
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sort(child)]));
}

function invalid(message: string): ControlledWorkerPayloadError {
  return new ControlledWorkerPayloadError("controlled_worker_payload_invalid", message);
}
