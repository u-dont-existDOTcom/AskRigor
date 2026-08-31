import { describe, expect, it } from "vitest";

import {
  communityIntegritySignalSchema,
  communityModerationEventSchema,
  communityPublicationLifecycleEventSchema,
  communityResearchProposalSchema,
  communityResearchQuestionSchema,
  communityReviewDisagreementSchema,
  communityScientificAnnotationSchema,
  communitySignalClusterSchema,
  communityWithdrawalPropagationReceiptSchema,
} from "../packages/contracts/src/index.js";
import {
  sha256,
  SyntheticCommunityIntegrityService,
  SyntheticCommunityLifecycleService,
  SyntheticCommunityResearchPipelineService,
} from "../packages/evidence-repository/src/index.js";

const AT = "2026-08-30T23:30:00.000Z";
const LATER = "2026-08-30T23:31:00.000Z";
const MEANING = sha256("synthetic source meaning");

function integritySignal(
  kind:
    | "COMMERCIAL_COORDINATION"
    | "SOCKPUPPET_COORDINATION"
    | "VOTE_BRIGADING"
    | "IMPERSONATION"
    | "REIDENTIFICATION_ATTEMPT"
    | "DANGEROUS_INSTRUCTION",
  requiredQueueTypes: Array<"MODERATION" | "PRIVACY" | "SCIENTIFIC" | "SAFETY">,
) {
  return communityIntegritySignalSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    integritySignalId: `ARINT-${kind}0001`,
    kind,
    targetType: "LEAD",
    targetId: "ARLEAD-SYNTHHOSTILE01",
    sourceMeaningSha256Before: MEANING,
    sourceMeaningSha256After: MEANING,
    verificationStateBefore: "UNVERIFIED",
    verificationStateAfter: "UNVERIFIED",
    evidenceCapabilityBefore: "DESCRIPTIVE_REPORT_ONLY",
    evidenceCapabilityAfter: "DESCRIPTIVE_REPORT_ONLY",
    formalEvidenceRelationshipBefore: "NOT_CHECKED",
    formalEvidenceRelationshipAfter: "NOT_CHECKED",
    independentSourceCountBefore: 1,
    independentSourceCountAfter: 1,
    engagement: { views: 1_000_000, replies: 40_000, votes: 900_000 },
    engagementAffectsEvidenceState: false,
    requiredQueueTypes,
    automatedRegulatoryReporting: false,
    createdAt: AT,
  });
}

function queue(
  suffix: string,
  queueType: "MODERATION" | "PRIVACY" | "SCIENTIFIC" | "SAFETY",
) {
  const requiredCapability = {
    MODERATION: "MODERATE_CONDUCT",
    PRIVACY: "REVIEW_PRIVACY",
    SCIENTIFIC: "ANNOTATE_SCIENCE",
    SAFETY: "TRIAGE_SAFETY",
  }[queueType];
  return {
    synthetic: true as const,
    queueItemId: `ARQUEUE-SYNTH${suffix}`,
    queueType,
    requiredCapability,
    targetType: "LEAD" as const,
    targetId: "ARLEAD-SYNTHHOSTILE01",
    originatorActorId: "ARSYN-INTEGRITYSYSTEM01",
    independentReviewRequired: true,
    sourceMeaningSha256: MEANING,
    seriousness:
      queueType === "SAFETY" ? ("UNKNOWN" as const) : ("NOT_APPLICABLE" as const),
    automatedRegulatoryReporting: false as const,
    status: "QUEUED" as const,
    createdAt: AT,
  };
}

function cluster(version = 1, memberLeadIds = ["ARLEAD-SYNTHHOSTILE01"]) {
  return communitySignalClusterSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    clusterId: "ARCL-SYNTHHOSTILE01",
    clusterVersion: version,
    scope: {
      condition: "Synthetic condition",
      population: null,
      interventionOrExposure: "Synthetic exposure",
      comparator: null,
      outcome: "Synthetic outcome",
      horizon: null,
    },
    programFingerprint: "synthetic-hostile-lifecycle-v1",
    memberLeadIds,
    independentSourceCount: memberLeadIds.length,
    directionCounts: {
      improved: memberLeadIds.length,
      worsened: 0,
      noClearChange: 0,
      mixed: 0,
      unknown: 0,
    },
    duplicateHandling: "Synthetic members use distinct independence keys.",
    formalEvidenceRelationship: "NOT_CHECKED",
    denominatorAvailable: false,
    effectivenessPercentageDisplayPermitted: false,
    limitations: ["Synthetic descriptive reports are not efficacy evidence."],
    createdAt: AT,
  });
}

