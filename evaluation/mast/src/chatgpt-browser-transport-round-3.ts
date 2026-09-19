import { createHash } from "node:crypto";

import { z } from "zod";

import { ROUND_3_STUDY_ID } from "./fresh-validation-round-3.js";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const instantSchema = z.string().datetime({ offset: true });
const opaqueInputSchema = z.string().regex(/^run-[0-9a-f]{24}$/u);

export const TRANSPORT_NORMALIZATION = "LINE_ENDINGS_TO_LF_ONLY" as const;
export const GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS = 2;

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
  authenticated: z.literal(true),
  freshConversation: z.literal(true),
  userMessageCount: z.literal(0),
  assistantMessageCount: z.literal(0),
  attachmentCount: z.literal(0),
  sendEnabled: z.literal(true),
}).strict();

const runtimeHashObservationSchema = z.object({
  browserUnitSha256: digestSchema,
  displayUnitSha256: digestSchema,
  watchdogUnitSha256: digestSchema,
  browserWrapperSha256: digestSchema,
  watchdogScriptSha256: digestSchema,
  transportScriptSha256: digestSchema,
}).strict();

export const round3RuntimeAttestationSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_3_STUDY_ID),
  browserProfile: z.literal("/home/cloudbrowser/.config/brave-mast-round3"),
  browserService: z.literal("askrigor-mast-round3-brave.service"),
  displayService: z.literal("askrigor-mast-round3-xvfb.service"),
  watchdogService: z.literal("askrigor-mast-round3-watchdog.service"),
  cdpEndpoint: z.literal("http://127.0.0.1:9224"),
  browserMainPid: z.number().int().positive(),
  observed: runtimeHashObservationSchema,
  observedAt: instantSchema,
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
  studyId: z.literal(ROUND_3_STUDY_ID),
  opaqueInputId: opaqueInputSchema,
  attempt: z.number().int().min(1).max(GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS),
  state: transportAttemptStateSchema,
  normalization: z.literal(TRANSPORT_NORMALIZATION),
  sourceUtf8Bytes: z.number().int().positive(),
  sourceCodePoints: z.number().int().positive(),
  sourceSha256: digestSchema,
  destinationPacketUtf8Bytes: z.number().int().positive(),
  destinationPacketCodePoints: z.number().int().positive(),
  destinationPacketSha256: digestSchema,
  composerUtf8Bytes: z.number().int().nonnegative(),
  composerCodePoints: z.number().int().nonnegative(),
  composerSha256: digestSchema,
  exactEquality: z.literal(true),
  ui: generationUiAttestationSchema,
  vpsDevice: z.literal("srv1894948"),
  vpsUser: z.literal("cloudbrowser"),
  cdpEndpoint: z.literal("http://127.0.0.1:9224"),
  cdpAttached: z.literal(true),
  browser: z.literal("Brave"),
  browserProfile: z.literal("/home/cloudbrowser/.config/brave-mast-round3"),
  browserService: z.literal("askrigor-mast-round3-brave.service"),
  displayService: z.literal("askrigor-mast-round3-xvfb.service"),
  watchdogService: z.literal("askrigor-mast-round3-watchdog.service"),
  runtimeAttestation: round3RuntimeAttestationSchema,
  tabCount: z.number().int().min(1).max(2),
  citationUrls: z.array(z.string().url()),
  toolProvenance: z.array(z.string().min(1)),
  responseArtifactSha256: digestSchema.nullable(),
  verifiedAt: instantSchema,
  sentAt: instantSchema.nullable(),
  completedAt: instantSchema,
  recoveredExistingSubmission: z.boolean(),
}).strict().superRefine((receipt, context) => {
  if (receipt.sourceUtf8Bytes !== receipt.composerUtf8Bytes
    || receipt.sourceUtf8Bytes !== receipt.destinationPacketUtf8Bytes
    || receipt.sourceCodePoints !== receipt.composerCodePoints
    || receipt.sourceCodePoints !== receipt.destinationPacketCodePoints
    || receipt.sourceSha256 !== receipt.destinationPacketSha256
    || receipt.sourceSha256 !== receipt.composerSha256) {
    context.addIssue({ code: "custom", message: "GENERATION_COMPOSER_SOURCE_MISMATCH" });
  }
  const sent = ["SENT", "RESPONSE_COMPLETE", "SEALED", "POST_SEND_AMBIGUOUS"].includes(receipt.state);
  if (sent !== (receipt.sentAt !== null)) {
    context.addIssue({ code: "custom", message: "GENERATION_SENT_TIMESTAMP_STATE_MISMATCH" });
  }
  if (["RESPONSE_COMPLETE", "SEALED"].includes(receipt.state) !== (receipt.responseArtifactSha256 !== null)) {
    context.addIssue({ code: "custom", message: "GENERATION_RESPONSE_ARTIFACT_STATE_MISMATCH" });
  }
  if (receipt.toolProvenance.length > 0) {
    context.addIssue({ code: "custom", message: "GENERATION_TOOL_USE_FORBIDDEN" });
  }
});

export const transportFailureReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_3_STUDY_ID),
  opaqueInputId: opaqueInputSchema,
  attempt: z.number().int().min(1).max(GENERATION_TRANSPORT_MAXIMUM_ATTEMPTS),
  stage: z.enum(["PACKET_SOURCE_VERIFY", "PACKET_TRANSFER", "PACKET_DESTINATION_VERIFY", "CDP_ATTACH", "AUTH_VERIFY", "FRESH_CHAT", "MODEL_SELECT", "SESSION_ATTEST", "COMPOSER_INSERT", "COMPOSER_VERIFY", "UI_ATTEST", "SUBMIT", "RESPONSE_CAPTURE", "LOCAL_SEAL"]),
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
