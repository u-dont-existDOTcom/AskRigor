import { describe, expect, it } from "vitest";

import {
  communityClosedLoopResultSchema,
  communityFormalEvidenceUpdateSchema,
  communityModerationAppealSchema,
  communityModerationEventSchema,
  communityProposalFeasibilityAssessmentSchema,
  communityQuestionEvidenceCheckSchema,
  communityQuestionTransitionSchema,
  communityResearchProposalSchema,
  communityResearchQuestionSchema,
} from "../packages/contracts/src/index.js";
import {
  sha256,
  SyntheticCommunityClosedLoopService,
} from "../packages/evidence-repository/src/index.js";

const AT = "2026-08-31T00:10:00.000Z";
const LATER = "2026-08-31T00:11:00.000Z";
const MEANING = sha256("synthetic closed-loop source meaning");

function question(version: number, overrides: Record<string, unknown> = {}) {
  return communityResearchQuestionSchema.parse({
    synthetic: true,
    questionId: "ARQ-SYNTHCLOSEDLOOP01",
    questionVersion: version,
    derivedFromClusterIds: ["ARCL-SYNTHCLOSEDLOOP01"],
    questionText: "Does the synthetic signal remain unresolved?",
    evidenceCheckStatus: "NOT_CHECKED",
    status: "EVIDENCE_CHECK",
    createdAt: version === 1 ? AT : LATER,
    ...overrides,
  });
}

function check(status: "ANSWERED_FOR_SCOPE" | "PARTIALLY_ANSWERED" | "FORMAL_EVIDENCE_CONFLICTED" | "NOT_ANSWERED") {
  return communityQuestionEvidenceCheckSchema.parse({
    synthetic: true,
    evidenceCheckId: `AREC-SYNTH${status}01`,
    questionId: "ARQ-SYNTHCLOSEDLOOP01",
    questionVersion: 1,
    matchedEvidenceStatus: status,
    summary: `Synthetic evidence-check state: ${status}.`,
    evidenceIdentifiers: ["SYNTHETIC-EVIDENCE-001"],
    checkedAt: LATER,
  });
}

function proposal() {
  return communityResearchProposalSchema.parse({
    synthetic: true,
    proposalId: "ARPROP-SYNTHCLOSEDLOOP01",
    proposalVersion: 1,
    questionId: "ARQ-SYNTHCLOSEDLOOP01",
    questionVersion: 1,
    proposalType: "TARGETED_REVIEW",
    designSummary: "Synthetic closed-loop targeted review fixture.",
    ethicsState: "REVIEW_REQUIRED",
    privacyState: "REVIEW_REQUIRED",
    safetyState: "REVIEW_REQUIRED",
    methodsReviewState: "NOT_REVIEWED",
    recruitmentActive: false,
    status: "DRAFT",
    createdAt: AT,
  });
}

describe("append-only moderation appeals", () => {
  it("reverses conduct action without rewriting source meaning or resolving science", () => {
    const service = new SyntheticCommunityClosedLoopService();
    const original = communityModerationEventSchema.parse({
      synthetic: true,
      eventId: "ARMOD-SYNTHORIGINAL01",
      targetType: "LEAD",
      targetId: "ARLEAD-SYNTHCLOSEDLOOP01",
      actorRole: "GLOBAL_MODERATOR",
      action: "HIDE",
      reason: "Synthetic conduct decision under appeal.",
      appealable: true,
      occurredAt: AT,
    });
    const reversal = communityModerationEventSchema.parse({
      synthetic: true,
      eventId: "ARMOD-SYNTHREVERSAL01",
      targetType: "LEAD",
      targetId: "ARLEAD-SYNTHCLOSEDLOOP01",
      actorRole: "GLOBAL_MODERATOR",
      action: "RESTORE",
      reason: "Synthetic appeal reversal; science remains separate.",
      appealable: true,
      occurredAt: LATER,
    });
    const appeal = communityModerationAppealSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      appealId: "ARAPPEAL-SYNTHREVERSAL01",
      originalModerationEventId: original.eventId,
      resolutionModerationEventId: reversal.eventId,
      targetType: "LEAD",
      targetId: original.targetId,
      appellantActorId: "ARSYN-SYNTHAPPELLANT01",
      sourceMeaningSha256Before: MEANING,
      sourceMeaningSha256After: MEANING,
      scientificDispositionChanged: false,
      appealState: "REVERSED",
      occurredAt: LATER,
    });

    expect(service.recordModerationAppeal(appeal, original, reversal)).toMatchObject({
      appealState: "REVERSED",
      scientificDispositionChanged: false,
    });
    expect(() =>
      communityModerationAppealSchema.parse({
        ...appeal,
        sourceMeaningSha256After: sha256("silently rewritten"),
      }),
    ).toThrow();
  });
});