function completeWithdrawalLifecycle(
  service: SyntheticCommunityLifecycleService,
) {
  const base = {
    schemaVersion: "0.1.0" as const,
    synthetic: true as const,
    labOnly: true as const,
    publicVersionId: "ARPUB-SYNTHLIFECYCLE01",
    leadId: "ARLEAD-SYNTHHOSTILE01",
    leadVersion: 1,
    verificationStateBefore: "UNVERIFIED" as const,
    verificationStateAfter: "UNVERIFIED" as const,
    evidenceCapabilityBefore: "DESCRIPTIVE_REPORT_ONLY" as const,
    evidenceCapabilityAfter: "DESCRIPTIVE_REPORT_ONLY" as const,
    formalEvidenceRelationshipBefore: "NOT_CHECKED" as const,
    formalEvidenceRelationshipAfter: "NOT_CHECKED" as const,
    occurredAt: AT,
  };
  const transitions = [
    ["ARLIFE-SYNTHWDRAFT0001", null, "DRAFT", "NOT_VISIBLE", "NOT_VISIBLE"],
    [
      "ARLIFE-SYNTHWREVIEW001",
      "DRAFT",
      "PRIVACY_REVIEW",
      "NOT_VISIBLE",
      "NOT_VISIBLE",
    ],
    [
      "ARLIFE-SYNTHWAPPROVE01",
      "PRIVACY_REVIEW",
      "APPROVED",
      "NOT_VISIBLE",
      "NOT_VISIBLE",
    ],
    [
      "ARLIFE-SYNTHWPROJECT01",
      "APPROVED",
      "SYNTHETIC_LAB_PROJECTION",
      "NOT_VISIBLE",
      "SYNTHETIC_LAB_ONLY",
    ],
    [
      "ARLIFE-SYNTHWWITHDRAW01",
      "SYNTHETIC_LAB_PROJECTION",
      "WITHDRAWN",
      "SYNTHETIC_LAB_ONLY",
      "NOT_VISIBLE",
    ],
  ] as const;
  for (const [lifecycleEventId, fromState, toState, visibilityBefore, visibilityAfter] of transitions) {
    service.recordPublicationTransition({
      ...base,
      lifecycleEventId,
      fromState,
      toState,
      visibilityBefore,
      visibilityAfter,
    });
  }
  return {
    synthetic: true as const,
    withdrawalEventId: "ARWITH-SYNTHWITHDRAW01",
    requesterType: "REPORTER" as const,
    targetRecordIds: [base.publicVersionId],
    requestedAt: LATER,
    propagationState: "COMPLETE" as const,
    publicContentRetained: false as const,
  };
}

