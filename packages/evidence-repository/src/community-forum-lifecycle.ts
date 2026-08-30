import {
  communityIntegritySignalSchema,
  communityModerationEventSchema,
  communityOperationalQueueItemSchema,
  communityPublicationLifecycleEventSchema,
  communityQuestionEvidenceCheckSchema,
  communityResearchProposalSchema,
  communityResearchQuestionExecutionSchema,
  communityResearchQuestionSchema,
  communityReviewDisagreementSchema,
  communityScientificAnnotationSchema,
  communitySignalClusterSchema,
  communityWithdrawalPropagationReceiptSchema,
  communityWithdrawalEventSchema,
  type CommunityIntegritySignal,
  type CommunityModerationEvent,
  type CommunityOperationalQueueItem,
  type CommunityPublicationLifecycleEvent,
  type CommunityQuestionEvidenceCheck,
  type CommunityResearchProposal,
  type CommunityResearchQuestion,
  type CommunityResearchQuestionExecution,
  type CommunityReviewDisagreement,
  type CommunityScientificAnnotation,
  type CommunitySignalCluster,
  type CommunityWithdrawalPropagationReceipt,
} from "@askrigor/contracts";

import { stableJson } from "./hash.js";
import { SyntheticCommunityOperationsService } from "./community-forum-operations.js";

export interface RoutedCommunityIntegritySignal {
  signal: CommunityIntegritySignal;
  queueItems: CommunityOperationalQueueItem[];
}

export class SyntheticCommunityIntegrityService {
  private readonly signals = new Map<string, RoutedCommunityIntegritySignal>();

  routeSignal(
    signalInput: unknown,
    queueInputs: unknown[],
  ): RoutedCommunityIntegritySignal {
    const signal = communityIntegritySignalSchema.parse(signalInput);
    const operations = new SyntheticCommunityOperationsService();
    const queueItems = queueInputs.map((input) => operations.enqueue(input));
    const suppliedTypes = new Set(queueItems.map((item) => item.queueType));
    for (const requiredType of signal.requiredQueueTypes) {
      if (!suppliedTypes.has(requiredType)) {
        throw new Error(
          `COMMUNITY_INTEGRITY_REQUIRED_QUEUE_MISSING queue=${requiredType}`,
        );
      }
    }
    if (
      suppliedTypes.size !== signal.requiredQueueTypes.length ||
      queueItems.length !== signal.requiredQueueTypes.length
    ) {
      throw new Error("COMMUNITY_INTEGRITY_QUEUE_SET_MISMATCH");
    }
    for (const item of queueItems) {
      if (
        item.targetType !== signal.targetType ||
        item.targetId !== signal.targetId ||
        item.sourceMeaningSha256 !== signal.sourceMeaningSha256Before
      ) {
        throw new Error("COMMUNITY_INTEGRITY_QUEUE_TARGET_MISMATCH");
      }
      if (!item.independentReviewRequired) {
        throw new Error("COMMUNITY_INTEGRITY_INDEPENDENT_REVIEW_REQUIRED");
      }
    }
    const routed = { signal, queueItems };
    const prior = this.signals.get(signal.integritySignalId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(routed)) {
        throw new Error("COMMUNITY_INTEGRITY_SIGNAL_COLLISION");
      }
      return structuredClone(prior);
    }
    this.signals.set(signal.integritySignalId, routed);
    return structuredClone(routed);
  }
}

export class SyntheticCommunityLifecycleService {
  private readonly disagreements = new Map<string, CommunityReviewDisagreement>();
  private readonly lifecycleEvents = new Map<
    string,
    CommunityPublicationLifecycleEvent
  >();
  private readonly currentLifecycle = new Map<
    string,
    CommunityPublicationLifecycleEvent
  >();
  private readonly propagationReceipts = new Map<
    string,
    CommunityWithdrawalPropagationReceipt
  >();

