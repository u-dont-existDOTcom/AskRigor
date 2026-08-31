import { describe, expect, it } from "vitest";

import {
  assertCommunityPublicationPreservesEvidence,
  communityDeletedSourceRetentionDecisionSchema,
  communityExternalSourceExtractionBoundarySchema,
  communityLeadSchema,
  communityPrivacyPublicationGateSchema,
  communityPrivateIntakeBoundarySchema,
  communityPublicVersionSchema,
} from "../packages/contracts/src/index.js";
import {
  sha256,
  syntheticPublicLeadProjectionSha256,
  SyntheticCommunityLeadService,
  SyntheticCommunityPrivacyProvenanceService,
  type CommunityPrivacyGateDependencies,
} from "../packages/evidence-repository/src/index.js";

const AT = "2026-08-31T00:30:00.000Z";

function consent(decision: "YES" | "NO" | "WITHDRAWN" | "NOT_ASKED") {
  return {
    decision,
    noticeVersion: "synthetic-privacy-provenance-v1",
    noticeSha256: sha256("synthetic privacy provenance notice"),
    decidedAt: AT,
    actorType: "REPORTER" as const,
  };
}

function privacyGate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    gateId: "ARPRIVGATE-SYNTHRARE0001",
    publicVersionId: "ARPUB-SYNTHPRIVACY0001",
    leadId: "ARLEAD-SYNTHPRIVACY0001",
    leadVersion: 1,
    riskFlagsBefore: [],
    riskFlagsAfter: [],
    generalizationApplied: false,
    minorStatus: "ADULT",
    guardianConsentState: "NOT_APPLICABLE",
    legalPrivacyReviewState: "APPROVED",
    ordinaryProjectionPermitted: true,
    decision: "ELIGIBLE_SYNTHETIC_LAB",
    assessedAt: AT,
    ...overrides,
  };
}

function gateDependencies(
  overrides: Partial<CommunityPrivacyGateDependencies> = {},
): CommunityPrivacyGateDependencies {
  return {
    publicVersionId: "ARPUB-SYNTHPRIVACY0001",
    leadId: "ARLEAD-SYNTHPRIVACY0001",
    leadVersion: 1,
    minorStatus: "ADULT" as const,
    residualPrivacyRiskFlags: [],
    ...overrides,
  };
}

function externalExtraction(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    extractionId: "AREXTRACT-SYNTHEXTERNAL0001",
    externalSourceId: "ARSYN-EXTERNALSOURCE0001",
    sourceUrl: "https://public-source.synthetic.invalid/report/1",
    sourceVisibility: "PUBLIC",
    providerTermsState: "ALLOWED",
    attributionState: "COMPLETE",
    quotationState: "NONE",
    privacyState: "PASS",
    deletionState: "ACTIVE",
    rawSourceBodyPersisted: false,
    publicationEligible: true,
    decision: "ELIGIBLE_SYNTHETIC_LAB",
    assessedAt: AT,
    ...overrides,
  };
}

