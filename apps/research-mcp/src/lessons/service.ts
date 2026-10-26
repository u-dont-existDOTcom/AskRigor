import { verifyCheckReportToken } from "../check-report.js";
import { currentProtocolElementNames } from "../protocol-rule-names.js";
import { researchReceiptSecretFromEnv } from "../research-receipts.js";
import { z } from "zod";
import {
  connectorLessonCandidateSchema,
  connectorLessonSubmissionResultSchema,
  connectorLessonDiagnosticTexts,
  existingRulesSchema,
  generalizedLessonSchema,
  lessonCandidateSchema,
  lessonSubmissionResultSchema,
  type ConnectorLessonCandidate,
  type ConnectorLessonSubmissionResult,
  type ConnectorLessonDiagnostics,
  type DetailedLessonReport,
  type GeneralizedLesson,
  type LessonCandidate,
  type LessonSubmissionResult,
} from "./contracts.js";
import { GitHubApiError, isRecord } from "./github-app.js";
import {
  publicCandidateId,
  type GitHubLessonQueue,
  type GitHubLessonQueueResult,
  type LessonSource,
} from "./github-lessons.js";
import type { LessonAnonymizer } from "./openai-anonymizer.js";
import {
  canonicalizeLesson,
  lessonFingerprint,
  screenDetailedLessonReport,
  screenLessonCandidate,
  screenPrivateText,
  type CanonicalLesson,
  type PrivacyScreenResult,
} from "./privacy-screen.js";
import type { LessonAttemptLimiter } from "./rate-limit.js";

/** What the caller knows about the account a lesson comes from. */
export interface LessonSubmissionContext {
  /**
   * Whether the calling account has detailed lesson reports turned on (owner question 154). Only then may a connector
   * lesson carry a detailed report; absent means off.
   */
  detailedReports?: boolean;
}

export interface LessonSubmissionPipeline {
  /**
   * Strict parse; only a connector request may name a related public AskRigor issue or carry a detailed report.
   */
  parseCandidate(raw: unknown, source: LessonSource): LessonCandidate | ConnectorLessonCandidate | undefined;
  parseGeneralized(raw: unknown): GeneralizedLesson | undefined;
  screen(candidate: LessonCandidate): PrivacyScreenResult;
  canonicalize(candidate: LessonCandidate): CanonicalLesson;
  fingerprint(canonical: CanonicalLesson): string;
  publicCandidateId(issueNumber: number): string;
}

export interface LessonSubmissionServiceOptions {
  limiter: LessonAttemptLimiter;
  anonymizer: LessonAnonymizer;
  queue: Pick<GitHubLessonQueue, "submit">;
  pipeline?: LessonSubmissionPipeline;
  reportSigningSecret?: () => string | undefined;
  protocolElements?: () => Promise<ReadonlySet<string>>;
}

const defaultPipeline: LessonSubmissionPipeline = {
  parseCandidate(raw, source) {
    const result = source === "connector"
      ? connectorLessonCandidateSchema.safeParse(raw)
      : lessonCandidateSchema.safeParse(raw);
    return result.success ? result.data : undefined;
  },
  parseGeneralized(raw) {
    const result = generalizedLessonSchema.safeParse(raw);
    return result.success ? result.data : undefined;
  },
  screen: screenLessonCandidate,
  canonicalize: canonicalizeLesson,
  fingerprint: lessonFingerprint,
  publicCandidateId,
};

const lessonAttemptLimitDecisionSchema = z.discriminatedUnion("allowed", [
  z.strictObject({ allowed: z.literal(true) }),
  z.strictObject({
    allowed: z.literal(false),
    retryAfterSeconds: z.number().int().positive(),
  }),
]);

const anonymizerOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("generalized"),
    candidate: generalizedLessonSchema,
  }),
  z.strictObject({ status: z.literal("privacy_rejected") }),
  z.strictObject({
    status: z.literal("anonymizer_unavailable"),
    reasonCode: z.enum(["ai_budget_exhausted", "privacy_service_unavailable"]),
  }),
]);

