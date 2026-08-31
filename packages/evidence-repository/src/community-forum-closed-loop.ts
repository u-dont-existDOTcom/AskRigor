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
  type CommunityClosedLoopResult,
  type CommunityFormalEvidenceUpdate,
  type CommunityModerationAppeal,
  type CommunityModerationEvent,
  type CommunityProposalFeasibilityAssessment,
  type CommunityQuestionEvidenceCheck,
  type CommunityQuestionTransition,
  type CommunityResearchProposal,
  type CommunityResearchQuestion,
} from "@askrigor/contracts";

import { stableJson } from "./hash.js";

export class SyntheticCommunityClosedLoopService {
  private readonly appeals = new Map<string, CommunityModerationAppeal>();
  private readonly evidenceUpdates = new Map<
    string,
    CommunityFormalEvidenceUpdate
  >();
  private readonly questionTransitions = new Map<
    string,
    CommunityQuestionTransition
  >();
  private readonly feasibilityAssessments = new Map<
    string,
    CommunityProposalFeasibilityAssessment
  >();
  private readonly results = new Map<string, CommunityClosedLoopResult>();

  recordModerationAppeal(
    appealInput: unknown,
    originalInput: unknown,
    resolutionInput: unknown | null,
  ): CommunityModerationAppeal {
    const appeal = communityModerationAppealSchema.parse(appealInput);
    const original = communityModerationEventSchema.parse(originalInput);
    const resolution =
      resolutionInput === null
        ? null
        : communityModerationEventSchema.parse(resolutionInput);
    if (!original.appealable) {
      throw new Error("COMMUNITY_MODERATION_EVENT_NOT_APPEALABLE");
    }
    if (
      appeal.originalModerationEventId !== original.eventId ||
      appeal.targetType !== original.targetType ||
      appeal.targetId !== original.targetId
    ) {
      throw new Error("COMMUNITY_MODERATION_APPEAL_ORIGINAL_MISMATCH");
    }
    if (appeal.resolutionModerationEventId === null) {
      if (resolution !== null) {
        throw new Error("COMMUNITY_MODERATION_APPEAL_UNEXPECTED_RESOLUTION");
      }
    } else {
      if (
        resolution === null ||
        appeal.resolutionModerationEventId !== resolution.eventId ||
        resolution.targetType !== original.targetType ||
        resolution.targetId !== original.targetId
      ) {
        throw new Error("COMMUNITY_MODERATION_APPEAL_RESOLUTION_MISMATCH");
      }
      if (
        (appeal.appealState === "REVERSED" && resolution.action !== "RESTORE") ||
        (appeal.appealState === "UPHELD" && resolution.action !== "NO_ACTION")
      ) {
        throw new Error("COMMUNITY_MODERATION_APPEAL_DISPOSITION_MISMATCH");
      }
    }
    return this.insertExact(
      this.appeals,
      appeal.appealId,
      appeal,
      "COMMUNITY_MODERATION_APPEAL_COLLISION",
    );
  }

  recordFormalEvidenceUpdate(input: unknown): CommunityFormalEvidenceUpdate {
    const update = communityFormalEvidenceUpdateSchema.parse(input);
    return this.insertExact(
      this.evidenceUpdates,
      update.evidenceUpdateId,
      update,
      "COMMUNITY_FORMAL_EVIDENCE_UPDATE_COLLISION",
    );
  }

  transitionQuestion(
    transitionInput: unknown,
    priorInput: unknown,
    nextInput: unknown,
    evidenceCheckInput: unknown,
  ): CommunityQuestionTransition {
    const transition = communityQuestionTransitionSchema.parse(transitionInput);
    const prior = communityResearchQuestionSchema.parse(priorInput);
    const next = communityResearchQuestionSchema.parse(nextInput);
    const evidenceCheck = communityQuestionEvidenceCheckSchema.parse(
      evidenceCheckInput,
    );
    this.assertQuestionTransition(transition, prior, next, evidenceCheck);
    return this.insertExact(
      this.questionTransitions,
      transition.transitionId,
      transition,
      "COMMUNITY_QUESTION_TRANSITION_COLLISION",
    );
  }

  assessProposal(
    assessmentInput: unknown,
    proposalInput: unknown,
    evidenceCheckInput: unknown,
  ): CommunityProposalFeasibilityAssessment {
    const assessment = communityProposalFeasibilityAssessmentSchema.parse(
      assessmentInput,
    );
    const proposal = communityResearchProposalSchema.parse(proposalInput);
    const evidenceCheck = communityQuestionEvidenceCheckSchema.parse(
      evidenceCheckInput,
    );
    if (
      assessment.proposalId !== proposal.proposalId ||
      assessment.proposalVersion !== proposal.proposalVersion ||
      assessment.questionId !== proposal.questionId ||
      assessment.questionVersion !== proposal.questionVersion ||
      assessment.evidenceCheckId !== evidenceCheck.evidenceCheckId ||
      assessment.questionId !== evidenceCheck.questionId ||
      assessment.questionVersion !== evidenceCheck.questionVersion ||
      assessment.matchedEvidenceStatus !== evidenceCheck.matchedEvidenceStatus
    ) {
      throw new Error("COMMUNITY_PROPOSAL_FEASIBILITY_DEPENDENCY_MISMATCH");
    }
    return this.insertExact(
      this.feasibilityAssessments,
      assessment.assessmentId,
      assessment,
      "COMMUNITY_PROPOSAL_FEASIBILITY_COLLISION",
    );
  }

  recordClosedLoopResult(
    resultInput: unknown,
    proposalInput: unknown,
  ): CommunityClosedLoopResult {
    const result = communityClosedLoopResultSchema.parse(resultInput);
    const proposal = communityResearchProposalSchema.parse(proposalInput);
    if (
      result.proposalId !== proposal.proposalId ||
      result.proposalVersion !== proposal.proposalVersion ||
      result.questionId !== proposal.questionId ||
      result.questionVersion !== proposal.questionVersion
    ) {
      throw new Error("COMMUNITY_CLOSED_LOOP_RESULT_PROPOSAL_MISMATCH");
    }
    return this.insertExact(
      this.results,
      result.resultPropagationId,
      result,
      "COMMUNITY_CLOSED_LOOP_RESULT_COLLISION",
    );
  }

  private assertQuestionTransition(
    transition: CommunityQuestionTransition,
    prior: CommunityResearchQuestion,
    next: CommunityResearchQuestion,
    evidenceCheck: CommunityQuestionEvidenceCheck,
  ): void {
    if (
      transition.questionId !== prior.questionId ||
      transition.questionId !== next.questionId ||
      transition.fromQuestionVersion !== prior.questionVersion ||
      transition.toQuestionVersion !== next.questionVersion ||
      transition.fromStatus !== prior.status ||
      transition.toStatus !== next.status ||
      transition.evidenceCheckId !== evidenceCheck.evidenceCheckId ||
      transition.questionId !== evidenceCheck.questionId ||
      transition.fromQuestionVersion !== evidenceCheck.questionVersion ||
      transition.matchedEvidenceStatus !== evidenceCheck.matchedEvidenceStatus ||
      next.evidenceCheckStatus !== evidenceCheck.matchedEvidenceStatus
    ) {
      throw new Error("COMMUNITY_QUESTION_TRANSITION_DEPENDENCY_MISMATCH");
    }
  }

  private insertExact<T>(
    records: Map<string, T>,
    key: string,
    value: T,
    collisionCode: string,
  ): T {
    const prior = records.get(key);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(value)) throw new Error(collisionCode);
      return structuredClone(prior);
    }
    records.set(key, value);
    return structuredClone(value);
  }
}