describe("hostile manipulation routing", () => {
  it("routes brigading and sockpuppet signals without upgrading evidence or independence", () => {
    const service = new SyntheticCommunityIntegrityService();
    const brigade = integritySignal("VOTE_BRIGADING", ["MODERATION", "SCIENTIFIC"]);
    const routed = service.routeSignal(brigade, [
      queue("BRIGADEMOD01", "MODERATION"),
      queue("BRIGADESCI01", "SCIENTIFIC"),
    ]);

    expect(routed.signal.engagement.votes).toBe(900_000);
    expect(routed.signal.engagementAffectsEvidenceState).toBe(false);
    expect(routed.signal.evidenceCapabilityAfter).toBe(
      routed.signal.evidenceCapabilityBefore,
    );
    expect(routed.signal.independentSourceCountAfter).toBe(1);
    expect(routed.queueItems.map((item) => item.queueType).sort()).toEqual([
      "MODERATION",
      "SCIENTIFIC",
    ]);

    expect(() =>
      communityIntegritySignalSchema.parse({
        ...integritySignal("SOCKPUPPET_COORDINATION", ["MODERATION", "SCIENTIFIC"]),
        independentSourceCountAfter: 2,
      }),
    ).toThrow();
    expect(() =>
      service.routeSignal(
        integritySignal("COMMERCIAL_COORDINATION", ["MODERATION", "SCIENTIFIC"]),
        [queue("COMMERCIALMOD01", "MODERATION")],
      ),
    ).toThrow("COMMUNITY_INTEGRITY_REQUIRED_QUEUE_MISSING");
  });

  it("routes dangerous instructions and reidentification to human queues without automated reporting", () => {
    const service = new SyntheticCommunityIntegrityService();
    const dangerous = service.routeSignal(
      integritySignal("DANGEROUS_INSTRUCTION", ["MODERATION", "SAFETY"]),
      [
        queue("DANGERROUTEMOD01", "MODERATION"),
        queue("DANGERROUTESAFE01", "SAFETY"),
      ],
    );
    expect(dangerous.queueItems.find((item) => item.queueType === "SAFETY")).toMatchObject({
      independentReviewRequired: true,
      automatedRegulatoryReporting: false,
      status: "QUEUED",
    });

    const privacy = service.routeSignal(
      integritySignal("REIDENTIFICATION_ATTEMPT", ["MODERATION", "PRIVACY"]),
      [
        queue("REIDENTMOD01", "MODERATION"),
        queue("REIDENTPRIV01", "PRIVACY"),
      ],
    );
    expect(privacy.queueItems.map((item) => item.queueType).sort()).toEqual([
      "MODERATION",
      "PRIVACY",
    ]);
  });
});

