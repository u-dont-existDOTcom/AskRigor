import { preventingRuleSchema } from "../protocol-rule-names.js";
import { CHECK_REPORT_TOKEN_MAX_CHARACTERS } from "../check-report.js";
import { z } from "zod";
import { lessonIncidentProvenanceSchema } from "./incident-contracts.js";

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
  incident_provenance: lessonIncidentProvenanceSchema.optional(),
  consent_scope: z.enum(["once", "conversation"]),
});

export type LessonCandidate = z.infer<typeof lessonCandidateSchema>;

/** The public repository whose issue a connector lesson may name. */
export const PUBLIC_ASKRIGOR_REPOSITORY = "u-dont-existDOTcom/AskRigor" as const;

/**
 * The number of an issue or pull request in the public AskRigor repository.
 * The queue builds the reference from this integer alone, so it adds no free text.
 */
export const relatedIssueSchema = z.number().int().min(1).max(1_000_000);

const lessonLine = z.string().trim().min(1).max(300).regex(/^[^\r\n]+$/u);

/** Declaration only: the server checks names and form, not whether a rule actually covered the failure. */
export const existingRulesSchema = z.union([
  z.strictObject({
    rules: z.array(z.strictObject({
      name: z.string().min(1).max(160),
      status: z.enum(["not_loaded", "loaded_not_applied", "applied_but_insufficient", "not_triggered", "unknown"]),
      reason: lessonLine,
    })).min(1).max(12),
  }),
  z.strictObject({ none: lessonLine }),
]);

/** The same kinds of parts named by detailed_report, with a concrete tool, rule or check to inspect. */
export const lessonPartToChangeSchema = z.strictObject({
  kind: z.enum(["tool", "protocol_rule", "final_check"]),
  name: z.string().trim().min(1).max(120),
});

export const connectorLessonDiagnosticsSchema = z.strictObject({
  existing_rules: existingRulesSchema,
  observed_behavior: z.string().min(20).max(1_200),
  part_to_change: lessonPartToChangeSchema,
});

export type ConnectorLessonDiagnostics = z.infer<typeof connectorLessonDiagnosticsSchema>;

/** All newly submitted prose passes the existing lesson screen; protocol names are separately checked exactly. */
export function connectorLessonDiagnosticTexts(diagnostics: ConnectorLessonDiagnostics): string[] {
  return [
    ...("rules" in diagnostics.existing_rules
      ? diagnostics.existing_rules.rules.map(({ reason }) => reason)
      : [diagnostics.existing_rules.none]),
    diagnostics.observed_behavior,
    diagnostics.part_to_change.name,
  ];
}

/**
 * A detailed report's bounds (owner question 154, 2026-10-21): the steps, what happened and what was expected, causes
 * with confidence, the parts of AskRigor to change, a proposed change, up to five invented test cases and what stays
 * uncertain, at most 10,000 characters in all.
 */
export const DETAILED_LESSON_REPORT_LIMITS = Object.freeze({
  steps: 12,
  stepCharacters: 300,
  observedCharacters: 1_000,
  expectedCharacters: 1_000,
  causes: 5,
  causeCharacters: 300,
  partsToChange: 8,
  partCharacters: 120,
  proposedChangeCharacters: 1_500,
  testCases: 5,
  testCaseCharacters: 1_200,
  uncertainCharacters: 1_000,
  totalCharacters: 10_000,
});

const reportLimits = DETAILED_LESSON_REPORT_LIMITS;
const reportText = (maximum: number) => z.string().min(1).max(maximum);

const detailedLessonReportFieldsSchema = z.strictObject({
  steps: z.array(reportText(reportLimits.stepCharacters)).min(1).max(reportLimits.steps),
  observed: reportText(reportLimits.observedCharacters),
  expected: reportText(reportLimits.expectedCharacters),
  causes: z.array(z.strictObject({
    cause: reportText(reportLimits.causeCharacters),
    confidence: z.enum(["low", "medium", "high"]),
  })).min(1).max(reportLimits.causes),
  parts_to_change: z.array(reportText(reportLimits.partCharacters)).min(1).max(reportLimits.partsToChange),
  proposed_change: reportText(reportLimits.proposedChangeCharacters),
  test_cases: z.array(z.strictObject({
    case: reportText(reportLimits.testCaseCharacters),
    negative_control: z.boolean(),
  })).max(reportLimits.testCases),
  uncertain: reportText(reportLimits.uncertainCharacters),
});

