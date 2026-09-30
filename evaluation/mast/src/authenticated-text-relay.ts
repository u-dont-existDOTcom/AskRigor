import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { ROUND_2_STUDY_ID } from "./fresh-validation-round-2.js";
import { TRANSPORT_NORMALIZATION, normalizeTransportText, transportTextIdentity } from "./chatgpt-browser-transport.js";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const instantSchema = z.string().datetime({ offset: true });
const opaqueInputSchema = z.string().regex(/^run-[0-9a-f]{24}$/u);

export const TEXT_RELAY_MINIMUM_TOKEN_BYTES = 32;
export const TEXT_RELAY_MAXIMUM_SERVES = 2;
export const TEXT_RELAY_MINIMUM_TTL_MS = 30_000;
export const TEXT_RELAY_MAXIMUM_TTL_MS = 15 * 60_000;

export type TextRelayStatus = "READY" | "SERVED" | "INVALIDATED" | "EXPIRED" | "CLOSED";

export const relayPageObservationSchema = z.object({
  schemaVersion: z.literal(1),
  observedAt: instantSchema,
  originProtocol: z.literal("https:"),
  pathnameSha256: digestSchema,
  normalization: z.literal(TRANSPORT_NORMALIZATION),
  relayUtf8Bytes: z.number().int().positive(),
  relayCodePoints: z.number().int().positive(),
  relayPageSha256: digestSchema,
}).strict();

export const relayLifecycleReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_2_STUDY_ID),
  opaqueInputId: opaqueInputSchema,
  expectedPacketSha256: digestSchema,
  tokenSha256: digestSchema,
  startedAt: instantSchema,
  expiresAt: instantSchema,
  stoppedAt: instantSchema.nullable(),
  finalStatus: z.enum(["READY", "SERVED", "INVALIDATED", "EXPIRED", "CLOSED"]),
  serveCount: z.number().int().min(0).max(TEXT_RELAY_MAXIMUM_SERVES),
  tunnelStarted: z.boolean(),
  tunnelStopped: z.boolean(),
}).strict();

export function relayPathname(input: { opaqueInputId: string; expectedPacketSha256: string; token: string }): string {
  return `/relay/${encodeURIComponent(input.opaqueInputId)}/${input.expectedPacketSha256}/${input.token}`;
}

export function verifyRelayPageTransfer(input: {
  expectedPacketSha256: string;
  expectedUtf8Bytes: number;
  expectedCodePoints: number;
  expectedPathname: string;
  observation: unknown;
}) {
  const observation = relayPageObservationSchema.parse(input.observation);
  const pathnameSha256 = createHash("sha256").update(input.expectedPathname, "utf8").digest("hex");
  if (observation.pathnameSha256 !== pathnameSha256
    || observation.relayPageSha256 !== input.expectedPacketSha256
    || observation.relayUtf8Bytes !== input.expectedUtf8Bytes
    || observation.relayCodePoints !== input.expectedCodePoints) {
    throw new Error("GENERATION_RELAY_PAGE_SOURCE_MISMATCH");
  }
  return { observation, exactEquality: true as const };
}

export async function projectTextRelayPageIdentity() {
  const fail = (failureCode: string) => ({ schemaVersion: 1, failureCode });
  try {
    if (typeof document === "undefined" || typeof location === "undefined") return fail("DOCUMENT_UNAVAILABLE");
    if (location.protocol !== "https:") return fail("RELAY_HTTPS_NOT_ESTABLISHED");
    const raw = document.body?.innerText;
    if (typeof raw !== "string" || raw.length === 0) return fail("RELAY_PAGE_TEXT_EMPTY");
    const normalized = raw.replace(/\r\n?/gu, "\n");
    const bytes = new TextEncoder().encode(normalized);
    const [pageHash, pathHash] = await Promise.all([
      crypto.subtle.digest("SHA-256", bytes),
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(location.pathname)),
    ]);
    const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    return {
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      originProtocol: location.protocol,
      pathnameSha256: hex(pathHash),
      normalization: "LINE_ENDINGS_TO_LF_ONLY",
      relayUtf8Bytes: bytes.byteLength,
      relayCodePoints: Array.from(normalized).length,
      relayPageSha256: hex(pageHash),
    };
  } catch {
    return fail("RELAY_PAGE_IDENTITY_PROJECTION_FAILED");
  }
}

