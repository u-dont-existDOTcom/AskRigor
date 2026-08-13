import { z } from "zod";
import {
  generalizedLessonSchema,
  lessonCandidateSchema,
  lessonSubmissionResultSchema,
  type GeneralizedLesson,
  type LessonCandidate,
  type LessonSubmissionResult,
} from "./contracts.js";
import { GitHubApiError } from "./github-app.js";
import {
  publicCandidateId,
  type GitHubLessonQueue,
  type GitHubLessonQueueResult,
} from "./github-lessons.js";
import type { LessonAnonymizer } from "./openai-anonymizer.js";
import {
  canonicalizeLesson,
  lessonFingerprint,
  screenLessonCandidate,
  type CanonicalLesson,
  type PrivacyScreenResult,
} from "./privacy-screen.js";
import type { LessonAttemptLimiter } from "./rate-limit.js";

export interface LessonSubmissionPipeline {
  parseCandidate(raw: unknown): LessonCandidate | undefined;
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
}

const defaultPipeline: LessonSubmissionPipeline = {
  parseCandidate(raw) {
    const result = lessonCandidateSchema.safeParse(raw);
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

  async submit(raw: unknown): Promise<LessonSubmissionResult> {
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

      const parsedCandidate = this.pipeline.parseCandidate(raw);
      if (!parsedCandidate) return privacyRejected();

      const preScreen = this.pipeline.screen(parsedCandidate);
      if (!preScreen.safe) return privacyRejected();

      const rawAnonymizerOutcome: unknown = await this.options.anonymizer.generalize(
        preScreen.candidate,
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
      const generalized = this.pipeline.parseGeneralized(anonymizerOutcome.candidate);
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
