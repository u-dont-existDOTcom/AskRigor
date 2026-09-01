import { describe, expect, it } from "vitest";

import {
  deterministicUuid,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributorAccessService,
  sha256,
  type ContributionPrivacyBoundary,
  type LivingEvidenceContribution,
  type ResearchFrontierContribution,
} from "../packages/evidence-repository/src/index.js";

const IDENTITY_SECRET = new TextEncoder().encode(
  "synthetic-research-identity-secret-with-at-least-thirty-two-bytes",
);
const SUBJECT = "auth0|synthetic-free-user";
const NOW = "2026-09-01T01:00:00.000Z";
const PRIVACY_BOUNDARY: ContributionPrivacyBoundary = {
  rawChatPersisted: false,
  promptPersisted: false,
  accountIdentityInPayload: false,
  privateHealthNarrativePersisted: false,
  uploadContentPersisted: false,
  rawSourceContentPersisted: false,
  rawProviderResponsePersisted: false,
  communityDataPersisted: false,
};

function agreement() {
  return {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true,
  } as const;
}

function fixture() {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({
    store,
    identitySecret: IDENTITY_SECRET,
    now: () => NOW,
    randomUuid: () => "99999999-9999-4999-a999-999999999999",
  });
  return { store, service };
}

describe("research contributor access", () => {
  it("publishes the exact choice before enrollment and stores only a keyed identity", async () => {
    const { store, service } = fixture();

    await expect(service.inspect(SUBJECT)).resolves.toMatchObject({
      status: "UNENROLLED",
      mode: null,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      notice: RESEARCH_USE_NOTICE,
      paidCheckoutAvailable: false,
    });
    const active = await service.acceptFreeContributor(SUBJECT, agreement());
    expect(active).toMatchObject({
      status: "ACTIVE",
      mode: "FREE_CONTRIBUTOR",
      contributionRequired: true,
      paidCheckoutAvailable: false,
    });

    const records = store.allAccounts();
    expect(records).toHaveLength(1);
    expect(records[0]!.accountKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(records)).not.toContain(SUBJECT);
    expect(records[0]!.agreement).toEqual(agreement());
  });

  it("rejects ambiguous or incomplete free-contributor agreement", async () => {
    const { store, service } = fixture();

    await expect(service.acceptFreeContributor(SUBJECT, {
      ...agreement(),
      eligibleDeidentifiedResearchContributionRequired: false,
    })).rejects.toThrow();
    expect(store.allAccounts()).toHaveLength(0);
  });

  it("preserves a partial formal frontier as a pending, non-authoritative proposal", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const payload = partialFrontier();

    const inserted = await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload,
    });
    expect(inserted.status).toBe("inserted");
    expect(inserted.record).toMatchObject({
      proposalKind: "RESEARCH_FRONTIER",
      partial: true,
      status: "PENDING_REVIEW",
    });
    expect(store.allProposals()).toHaveLength(1);
    expect(JSON.stringify(store.allProposals()[0]!.payload)).not.toContain(SUBJECT);

    const replay = await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload,
    });
    expect(replay.status).toBe("idempotent_replay");
    expect(replay.record.proposalId).toBe(inserted.record.proposalId);
    expect(store.allProposals()).toHaveLength(1);
  });

  it("accepts complete source-bound analysis but rejects topic-only and community analysis", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const sourceAnalysis = completeSourceAnalysis();

    const inserted = await service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: sourceAnalysis,
    });
    expect(inserted.record.partial).toBe(false);
    expect(inserted.record.status).toBe("PENDING_REVIEW");

    const topicOnly = structuredClone(sourceAnalysis);
    topicOnly.source = null;
    topicOnly.analysis.analysisKind = "topic_synthesis";
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: topicOnly,
    })).rejects.toMatchObject({ code: "CONTRIBUTION_PRIVACY_REJECTED" });

    const community = completeSourceAnalysis();
    community.source!.identifiers = [{
      scheme: "url",
      value: "https://www.youtube.com/watch?v=synthetic",
    }];
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: community,
    })).rejects.toMatchObject({ code: "CONTRIBUTION_PRIVACY_REJECTED" });

    expect(store.allProposals()).toHaveLength(1);
  });

  it("rejects prohibited keys and obvious contact details before persistence", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());

    const prohibited = partialFrontier() as unknown as Record<string, unknown>;
    prohibited.rawChat = "private conversation";
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: prohibited,
    })).rejects.toThrow("PROHIBITED_PERSISTENT_KEY");

    const contact = partialFrontier();
    contact.question.normalizedQuestion =
      "Please identify records for private.person@example.com";
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: contact,
    })).rejects.toMatchObject({ code: "CONTRIBUTION_PRIVACY_REJECTED" });
    expect(store.allProposals()).toHaveLength(0);
  });

  it("fails paid-private mode closed without an entitlement and never contributes with one", async () => {
    const { store, service } = fixture();
    await expect(service.activatePaidPrivate(SUBJECT)).rejects.toMatchObject({
      code: "PAID_PRIVATE_ENTITLEMENT_REQUIRED",
    });

    const accountKey = service.accountKeyForSubject(SUBJECT);
    store.grantPrivateEntitlement({
      entitlementId: "88888888-8888-4888-a888-888888888888",
      accountKey,
      status: "ACTIVE",
      source: "OWNER_GRANTED",
      externalReferenceSha256: null,
      grantedAt: "2026-08-31T00:00:00.000Z",
      expiresAt: "2026-09-02T00:00:00.000Z",
      revokedAt: null,
    });
    const active = await service.activatePaidPrivate(SUBJECT);
    expect(active).toMatchObject({
      status: "ACTIVE",
      mode: "PAID_PRIVATE",
      contributionRequired: false,
      privateEntitlementRequired: true,
      paidCheckoutAvailable: false,
    });
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
    })).rejects.toMatchObject({ code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE" });
    expect(store.allProposals()).toHaveLength(0);
  });

  it("blocks all later use after revocation", async () => {
    const { service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.requireActive(SUBJECT)).resolves.toBe("FREE_CONTRIBUTOR");

    const revoked = await service.revoke(SUBJECT);
    expect(revoked.status).toBe("REVOKED");
    await expect(service.requireActive(SUBJECT)).rejects.toMatchObject({
      code: "RESEARCH_ACCESS_REVOKED",
    });
  });

  it("rejects identity secrets that cannot protect a stable OAuth subject", () => {
    expect(() => new ResearchContributorAccessService({
      store: new InMemoryResearchContributorAccessStore(),
      identitySecret: new Uint8Array(31),
    })).toThrow("RESEARCH_IDENTITY_SECRET_TOO_SHORT");
  });
});