export async function createOneTimeTextRelay(input: {
  packetPath: string;
  opaqueInputId: string;
  expectedPacketSha256: string;
  ttlMs: number;
  maxServes?: number;
  token?: string;
  host?: string;
  port?: number;
  now?: () => number;
  onEvent?: (event: { opaqueInputId: string; expectedPacketSha256: string; status: string }) => void;
}) {
  const opaqueInputId = opaqueInputSchema.parse(input.opaqueInputId);
  const expectedPacketSha256 = digestSchema.parse(input.expectedPacketSha256);
  if (!Number.isInteger(input.ttlMs) || input.ttlMs < TEXT_RELAY_MINIMUM_TTL_MS
    || input.ttlMs > TEXT_RELAY_MAXIMUM_TTL_MS) throw new Error("TEXT_RELAY_TTL_INVALID");
  const maxServes = input.maxServes ?? 1;
  if (!Number.isInteger(maxServes) || maxServes < 1 || maxServes > TEXT_RELAY_MAXIMUM_SERVES) {
    throw new Error("TEXT_RELAY_SERVE_LIMIT_INVALID");
  }
  const token = input.token ?? randomBytes(TEXT_RELAY_MINIMUM_TOKEN_BYTES).toString("base64url");
  if (Buffer.from(token, "base64url").byteLength < TEXT_RELAY_MINIMUM_TOKEN_BYTES) {
    throw new Error("TEXT_RELAY_TOKEN_ENTROPY_INVALID");
  }
  const packetPath = resolve(input.packetPath);
  const metadata = await lstat(packetPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(packetPath) !== packetPath) {
    throw new Error("TEXT_RELAY_PACKET_PATH_INVALID");
  }
  const source = normalizeTransportText(await readFile(packetPath, "utf8"));
  const identity = transportTextIdentity(source);
  if (identity.sha256 !== expectedPacketSha256) throw new Error("TEXT_RELAY_SOURCE_HASH_MISMATCH");
  const sourceBytes = Buffer.from(source, "utf8");
  const expectedPathname = relayPathname({ opaqueInputId, expectedPacketSha256, token });
  const tokenSha256 = createHash("sha256").update(token, "utf8").digest("hex");
  const now = input.now ?? Date.now;
  const startedMs = now();
  const expiresMs = startedMs + input.ttlMs;
  let status: TextRelayStatus = "READY";
  let serveCount = 0;
  let server: Server;
  const emit = (eventStatus: string) => input.onEvent?.({ opaqueInputId, expectedPacketSha256, status: eventStatus });
  const replyUnavailable = (response: import("node:http").ServerResponse, code: number) => {
    response.writeHead(code, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    response.end();
  };
  server = createServer((request, response) => {
    if (now() >= expiresMs && status !== "INVALIDATED" && status !== "CLOSED") status = "EXPIRED";
    const pathname = new URL(request.url ?? "/", "http://relay.invalid").pathname;
    if (request.method !== "GET" || pathname !== expectedPathname) {
      emit("REJECTED_PATH");
      replyUnavailable(response, 404);
      return;
    }
    if (status === "EXPIRED" || status === "INVALIDATED" || status === "CLOSED" || serveCount >= maxServes) {
      emit("REJECTED_UNAVAILABLE");
      replyUnavailable(response, 410);
      return;
    }
    serveCount += 1;
    status = "SERVED";
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": sourceBytes.byteLength,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(sourceBytes);
    emit("SERVED");
  });
  const host = input.host ?? "127.0.0.1";
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(input.port ?? 0, host, () => accept());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEXT_RELAY_ADDRESS_INVALID");
  emit("READY");
  return {
    opaqueInputId,
    expectedPacketSha256,
    sourceIdentity: identity,
    token,
    tokenSha256,
    expectedPathname,
    localUrl: `http://${host}:${address.port}${expectedPathname}`,
    port: address.port,
    startedAt: new Date(startedMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    status: () => ({ status, serveCount }),
    invalidate: () => {
      if (status !== "CLOSED" && status !== "EXPIRED") status = "INVALIDATED";
      emit("INVALIDATED");
    },
    close: async () => {
      if (status !== "INVALIDATED" && status !== "EXPIRED") status = "CLOSED";
      await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
      emit("CLOSED");
    },
  };
}