describe("exact reidentification and minor gates", () => {
  it("holds rare combinations until every residual signal is generalized away", () => {
    const service = new SyntheticCommunityPrivacyProvenanceService();
    const rareSignals: CommunityPrivacyGateDependencies["residualPrivacyRiskFlags"] = [
      "RARE_COMBINATION",
      "PRECISE_LOCATION",
      "CLINICIAN_OR_CLINIC",
      "EXACT_DATE_OR_AGE",
    ];
    const initial = service.evaluatePublicationGate(
      privacyGate({
        riskFlagsBefore: rareSignals,
        riskFlagsAfter: rareSignals,
        decision: "HOLD_REIDENTIFICATION",
        ordinaryProjectionPermitted: false,
      }),
      gateDependencies({ residualPrivacyRiskFlags: rareSignals }),
    );
    expect(initial).toMatchObject({
      generalizationApplied: false,
      decision: "HOLD_REIDENTIFICATION",
      ordinaryProjectionPermitted: false,
    });

    expect(
      service.evaluatePublicationGate(
        privacyGate({
          gateId: "ARPRIVGATE-SYNTHRARE0002",
          riskFlagsBefore: rareSignals,
          riskFlagsAfter: ["RARE_COMBINATION"],
          generalizationApplied: true,
          decision: "HOLD_REIDENTIFICATION",
          ordinaryProjectionPermitted: false,
        }),
        gateDependencies({ residualPrivacyRiskFlags: ["RARE_COMBINATION"] }),
      ).riskFlagsAfter,
    ).toEqual(["RARE_COMBINATION"]);

    expect(
      service.evaluatePublicationGate(
        privacyGate({
          gateId: "ARPRIVGATE-SYNTHRARE0003",
          riskFlagsBefore: rareSignals,
          riskFlagsAfter: [],
          generalizationApplied: true,
        }),
        gateDependencies(),
      ).decision,
    ).toBe("ELIGIBLE_SYNTHETIC_LAB");

    expect(() =>
      communityPrivacyPublicationGateSchema.parse(
        privacyGate({
          gateId: "ARPRIVGATE-SYNTHRARE0004",
          riskFlagsBefore: rareSignals,
          riskFlagsAfter: ["PRECISE_LOCATION"],
          generalizationApplied: true,
        }),
      ),
    ).toThrow();
  });

  it("blocks ordinary projection for minors and unknown ages even without direct identifiers", () => {
    const service = new SyntheticCommunityPrivacyProvenanceService();
    for (const minorStatus of ["MINOR", "UNKNOWN"] as const) {
      const held = service.evaluatePublicationGate(
        privacyGate({
          gateId: `ARPRIVGATE-SYNTH${minorStatus}0001`,
          minorStatus,
          guardianConsentState: "PENDING",
          legalPrivacyReviewState: "REVIEW_REQUIRED",
          ordinaryProjectionPermitted: false,
          decision: "HOLD_MINOR_REVIEW",
        }),
        gateDependencies({ minorStatus }),
      );
      expect(held).toMatchObject({
        minorStatus,
        ordinaryProjectionPermitted: false,
        decision: "HOLD_MINOR_REVIEW",
      });
    }

    expect(() =>
      communityPrivacyPublicationGateSchema.parse(
        privacyGate({
          gateId: "ARPRIVGATE-SYNTHMINOR0002",
          minorStatus: "MINOR",
          guardianConsentState: "APPROVED",
          legalPrivacyReviewState: "APPROVED",
        }),
      ),
    ).toThrow();
    expect(() =>
      service.evaluatePublicationGate(
        privacyGate({
          gateId: "ARPRIVGATE-SYNTHMINOR0003",
          minorStatus: "MINOR",
          guardianConsentState: "PENDING",
          legalPrivacyReviewState: "REVIEW_REQUIRED",
          ordinaryProjectionPermitted: false,
          decision: "HOLD_MINOR_REVIEW",
        }),
        gateDependencies({ minorStatus: "ADULT" }),
      ),
    ).toThrow("COMMUNITY_PRIVACY_PUBLICATION_GATE_DEPENDENCY_MISMATCH");
  });
});

