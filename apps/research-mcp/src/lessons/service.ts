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

/** Orchestrates the endpoint-global, fail-closed lesson submission pipeline. */
export class LessonSubmissionService {
  private readonly pipeline: LessonSubmissionPipeline;

  constructor(private readonly options: LessonSubmissionServiceOptions) {
    this.pipeline = options.pipeline ?? defaultPipeline;
  }

  async submit(raw: unknown): Promise<LessonSubmissionResult> {
    try {
      const limit = this.options.limiter.consume();
      if (!limit.allowed) {
        const result: unknown = {
          status: "rate_limited",
          retryable: true,
          retry_after_seconds: limit.retryAfterSeconds,
          reason_code: this.options.limiter.lastBlockingReason(),
        };
        const parsedResult = lessonSubmissionResultSchema.safeParse(result);
        return parsedResult.success ? parsedResult.data : githubUnavailable(undefined);
      }

      const parsedCandidate = this.pipeline.parseCandidate(raw);
      if (!parsedCandidate) return privacyRejected();

      const preScreen = this.pipeline.screen(parsedCandidate);
      if (!preScreen.safe) return privacyRejected();

      const anonymizerOutcome: Awaited<ReturnType<LessonAnonymizer["generalize"]>> =
        await this.options.anonymizer.generalize(preScreen.candidate);

      if (anonymizerOutcome.status === "privacy_rejected") return privacyRejected();
      if (anonymizerOutcome.status === "anonymizer_unavailable") {
        return anonymizerOutcome.reasonCode === "ai_budget_exhausted"
          ? anonymizerUnavailable("ai_budget_exhausted", false)
          : anonymizerUnavailable("privacy_service_unavailable", true);
      }
      if (anonymizerOutcome.status !== "generalized") {
        return githubUnavailable(undefined);
      }

      const generalized = this.pipeline.parseGeneralized(anonymizerOutcome.candidate);
      if (!generalized) return anonymizerUnavailable("privacy_service_unavailable", true);

      const postScreen = this.pipeline.screen(generalized);
      if (!postScreen.safe) return privacyRejected();

      const canonical = this.pipeline.canonicalize(postScreen.candidate);
      const fingerprint = this.pipeline.fingerprint(canonical);

      let queueResult: GitHubLessonQueueResult;
      try {
        queueResult = await this.options.queue.submit({
          candidate: postScreen.candidate,
          fingerprint,
        });
      } catch (error) {
        return githubUnavailable(error);
      }

      return this.receiptFor(queueResult);
    } catch {
      return githubUnavailable(undefined);
    }
  }

  private receiptFor(queueResult: GitHubLessonQueueResult): LessonSubmissionResult {
    if (queueResult.kind !== "created" && queueResult.kind !== "existing") {
      return githubUnavailable(undefined);
    }
    const candidateId = this.pipeline.publicCandidateId(queueResult.issueNumber);
    const result: unknown = {
      status: queueResult.kind === "created" ? "submitted" : "existing_candidate",
      candidate_id: candidateId,
      occurrence_count: queueResult.occurrenceCount,
      retryable: false,
    };
    const parsed = lessonSubmissionResultSchema.safeParse(result);
    return parsed.success ? parsed.data : githubUnavailable(undefined);
  }
}

function privacyRejected(): LessonSubmissionResult {
  return {
    status: "privacy_rejected",
    retryable: false,
    reason_code: "unsafe_candidate",
  };
}

function anonymizerUnavailable(
  reasonCode: "ai_budget_exhausted" | "privacy_service_unavailable",
  retryable: boolean,
): LessonSubmissionResult {
  return {
    status: "anonymizer_unavailable",
    retryable,
    reason_code: reasonCode,
  };
}

function githubUnavailable(error: unknown): LessonSubmissionResult {
  if (error instanceof GitHubApiError) {
    if (error.code === "github_auth_unavailable" || error.code === "github_scope_invalid") {
      return {
        status: "github_unavailable",
        retryable: false,
        reason_code: "github_auth_unavailable",
      };
    }
    return {
      status: "github_unavailable",
      retryable: error.retryable,
      reason_code: "github_service_unavailable",
    };
  }
  return {
    status: "github_unavailable",
    retryable: false,
    reason_code: "github_service_unavailable",
  };
}
