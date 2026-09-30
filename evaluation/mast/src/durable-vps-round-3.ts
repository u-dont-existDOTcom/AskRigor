import { createHash } from "node:crypto";

import { z } from "zod";

import { ROUND_3_STUDY_ID } from "./fresh-validation-round-3.js";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const instantSchema = z.string().datetime({ offset: true });
const runIdSchema = z.string().regex(/^(?:run-[0-9a-f]{24}|synthetic-durability)$/u);

export const ROUND_3_BROWSER_PROFILE = "/home/cloudbrowser/.config/brave-mast-round3" as const;
export const ROUND_3_BROWSER_SERVICE = "askrigor-mast-round3-brave.service" as const;
export const ROUND_3_DISPLAY_SERVICE = "askrigor-mast-round3-xvfb.service" as const;
export const ROUND_3_WATCHDOG_SERVICE = "askrigor-mast-round3-watchdog.service" as const;
export const ROUND_3_CDP_ENDPOINT = "http://127.0.0.1:9224" as const;

export const runtimeFileHashesSchema = z.object({
  browserUnitSha256: digestSchema,
  displayUnitSha256: digestSchema,
  watchdogUnitSha256: digestSchema,
  browserWrapperSha256: digestSchema,
  watchdogScriptSha256: digestSchema,
  transportScriptSha256: digestSchema,
}).strict();

export type RuntimeFileHashes = z.infer<typeof runtimeFileHashesSchema>;

export function verifyRuntimeFileHashes(expected: unknown, observed: unknown): RuntimeFileHashes {
  const left = runtimeFileHashesSchema.parse(expected);
  const right = runtimeFileHashesSchema.parse(observed);
  for (const key of Object.keys(left) as Array<keyof RuntimeFileHashes>) {
    if (left[key] !== right[key]) throw new Error(`ROUND_3_RUNTIME_HASH_DRIFT:${key}`);
  }
  return right;
}

export const uiAttestationSchema = z.object({
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

export const sentReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_3_STUDY_ID),
  opaqueInputId: runIdSchema,
  attempt: z.number().int().positive(),
  state: z.literal("SENT"),
  normalization: z.literal("LINE_ENDINGS_TO_LF_ONLY"),
  sourceUtf8Bytes: z.number().int().positive(),
  sourceSha256: digestSchema,
  destinationPacketUtf8Bytes: z.number().int().positive(),
  destinationPacketSha256: digestSchema,
  composerUtf8Bytes: z.number().int().positive(),
  composerSha256: digestSchema,
  exactEquality: z.literal(true),
  ui: uiAttestationSchema,
  browserProfile: z.literal(ROUND_3_BROWSER_PROFILE),
  browserService: z.literal(ROUND_3_BROWSER_SERVICE),
  displayService: z.literal(ROUND_3_DISPLAY_SERVICE),
  watchdogService: z.literal(ROUND_3_WATCHDOG_SERVICE),
  cdpEndpoint: z.literal(ROUND_3_CDP_ENDPOINT),
  sentAt: instantSchema,
}).strict().superRefine((receipt, context) => {
  if (receipt.sourceSha256 !== receipt.destinationPacketSha256
    || receipt.sourceSha256 !== receipt.composerSha256
    || receipt.sourceUtf8Bytes !== receipt.destinationPacketUtf8Bytes
    || receipt.sourceUtf8Bytes !== receipt.composerUtf8Bytes) {
    context.addIssue({ code: "custom", message: "ROUND_3_SENT_IDENTITY_MISMATCH" });
  }
});

export const recoveryCandidateSchema = z.object({
  candidateId: z.string().min(1),
  url: z.string().url(),
  normalizedUserMessageSha256: digestSchema,
  normalizedUserMessageUtf8Bytes: z.number().int().positive(),
  userMessageCount: z.literal(1),
  assistantMessageCount: z.number().int().min(0).max(1),
}).strict();

export type RecoveryCandidate = z.infer<typeof recoveryCandidateSchema>;

export function selectExactRecoveryCandidate(input: {
  expectedSha256: string;
  expectedUtf8Bytes: number;
  candidates: unknown[];
}): RecoveryCandidate {
  const expectedSha256 = digestSchema.parse(input.expectedSha256);
  if (!Number.isSafeInteger(input.expectedUtf8Bytes) || input.expectedUtf8Bytes <= 0) {
    throw new Error("ROUND_3_RECOVERY_EXPECTED_LENGTH_INVALID");
  }
  const candidates = input.candidates.map((value) => recoveryCandidateSchema.parse(value));
  const matching = candidates.filter((candidate) => (
    candidate.normalizedUserMessageSha256 === expectedSha256
      && candidate.normalizedUserMessageUtf8Bytes === input.expectedUtf8Bytes
  ));
  if (matching.length === 0) throw new Error("ROUND_3_RECOVERY_CANDIDATE_ZERO");
  if (matching.length > 1) throw new Error("ROUND_3_RECOVERY_CANDIDATE_MULTIPLE");
  return matching[0]!;
}

export function normalizedTextIdentity(value: string): { normalized: string; sha256: string; utf8Bytes: number } {
  const normalized = value.replace(/\r\n?/gu, "\n");
  const bytes = Buffer.from(normalized, "utf8");
  return { normalized, sha256: createHash("sha256").update(bytes).digest("hex"), utf8Bytes: bytes.byteLength };
}

export function determineResumeAction(input: {
  localSealed: boolean;
  responseReady: boolean;
  ambiguityReceipt: boolean;
  sendIntent: boolean;
  sentReceipt: boolean;
  preSendFailureCount: number;
}): "SKIP_SEALED" | "SKIP_RESPONSE_READY" | "STOP_AMBIGUOUS" | "RECOVER_EXISTING_SUBMISSION" | "NEW_PRE_SEND_ATTEMPT" {
  if (input.localSealed) return "SKIP_SEALED";
  if (input.responseReady) return "SKIP_RESPONSE_READY";
  if (input.ambiguityReceipt) return "STOP_AMBIGUOUS";
  if (input.sendIntent || input.sentReceipt) return "RECOVER_EXISTING_SUBMISSION";
  if (!Number.isSafeInteger(input.preSendFailureCount) || input.preSendFailureCount < 0
    || input.preSendFailureCount >= 2) return "STOP_AMBIGUOUS";
  return "NEW_PRE_SEND_ATTEMPT";
}
