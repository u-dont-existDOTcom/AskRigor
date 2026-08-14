import { z } from "zod";

const categorySchema = z.enum([
  "missing_sources",
  "conflicting_claims",
  "incomplete_research",
  "evidence_weighting",
  "community_corpus",
  "tool_semantics",
  "protocol_execution",
  "privacy_or_safety",
  "usability",
  "other",
]);

const evidenceBasisSchema = z.enum([
  "assistant_self_check",
  "tool_receipt_conflict",
  "source_recheck",
  "instruction_mismatch",
]);

const protocolIdentitySchema = z.strictObject({
  name: z.string().min(1).max(64),
  version: z.string().min(1).max(64),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

/** The only request shape accepted from the Action transport. */
export const lessonCandidateSchema = z.strictObject({
  category: categorySchema,
  general_lesson: z.string().min(40).max(600),
  expected_behavior: z.string().min(40).max(1_200),
  failure_reason: z.string().min(20).max(800),
  synthetic_regression_example: z.string().min(20).max(1_200),
  evidence_basis: evidenceBasisSchema,
  askrigor_version: z.string().min(1).max(64).optional(),
  protocol_identities: z.array(protocolIdentitySchema).max(4).optional(),
  consent_scope: z.enum(["once", "conversation"]),
});

export type LessonCandidate = z.infer<typeof lessonCandidateSchema>;

/** The model must return the same bounded, derived-only lesson shape. */
export const generalizedLessonSchema = z.strictObject({
  category: categorySchema,
  general_lesson: z.string().min(40).max(600),
  expected_behavior: z.string().min(40).max(1_200),
  failure_reason: z.string().min(20).max(800),
  synthetic_regression_example: z.string().min(20).max(1_200),
  evidence_basis: evidenceBasisSchema,
  askrigor_version: z.string().min(1).max(64).optional(),
  protocol_identities: z.array(protocolIdentitySchema).max(4).optional(),
  consent_scope: z.enum(["once", "conversation"]),
});

export type GeneralizedLesson = z.infer<typeof generalizedLessonSchema>;

export const lessonReasonCodeSchema = z.enum([
  "invalid_candidate",
  "unsafe_candidate",
  "hourly_limit",
  "daily_limit",
  "ai_budget_exhausted",
  "privacy_service_unavailable",
  "github_auth_unavailable",
  "github_service_unavailable",
]);

export type LessonReasonCode = z.infer<typeof lessonReasonCodeSchema>;

const candidateIdSchema = z.string().regex(/^ARL-[0-9]{4,}$/);
const occurrenceCountSchema = z.number().int().min(1);

const submittedResultSchema = z.strictObject({
  status: z.literal("submitted"),
  candidate_id: candidateIdSchema,
  occurrence_count: occurrenceCountSchema,
  retryable: z.literal(false),
});

const existingCandidateResultSchema = z.strictObject({
  status: z.literal("existing_candidate"),
  candidate_id: candidateIdSchema,
  occurrence_count: occurrenceCountSchema,
  retryable: z.literal(false),
});

const privacyRejectedResultSchema = z.strictObject({
  status: z.literal("privacy_rejected"),
  retryable: z.literal(false),
  reason_code: z.literal("unsafe_candidate"),
});

const rateLimitedResultSchema = z.strictObject({
  status: z.literal("rate_limited"),
  retryable: z.literal(true),
  retry_after_seconds: z.number().int().positive(),
  reason_code: z.enum(["hourly_limit", "daily_limit"]),
});

const anonymizerUnavailableResultSchema = z.strictObject({
  status: z.literal("anonymizer_unavailable"),
  retryable: z.boolean(),
  reason_code: z.enum(["ai_budget_exhausted", "privacy_service_unavailable"]),
});

const githubUnavailableResultSchema = z.strictObject({
  status: z.literal("github_unavailable"),
  retryable: z.boolean(),
  reason_code: z.enum(["github_auth_unavailable", "github_service_unavailable"]),
});

/** A public receipt: deliberately no issue number, URL, lesson text, or fingerprint. */
export const lessonSubmissionResultSchema = z.discriminatedUnion("status", [
  submittedResultSchema,
  existingCandidateResultSchema,
  privacyRejectedResultSchema,
  rateLimitedResultSchema,
  anonymizerUnavailableResultSchema,
  githubUnavailableResultSchema,
]);

export type LessonSubmissionResult = z.infer<typeof lessonSubmissionResultSchema>;
