import { describe, expect, it } from "vitest";
import {
  connectorLessonCandidateSchema,
  generalizedLessonSchema,
  lessonCandidateSchema,
  lessonSubmissionResultSchema,
} from "../apps/research-mcp/src/lessons/contracts.js";

const validCandidate = {
  category: "missing_sources",
  general_lesson: "When material factual claims are made, AskRigor should attach traceable sources.",
  expected_behavior: "Cite each material claim near the sentence it supports and expose any source-access boundary.",
  failure_reason: "The answer asserted a conclusion without giving the user a way to inspect its evidence.",
  synthetic_regression_example: "A response ranks two interventions but supplies no citations for either ranking.",
  evidence_basis: "assistant_self_check",
  askrigor_version: "0.1.0",
  protocol_identities: [{
    name: "HRP",
    version: "20.5.17",
    sha256: "a".repeat(64),
  }],
  consent_scope: "once",
};

describe("lesson candidate contract", () => {
  it("accepts the exact valid derived candidate fixture", () => {
    expect(lessonCandidateSchema.parse(validCandidate)).toEqual(validCandidate);
    expect(generalizedLessonSchema.parse(validCandidate)).toEqual(validCandidate);
  });

  it.each([
    ["category", "not_a_category"],
    ["evidence_basis", "user_assertion"],
    ["consent_scope", "always"],
  ])("rejects an unsupported %s enum", (field, value) => {
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, [field]: value }).success).toBe(false);
  });

  it.each([
    ["general_lesson", 39, 600],
    ["general_lesson", 601, 600],
    ["expected_behavior", 39, 40],
    ["expected_behavior", 1201, 1200],
    ["failure_reason", 19, 20],
    ["failure_reason", 801, 800],
    ["synthetic_regression_example", 19, 20],
    ["synthetic_regression_example", 1201, 1200],
  ])("rejects %s outside its %i character boundary", (field, length) => {
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, [field]: "x".repeat(length) }).success).toBe(false);
  });

  it("enforces version, protocol identity, count, and SHA boundaries", () => {
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, askrigor_version: "v".repeat(65) }).success).toBe(false);
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, protocol_identities: Array.from({ length: 5 }, () => validCandidate.protocol_identities[0]) }).success).toBe(false);
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, protocol_identities: [{ name: "n".repeat(65), version: "1" }] }).success).toBe(false);
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, protocol_identities: [{ name: "HRP", version: "v".repeat(65) }] }).success).toBe(false);
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, protocol_identities: [{ name: "HRP", version: "1", sha256: "A".repeat(64) }] }).success).toBe(false);
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, protocol_identities: [{ name: "HRP", version: "1", sha256: "a".repeat(63) }] }).success).toBe(false);
  });

  it.each([
    "raw_chat",
    "user_message",
    "assistant_message",
    "conversation_id",
    "user_id",
    "email",
    "location",
    "medical_history",
    "upload",
  ])("rejects forbidden and unknown request field %s", (field) => {
    expect(lessonCandidateSchema.safeParse({ ...validCandidate, [field]: "not permitted" }).success).toBe(false);
  });
});

// Issue #357: a connector lesson may point to the public AskRigor issue that
// reports the failure in detail, by number only.
describe("connector lesson candidate contract", () => {
  const withRelatedIssue = { ...validCandidate, related_issue: 357 };

  it("accepts an optional related issue number on the connector only", () => {
    expect(connectorLessonCandidateSchema.parse(validCandidate)).toEqual(validCandidate);
    expect(connectorLessonCandidateSchema.parse(withRelatedIssue)).toEqual(withRelatedIssue);
    for (const related_issue of [1, 1_000_000]) {
      expect(connectorLessonCandidateSchema.parse({ ...validCandidate, related_issue })).toEqual({
        ...validCandidate,
        related_issue,
      });
    }
    // The Action's request shape and the generalized shape are unchanged.
    expect(lessonCandidateSchema.safeParse(withRelatedIssue).success).toBe(false);
    expect(generalizedLessonSchema.safeParse(withRelatedIssue).success).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -357],
    ["not an integer", 357.5],
    ["a numeric string", "357"],
    ["a link", "https://github.com/u-dont-existDOTcom/AskRigor/issues/357"],
    ["over the bound", 1_000_001],
    ["not a number", Number.NaN],
    ["null", null],
  ])("rejects a related issue that is %s", (_name, related_issue) => {
    expect(connectorLessonCandidateSchema.safeParse({ ...validCandidate, related_issue }).success).toBe(false);
  });

  it("takes no incident provenance", () => {
    expect(connectorLessonCandidateSchema.safeParse({
      ...validCandidate,
      incident_provenance: {
        incident_id: "ali_originalincident0001",
        incident_sha256: "b".repeat(64),
        preservation_status: "EXACT_TRANSCRIPT_PRESERVED",
      },
    }).success).toBe(false);
  });
});

describe("private-safe lesson submission results", () => {
  it.each([
    { status: "submitted", candidate_id: "ARL-0042", occurrence_count: 1, retryable: false },
    { status: "existing_candidate", candidate_id: "ARL-0042", occurrence_count: 2, retryable: false },
    { status: "privacy_rejected", retryable: false, reason_code: "unsafe_candidate" },
    { status: "rate_limited", retryable: true, retry_after_seconds: 60, reason_code: "hourly_limit" },
    { status: "anonymizer_unavailable", retryable: true, reason_code: "privacy_service_unavailable" },
    { status: "github_unavailable", retryable: true, reason_code: "github_service_unavailable" },
  ])("accepts the %s public result shape", (result) => {
    expect(lessonSubmissionResultSchema.safeParse(result).success).toBe(true);
  });

  it("rejects unsafe result fields and invalid status-specific combinations", () => {
    expect(lessonSubmissionResultSchema.safeParse({ status: "submitted", candidate_id: "ARL-0042", occurrence_count: 1, retryable: true }).success).toBe(false);
    expect(lessonSubmissionResultSchema.safeParse({ status: "rate_limited", retryable: true, retry_after_seconds: 60, reason_code: "unsafe_candidate" }).success).toBe(false);
    expect(lessonSubmissionResultSchema.safeParse({ status: "privacy_rejected", retryable: false, reason_code: "unsafe_candidate", issue_number: 42 }).success).toBe(false);
    expect(lessonSubmissionResultSchema.safeParse({ status: "github_unavailable", retryable: true, reason_code: "github_service_unavailable", url: "https://github.com/private" }).success).toBe(false);
    expect(lessonSubmissionResultSchema.safeParse({ status: "privacy_rejected", retryable: false, reason_code: "unsafe_candidate", fingerprint: "a".repeat(64) }).success).toBe(false);
    expect(lessonSubmissionResultSchema.safeParse({ status: "privacy_rejected", retryable: false, reason_code: "unsafe_candidate", candidate: validCandidate }).success).toBe(false);
  });
});