describe("formal evidence and question transitions", () => {
  it("keeps aligned contradiction, mismatch, staleness, and report volume explicit", () => {
    const service = new SyntheticCommunityClosedLoopService();
    const update = communityFormalEvidenceUpdateSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      evidenceUpdateId: "AREVUP-SYNTHSTALECONFLICT01",
      clusterId: "ARCL-SYNTHCLOSEDLOOP01",
      fromClusterVersion: 1,
      toClusterVersion: 2,
      updateKind: "CORRECTION_OR_RETRACTION",
      scopeRelationship: "ALIGNED_SCOPE",
      formalEvidenceRelationshipBefore: "CORROBORATED_FOR_MATCHED_SCOPE",
      formalEvidenceRelationshipAfter: "FORMAL_EVIDENCE_CONFLICTED",
      freshnessBefore: "CURRENT",
      freshnessAfter: "STALE_PENDING_REVIEW",
      communityReportCountBefore: 2,
      communityReportCountAfter: 1_000_002,
      communityReportCountAffectsFormalEvidence: false,
      originatingReportsRetained: true,
      originatingReportMeaningChanged: false,
      effectivenessPercentageDisplayPermitted: false,
      evidenceIdentifiers: ["SYNTHETIC-CORRECTION-001"],
      occurredAt: LATER,
    });
    expect(service.recordFormalEvidenceUpdate(update)).toMatchObject({
      scopeRelationship: "ALIGNED_SCOPE",
      freshnessAfter: "STALE_PENDING_REVIEW",
      communityReportCountAffectsFormalEvidence: false,
      originatingReportsRetained: true,
    });
    expect(() =>
      communityFormalEvidenceUpdateSchema.parse({
        ...update,
        communityReportCountAffectsFormalEvidence: true,
      }),
    ).toThrow();
  });

  it("uses exact evidence-check state and contiguous versions when narrowing a question", () => {
    const service = new SyntheticCommunityClosedLoopService();
    const prior = question(1);
    const evidenceCheck = check("PARTIALLY_ANSWERED");
    const narrowed = question(2, {
      questionText: "Which part of the synthetic signal remains unresolved?",
      evidenceCheckStatus: "PARTIALLY_ANSWERED",
      status: "OPEN_UNCERTAINTY",
    });
    const transition = communityQuestionTransitionSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      transitionId: "ARQTRANS-SYNTHPARTIAL01",
      questionId: prior.questionId,
      fromQuestionVersion: 1,
      toQuestionVersion: 2,
      evidenceCheckId: evidenceCheck.evidenceCheckId,
      matchedEvidenceStatus: "PARTIALLY_ANSWERED",
      fromStatus: "EVIDENCE_CHECK",
      toStatus: "OPEN_UNCERTAINTY",
      transitionKind: "NARROW_PARTIAL_ANSWER",
      occurredAt: LATER,
    });
    expect(
      service.transitionQuestion(transition, prior, narrowed, evidenceCheck),
    ).toMatchObject({ transitionKind: "NARROW_PARTIAL_ANSWER" });
    expect(() =>
      service.transitionQuestion(
        { ...transition, transitionId: "ARQTRANS-SYNTHGAP0001", toQuestionVersion: 3 },
        prior,
        { ...narrowed, questionVersion: 3 },
        evidenceCheck,
      ),
    ).toThrow();
  });
});

