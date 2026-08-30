import { describe, expect, it } from "vitest";

import {
  communityComposerDraftSchema,
  communityFrontierCardSchema,
  communityOperationalActionSchema,
  communityOperationalQueueItemSchema,
  type CommunityFrontierCard,
} from "../packages/contracts/src/index.js";
import {
  buildSyntheticCommunityFrontierView,
  sha256,
  SyntheticCommunityComposerService,
  SyntheticCommunityOperationsService,
} from "../packages/evidence-repository/src/index.js";

const AT = "2026-08-30T22:45:00.000Z";
const LATER = "2026-08-30T22:46:00.000Z";
const REPORTER = "ARSYN-COMPOSERREPORTER01";

function frontierCard(
  suffix: string,
  reportedDirection: CommunityFrontierCard["reportedDirection"],
  overrides: Partial<CommunityFrontierCard> = {},
): CommunityFrontierCard {
  return communityFrontierCardSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    cardId: `ARCARD-SYNTH${suffix}`,
    publicVersionId: `ARPUB-SYNTH${suffix}`,
    leadId: `ARLEAD-SYNTH${suffix}`,
    leadVersion: 1,
    sourceIndependenceKey: sha256(`synthetic-independent-source-${suffix}`),
    publicTitle: `Synthetic ${reportedDirection.toLowerCase()} report ${suffix}`,
    condition: "Synthetic reported condition",
    diagnosticCertainty: "SELF_IDENTIFIED",
    exactInterventionCombination: ["Synthetic component A"],
    reportedDirection,
    timingAndPersistence: "Synthetic timing remains incomplete.",
    reporterRole: "SELF",
    sourceDistance: "FIRSTHAND_SUBJECT",
    sourceDistanceLabel: "Synthetic firsthand subject report",
    verificationState: "UNVERIFIED",
    completenessBand: "PARTIAL",
    evidenceCapability: "DESCRIPTIVE_REPORT_ONLY",
    formalEvidenceRelationship: "NOT_CHECKED",
    harmsReported: reportedDirection === "WORSENED",
    noEffectReported: reportedDirection === "NO_CLEAR_CHANGE",
    cointerventionsAndConfounders: ["Synthetic cointervention unknown"],
    clusterIds: [],
    challengeCount: 0,
    latestCorrectionLeadVersion: null,
    withdrawn: false,
    researchStatus: "LEAD_ONLY",
    discussionActivity: { views: 0, replies: 0 },
    discussionActivityAffectsEvidenceState: false,
    ...overrides,
  });
}