const githubLessonQueueResultSchema = z.strictObject({
  kind: z.enum(["created", "existing"]),
  issueNumber: z.number().int().positive(),
  occurrenceCount: z.number().int().positive(),
  possibleRegression: z.boolean(),
});

const githubApiErrorShapeSchema = z.discriminatedUnion("code", [
  z.strictObject({
    code: z.literal("github_auth_unavailable"),
    retryable: z.literal(false),
  }),
  z.strictObject({
    code: z.literal("github_scope_invalid"),
    retryable: z.literal(false),
  }),
  z.strictObject({
    code: z.literal("github_service_unavailable"),
    retryable: z.boolean(),
  }),
]);

/** Orchestrates the endpoint-global, fail-closed lesson submission pipeline. */
export class LessonSubmissionService {
  private readonly pipeline: LessonSubmissionPipeline;

  constructor(private readonly options: LessonSubmissionServiceOptions) {
    this.pipeline = options.pipeline ?? defaultPipeline;
  }

  async submit(
    raw: unknown,
    source: LessonSource = "custom-gpt",
    context: LessonSubmissionContext = {},
  ): Promise<ConnectorLessonSubmissionResult> {
    try {
      const parsedLimit = lessonAttemptLimitDecisionSchema.safeParse(
        this.options.limiter.consume(),
      );
      if (!parsedLimit.success) return genericGitHubUnavailable();
      const limit = parsedLimit.data;
      if (!limit.allowed) {
        return finalizePublicResult({
          status: "rate_limited",
          retryable: true,
          retry_after_seconds: limit.retryAfterSeconds,
          reason_code: this.options.limiter.lastBlockingReason(),
        });
      }

      // Owner question 154: a connector lesson carries a detailed report only from an account that turned detailed
      // lesson reports on. Any other is refused before it is parsed or screened, and nothing is stored, so the model
      // can send the same lesson again without it. The Action's shape has no such field and is unchanged.
      if (source === "connector" && carriesDetailedReport(raw) && context.detailedReports !== true) {
        return detailedReportRefused();
      }

      if (source === "connector" && isRecord(raw) && raw.check_report_token !== undefined &&
        (typeof raw.check_report_token !== "string" || verifyCheckReportToken(raw.check_report_token,
          (this.options.reportSigningSecret ?? researchReceiptSecretFromEnv)()) === undefined)) {
        return { status: "check_report_refused", retryable: false, reason_code: "invalid_check_report_token" };
      }

      if (source === "connector") {
        const inventory = existingRulesSchema.safeParse(isRecord(raw) ? raw.existing_rules : undefined);
        if (!inventory.success) return {
          status: "existing_rules_refused", retryable: false, reason_code: "invalid_existing_rules",
        };
        if ("rules" in inventory.data) {
          const names = await (this.options.protocolElements ?? currentProtocolElementNames)();
          if (inventory.data.rules.some(({ name }) => !names.has(name))) return {
            status: "existing_rules_refused", retryable: false, reason_code: "unknown_protocol_element",
          };
        }
      }

      const parsed = this.pipeline.parseCandidate(raw, source);
      if (!parsed) return privacyRejected();
      // A related public AskRigor issue (connector only) is a validated number
      // the queue renders as a reference, not lesson text. Like incident
      // provenance below, it stays out of the screen and the anonymizer, and
      // the exact validated number reaches the queue. Connector diagnostics
      // are screened field by field and preserved exactly, like a detailed report.
      // A detailed report
      // (connector only) is screened here, field by field, and never reaches
      // the anonymizer either: the queue renders it from its validated fields.
      const { candidate: parsedCandidate, relatedIssue, detailedReport, check_report_token: reportToken,
        preventing_rule: preventingRule, missing_rule: missingRule, diagnostics } = splitConnectorFields(parsed);
      const checkReport = reportToken === undefined ? undefined
        : verifyCheckReportToken(reportToken, (this.options.reportSigningSecret ?? researchReceiptSecretFromEnv)());
      if (reportToken !== undefined && checkReport === undefined) return {
        status: "check_report_refused", retryable: false, reason_code: "invalid_check_report_token",
      };
      if ((missingRule !== undefined && preventingRule !== "no_rule") || (preventingRule !== undefined &&
        (preventingRule === "no_rule" ? missingRule === undefined :
          !(await (this.options.protocolElements ?? currentProtocolElementNames)()).has(preventingRule)))) {
        return { status: "correction_rule_refused", retryable: false, reason_code: "invalid_preventing_rule" };
      }
      if (missingRule !== undefined && screenPrivateText(missingRule) !== undefined) return privacyRejected();
      if (diagnostics !== undefined && connectorLessonDiagnosticTexts(diagnostics)
        .some((text) => screenPrivateText(text) !== undefined)) return privacyRejected();

      const preScreen = this.pipeline.screen(parsedCandidate);
      if (!preScreen.safe) return privacyRejected();
      if (detailedReport !== undefined && screenDetailedLessonReport(detailedReport) !== undefined) {
        return privacyRejected();
      }

      // Opaque incident provenance is server-owned linkage metadata, not content
      // for model generalization. Keep it out of the anonymizer and reattach the
      // exact validated tuple afterward so a model cannot drop or rewrite it.
      const incidentProvenance = preScreen.candidate.incident_provenance;
      let candidateForAnonymizer: LessonCandidate = preScreen.candidate;
      if (incidentProvenance !== undefined) {
        const {
          incident_provenance: _incidentProvenance,
          ...withoutIncidentProvenance
        } = preScreen.candidate;
        candidateForAnonymizer = withoutIncidentProvenance;
      }
      const rawAnonymizerOutcome: unknown = await this.options.anonymizer.generalize(
        candidateForAnonymizer,
      );
      const parsedAnonymizerOutcome = anonymizerOutcomeSchema.safeParse(rawAnonymizerOutcome);
      if (!parsedAnonymizerOutcome.success) return genericGitHubUnavailable();
      const anonymizerOutcome = parsedAnonymizerOutcome.data;

      if (anonymizerOutcome.status === "privacy_rejected") return privacyRejected();
      if (anonymizerOutcome.status === "anonymizer_unavailable") {
        return anonymizerOutcome.reasonCode === "ai_budget_exhausted"
          ? anonymizerUnavailable("ai_budget_exhausted", false)
          : anonymizerUnavailable("privacy_service_unavailable", true);
      }
      const {
        incident_provenance: _modelIncidentProvenance,
        ...generalizedWithoutIncidentProvenance
      } = anonymizerOutcome.candidate;
      const generalized = this.pipeline.parseGeneralized({
        ...generalizedWithoutIncidentProvenance,
        ...(incidentProvenance === undefined
          ? {}
          : { incident_provenance: incidentProvenance }),
      });
      if (!generalized) return anonymizerUnavailable("privacy_service_unavailable", true);

      const postScreen = this.pipeline.screen(generalized);
      if (!postScreen.safe) return privacyRejected();

      const canonical = this.pipeline.canonicalize(postScreen.candidate);
      const fingerprint = this.pipeline.fingerprint(canonical);

      let rawQueueResult: unknown;
      try {
        rawQueueResult = await this.options.queue.submit({
          candidate: postScreen.candidate,
          fingerprint,
          source,
          ...(relatedIssue === undefined ? {} : { relatedIssue }),
          ...(detailedReport === undefined ? {} : { detailedReport }),
          ...(diagnostics === undefined ? {} : { diagnostics }),
          ...(checkReport === undefined ? {} : { checkReport }),
          ...(preventingRule === undefined ? {} : { correctionRule: { name: preventingRule, ...(missingRule === undefined ? {} : { missing: missingRule }) } }),
        });
      } catch (error) {
        return githubUnavailable(error);
      }

      const parsedQueueResult = githubLessonQueueResultSchema.safeParse(rawQueueResult);
      if (!parsedQueueResult.success) return genericGitHubUnavailable();

      return this.receiptFor(parsedQueueResult.data);
    } catch {
      return githubUnavailable(undefined);
    }
  }