function partialFrontier(): ResearchFrontierContribution {
  const base = "synthetic:contributor-frontier";
  const query = "prolactinoma spontaneous remission formal evidence";
  const laneId = deterministicUuid(`${base}:lane`);
  const passId = deterministicUuid(`${base}:pass`);
  return {
    schemaVersion: 1,
    idempotencyKey: "synthetic:contributor-frontier:partial",
    contributionId: deterministicUuid(`${base}:contribution`),
    persistenceBoundary: {
      rawSourceContentPersisted: false,
      rawProviderResponsePersisted: false,
      personalDataPersisted: false,
      communityDataPersisted: false,
    },
    run: {
      runId: deterministicUuid(`${base}:run`),
      runKind: "live_research",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:01:00.000Z",
      protocolManifests: [{
        name: "Synthetic protocol",
        version: "1",
        revisionDate: "2026-09-01",
        sha256: "1".repeat(64),
      }],
      provenanceNote: "Synthetic deidentified formal-source frontier.",
    },
    topic: {
      topicId: deterministicUuid(`${base}:topic`),
      canonicalKey: "prolactinoma.spontaneous-remission",
      label: "Prolactinoma spontaneous remission",
    },
    question: {
      questionId: deterministicUuid(`${base}:question`),
      normalizedQuestion: "What precedes spontaneous prolactinoma remission?",
      dimensions: {
        population: "People with documented prolactinoma",
        programOrExposure: "Biological or environmental transition",
        comparator: "Similar non-remission cases",
        outcome: "Treatment-free remission or regression",
        horizon: null,
        setting: null,
      },
    },
    frontier: {
      frontierId: deterministicUuid(`${base}:frontier`),
      lanes: [{
        laneId,
        canonicalKey: "pubmed.formal",
        sourceClass: "study",
        provider: "pubmed",
        label: "PubMed formal evidence",
      }],
      passes: [{
        passId,
        laneId,
        deidentifiedQuery: query,
        declaredQuerySha256: sha256(query),
        executedAt: "2026-09-01T00:00:30.000Z",
        coverageBasis: "provider_unspecified",
        requestedWindow: null,
        confirmedWindow: null,
        coverageRelation: "unscoped",
        deltaFromPassId: null,
        status: "partial",
        accessStatus: "partial",
        exhausted: false,
        retrievedCandidateCount: 0,
        screenedCandidateCount: 0,
        selectedCandidateCount: 0,
        nextCapability: "Continue the formal PubMed search.",
        blockedReasonCode: null,
        receiptSha256: sha256("synthetic partial receipt"),
        limitations: ["The corpus is partial and remains eligible for bounded review."],
      }],
      candidateVersions: [],
      trailVersions: [{
        trailId: deterministicUuid(`${base}:trail`),
        versionId: deterministicUuid(`${base}:trail-version`),
        trailKind: "unattempted_search",
        laneId,
        targetWindow: null,
        description: "Continue discovery for formal comparison cohorts.",
        rationale: "The initial pass stopped before exhaustion.",
        priority: "high",
        state: "ready",
        nextCapability: "Continue the PubMed search and screen new candidates.",
        blockedReasonCode: null,
        resolutionNote: null,
        previousVersionId: null,
      }],
    },
  };
}