describe("weak evidence remains independent from public visibility", () => {
  it("permits a deidentified, consented, incomplete multi-hop lead without upgrading it", () => {
    const lead = communityLeadSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      leadId: "ARLEAD-SYNTHHEARSAY0001",
      leadVersion: 1,
      sourceReferences: [
        {
          synthetic: true,
          sourceEventId: "AREVT-SYNTHHEARSAY0001",
          forumInstanceId: "ASKRIGOR-SYNTHETIC-LAB",
          topicId: "SYNTHETIC-TOPIC-9201",
          postId: "SYNTHETIC-POST-9201",
          sourceVersion: 1,
          sourceVisibility: "PUBLIC",
          authorAccountId: "ARSYN-HEARSAYREPORTER01",
          occurredAt: AT,
          contentSha256: sha256("synthetic low-detail hearsay source"),
          rawForumBodyPersisted: false,
        },
      ],
      reporter: {
        accountId: "ARSYN-HEARSAYREPORTER01",
        role: "OTHER",
        informationOrigin: "THIRD_PARTY_RELAYED",
        sourceDistance: "MULTI_HOP_HEARSAY",
        verificationState: "UNVERIFIED",
      },
      subjectBoundary: {
        subjectIdentifiableInPublicVersion: false,
        directSubjectQuotePresent: false,
        subjectDocumentsOrMediaPresent: false,
        subjectExactVersionApproval: null,
        minorStatus: "ADULT",
      },
      condition: { name: "Synthetic reported condition", diagnosticCertainty: "UNKNOWN" },
      interventionEpisode: {
        episodeType: "UNKNOWN",
        components: [{ name: "Synthetic reported intervention", doseKnown: false, route: null }],
        sequenceKnown: false,
      },
      outcome: {
        name: "Synthetic reported outcome",
        reportedDirection: "UNKNOWN",
        reportedMagnitude: "UNKNOWN",
        measurementType: "UNKNOWN",
      },
      verificationState: "UNVERIFIED",
      evidenceCapability: "LEAD_ONLY",
      formalEvidenceRelationship: "NOT_CHECKED",
      completenessBand: "MINIMAL",
      missingMaterialFields: [
        "subject identity",
        "diagnostic basis",
        "intervention details",
        "timing",
        "outcome measurement",
      ],
      duplicateOrLinkedLeadIds: [],
      reporterPublicLeadConsent: consent("YES"),
      status: "STRUCTURED",
      createdAt: AT,
    });
    const publicCandidate = communityPublicVersionSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      publicVersionId: "ARPUB-SYNTHHEARSAY0001",
      leadId: lead.leadId,
      leadVersion: lead.leadVersion,
      publicationObjectType: "PUBLIC_RESEARCH_LEAD",
      publicTitle: "Synthetic incomplete multi-hop research lead",
      publicParaphrase: "A synthetic reporter relayed an incomplete, multi-hop report with most details unknown.",
      sourceDistanceLabel: "Multi-hop hearsay; neither reporter nor subject verified",
      limitations: ["Synthetic, incomplete, unverified, multi-hop, descriptive, and noncausal."],
      reporterPublicationConsent: consent("YES"),
      subjectExactVersionApproval: null,
      privacyReview: {
        reviewId: "ARPRIV-SYNTHHEARSAY0001",
        outcome: "PASS",
        riskFlags: [],
        reviewedAt: AT,
      },
      abuseReviewState: "PASS",
      jurisdictionPolicyState: "ALLOWED_SYNTHETIC_LAB",
      subjectIdentifiableInPublicVersion: false,
      directSubjectQuotePresent: false,
      documentsOrMediaPresent: false,
      verificationState: "UNVERIFIED",
      evidenceCapability: "LEAD_ONLY",
      formalEvidenceRelationship: "NOT_CHECKED",
      status: "SYNTHETIC_LAB_PROJECTION",
      publicPayloadSha256: "0".repeat(64),
    });
    const publicVersion = communityPublicVersionSchema.parse({
      ...publicCandidate,
      publicPayloadSha256:
        syntheticPublicLeadProjectionSha256(publicCandidate),
    });

    expect(() =>
      assertCommunityPublicationPreservesEvidence(lead, publicVersion),
    ).not.toThrow();
    const service = new SyntheticCommunityLeadService();
    service.createLead(lead);
    expect(service.projectPublicVersion(publicVersion)).toMatchObject({
      verificationState: "UNVERIFIED",
      evidenceCapability: "LEAD_ONLY",
      formalEvidenceRelationship: "NOT_CHECKED",
    });
    expect(publicVersion).toMatchObject({
      verificationState: "UNVERIFIED",
      evidenceCapability: "LEAD_ONLY",
      formalEvidenceRelationship: "NOT_CHECKED",
    });
  });
});

