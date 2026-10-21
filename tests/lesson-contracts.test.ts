import { describe, expect, it } from "vitest";
import {
  connectorLessonCandidateSchema,
  connectorLessonSubmissionResultSchema,
  DETAILED_LESSON_REPORT_LIMITS,
  detailedLessonReportSchema,
  detailedLessonReportTexts,
  generalizedLessonSchema,
  lessonCandidateSchema,
  lessonSubmissionResultSchema,
  type DetailedLessonReport,
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

// Owner question 154 (2026-10-21): a connector lesson may carry an optional detailed report, typed and bounded, about
// 10,000 characters in all, only from an account that turned detailed lesson reports on (the service checks that).
describe("connector lesson detailed report contract", () => {
  const report: DetailedLessonReport = {
    steps: ["The assistant searched one database and found three trials."],
    observed: "The answer called the evidence strong although no trial was read in full.",
    expected: "The answer should read the decisive trials in full before rating the evidence.",
    causes: [{ cause: "The final check accepted an answer with no key studies.", confidence: "high" }],
    parts_to_change: ["finalize_research"],
    proposed_change: "Refuse a strength rating unless a key study was read in full.",
    test_cases: [{ case: "An invented answer rates three abstracts as strong; the check refuses it.", negative_control: false }],
    uncertain: "Whether the model would still rate the evidence once the rule names the full-text read.",
  };
  const withReport = (detailed_report: unknown) => ({ ...validCandidate, detailed_report });
  const limits = DETAILED_LESSON_REPORT_LIMITS;

  it("accepts an optional detailed report on the connector only", () => {
    expect(connectorLessonCandidateSchema.parse(withReport(report))).toEqual(withReport(report));
    expect(connectorLessonCandidateSchema.parse({ ...withReport(report), related_issue: 357 }))
      .toEqual({ ...withReport(report), related_issue: 357 });
    // No test case is required, and the bounds hold at their limits.
    const atLimits: DetailedLessonReport = {
      steps: Array.from({ length: limits.steps }, () => "s".repeat(limits.stepCharacters)),
      observed: "o",
      expected: "e",
      causes: Array.from({ length: limits.causes }, () => ({ cause: "c".repeat(limits.causeCharacters), confidence: "low" as const })),
      parts_to_change: Array.from({ length: limits.partsToChange }, () => "p".repeat(limits.partCharacters)),
      proposed_change: "x".repeat(limits.proposedChangeCharacters),
      test_cases: [],
      uncertain: "u".repeat(limits.uncertainCharacters),
    };
    expect(connectorLessonCandidateSchema.safeParse(withReport(atLimits)).success).toBe(true);
    // The Action's request shape and the generalized shape are unchanged: there the report is an unknown field.
    expect(lessonCandidateSchema.safeParse(withReport(report)).success).toBe(false);
    expect(generalizedLessonSchema.safeParse(withReport(report)).success).toBe(false);
  });

  it("counts every text of the report, in order, for the screen and the total", () => {
    expect(detailedLessonReportTexts({
      ...report,
      steps: ["step one", "step two"],
      test_cases: [{ case: "case one", negative_control: true }, { case: "case two", negative_control: false }],
    })).toEqual([
      "step one", "step two", report.observed, report.expected, report.causes[0]!.cause, "finalize_research",
      report.proposed_change, "case one", "case two", report.uncertain,
    ]);
  });

  it.each([
    ["no step", { steps: [] }],
    ["13 steps", { steps: Array.from({ length: 13 }, () => "A step.") }],
    ["a step over 300 characters", { steps: ["s".repeat(301)] }],
    ["an empty step", { steps: [""] }],
    ["observed over 1,000 characters", { observed: "o".repeat(1_001) }],
    ["expected over 1,000 characters", { expected: "e".repeat(1_001) }],
    ["no cause", { causes: [] }],
    ["six causes", { causes: Array.from({ length: 6 }, () => ({ cause: "A cause.", confidence: "low" })) }],
    ["a cause over 300 characters", { causes: [{ cause: "c".repeat(301), confidence: "low" }] }],
    ["a cause without its confidence", { causes: [{ cause: "A cause." }] }],
    ["a confidence outside low, medium and high", { causes: [{ cause: "A cause.", confidence: "certain" }] }],
    ["a cause with another field", { causes: [{ cause: "A cause.", confidence: "low", source: "chat" }] }],
    ["no part to change", { parts_to_change: [] }],
    ["nine parts to change", { parts_to_change: Array.from({ length: 9 }, () => "A part.") }],
    ["a part over 120 characters", { parts_to_change: ["p".repeat(121)] }],
    ["a proposed change over 1,500 characters", { proposed_change: "x".repeat(1_501) }],
    ["six test cases", { test_cases: Array.from({ length: 6 }, () => ({ case: "A case.", negative_control: false })) }],
    ["a test case over 1,200 characters", { test_cases: [{ case: "t".repeat(1_201), negative_control: false }] }],
    ["a test case without its control flag", { test_cases: [{ case: "A case." }] }],
    ["a control flag that is not a boolean", { test_cases: [{ case: "A case.", negative_control: "yes" }] }],
    ["uncertain over 1,000 characters", { uncertain: "u".repeat(1_001) }],
    ["no uncertain", { uncertain: undefined }],
    ["another field", { transcript: "The raw chat." }],
  ])("rejects a report with %s", (_name, change) => {
    expect(connectorLessonCandidateSchema.safeParse(withReport({ ...report, ...change })).success).toBe(false);
  });

  it.each([null, "A long report.", ["A step."], 42])("rejects a report that is not an object: %j", (value) => {
    expect(connectorLessonCandidateSchema.safeParse(withReport(value)).success).toBe(false);
  });

  it("holds the report to 10,000 characters in all, though each field is within its own bound", () => {
    const sized = (total: number): DetailedLessonReport => {
      // Twelve full steps (3,600), observed and expected (2,000), five full causes (1,500), one part (100), a full
      // proposed change (1,500) and one full test case (1,200) make 9,900; what stays uncertain fills the rest.
      const fixed = {
        steps: Array.from({ length: 12 }, () => "s".repeat(300)),
        observed: "o".repeat(1_000),
        expected: "e".repeat(1_000),
        causes: Array.from({ length: 5 }, () => ({ cause: "c".repeat(300), confidence: "medium" as const })),
        parts_to_change: ["p".repeat(100)],
        proposed_change: "x".repeat(1_500),
        test_cases: [{ case: "t".repeat(1_200), negative_control: false }],
      };
      const used = detailedLessonReportTexts({ ...fixed, uncertain: "" }).join("").length;
      return { ...fixed, uncertain: "u".repeat(total - used) };
    };
    expect(detailedLessonReportTexts(sized(limits.totalCharacters)).join("").length).toBe(10_000);
    expect(detailedLessonReportSchema.safeParse(sized(limits.totalCharacters)).success).toBe(true);
    expect(detailedLessonReportSchema.safeParse(sized(limits.totalCharacters + 1)).success).toBe(false);
    expect(connectorLessonCandidateSchema.safeParse(withReport(sized(limits.totalCharacters + 1))).success).toBe(false);
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

  // Owner question 154: the connector's refusal of a detailed report the account has not turned on. The Action's
  // receipts, published in its OpenAPI document, are unchanged.
  it("adds only the connector's detailed report refusal, with its stable reason code", () => {
    const refused = { status: "detailed_report_refused", retryable: false, reason_code: "detailed_reports_off" };
    expect(connectorLessonSubmissionResultSchema.parse(refused)).toEqual(refused);
    expect(lessonSubmissionResultSchema.safeParse(refused).success).toBe(false);
    expect(connectorLessonSubmissionResultSchema.safeParse({ ...refused, retryable: true }).success).toBe(false);
    expect(connectorLessonSubmissionResultSchema.safeParse({ ...refused, reason_code: "unsafe_candidate" }).success).toBe(false);
    expect(connectorLessonSubmissionResultSchema.safeParse({ ...refused, detailed_report: {} }).success).toBe(false);
    expect(connectorLessonSubmissionResultSchema.safeParse({
      status: "submitted", candidate_id: "ARL-0042", occurrence_count: 1, retryable: false,
    }).success).toBe(true);
  });
});
