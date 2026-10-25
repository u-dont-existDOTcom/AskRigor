import { describe, expect, it } from "vitest";

import {
  deterministicUuid,
  EARLIER_RESEARCH_USE_NOTICE_VERSIONS,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributorAccessService,
  PAID_PRIVATE_MAP_ONLY,
  RESEARCH_MAP_CONSENT,
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

  it.each(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"] as const)(
    "rejects sandbox identifier values in %s before persistence, regardless of scheme case or identifier label",
    async (proposalKind) => {
      const { store, service } = fixture();
      await service.acceptFreeContributor(SUBJECT, agreement());
      for (const value of ["sandbox:/mnt/data/report.json", "SaNdBoX:/mnt/data/report.json", "SANDBOX:report.json"]) {
        for (const scheme of ["url", "other"] as const) {
          const submission = service.submitProposal(SUBJECT, {
            proposalKind,
            privacyBoundary: PRIVACY_BOUNDARY,
            payload: contributionWithIdentifier(proposalKind, scheme, value),
          });
          await expect(submission).rejects.toBeInstanceOf(ResearchAccessError);
          // Owner question 127: the rejection names the rule and the exact identifier, never the link.
          await expect(submission).rejects.toMatchObject({
            name: "Error",
            code: "CONTRIBUTION_PRIVACY_REJECTED",
            total: 1,
            problems: [{
              path: proposalKind === "SOURCE_ANALYSIS"
                ? "payload.source.identifiers[1].value"
                : "payload.frontier.candidateVersions[0].identifiers[1].value",
              rule: "sandbox_locator",
              expected: expect.stringContaining("a sandbox: link points into another session and can never be opened"),
            }],
          });
          const rejection = await submission.catch((error: unknown) => error);
          expect(`${(rejection as Error).message}${JSON.stringify(rejection)}`).not.toContain(value.slice(8));
        }
      }
      expect(store.allProposals()).toHaveLength(0);
    },
  );

  it.each(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"] as const)(
    "accepts an ordinary HTTPS identifier in %s, even when sandbox: appears later in the URL",
    async (proposalKind) => {
      const { store, service } = fixture();
      await service.acceptFreeContributor(SUBJECT, agreement());
      await expect(service.submitProposal(SUBJECT, {
        proposalKind,
        privacyBoundary: PRIVACY_BOUNDARY,
        payload: contributionWithIdentifier(proposalKind, "url", "https://example.org/study/sandbox:report.json"),
      })).resolves.toMatchObject({ status: "inserted", record: { status: "PENDING_REVIEW", proposalKind } });
      expect(store.allProposals()).toHaveLength(1);
    },
  );

  it("rejects prohibited keys and obvious contact details before persistence", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());

    const prohibited = partialFrontier() as unknown as Record<string, unknown>;
    prohibited.rawChat = "private conversation";
    const rejection = await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: prohibited,
    }).catch((error: unknown) => error);
    // Owner question 127: every problem, the prohibited key first; the key and its value are not repeated.
    expect(rejection).toMatchObject({
      code: "CONTRIBUTION_PRIVACY_REJECTED",
      problems: [
        { path: "payload.*", rule: "prohibited_key" },
        { path: "payload", rule: "unknown_keys" },
      ],
    });
    expect(`${(rejection as Error).message}${JSON.stringify(rejection)}`).not.toMatch(/rawChat|private conversation/u);

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
    })).rejects.toMatchObject({ code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE", message: PAID_PRIVATE_MAP_ONLY });
    expect(store.allProposals()).toHaveLength(0);

    // Owner answer 143a: only this research's map, with the user's yes and the receipt of the check that offered it,
    // which the caller checked; the consent alone, or a receipt the caller did not check, files nothing.
    const receipt = "rr1~finalization~map=offered~1~synthetic";
    const consented = {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
      userConsent: RESEARCH_MAP_CONSENT,
      finalizationReceipt: receipt,
    };
    await expect(service.submitProposal(SUBJECT, consented)).rejects.toMatchObject({
      code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE",
    });
    await expect(service.submitProposal(SUBJECT, consented, {
      paidPrivateConsent: { receiptSha256: sha256("another receipt") },
    })).rejects.toMatchObject({ code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE" });
    // A paid private account files a map, never an analysis or a topic link, even with a checked consent.
    await expect(service.submitProposal(SUBJECT, { ...consented, proposalKind: "SOURCE_ANALYSIS" }, {
      paidPrivateConsent: { receiptSha256: sha256(receipt) },
    })).rejects.toMatchObject({ code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE" });
    expect(store.allProposals()).toHaveLength(0);
    const filed = await service.submitProposal(SUBJECT, consented, {
      paidPrivateConsent: { receiptSha256: sha256(receipt) },
    });
    expect(filed.status).toBe("inserted");
    expect(filed.record.consentReceiptSha256).toBe(sha256(receipt));
    expect(store.allProposals()).toHaveLength(1);
  });

  // Owner answer 171 (2026-10-25): the three approved changes to the free notice, word for word.
  // All other sentences stay as in v3, and every earlier account accepts v4 before free research.
  it("pins the fourth free contributor notice, word for word, after the three earlier versions", () => {
    expect(RESEARCH_USE_NOTICE_VERSION).toBe("free-contributor-v4-2026-10-25");
    expect(EARLIER_RESEARCH_USE_NOTICE_VERSIONS).toEqual([
      "free-contributor-v1-2026-09-01",
      "free-contributor-v2-2026-09-30",
      "free-contributor-v3-2026-10-22",
    ]);
    expect(RESEARCH_USE_NOTICE).toBe([
      "Free AskRigor use is reciprocal: what AskRigor learns from your research is saved for its research library.",
      "That includes deidentified structured research progress and, for each finished research answer whose " +
        "findings would help other people, a findings card: the question in general terms, the main findings and " +
        "how certain they are, the public studies behind them, and what public online communities reported, " +
        "summarized without their posts, names, links or video IDs.",
      "AskRigor never saves raw chat, prompts, identity or contact details, private health narratives, uploads, or " +
        "raw source or provider bodies.",
      "Saved research is reviewed and does not become evidence, conclusions, or scientific authority merely because " +
        "it was saved or repeated.",
      "Your findings cards are published in AskRigor's public Atlas as soon as they are saved, written without you and marked \"Not checked by supervisors yet\" until AskRigor's owner has reviewed them, and people who sign in can vote and comment on them.",
      "If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas unless AskRigor's owner has already accepted its findings; no reason is needed.",
      "An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, " +
        "and rewritten or removed if it could identify anyone.",
      "Paid private access saves research findings or lesson feedback only when you accept saving them for that " +
        "answer, and requires an active verified entitlement.",
    ].join(" "));
  });

  it.each(EARLIER_RESEARCH_USE_NOTICE_VERSIONS)("asks a free account that accepted %s to accept the current notice", async (earlier) => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const [account] = store.allAccounts();
    await store.saveAccount({ ...account!, noticeVersion: earlier, agreement: { ...agreement(), noticeVersion: earlier } });

    await expect(service.inspect(SUBJECT)).resolves.toMatchObject({
      status: "UNENROLLED",
      mode: null,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      notice: RESEARCH_USE_NOTICE,
    });
    await expect(service.requireActive(SUBJECT)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
    })).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    // Only the current notice can be accepted.
    await expect(service.acceptFreeContributor(SUBJECT, { ...agreement(), noticeVersion: earlier })).rejects.toThrow();

    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.requireActive(SUBJECT)).resolves.toBe("FREE_CONTRIBUTOR");
    expect(store.allAccounts()[0]).toMatchObject({ noticeVersion: RESEARCH_USE_NOTICE_VERSION });
  });

  it("blocks all later use after revocation", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.requireActive(SUBJECT)).resolves.toBe("FREE_CONTRIBUTOR");
    await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
    });

    const revoked = await service.revoke(SUBJECT);
    expect(revoked.status).toBe("REVOKED");
    expect(store.allProposals()).toMatchObject([{
      status: "WITHDRAWN",
      reviewReason: "contributor_access_revoked",
    }]);
    await expect(service.requireActive(SUBJECT)).rejects.toMatchObject({
      code: "RESEARCH_ACCESS_REVOKED",
    });
  });

  // Owner answer 140b (2026-10-20): the plain-answer note is a stored choice, on by default.
  it("stores the plain-answer note setting, on by default, which saving or revoking the account leaves as it is", async () => {
    const { store, service } = fixture();
    await expect(service.setPlainAnswerNote(SUBJECT, false)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    expect(store.allAccounts()).toEqual([]);
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toEqual({
      mode: "FREE_CONTRIBUTOR", plainAnswerNote: true, detailedLessonReports: false,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    });
    await expect(service.setPlainAnswerNote(SUBJECT, false)).resolves.toBe(false);
    await expect(service.activeAccount(SUBJECT)).resolves.toEqual({
      mode: "FREE_CONTRIBUTOR", plainAnswerNote: false, detailedLessonReports: false,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    });
    // Accepting again saves the account row anew; the choice is the account's, not the agreement's.
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false });
    await service.revoke(SUBJECT);
    await expect(service.setPlainAnswerNote(SUBJECT, true)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REVOKED" });
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false });
    await service.setPlainAnswerNote(SUBJECT, true);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: true });
    // Only the choice is kept: no text field joins the account row.
    expect(Object.keys(store.allAccounts()[0]!).sort()).toEqual([
      "accountKey", "activatedAt", "agreement", "createdAt", "mode", "noticeVersion", "plainAnswerNote", "revokedAt",
      "status", "updatedAt"
    ]);
  });

  // Owner question 154 (2026-10-21): detailed lesson reports are a stored choice, off by default, that the user turns on.
  it("stores the detailed lesson reports setting, off by default, which saving or revoking the account leaves as it is", async () => {
    const { store, service } = fixture();
    await expect(service.setDetailedLessonReports(SUBJECT, true)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    expect(store.allAccounts()).toEqual([]);
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ detailedLessonReports: false });
    await expect(service.setDetailedLessonReports(SUBJECT, true)).resolves.toBe(true);
    await expect(service.activeAccount(SUBJECT)).resolves.toEqual({
      mode: "FREE_CONTRIBUTOR", plainAnswerNote: true, detailedLessonReports: true,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    });
    // Each setting changes only itself.
    await service.setPlainAnswerNote(SUBJECT, false);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false, detailedLessonReports: true });
    // Accepting again saves the account row anew; the choice is the account's, not the agreement's.
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ detailedLessonReports: true });
    await service.revoke(SUBJECT);
    await expect(service.setDetailedLessonReports(SUBJECT, false)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REVOKED" });
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ detailedLessonReports: true });
    await expect(service.setDetailedLessonReports(SUBJECT, false)).resolves.toBe(false);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false, detailedLessonReports: false });
    // Only the choice is kept: no report or text field joins the account row.
    expect(Object.keys(store.allAccounts()[0]!).sort()).toEqual([
      "accountKey", "activatedAt", "agreement", "createdAt", "detailedLessonReports", "mode", "noticeVersion",
      "plainAnswerNote", "revokedAt", "status", "updatedAt"
    ]);
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

function contributionWithIdentifier(
  kind: "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS",
  scheme: "url" | "other",
  value: string,
): ResearchFrontierContribution | LivingEvidenceContribution {
  if (kind === "SOURCE_ANALYSIS") {
    const payload = completeSourceAnalysis();
    payload.source!.identifiers.push({ scheme, value });
    return payload;
  }
  const payload = partialFrontier();
  payload.frontier.candidateVersions.push({
    candidateId: deterministicUuid("synthetic:contributor-frontier:candidate"),
    versionId: deterministicUuid("synthetic:contributor-frontier:candidate-version"),
    observedInPassId: payload.frontier.passes[0]!.passId,
    candidateKind: "study",
    identifiers: [{ scheme: "doi", value: "10.0000/synthetic.1" }, { scheme, value }],
    displayTitle: "Synthetic formal study",
    publicationDate: null,
    decision: "deferred",
    decisionReason: "Full-text review remains open.",
    relevanceSummary: "Synthetic candidate for source-linked analysis.",
    sourceFamilyId: null,
    previousVersionId: null,
  });
  payload.frontier.passes[0]!.retrievedCandidateCount = 1;
  payload.frontier.passes[0]!.screenedCandidateCount = 1;
  return payload;
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