  private receiptFor(queueResult: GitHubLessonQueueResult): LessonSubmissionResult {
    const candidateId = this.pipeline.publicCandidateId(queueResult.issueNumber);
    return finalizePublicResult({
      status: queueResult.kind === "created" ? "submitted" : "existing_candidate",
      candidate_id: candidateId,
      occurrence_count: queueResult.occurrenceCount,
      retryable: false,
    });
  }
}

// Each connector-only key is dropped even when present with no value, so the
// anonymizer and the strict generalized parse never see it.
function splitConnectorFields(
  parsed: LessonCandidate | ConnectorLessonCandidate,
): { candidate: LessonCandidate; relatedIssue?: number; detailedReport?: DetailedLessonReport;
  diagnostics?: ConnectorLessonDiagnostics; check_report_token?: string; preventing_rule?: string; missing_rule?: string } {
  // The Action's strict shape has no inventory, so only a connector candidate gets past this.
  if (!("existing_rules" in parsed)) return { candidate: parsed };
  const {
    related_issue: relatedIssue,
    detailed_report: detailedReport,
    existing_rules, observed_behavior, part_to_change,
    check_report_token, preventing_rule, missing_rule,
    ...candidate
  } = parsed as ConnectorLessonCandidate;
  return {
    candidate,
    diagnostics: { existing_rules, observed_behavior, part_to_change },
    ...(relatedIssue === undefined ? {} : { relatedIssue }),
    ...(detailedReport === undefined ? {} : { detailedReport }),
    ...(check_report_token === undefined ? {} : { check_report_token }),
    ...(preventing_rule === undefined ? {} : { preventing_rule }),
    ...(missing_rule === undefined ? {} : { missing_rule }),
  };
}

