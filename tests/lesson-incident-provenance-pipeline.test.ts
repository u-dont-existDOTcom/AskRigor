import { describe, expect, it } from "vitest";

import type { LessonAttemptLimiter } from
  "../apps/research-mcp/src/lessons/rate-limit.js";
import { LessonSubmissionService } from
  "../apps/research-mcp/src/lessons/service.js";
import type { GeneralizedLesson, LessonCandidate } from
  "../apps/research-mcp/src/lessons/contracts.js";

const originalProvenance = {
  incident_id: "ali_originalincident0001",
  incident_sha256: "a".repeat(64),
  preservation_status: "EXACT_TRANSCRIPT_PRESERVED" as const,
};

const candidate: LessonCandidate = {
  category: "evidence_weighting",
  general_lesson: "When source evidence points in a specific direction, AskRigor should preserve that direction in its conclusion.",
  expected_behavior: "Keep the source-supported direction intact through synthesis and distinguish it from unsupported alternatives or mechanisms.",
  failure_reason: "The response reversed the direction of the cited evidence after retrieval.",
  synthetic_regression_example: "A source reports inhibition, but the final answer rewrites it as promotion without supporting evidence.",
  evidence_basis: "source_recheck",
  askrigor_version: "0.1.0",
  protocol_identities: [{ name: "HRP", version: "test", sha256: "b".repeat(64) }],
  incident_provenance: originalProvenance,
  consent_scope: "once",
};

describe("lesson incident provenance through generalization", () => {
  it("keeps provenance out of the anonymizer and reattaches the exact original tuple", async () => {
    let anonymizerInput: LessonCandidate | undefined;
    let queuedCandidate: GeneralizedLesson | undefined;
    const fakeModelProvenance = {
      incident_id: "ali_modelmustnotcontrol0001",
      incident_sha256: "c".repeat(64),
      preservation_status: "PARTIAL_TRANSCRIPT_PRESERVED" as const,
    };

    const service = new LessonSubmissionService({
      limiter: {
        consume: () => ({ allowed: true as const }),
        lastBlockingReason: () => "hourly_limit" as const,
      } as LessonAttemptLimiter,
      anonymizer: {
        async generalize(input) {
          anonymizerInput = input;
          return {
            status: "generalized" as const,
            candidate: {
              ...input,
              incident_provenance: fakeModelProvenance,
            },
          };
        },
      },
      queue: {
        async submit({ candidate: submittedCandidate }) {
          queuedCandidate = submittedCandidate;
          return {
            kind: "created" as const,
            issueNumber: 42,
            occurrenceCount: 1,
            possibleRegression: false,
          };
        },
      },
    });

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "submitted",
      candidate_id: "ARL-0042",
      occurrence_count: 1,
      retryable: false,
    });
    expect(anonymizerInput?.incident_provenance).toBeUndefined();
    expect(queuedCandidate?.incident_provenance).toEqual(originalProvenance);
    expect(queuedCandidate?.incident_provenance).not.toEqual(fakeModelProvenance);
  });
});