export type DetailedLessonReport = z.infer<typeof detailedLessonReportFieldsSchema>;

/** Every text of a detailed report, in order: what the privacy screen reads and the total bound counts. */
export function detailedLessonReportTexts(report: DetailedLessonReport): string[] {
  return [
    ...report.steps,
    report.observed,
    report.expected,
    ...report.causes.map(({ cause }) => cause),
    ...report.parts_to_change,
    report.proposed_change,
    ...report.test_cases.map((testCase) => testCase.case),
    report.uncertain,
  ];
}

/**
 * The optional detailed report a connector lesson may carry, only from an account that turned detailed lesson reports
 * on (owner question 154). Typed and bounded, at most 10,000 characters across all its texts.
 */
export const detailedLessonReportSchema = detailedLessonReportFieldsSchema.refine(
  (report) => detailedLessonReportTexts(report).reduce((total, text) => total + text.length, 0) <=
    reportLimits.totalCharacters,
  { message: `A detailed report holds at most ${reportLimits.totalCharacters.toLocaleString("en-US")} characters in all.` },
);

/**
 * The connector's request shape: the Action's candidate without incident
 * provenance (the connector has no incident vault), with required existing-rule
 * and short diagnostic declarations, plus the optional number
 * of a public AskRigor issue that reports the failure and, only from an
 * account that turned detailed lesson reports on, an optional detailed report.
 * Only the connector accepts related_issue and detailed_report; the Action's
 * shape above is unchanged.
 */
export const connectorLessonCandidateSchema = lessonCandidateSchema
  .omit({ incident_provenance: true })
  .extend({
    ...connectorLessonDiagnosticsSchema.shape,
    related_issue: relatedIssueSchema.optional(),
    detailed_report: detailedLessonReportSchema.optional(),
    check_report_token: z.string().min(1).max(CHECK_REPORT_TOKEN_MAX_CHARACTERS).optional(),
    preventing_rule: preventingRuleSchema.optional(),
    missing_rule: z.string().trim().min(1).max(300).regex(/^[^\r\n]+$/u).optional(),
  });

export type ConnectorLessonCandidate = z.infer<typeof connectorLessonCandidateSchema>;

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
  incident_provenance: lessonIncidentProvenanceSchema.optional(),
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
  "detailed_reports_off",
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

/**
 * A connector lesson that carried a detailed report from an account without detailed lesson reports turned on, or
 * without a research account (owner question 154): nothing was stored, and the same lesson without its report may
 * be sent again.
 */
const detailedReportRefusedResultSchema = z.strictObject({
  status: z.literal("detailed_report_refused"),
  retryable: z.literal(false),
  reason_code: z.literal("detailed_reports_off"),
});

/** The connector's public receipt: the Action's, or the refusal of a detailed report this account has not turned on. */
export const connectorLessonSubmissionResultSchema = z.discriminatedUnion("status", [
  ...lessonSubmissionResultSchema.options,
  detailedReportRefusedResultSchema,
  z.strictObject({ status: z.literal("check_report_refused"), retryable: z.literal(false), reason_code: z.literal("invalid_check_report_token") }),
  z.strictObject({ status: z.literal("correction_rule_refused"), retryable: z.literal(false), reason_code: z.literal("invalid_preventing_rule") }),
  z.strictObject({
    status: z.literal("existing_rules_refused"),
    retryable: z.literal(false),
    reason_code: z.enum(["invalid_existing_rules", "unknown_protocol_element"]),
  }),
]);

export type ConnectorLessonSubmissionResult = z.infer<typeof connectorLessonSubmissionResultSchema>;