describe("discipline and publication lifecycle separation", () => {
  it("keeps moderation action, scientific disagreement, and source meaning separate", () => {
    const service = new SyntheticCommunityLifecycleService();
    const moderation = communityModerationEventSchema.parse({
      synthetic: true,
      eventId: "ARMOD-SYNTHDISAGREE01",
      targetType: "LEAD",
      targetId: "ARLEAD-SYNTHHOSTILE01",
      actorRole: "GLOBAL_MODERATOR",
      action: "HIDE",
      reason: "Synthetic conduct-only moderation fixture.",
      appealable: true,
      occurredAt: AT,
    });
    const annotation = communityScientificAnnotationSchema.parse({
      synthetic: true,
      annotationId: "ARANN-SYNTHDISAGREE01",
      targetType: "LEAD",
      targetId: "ARLEAD-SYNTHHOSTILE01",
      annotationType: "UNRESOLVED_DISPUTE",
      annotationText: "Synthetic evidence interpretation remains disputed.",
      actorRole: "SCIENTIFIC_ANNOTATOR",
      occurredAt: LATER,
      appealable: true,
    });
    const disagreement = communityReviewDisagreementSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      disagreementId: "ARDIS-SYNTHSEPARATE01",
      targetType: "LEAD",
      targetId: "ARLEAD-SYNTHHOSTILE01",
      moderationEventId: moderation.eventId,
      moderationDisposition: "CONDUCT_ACTION_RECORDED",
      scientificAnnotationId: annotation.annotationId,
      scientificDisposition: "UNRESOLVED",
      sourceMeaningSha256Before: MEANING,
      sourceMeaningSha256After: MEANING,
      status: "OPEN",
      recordedAt: LATER,
    });

    expect(
      service.recordDisagreement(disagreement, moderation, annotation),
    ).toMatchObject({ status: "OPEN", scientificDisposition: "UNRESOLVED" });
    expect(() =>
      communityReviewDisagreementSchema.parse({
        ...disagreement,
        sourceMeaningSha256After: sha256("rewritten meaning"),
      }),
    ).toThrow();
  });

  it("makes approval and actual lab visibility distinct append-only transitions", () => {
    const service = new SyntheticCommunityLifecycleService();
    const base = {
      schemaVersion: "0.1.0" as const,
      synthetic: true as const,
      labOnly: true as const,
      publicVersionId: "ARPUB-SYNTHLIFECYCLE01",
      leadId: "ARLEAD-SYNTHHOSTILE01",
      leadVersion: 1,
      verificationStateBefore: "UNVERIFIED",
      verificationStateAfter: "UNVERIFIED",
      evidenceCapabilityBefore: "DESCRIPTIVE_REPORT_ONLY",
      evidenceCapabilityAfter: "DESCRIPTIVE_REPORT_ONLY",
      formalEvidenceRelationshipBefore: "NOT_CHECKED",
      formalEvidenceRelationshipAfter: "NOT_CHECKED",
    };
    service.recordPublicationTransition(
      communityPublicationLifecycleEventSchema.parse({
        ...base,
        lifecycleEventId: "ARLIFE-SYNTHDRAFT0001",
        fromState: null,
        toState: "DRAFT",
        visibilityBefore: "NOT_VISIBLE",
        visibilityAfter: "NOT_VISIBLE",
        occurredAt: AT,
      }),
    );
    service.recordPublicationTransition(
      communityPublicationLifecycleEventSchema.parse({
        ...base,
        lifecycleEventId: "ARLIFE-SYNTHREVIEW001",
        fromState: "DRAFT",
        toState: "PRIVACY_REVIEW",
        visibilityBefore: "NOT_VISIBLE",
        visibilityAfter: "NOT_VISIBLE",
        occurredAt: AT,
      }),
    );
    const approved = service.recordPublicationTransition(
      communityPublicationLifecycleEventSchema.parse({
        ...base,
        lifecycleEventId: "ARLIFE-SYNTHAPPROVE01",
        fromState: "PRIVACY_REVIEW",
        toState: "APPROVED",
        visibilityBefore: "NOT_VISIBLE",
        visibilityAfter: "NOT_VISIBLE",
        occurredAt: LATER,
      }),
    );
    expect(approved.visibilityAfter).toBe("NOT_VISIBLE");

    const projected = service.recordPublicationTransition(
      communityPublicationLifecycleEventSchema.parse({
        ...base,
        lifecycleEventId: "ARLIFE-SYNTHPROJECT01",
        fromState: "APPROVED",
        toState: "SYNTHETIC_LAB_PROJECTION",
        visibilityBefore: "NOT_VISIBLE",
        visibilityAfter: "SYNTHETIC_LAB_ONLY",
        occurredAt: LATER,
      }),
    );
    expect(projected.visibilityAfter).toBe("SYNTHETIC_LAB_ONLY");
    const challenged = service.recordPublicationTransition(
      communityPublicationLifecycleEventSchema.parse({
        ...base,
        lifecycleEventId: "ARLIFE-SYNTHCHALLENGE01",
        fromState: "SYNTHETIC_LAB_PROJECTION",
        toState: "CHALLENGED",
        visibilityBefore: "SYNTHETIC_LAB_ONLY",
        visibilityAfter: "SYNTHETIC_LAB_ONLY",
        occurredAt: LATER,
      }),
    );
    expect(challenged).toMatchObject({
      toState: "CHALLENGED",
      visibilityAfter: "SYNTHETIC_LAB_ONLY",
    });
    expect(() =>
      communityPublicationLifecycleEventSchema.parse({
        ...projected,
        lifecycleEventId: "ARLIFE-INVALIDAPPROVAL01",
        fromState: "PRIVACY_REVIEW",
        toState: "APPROVED",
        visibilityAfter: "SYNTHETIC_LAB_ONLY",
      }),
    ).toThrow();
  });
});