describe("external, deleted, and private provenance boundaries", () => {
  it("requires public access, allowed terms, complete attribution, privacy, and an active source", () => {
    const service = new SyntheticCommunityPrivacyProvenanceService();
    expect(service.recordExternalExtraction(externalExtraction()).publicationEligible).toBe(true);

    const blocked = [
      externalExtraction({
        extractionId: "AREXTRACT-SYNTHPRIVATE0001",
        sourceVisibility: "PRIVATE",
        publicationEligible: false,
        decision: "HOLD_ACCESS_OR_TERMS",
      }),
      externalExtraction({
        extractionId: "AREXTRACT-SYNTHTERMS00001",
        providerTermsState: "REVIEW_REQUIRED",
        publicationEligible: false,
        decision: "HOLD_ACCESS_OR_TERMS",
      }),
      externalExtraction({
        extractionId: "AREXTRACT-SYNTHATTRIB0001",
        attributionState: "INCOMPLETE",
        publicationEligible: false,
        decision: "HOLD_ATTRIBUTION_OR_QUOTATION",
      }),
      externalExtraction({
        extractionId: "AREXTRACT-SYNTHDELETED001",
        sourceVisibility: "DELETED",
        deletionState: "DELETED",
        publicationEligible: false,
        decision: "WITHDRAW_SOURCE_DELETED",
      }),
    ];
    for (const candidate of blocked) {
      expect(service.recordExternalExtraction(candidate).publicationEligible).toBe(false);
    }
    expect(() =>
      communityExternalSourceExtractionBoundarySchema.parse({
        ...blocked[3],
        publicationEligible: true,
        decision: "ELIGIBLE_SYNTHETIC_LAB",
      }),
    ).toThrow();
  });

  it("retains only content-free provenance after deletion under independent consent and policy", () => {
    const service = new SyntheticCommunityPrivacyProvenanceService();
    const retained = service.recordDeletedSourceRetention({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      decisionId: "ARRETENTION-SYNTHDELETED0001",
      sourceEventId: "AREVT-SYNTHDELETED0001",
      sourceVersion: 2,
      leadId: "ARLEAD-SYNTHDELETED0001",
      leadVersion: 1,
      publicVersionId: "ARPUB-SYNTHDELETED0001",
      sourceDeleted: true,
      sourceBodyRetained: false,
      provenanceRetained: true,
      reporterPublicLeadConsentState: "YES",
      leadConsentIndependentOfSourcePost: true,
      privacyPolicyState: "PASS",
      disposition: "RETAIN_DEIDENTIFIED_LEAD",
      assessedAt: AT,
    });
    expect(retained).toMatchObject({
      sourceBodyRetained: false,
      provenanceRetained: true,
      disposition: "RETAIN_DEIDENTIFIED_LEAD",
    });

    expect(() =>
      communityDeletedSourceRetentionDecisionSchema.parse({
        ...retained,
        decisionId: "ARRETENTION-SYNTHDELETED0002",
        reporterPublicLeadConsentState: "WITHDRAWN",
      }),
    ).toThrow();
  });

  it("keeps paid private intake outside the forum and public lead pipeline", () => {
    const service = new SyntheticCommunityPrivacyProvenanceService();
    const boundary = service.recordPrivateIntake({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      boundaryId: "ARPRIVATE-SYNTHPAIDINTAKE01",
      intakeId: "ARSYN-PAIDINTAKE0001",
      intakeClass: "PAID_PRIVATE",
      sourceVisibility: "PRIVATE",
      initialPublicLeadConsentState: "NOT_ASKED",
      forumRecordCreated: false,
      publicProjectionCreated: false,
      laterSeparatePublicLeadWorkflowRequired: true,
      rawIntakeBodyPersisted: false,
      assessedAt: AT,
    });
    expect(boundary).toMatchObject({
      forumRecordCreated: false,
      publicProjectionCreated: false,
      laterSeparatePublicLeadWorkflowRequired: true,
    });
    expect(() =>
      communityPrivateIntakeBoundarySchema.parse({
        ...boundary,
        initialPublicLeadConsentState: "YES",
        publicProjectionCreated: true,
      }),
    ).toThrow();
  });
});