function completeSourceAnalysis(): LivingEvidenceContribution {
  const content = "# Synthetic source analysis\nThe report preserves a complete performed method analysis for a formal study fixture.\n";
  return {
    schemaVersion: 1,
    idempotencyKey: "synthetic:contributor-source-analysis:complete",
    run: {
      runId: "11111111-1111-4111-a111-111111111111",
      runKind: "live_research",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:01:00.000Z",
      protocolManifests: [{
        name: "Synthetic protocol",
        version: "1",
        revisionDate: "2026-09-01",
        sha256: "2".repeat(64),
      }],
      provenanceNote: "Synthetic formal study analysis.",
    },
    topic: {
      topicId: "22222222-2222-4222-a222-222222222222",
      canonicalKey: "prolactinoma.synthetic-study",
      label: "Synthetic prolactinoma study",
    },
    source: {
      familyId: "33333333-3333-4333-a333-333333333333",
      versionId: "44444444-4444-4444-a444-444444444444",
      sourceKind: "study",
      identityHash: "3".repeat(64),
      displayTitle: "Synthetic formal prolactinoma study",
      identifiers: [{ scheme: "doi", value: "10.0000/synthetic.1" }],
      sourceContentSha256: "4".repeat(64),
      accessStatus: "complete",
      retrievedAt: "2026-09-01T00:00:10.000Z",
      sourceLocator: "Synthetic full-text fixture",
      rawContentPersisted: false,
    },
    analysis: {
      analysisId: "55555555-5555-4555-a555-555555555555",
      versionId: "66666666-6666-4666-a666-666666666666",
      analysisKind: "study_method_audit",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "complete_performed_analysis",
      authoredAt: "2026-09-01T00:01:00.000Z",
      coverageStatement: "Complete synthetic performed analysis.",
      declaredWholeTextSha256: sha256(content),
      sections: [{
        ordinal: 0,
        sectionKey: "000-synthetic-source-analysis",
        title: "Synthetic source analysis",
        content,
      }],
      domains: [],
      claimCapabilities: [],
      futureAnalysisItems: [],
    },
    receipts: [],
  };
}