describe("withdrawal propagation and research continuation", () => {
  it("removes one exact projection and invalidates downstream cluster-derived work without erasing provenance", () => {
    const service = new SyntheticCommunityLifecycleService();
    const withdrawal = completeWithdrawalLifecycle(service);
    const receipt = communityWithdrawalPropagationReceiptSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      propagationReceiptId: "ARPROPAGATE-SYNTHWITHDRAW01",
      withdrawalEventId: "ARWITH-SYNTHWITHDRAW01",
      publicVersionId: "ARPUB-SYNTHLIFECYCLE01",
      leadId: "ARLEAD-SYNTHHOSTILE01",
      leadVersion: 1,
      exactProjectionRemoved: true,
      publicContentRetained: false,
      provenanceRetained: true,
      clusterChanges: [
        {
          clusterId: "ARCL-SYNTHHOSTILE01",
          fromClusterVersion: 1,
          toClusterVersion: null,
          disposition: "RETIRED_EMPTY",
        },
      ],
      affectedQuestions: [
        {
          questionId: "ARQ-SYNTHHOSTILE01",
          questionVersion: 1,
          dependencyState: "REVIEW_REQUIRED",
        },
      ],
      affectedProposals: [
        {
          proposalId: "ARPROP-SYNTHHOSTILE01",
          proposalVersion: 1,
          dependencyState: "REVIEW_REQUIRED",
        },
      ],
      propagationState: "COMPLETE",
      completedAt: LATER,
    });
    expect(service.recordWithdrawalPropagation(receipt, withdrawal)).toMatchObject({
      exactProjectionRemoved: true,
      publicContentRetained: false,
      provenanceRetained: true,
      propagationState: "COMPLETE",
    });
    expect(() =>
      communityWithdrawalPropagationReceiptSchema.parse({
        ...receipt,
        publicContentRetained: true,
      }),
    ).toThrow();
  });

  it("binds cluster versions to questions, checks, and nonrecruiting proposals", () => {
    const service = new SyntheticCommunityResearchPipelineService();
    service.registerCluster(cluster());
    const question = communityResearchQuestionSchema.parse({
      synthetic: true,
      questionId: "ARQ-SYNTHHOSTILE01",
      questionVersion: 1,
      derivedFromClusterIds: ["ARCL-SYNTHHOSTILE01"],
      questionText: "What evidence could distinguish the synthetic signal?",
      evidenceCheckStatus: "NOT_CHECKED",
      status: "EVIDENCE_CHECK",
      createdAt: AT,
    });
    const execution = service.createQuestion(question, [
      { clusterId: "ARCL-SYNTHHOSTILE01", clusterVersion: 1 },
    ]);
    expect(execution.clusterDependencies).toEqual([
      { clusterId: "ARCL-SYNTHHOSTILE01", clusterVersion: 1 },
    ]);
    const check = service.recordEvidenceCheck({
      synthetic: true,
      evidenceCheckId: "AREC-SYNTHHOSTILE01",
      questionId: question.questionId,
      questionVersion: 1,
      matchedEvidenceStatus: "NOT_ANSWERED",
      summary: "Synthetic exact-scope check found an unresolved question.",
      evidenceIdentifiers: [],
      checkedAt: LATER,
    });
    const proposal = communityResearchProposalSchema.parse({
      synthetic: true,
      proposalId: "ARPROP-SYNTHHOSTILE01",
      proposalVersion: 1,
      questionId: question.questionId,
      questionVersion: 1,
      proposalType: "TARGETED_REVIEW",
      designSummary: "Synthetic nonrecruiting targeted review fixture.",
      ethicsState: "REVIEW_REQUIRED",
      privacyState: "REVIEW_REQUIRED",
      safetyState: "REVIEW_REQUIRED",
      methodsReviewState: "NOT_REVIEWED",
      recruitmentActive: false,
      status: "DRAFT",
      createdAt: LATER,
    });
    expect(service.createProposal(proposal, check.evidenceCheckId)).toMatchObject({
      recruitmentActive: false,
      questionVersion: 1,
    });

    expect(() =>
      service.createQuestion(
        { ...question, questionVersion: 3, createdAt: LATER },
        [{ clusterId: "ARCL-SYNTHHOSTILE01", clusterVersion: 1 }],
      ),
    ).toThrow("COMMUNITY_RESEARCH_QUESTION_VERSION_GAP");
    expect(() =>
      service.createQuestion(
        {
          ...question,
          questionId: "ARQ-SYNTHMISSINGCL01",
          derivedFromClusterIds: ["ARCL-SYNTHMISSING01"],
        },
        [{ clusterId: "ARCL-SYNTHMISSING01", clusterVersion: 1 }],
      ),
    ).toThrow("COMMUNITY_RESEARCH_CLUSTER_VERSION_NOT_FOUND");

    const answeredService = new SyntheticCommunityResearchPipelineService();
    answeredService.registerCluster(cluster());
    answeredService.createQuestion(question, [
      { clusterId: "ARCL-SYNTHHOSTILE01", clusterVersion: 1 },
    ]);
    const answered = answeredService.recordEvidenceCheck({
      ...check,
      evidenceCheckId: "AREC-SYNTHANSWERED01",
      matchedEvidenceStatus: "ANSWERED_FOR_SCOPE",
    });
    expect(() => answeredService.createProposal(proposal, answered.evidenceCheckId)).toThrow(
      "COMMUNITY_RESEARCH_PROPOSAL_SCOPE_ALREADY_ANSWERED",
    );
  });
});