  recordDisagreement(
    disagreementInput: unknown,
    moderationInput: unknown,
    scientificInput: unknown,
  ): CommunityReviewDisagreement {
    const disagreement = communityReviewDisagreementSchema.parse(
      disagreementInput,
    );
    const moderation = communityModerationEventSchema.parse(moderationInput);
    const scientific = communityScientificAnnotationSchema.parse(scientificInput);
    this.assertDisagreementLinks(disagreement, moderation, scientific);
    const prior = this.disagreements.get(disagreement.disagreementId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(disagreement)) {
        throw new Error("COMMUNITY_REVIEW_DISAGREEMENT_COLLISION");
      }
      return structuredClone(prior);
    }
    this.disagreements.set(disagreement.disagreementId, disagreement);
    return structuredClone(disagreement);
  }

  recordPublicationTransition(
    input: unknown,
  ): CommunityPublicationLifecycleEvent {
    const event = communityPublicationLifecycleEventSchema.parse(input);
    const eventPrior = this.lifecycleEvents.get(event.lifecycleEventId);
    if (eventPrior !== undefined) {
      if (stableJson(eventPrior) !== stableJson(event)) {
        throw new Error("COMMUNITY_PUBLICATION_LIFECYCLE_EVENT_COLLISION");
      }
      return structuredClone(eventPrior);
    }
    const current = this.currentLifecycle.get(event.publicVersionId);
    if (current === undefined) {
      if (event.fromState !== null) {
        throw new Error("COMMUNITY_PUBLICATION_LIFECYCLE_START_REQUIRED");
      }
    } else {
      if (event.fromState !== current.toState) {
        throw new Error("COMMUNITY_PUBLICATION_LIFECYCLE_STALE_STATE");
      }
      if (
        event.leadId !== current.leadId ||
        event.leadVersion !== current.leadVersion
      ) {
        throw new Error("COMMUNITY_PUBLICATION_LIFECYCLE_IDENTITY_MISMATCH");
      }
      if (
        event.visibilityBefore !== current.visibilityAfter ||
        event.verificationStateBefore !== current.verificationStateAfter ||
        event.evidenceCapabilityBefore !== current.evidenceCapabilityAfter ||
        event.formalEvidenceRelationshipBefore !==
          current.formalEvidenceRelationshipAfter
      ) {
        throw new Error("COMMUNITY_PUBLICATION_LIFECYCLE_CONTINUITY_MISMATCH");
      }
    }
    this.lifecycleEvents.set(event.lifecycleEventId, event);
    this.currentLifecycle.set(event.publicVersionId, event);
    return structuredClone(event);
  }

  recordWithdrawalPropagation(
    input: unknown,
    withdrawalInput: unknown,
  ): CommunityWithdrawalPropagationReceipt {
    const receipt = communityWithdrawalPropagationReceiptSchema.parse(input);
    const withdrawal = communityWithdrawalEventSchema.parse(withdrawalInput);
    if (
      withdrawal.withdrawalEventId !== receipt.withdrawalEventId ||
      !withdrawal.targetRecordIds.includes(receipt.publicVersionId) ||
      withdrawal.propagationState !== "COMPLETE"
    ) {
      throw new Error("COMMUNITY_WITHDRAWAL_PROPAGATION_EVENT_MISMATCH");
    }
    const lifecycle = this.currentLifecycle.get(receipt.publicVersionId);
    if (
      lifecycle === undefined ||
      lifecycle.toState !== "WITHDRAWN" ||
      lifecycle.leadId !== receipt.leadId ||
      lifecycle.leadVersion !== receipt.leadVersion ||
      lifecycle.visibilityAfter !== "NOT_VISIBLE"
    ) {
      throw new Error("COMMUNITY_WITHDRAWAL_LIFECYCLE_NOT_COMPLETE");
    }
    const prior = this.propagationReceipts.get(receipt.propagationReceiptId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(receipt)) {
        throw new Error("COMMUNITY_WITHDRAWAL_PROPAGATION_COLLISION");
      }
      return structuredClone(prior);
    }
    this.propagationReceipts.set(receipt.propagationReceiptId, receipt);
    return structuredClone(receipt);
  }

  private assertDisagreementLinks(
    disagreement: CommunityReviewDisagreement,
    moderation: CommunityModerationEvent,
    scientific: CommunityScientificAnnotation,
  ): void {
    if (
      disagreement.moderationEventId !== moderation.eventId ||
      disagreement.scientificAnnotationId !== scientific.annotationId
    ) {
      throw new Error("COMMUNITY_REVIEW_DISAGREEMENT_REFERENCE_MISMATCH");
    }
    if (
      disagreement.targetType !== moderation.targetType ||
      disagreement.targetId !== moderation.targetId ||
      disagreement.targetType !== scientific.targetType ||
      disagreement.targetId !== scientific.targetId
    ) {
      throw new Error("COMMUNITY_REVIEW_DISAGREEMENT_TARGET_MISMATCH");
    }
  }
}

export class SyntheticCommunityResearchPipelineService {
  private readonly clusters = new Map<string, CommunitySignalCluster>();
  private readonly questions = new Map<string, CommunityResearchQuestionExecution>();
  private readonly checks = new Map<string, CommunityQuestionEvidenceCheck>();
  private readonly proposals = new Map<string, CommunityResearchProposal>();