// Checked before the strict parse, so a report the account may not send is refused whatever it holds.
function carriesDetailedReport(raw: unknown): boolean {
  return isRecord(raw) && raw.detailed_report !== undefined;
}

function detailedReportRefused(): ConnectorLessonSubmissionResult {
  return connectorLessonSubmissionResultSchema.parse({
    status: "detailed_report_refused",
    retryable: false,
    reason_code: "detailed_reports_off",
  });
}

function privacyRejected(): LessonSubmissionResult {
  return finalizePublicResult({
    status: "privacy_rejected",
    retryable: false,
    reason_code: "unsafe_candidate",
  });
}

function anonymizerUnavailable(
  reasonCode: "ai_budget_exhausted" | "privacy_service_unavailable",
  retryable: boolean,
): LessonSubmissionResult {
  return finalizePublicResult({
    status: "anonymizer_unavailable",
    retryable,
    reason_code: reasonCode,
  });
}

function githubUnavailable(error: unknown): LessonSubmissionResult {
  if (error instanceof GitHubApiError) {
    const parsedError = githubApiErrorShapeSchema.safeParse({
      code: error.code,
      retryable: error.retryable,
    });
    if (!parsedError.success) return genericGitHubUnavailable();
    if (
      parsedError.data.code === "github_auth_unavailable" ||
      parsedError.data.code === "github_scope_invalid"
    ) {
      return finalizePublicResult({
        status: "github_unavailable",
        retryable: false,
        reason_code: "github_auth_unavailable",
      });
    }
    return finalizePublicResult({
      status: "github_unavailable",
      retryable: parsedError.data.retryable,
      reason_code: "github_service_unavailable",
    });
  }
  return genericGitHubUnavailable();
}

function finalizePublicResult(value: unknown): LessonSubmissionResult {
  const parsed = lessonSubmissionResultSchema.safeParse(value);
  return parsed.success ? parsed.data : genericGitHubUnavailable();
}

function genericGitHubUnavailable(): LessonSubmissionResult {
  return lessonSubmissionResultSchema.parse({
    status: "github_unavailable",
    retryable: false,
    reason_code: "github_service_unavailable",
  });
}