describe("proposal feasibility and closed-loop results", () => {
  it("does not let popularity override an answered question or infeasible design", () => {
    const service = new SyntheticCommunityClosedLoopService();
    const candidate = proposal();
    const answered = check("ANSWERED_FOR_SCOPE");
    expect(
      service.assessProposal(
        communityProposalFeasibilityAssessmentSchema.parse({
          schemaVersion: "0.1.0",
          synthetic: true,
          labOnly: true,
          assessmentId: "ARFEAS-SYNTHANSWERED01",
          proposalId: candidate.proposalId,
          proposalVersion: 1,
          questionId: candidate.questionId,
          questionVersion: 1,
          evidenceCheckId: answered.evidenceCheckId,
          matchedEvidenceStatus: "ANSWERED_FOR_SCOPE",
          designAnswerability: "FEASIBLE",
          popularity: { votes: 1_000_000, comments: 100_000 },
          popularityAffectsFeasibility: false,
          disposition: "BLOCKED_ANSWERED_SCOPE",
          launchAuthorized: false,
          recruitmentActive: false,
          assessedAt: LATER,
        }),
        candidate,
        answered,
      ).disposition,
    ).toBe("BLOCKED_ANSWERED_SCOPE");

    const unresolved = check("NOT_ANSWERED");
    expect(
      service.assessProposal(
        {
          schemaVersion: "0.1.0",
          synthetic: true,
          labOnly: true,
          assessmentId: "ARFEAS-SYNTHINFEASIBLE01",
          proposalId: candidate.proposalId,
          proposalVersion: 1,
          questionId: candidate.questionId,
          questionVersion: 1,
          evidenceCheckId: unresolved.evidenceCheckId,
          matchedEvidenceStatus: "NOT_ANSWERED",
          designAnswerability: "INFEASIBLE",
          popularity: { votes: 2_000_000, comments: 200_000 },
          popularityAffectsFeasibility: false,
          disposition: "BLOCKED_INFEASIBLE_DESIGN",
          launchAuthorized: false,
          recruitmentActive: false,
          assessedAt: LATER,
        },
        candidate,
        unresolved,
      ).launchAuthorized,
    ).toBe(false);
  });

  it("returns a negative result to every exact origin without hiding or punishing reports", () => {
    const service = new SyntheticCommunityClosedLoopService();
    const candidate = proposal();
    const receipt = communityClosedLoopResultSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      resultPropagationId: "ARRESULT-SYNTHNEGATIVE01",
      proposalId: candidate.proposalId,
      proposalVersion: 1,
      questionId: candidate.questionId,
      questionVersion: 1,
      resultDirection: "NEGATIVE",
      formalEvidenceRelationship: "CONTRADICTED_FOR_MATCHED_SCOPE",
      clusterTargets: [
        { clusterId: "ARCL-SYNTHCLOSEDLOOP01", clusterVersion: 2 },
      ],
      leadTargets: [
        { leadId: "ARLEAD-SYNTHCLOSEDLOOP01", leadVersion: 1 },
      ],
      forumTargets: [
        { targetType: "TOPIC", targetId: "SYNTHETIC-TOPIC-9501" },
      ],
      originatingReportsRetained: true,
      originatingHypothesisPenalized: false,
      sourceMeaningChanged: false,
      causalClaimPermitted: false,
      effectivenessPercentageDisplayPermitted: false,
      recruitmentActive: false,
      propagatedAt: LATER,
    });
    expect(service.recordClosedLoopResult(receipt, candidate)).toMatchObject({
      resultDirection: "NEGATIVE",
      originatingReportsRetained: true,
      originatingHypothesisPenalized: false,
      sourceMeaningChanged: false,
    });
    expect(() =>
      communityClosedLoopResultSchema.parse({
        ...receipt,
        originatingReportsRetained: false,
      }),
    ).toThrow();
  });
});