  registerCluster(input: unknown): CommunitySignalCluster {
    const cluster = communitySignalClusterSchema.parse(input);
    const exactKey = this.versionKey(cluster.clusterId, cluster.clusterVersion);
    const exact = this.clusters.get(exactKey);
    if (exact !== undefined) {
      if (stableJson(exact) !== stableJson(cluster)) {
        throw new Error("COMMUNITY_RESEARCH_CLUSTER_VERSION_COLLISION");
      }
      return structuredClone(exact);
    }
    const latest = this.latestVersion(this.clusters, cluster.clusterId);
    if (
      (latest === 0 && cluster.clusterVersion !== 1) ||
      (latest > 0 && cluster.clusterVersion !== latest + 1)
    ) {
      throw new Error("COMMUNITY_RESEARCH_CLUSTER_VERSION_GAP");
    }
    this.clusters.set(exactKey, cluster);
    return structuredClone(cluster);
  }

  createQuestion(
    questionInput: unknown,
    clusterDependencies: Array<{ clusterId: string; clusterVersion: number }>,
  ): CommunityResearchQuestionExecution {
    const question = communityResearchQuestionSchema.parse(questionInput);
    const execution = communityResearchQuestionExecutionSchema.parse({
      synthetic: true,
      question,
      clusterDependencies,
    });
    for (const dependency of execution.clusterDependencies) {
      if (!this.clusters.has(this.versionKey(dependency.clusterId, dependency.clusterVersion))) {
        throw new Error(
          `COMMUNITY_RESEARCH_CLUSTER_VERSION_NOT_FOUND cluster=${dependency.clusterId} version=${dependency.clusterVersion}`,
        );
      }
    }
    const exactKey = this.versionKey(question.questionId, question.questionVersion);
    const exact = this.questions.get(exactKey);
    if (exact !== undefined) {
      if (stableJson(exact) !== stableJson(execution)) {
        throw new Error("COMMUNITY_RESEARCH_QUESTION_VERSION_COLLISION");
      }
      return structuredClone(exact);
    }
    const latest = this.latestVersion(this.questions, question.questionId);
    if (
      (latest === 0 && question.questionVersion !== 1) ||
      (latest > 0 && question.questionVersion !== latest + 1)
    ) {
      throw new Error("COMMUNITY_RESEARCH_QUESTION_VERSION_GAP");
    }
    this.questions.set(exactKey, execution);
    return structuredClone(execution);
  }

  recordEvidenceCheck(input: unknown): CommunityQuestionEvidenceCheck {
    const check = communityQuestionEvidenceCheckSchema.parse(input);
    if (!this.questions.has(this.versionKey(check.questionId, check.questionVersion))) {
      throw new Error("COMMUNITY_RESEARCH_QUESTION_VERSION_NOT_FOUND");
    }
    const prior = this.checks.get(check.evidenceCheckId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(check)) {
        throw new Error("COMMUNITY_RESEARCH_EVIDENCE_CHECK_COLLISION");
      }
      return structuredClone(prior);
    }
    this.checks.set(check.evidenceCheckId, check);
    return structuredClone(check);
  }

  createProposal(
    proposalInput: unknown,
    evidenceCheckId: string,
  ): CommunityResearchProposal {
    const proposal = communityResearchProposalSchema.parse(proposalInput);
    const check = this.checks.get(evidenceCheckId);
    if (check === undefined) {
      throw new Error("COMMUNITY_RESEARCH_EVIDENCE_CHECK_NOT_FOUND");
    }
    if (
      proposal.questionId !== check.questionId ||
      proposal.questionVersion !== check.questionVersion
    ) {
      throw new Error("COMMUNITY_RESEARCH_PROPOSAL_QUESTION_VERSION_MISMATCH");
    }
    if (check.matchedEvidenceStatus === "ANSWERED_FOR_SCOPE") {
      throw new Error("COMMUNITY_RESEARCH_PROPOSAL_SCOPE_ALREADY_ANSWERED");
    }
    const exactKey = this.versionKey(proposal.proposalId, proposal.proposalVersion);
    const exact = this.proposals.get(exactKey);
    if (exact !== undefined) {
      if (stableJson(exact) !== stableJson(proposal)) {
        throw new Error("COMMUNITY_RESEARCH_PROPOSAL_VERSION_COLLISION");
      }
      return structuredClone(exact);
    }
    const latest = this.latestVersion(this.proposals, proposal.proposalId);
    if (
      (latest === 0 && proposal.proposalVersion !== 1) ||
      (latest > 0 && proposal.proposalVersion !== latest + 1)
    ) {
      throw new Error("COMMUNITY_RESEARCH_PROPOSAL_VERSION_GAP");
    }
    this.proposals.set(exactKey, proposal);
    return structuredClone(proposal);
  }

  private versionKey(id: string, version: number): string {
    return `${id}:${version}`;
  }

  private latestVersion<T>(records: Map<string, T>, id: string): number {
    let latest = 0;
    for (const key of records.keys()) {
      if (!key.startsWith(`${id}:`)) continue;
      const version = Number(key.slice(id.length + 1));
      if (Number.isInteger(version) && version > latest) latest = version;
    }
    return latest;
  }
}
