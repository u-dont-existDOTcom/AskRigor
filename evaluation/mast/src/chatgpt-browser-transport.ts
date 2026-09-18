import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { z } from "zod";

import { ROUND_2_STUDY_ID } from "./fresh-validation-round-2.js";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const instantSchema = z.string().datetime({ offset: true });
const opaqueInputSchema = z.string().regex(/^run-[0-9a-f]{24}$/u);

export const TRANSPORT_NORMALIZATION = "LINE_ENDINGS_TO_LF_ONLY" as const;
export const GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS = 2;
export const BROWSER_TRANSPORT_CHUNK_UTF8_BYTES = 64 * 1024;

export function normalizeTransportText(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

export function transportTextIdentity(value: string) {
  const normalized = normalizeTransportText(value);
  const bytes = Buffer.from(normalized, "utf8");
  return {
    normalization: TRANSPORT_NORMALIZATION,
    utf8Bytes: bytes.byteLength,
    codePoints: [...normalized].length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function encodeBrowserFillPayload(value: string) {
  const normalized = normalizeTransportText(value);
  const bytes = Buffer.from(normalized, "utf8");
  const chunks = [];
  for (let offset = 0; offset < bytes.byteLength; offset += BROWSER_TRANSPORT_CHUNK_UTF8_BYTES) {
    const raw = bytes.subarray(offset, Math.min(offset + BROWSER_TRANSPORT_CHUNK_UTF8_BYTES, bytes.byteLength));
    const compressed = gzipSync(raw, { level: 9, mtime: 0 });
    chunks.push({
      index: chunks.length,
      rawUtf8Bytes: raw.byteLength,
      rawSha256: createHash("sha256").update(raw).digest("hex"),
      gzipBase64: compressed.toString("base64"),
      gzipSha256: createHash("sha256").update(compressed).digest("hex"),
    });
  }
  return { schemaVersion: 1 as const, encoding: "GZIP_BASE64_CHUNKS" as const,
    normalization: TRANSPORT_NORMALIZATION, source: transportTextIdentity(normalized), chunks };
}

export function decodeBrowserFillPayload(payload: ReturnType<typeof encodeBrowserFillPayload>): string {
  const bytes = Buffer.concat(payload.chunks.map((chunk, index) => {
    if (chunk.index !== index) throw new Error("BROWSER_FILL_CHUNK_ORDER_INVALID");
    const compressed = Buffer.from(chunk.gzipBase64, "base64");
    if (createHash("sha256").update(compressed).digest("hex") !== chunk.gzipSha256) {
      throw new Error("BROWSER_FILL_COMPRESSED_CHUNK_HASH_MISMATCH");
    }
    const raw = gunzipSync(compressed);
    if (raw.byteLength !== chunk.rawUtf8Bytes
      || createHash("sha256").update(raw).digest("hex") !== chunk.rawSha256) {
      throw new Error("BROWSER_FILL_RAW_CHUNK_HASH_MISMATCH");
    }
    return raw;
  }));
  const value = bytes.toString("utf8");
  const identity = transportTextIdentity(value);
  if (JSON.stringify(identity) !== JSON.stringify(payload.source)) throw new Error("BROWSER_FILL_SOURCE_HASH_MISMATCH");
  return value;
}

export const composerObservationSchema = z.object({
  schemaVersion: z.literal(1),
  observedAt: instantSchema,
  origin: z.literal("https://chatgpt.com"),
  composerSelector: z.literal("#prompt-textarea"),
  composerCount: z.literal(1),
  extraction: z.enum(["TEXTAREA_VALUE", "CONTENTEDITABLE_INNER_TEXT"]),
  normalization: z.literal(TRANSPORT_NORMALIZATION),
  composerUtf8Bytes: z.number().int().nonnegative(),
  composerCodePoints: z.number().int().nonnegative(),
  composerSha256: digestSchema,
}).strict();

export const generationUiAttestationSchema = z.object({
  schemaVersion: z.literal(1),
  observedAt: instantSchema,
  origin: z.literal("https://chatgpt.com"),
  modelVisibleLabel: z.literal("GPT-5.6 Sol"),
  reasoningVisibleLabel: z.literal("Extra High"),
  reasoningOrdinal: z.literal("4 of 5"),
  chatMode: z.literal("TEMPORARY"),
  personalization: z.literal("UNPERSONALIZED"),
  userMessageCount: z.literal(0),
  assistantMessageCount: z.literal(0),
  attachmentCount: z.literal(0),
  sendEnabled: z.literal(true),
}).strict();

export const transportAttemptStateSchema = z.enum([
  "READY",
  "COMPOSER_VERIFIED",
  "SENT",
  "RESPONSE_COMPLETE",
  "SEALED",
  "PRE_SEND_FAILED",
  "POST_SEND_AMBIGUOUS",
]);

export const generationTransportReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_2_STUDY_ID),
  opaqueInputId: opaqueInputSchema,
  attempt: z.number().int().min(1).max(GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS),
  state: transportAttemptStateSchema,
  normalization: z.literal(TRANSPORT_NORMALIZATION),
  sourceUtf8Bytes: z.number().int().positive(),
  sourceCodePoints: z.number().int().positive(),
  sourceSha256: digestSchema,
  composerUtf8Bytes: z.number().int().nonnegative(),
  composerCodePoints: z.number().int().nonnegative(),
  composerSha256: digestSchema,
  exactEquality: z.literal(true),
  ui: generationUiAttestationSchema,
  verifiedAt: instantSchema,
  sentAt: instantSchema.nullable(),
}).strict().superRefine((receipt, context) => {
  if (receipt.sourceUtf8Bytes !== receipt.composerUtf8Bytes
    || receipt.sourceCodePoints !== receipt.composerCodePoints
    || receipt.sourceSha256 !== receipt.composerSha256) {
    context.addIssue({ code: "custom", message: "GENERATION_COMPOSER_SOURCE_MISMATCH" });
  }
  const sent = ["SENT", "RESPONSE_COMPLETE", "SEALED", "POST_SEND_AMBIGUOUS"].includes(receipt.state);
  if (sent !== (receipt.sentAt !== null)) {
    context.addIssue({ code: "custom", message: "GENERATION_SENT_TIMESTAMP_STATE_MISMATCH" });
  }
});