describe("member-controlled synthetic experience composer", () => {
  it("keeps an ordinary post as conversation and permits an incomplete early stop", () => {
    const service = new SyntheticCommunityComposerService();
    const initial = service.startDraft({
      draftId: "ARDRAFT-SYNTH0001",
      reporterAccountId: REPORTER,
      sourcePostId: "SYNTHETIC-POST-2001",
      updatedAt: AT,
    });

    expect(initial).toMatchObject({
      draftVersion: 1,
      sourcePostDisposition: "ORDINARY_CONVERSATION",
      status: "DRAFT",
      reporter: null,
      condition: null,
      preview: null,
    });
    expect(initial.missingMaterialFields).toContain("reporter relationship");
    expect(() =>
      service.requestSyntheticPublication(
        initial.draftId,
        REPORTER,
        LATER,
      ),
    ).toThrow("COMMUNITY_COMPOSER_PUBLIC_LEAD_OPT_IN_REQUIRED");

    const stopped = service.stopEarly(
      initial.draftId,
      REPORTER,
      "2026-08-30T22:45:30.000Z",
    );
    expect(stopped.status).toBe("STOPPED");
    expect(stopped.missingMaterialFields).toEqual(
      initial.missingMaterialFields,
    );
    expect(stopped.condition).toBeNull();
  });

  it("requires accepted conversion, a reviewable preview, acknowledgement, and affirmative permission", () => {
    const service = new SyntheticCommunityComposerService();
    const draft = service.startDraft({
      draftId: "ARDRAFT-SYNTH0002",
      reporterAccountId: REPORTER,
      sourcePostId: "SYNTHETIC-POST-2002",
      updatedAt: AT,
    });
    service.offerLeadConversion(draft.draftId, AT);
    service.respondToLeadConversion(draft.draftId, REPORTER, "ACCEPTED", AT);
    const detailed = service.recordDetails(
      draft.draftId,
      REPORTER,
      {
        reporter: {
          role: "FRIEND",
          informationOrigin: "SUBJECT_RELAYED_TO_REPORTER",
          sourceDistance: "ONE_HOP_SUBJECT_RELAY",
        },
        condition: {
          name: "Synthetic reported condition",
          diagnosticCertainty: "REPORTED_BY_PROXY",
        },
        interventionEpisode: {
          components: ["Synthetic component A", "Synthetic component B"],
          exactCombinationKnown: true,
        },
        outcome: {
          name: "Synthetic overall symptoms",
          reportedDirection: "MIXED",
          timing: null,
          persistence: null,
        },
        cointerventions: [],
        harms: ["Synthetic transient worsening"],
        unknowns: ["Timing", "Persistence"],
      },
      AT,
    );
    expect(detailed.reporter?.sourceDistance).toBe("ONE_HOP_SUBJECT_RELAY");
    expect(detailed.unknowns).toEqual(["Timing", "Persistence"]);

    const previewed = service.preparePreview(
      draft.draftId,
      REPORTER,
      {
        publicTitle: "Synthetic secondhand combination report",
        publicParaphrase:
          "A synthetic reporter says a synthetic friend described a mixed outcome.",
        sourceDistanceLabel:
          "One-hop report from a friend; not a firsthand subject account",
        limitations: [
          "Synthetic, secondhand, unverified, incomplete, and noncausal.",
        ],
      },
      AT,
    );
    expect(previewed.preview).toMatchObject({
      acknowledgedAt: null,
      sourceDistanceLabel:
        "One-hop report from a friend; not a firsthand subject account",
    });
    expect(previewed.preview?.previewPayloadSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(() =>
      service.requestSyntheticPublication(
        draft.draftId,
        REPORTER,
        LATER,
      ),
    ).toThrow("COMMUNITY_COMPOSER_PUBLIC_LEAD_OPT_IN_REQUIRED");

    service.recordPermission(
      draft.draftId,
      REPORTER,
      "PUBLIC_LEAD",
      "YES",
      AT,
    );
    expect(() =>
      service.requestSyntheticPublication(
        draft.draftId,
        REPORTER,
        LATER,
      ),
    ).toThrow("COMMUNITY_COMPOSER_PREVIEW_ACKNOWLEDGEMENT_REQUIRED");
    service.acknowledgePreview(draft.draftId, REPORTER, LATER);
    const requested = service.requestSyntheticPublication(
      draft.draftId,
      REPORTER,
      LATER,
    );
    expect(requested).toMatchObject({
      status: "SYNTHETIC_PUBLICATION_REQUESTED",
      sourcePostDisposition: "CONVERSION_ACCEPTED",
      permissions: { publicLead: "YES" },
    });
  });

  it("cannot silently convert a declined post or let another account control the draft", () => {
    const service = new SyntheticCommunityComposerService();
    const draft = service.startDraft({
      draftId: "ARDRAFT-SYNTH0003",
      reporterAccountId: REPORTER,
      sourcePostId: "SYNTHETIC-POST-2003",
      updatedAt: AT,
    });
    service.offerLeadConversion(draft.draftId, AT);
    service.respondToLeadConversion(draft.draftId, REPORTER, "DECLINED", AT);
    expect(() =>
      service.recordPermission(
        draft.draftId,
        REPORTER,
        "PUBLIC_LEAD",
        "YES",
        LATER,
      ),
    ).toThrow("COMMUNITY_COMPOSER_CONVERSION_NOT_ACCEPTED");
    expect(() =>
      service.stopEarly(
        draft.draftId,
        "ARSYN-UNRELATEDACCOUNT01",
        LATER,
      ),
    ).toThrow("COMMUNITY_COMPOSER_ACCOUNT_MISMATCH");
  });

  it("treats a directly opened structured intake as explicit lead intent but not publication consent", () => {
    const service = new SyntheticCommunityComposerService();
    const direct = service.startDraft({
      draftId: "ARDRAFT-SYNTHDIRECT01",
      reporterAccountId: REPORTER,
      sourcePostId: null,
      updatedAt: AT,
    });
    expect(direct).toMatchObject({
      entryPoint: "DIRECT_STRUCTURED_INTAKE",
      sourcePostId: null,
      sourcePostDisposition: "NOT_APPLICABLE_DIRECT_INTAKE",
      permissions: { publicLead: "NOT_ASKED" },
    });
    expect(() =>
      service.requestSyntheticPublication(
        direct.draftId,
        REPORTER,
        LATER,
      ),
    ).toThrow("COMMUNITY_COMPOSER_PUBLIC_LEAD_OPT_IN_REQUIRED");
    expect(
      service.recordPermission(
        direct.draftId,
        REPORTER,
        "PUBLIC_LEAD",
        "YES",
        LATER,
      ).permissions.publicLead,
    ).toBe("YES");
  });
});

describe("balanced synthetic public-lead frontier", () => {
  it("interleaves harm, no-effect, benefit, mixed, and unknown without positive-first or popularity ranking", () => {
    const cards = [
      frontierCard("IMPROVED01", "IMPROVED", {
        discussionActivity: { views: 1_000_000, replies: 50_000 },
      }),
      frontierCard("IMPROVED02", "IMPROVED"),
      frontierCard("WORSENED01", "WORSENED"),
      frontierCard("NOEFFECT01", "NO_CLEAR_CHANGE"),
      frontierCard("MIXED0001", "MIXED"),
      frontierCard("UNKNOWN001", "UNKNOWN"),
    ];
    const view = buildSyntheticCommunityFrontierView({
      cards,
      generatedAt: AT,
    });

    expect(view.defaultOrder).toBe("DIRECTION_BALANCED_STABLE");
    expect(view.cards.map((card) => card.reportedDirection).slice(0, 5)).toEqual(
      ["NO_CLEAR_CHANGE", "WORSENED", "IMPROVED", "MIXED", "UNKNOWN"],
    );
    expect(view.cards[0]?.cardId).not.toBe("ARCARD-SYNTHIMPROVED01");
    expect(view.directionCounts).toEqual({
      improved: 2,
      worsened: 1,
      noClearChange: 1,
      mixed: 1,
      unknown: 1,
    });
    expect(view).toMatchObject({
      denominatorAvailable: false,
      effectivenessPercentageDisplayPermitted: false,
      discussionActivityAffectsEvidenceState: false,
    });
    expect(JSON.stringify(view)).not.toContain(
      '"effectivenessPercentageDisplayPermitted":true',
    );
  });

  it("filters explicitly while retaining evidence, version, correction, and withdrawal axes", () => {
    const withdrawnHarm = frontierCard("WITHDRAWN1", "WORSENED", {
      leadVersion: 3,
      verificationState: "CONFLICTED",
      challengeCount: 2,
      latestCorrectionLeadVersion: 3,
      withdrawn: true,
      researchStatus: "FORMAL_EVIDENCE_CONFLICTED",
    });
    const view = buildSyntheticCommunityFrontierView({
      cards: [withdrawnHarm, frontierCard("BENEFIT001", "IMPROVED")],
      filters: { directions: ["WORSENED"], includeWithdrawn: true },
      generatedAt: AT,
    });
    expect(view.cards).toEqual([withdrawnHarm]);
    expect(view.cards[0]).toMatchObject({
      leadVersion: 3,
      verificationState: "CONFLICTED",
      challengeCount: 2,
      latestCorrectionLeadVersion: 3,
      withdrawn: true,
      formalEvidenceRelationship: "NOT_CHECKED",
    });
    expect(view.appliedFilters).toEqual({
      directions: ["WORSENED"],
      includeWithdrawn: true,
    });
  });
});

describe("capability-separated synthetic operational queues", () => {
  it("routes a serious-harm candidate to human safety review without automated reporting", () => {
    const service = new SyntheticCommunityOperationsService();
    service.assignRole({
      synthetic: true,
      assignmentId: "ARROLE-SAFETY0001",
      actorId: "ARSYN-SAFETYREVIEWER01",
      role: "SAFETY_REVIEWER",
      assignedByActorId: "ARSYN-ADMINISTRATOR01",
      active: true,
      assignedAt: AT,
    });
    const sourceMeaningSha256 = sha256("synthetic member meaning v1");
    const queued = service.enqueue({
      synthetic: true,
      queueItemId: "ARQUEUE-SAFETY0001",
      queueType: "SAFETY",
      requiredCapability: "TRIAGE_SAFETY",
      targetType: "LEAD",
      targetId: "ARLEAD-SYNTHSAFETY0001",
      originatorActorId: "ARSYN-ORIGINATOR0001",
      independentReviewRequired: true,
      sourceMeaningSha256,
      seriousness: "SERIOUS",
      automatedRegulatoryReporting: false,
      status: "QUEUED",
      createdAt: AT,
    });
    expect(queued.automatedRegulatoryReporting).toBe(false);

    const action = service.act({
      synthetic: true,
      actionId: "ARACTION-SAFETY0001",
      queueItemId: queued.queueItemId,
      actorId: "ARSYN-SAFETYREVIEWER01",
      activeRole: "SAFETY_REVIEWER",
      capability: "TRIAGE_SAFETY",
      action: "TRIAGE_FOR_HUMAN_REVIEW",
      sourceMeaningSha256Before: sourceMeaningSha256,
      sourceMeaningSha256After: sourceMeaningSha256,
      annotationText: "Synthetic serious-harm candidate requires human review.",
      automatedRegulatoryReporting: false,
      resultingStatus: "IN_REVIEW",
      occurredAt: LATER,
    });
    expect(action).toMatchObject({
      activeRole: "SAFETY_REVIEWER",
      automatedRegulatoryReporting: false,
      resultingStatus: "IN_REVIEW",
    });
  });

  it("rejects role collisions, cross-capability actions, and silent source-meaning edits", () => {
    const service = new SyntheticCommunityOperationsService();
    for (const assignment of [
      {
        assignmentId: "ARROLE-PRIVACY0001",
        actorId: "ARSYN-PRIVACYREVIEWER01",
        role: "PRIVACY_REVIEWER",
      },
      {
        assignmentId: "ARROLE-MODERATOR001",
        actorId: "ARSYN-PRIVACYREVIEWER01",
        role: "GLOBAL_MODERATOR",
      },
      {
        assignmentId: "ARROLE-ORIGINATOR01",
        actorId: "ARSYN-ORIGINATOR0001",
        role: "PRIVACY_REVIEWER",
      },
    ] as const) {
      service.assignRole({
        synthetic: true,
        ...assignment,
        assignedByActorId: "ARSYN-ADMINISTRATOR01",
        active: true,
        assignedAt: AT,
      });
    }
    const sourceMeaningSha256 = sha256("synthetic member meaning v1");
    const queued = communityOperationalQueueItemSchema.parse({
      synthetic: true,
      queueItemId: "ARQUEUE-PRIVACY001",
      queueType: "PRIVACY",
      requiredCapability: "REVIEW_PRIVACY",
      targetType: "PUBLIC_VERSION",
      targetId: "ARPUB-SYNTHPRIVACY0001",
      originatorActorId: "ARSYN-ORIGINATOR0001",
      independentReviewRequired: true,
      sourceMeaningSha256,
      seriousness: "NOT_APPLICABLE",
      automatedRegulatoryReporting: false,
      status: "QUEUED",
      createdAt: AT,
    });
    service.enqueue(queued);

    const baseAction = {
      synthetic: true as const,
      actionId: "ARACTION-PRIVACY001",
      queueItemId: queued.queueItemId,
      actorId: "ARSYN-PRIVACYREVIEWER01",
      activeRole: "PRIVACY_REVIEWER" as const,
      capability: "REVIEW_PRIVACY" as const,
      action: "PRIVACY_PASS" as const,
      sourceMeaningSha256Before: sourceMeaningSha256,
      sourceMeaningSha256After: sourceMeaningSha256,
      annotationText: "Synthetic privacy review annotation.",
      automatedRegulatoryReporting: false as const,
      resultingStatus: "RESOLVED" as const,
      occurredAt: LATER,
    };
    expect(() =>
      service.act({
        ...baseAction,
        actionId: "ARACTION-COLLISION01",
        actorId: queued.originatorActorId,
      }),
    ).toThrow("COMMUNITY_OPERATION_INDEPENDENT_REVIEW_COLLISION");
    expect(() =>
      service.act({
        ...baseAction,
        actionId: "ARACTION-WRONGROLE01",
        activeRole: "GLOBAL_MODERATOR",
      }),
    ).toThrow("COMMUNITY_OPERATION_ROLE_CAPABILITY_MISMATCH");
    expect(() =>
      service.act({
        ...baseAction,
        actionId: "ARACTION-REWRITE001",
        sourceMeaningSha256After: sha256("silently rewritten meaning"),
      }),
    ).toThrow("COMMUNITY_OPERATION_CANNOT_REWRITE_SOURCE_MEANING");
    expect(service.act(baseAction).resultingStatus).toBe("RESOLVED");
  });

  it("makes invalid queue/capability and automated-reporting states unrepresentable", () => {
    expect(() =>
      communityOperationalQueueItemSchema.parse({
        synthetic: true,
        queueItemId: "ARQUEUE-INVALID001",
        queueType: "MODERATION",
        requiredCapability: "ANNOTATE_SCIENCE",
        targetType: "POST",
        targetId: "SYNTHETIC-POST-2999",
        originatorActorId: "ARSYN-ORIGINATOR0001",
        independentReviewRequired: false,
        sourceMeaningSha256: sha256("synthetic source"),
        seriousness: "NOT_APPLICABLE",
        automatedRegulatoryReporting: false,
        status: "QUEUED",
        createdAt: AT,
      }),
    ).toThrow();
    expect(() =>
      communityOperationalActionSchema.parse({
        synthetic: true,
        actionId: "ARACTION-AUTOREPORT01",
        queueItemId: "ARQUEUE-SAFETY0002",
        actorId: "ARSYN-SAFETYREVIEWER01",
        activeRole: "SAFETY_REVIEWER",
        capability: "TRIAGE_SAFETY",
        action: "TRIAGE_FOR_HUMAN_REVIEW",
        sourceMeaningSha256Before: sha256("synthetic source"),
        sourceMeaningSha256After: sha256("synthetic source"),
        annotationText: null,
        automatedRegulatoryReporting: true,
        resultingStatus: "IN_REVIEW",
        occurredAt: LATER,
      }),
    ).toThrow();
    expect(() =>
      communityOperationalActionSchema.parse({
        synthetic: true,
        actionId: "ARACTION-BADSTATUS001",
        queueItemId: "ARQUEUE-SAFETY0002",
        actorId: "ARSYN-SAFETYREVIEWER01",
        activeRole: "SAFETY_REVIEWER",
        capability: "TRIAGE_SAFETY",
        action: "TRIAGE_FOR_HUMAN_REVIEW",
        sourceMeaningSha256Before: sha256("synthetic source"),
        sourceMeaningSha256After: sha256("synthetic source"),
        annotationText: null,
        automatedRegulatoryReporting: false,
        resultingStatus: "RESOLVED",
        occurredAt: LATER,
      }),
    ).toThrow(/resulting queue status/iu);
  });
});