export const transportFailureReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_2_STUDY_ID),
  opaqueInputId: opaqueInputSchema,
  attempt: z.number().int().min(1).max(GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS),
  stage: z.enum(["CLIPBOARD_STAGE", "COMPOSER_INSERT", "COMPOSER_VERIFY", "UI_ATTEST", "SUBMIT", "RESPONSE_CAPTURE"]),
  failureCode: z.string().regex(/^[A-Z0-9_]+$/u),
  sourceSha256: digestSchema,
  observedComposerSha256: digestSchema.nullable(),
  messageMayHaveBeenSent: z.boolean(),
  retryable: z.boolean(),
  stoppedBeforeSend: z.boolean(),
  recordedAt: instantSchema,
}).strict().superRefine((receipt, context) => {
  if (receipt.messageMayHaveBeenSent && (receipt.retryable || receipt.stoppedBeforeSend)) {
    context.addIssue({ code: "custom", message: "AMBIGUOUS_SEND_MUST_NOT_BE_RETRYABLE" });
  }
  if (!receipt.messageMayHaveBeenSent && !receipt.stoppedBeforeSend) {
    context.addIssue({ code: "custom", message: "PRE_SEND_FAILURE_BOUNDARY_INVALID" });
  }
});

export function verifyComposerTransfer(input: {
  source: string;
  observation: z.infer<typeof composerObservationSchema>;
}) {
  const source = transportTextIdentity(input.source);
  const observation = composerObservationSchema.parse(input.observation);
  if (source.sha256 !== observation.composerSha256
    || source.utf8Bytes !== observation.composerUtf8Bytes
    || source.codePoints !== observation.composerCodePoints) {
    throw new Error("GENERATION_COMPOSER_SOURCE_MISMATCH");
  }
  return { source, observation, exactEquality: true as const };
}

export function assertPreSendEligible(input: {
  source: string;
  observation: z.infer<typeof composerObservationSchema>;
  ui: unknown;
  priorStates: string[];
  attempt: number;
}) {
  if (!Number.isInteger(input.attempt) || input.attempt < 1
    || input.attempt > GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS) {
    throw new Error("GENERATION_TRANSPORT_ATTEMPT_INVALID");
  }
  if (input.priorStates.some((state) => ["SENT", "RESPONSE_COMPLETE", "SEALED", "POST_SEND_AMBIGUOUS"].includes(state))) {
    throw new Error("GENERATION_DUPLICATE_SEND_BLOCKED");
  }
  const transfer = verifyComposerTransfer({ source: input.source, observation: input.observation });
  const ui = generationUiAttestationSchema.parse(input.ui);
  return { ...transfer, ui, sendAuthorized: true as const };
}

export function retryDisposition(input: {
  attempt: number;
  messageMayHaveBeenSent: boolean;
  sealed: boolean;
}) {
  if (input.sealed) return "SKIP_SEALED" as const;
  if (input.messageMayHaveBeenSent) return "PRESERVE_AMBIGUITY_NO_RETRY" as const;
  if (input.attempt >= GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS) return "ATTEMPT_CEILING_EXHAUSTED" as const;
  return "RETRY_PRE_SEND_ONLY" as const;
}

/**
 * Self-contained read-only function intended for execution in the authenticated
 * ChatGPT page. It returns only the complete normalized composer identity, not
 * the prompt text. The caller compares this result with the local source bytes.
 */
export async function projectChatGptComposerIdentity() {
  const fail = (failureCode: string) => ({ schemaVersion: 1, failureCode });
  try {
    if (typeof document === "undefined" || typeof location === "undefined") return fail("DOCUMENT_UNAVAILABLE");
    if (location.origin !== "https://chatgpt.com") return fail("AUTHORIZED_ORIGIN_NOT_ESTABLISHED");
    const composers = document.querySelectorAll("#prompt-textarea");
    if (composers.length !== 1) return fail("COMPOSER_NOT_UNIQUE");
    const composer = composers[0] as HTMLElement;
    let raw: string;
    let extraction: "TEXTAREA_VALUE" | "CONTENTEDITABLE_INNER_TEXT";
    if (composer.tagName === "TEXTAREA") {
      raw = (composer as HTMLTextAreaElement).value;
      extraction = "TEXTAREA_VALUE";
    } else if (composer.getAttribute("contenteditable") === "true") {
      raw = composer.innerText;
      extraction = "CONTENTEDITABLE_INNER_TEXT";
    } else return fail("COMPOSER_NOT_EDITABLE");
    const normalized = raw.replace(/\r\n?/gu, "\n");
    const bytes = new TextEncoder().encode(normalized);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
    return {
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      origin: location.origin,
      composerSelector: "#prompt-textarea",
      composerCount: composers.length,
      extraction,
      normalization: "LINE_ENDINGS_TO_LF_ONLY",
      composerUtf8Bytes: bytes.byteLength,
      composerCodePoints: Array.from(normalized).length,
      composerSha256: sha256,
    };
  } catch {
    return fail("COMPOSER_IDENTITY_PROJECTION_FAILED");
  }
}
