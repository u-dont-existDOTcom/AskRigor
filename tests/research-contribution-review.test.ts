import { describe, expect, it } from "vitest";

import {
  InMemoryResearchContributionReviewStore,
  ResearchContributionReviewService,
  prepareResearchContributionProposal,
  sha256,
  type ContributionPrivacyBoundary,
  type LivingEvidenceContribution,
  type ResearchContributionProposalRecord,
} from "../packages/evidence-repository/src/index.js";
import { createResearchContributionReviewHandler } from
  "../apps/research-mcp/src/research-contribution-review-tool.js";

const NOW = "2026-09-01T03:00:00.000Z";
const OWNER = "auth0|synthetic-owner-reviewer";
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

function fixture() {
  const prepared = prepareResearchContributionProposal(
    "SOURCE_ANALYSIS",
    sourceAnalysis(),
  );
  const proposal: ResearchContributionProposalRecord = {
    proposalId: "77777777-7777-4777-a777-777777777777",
    accountKey: "8".repeat(64),
    proposalKind: "SOURCE_ANALYSIS",
    payloadSha256: prepared.payloadSha256,
    payload: prepared.payload,
    privacyBoundary: PRIVACY_BOUNDARY,
    partial: prepared.partial,
    status: "PENDING_REVIEW",
    createdAt: "2026-09-01T02:59:00.000Z",
    reviewedAt: null,
    reviewReason: null,
  };
  const store = new InMemoryResearchContributionReviewStore([proposal]);
  const service = new ResearchContributionReviewService(store, {
    now: () => NOW,
    randomUuid: () => "99999999-9999-4999-a999-999999999999",
  });
  return { proposal, service, store };
}

describe("research contribution owner review", () => {
  it("returns the oldest pending proposal without leaking its account key", async () => {
    const { service } = fixture();
    const view = await service.inspect();

    expect(view).toMatchObject({
      proposalId: "77777777-7777-4777-a777-777777777777",
      proposalKind: "SOURCE_ANALYSIS",
      status: "PENDING_REVIEW",
      promotion: null,
    });
    expect(JSON.stringify(view)).not.toContain("accountKey");
    expect(JSON.stringify(view)).not.toContain("8".repeat(64));
  });

  it("atomically accepts the exact reviewed hash and creates one pending intent", async () => {
    const { proposal, service } = fixture();
    const accepted = await service.decide({
      proposalId: proposal.proposalId,
      expectedPayloadSha256: proposal.payloadSha256,
      decision: "ACCEPT",
      reason: "Validated deidentified formal-source analysis.",
    });

    expect(accepted).toMatchObject({
      status: "ACCEPTED",
      reviewedAt: NOW,
      promotion: {
        promotionId: "99999999-9999-4999-a999-999999999999",
        status: "PENDING",
        receipt: null,
      },
    });
    const replay = await service.decide({
      proposalId: proposal.proposalId,
      expectedPayloadSha256: proposal.payloadSha256,
      decision: "ACCEPT",
      reason: "Validated deidentified formal-source analysis.",
    });
    expect(replay.promotion?.promotionId).toBe(
      "99999999-9999-4999-a999-999999999999",
    );
  });

  it("rejects without an intent and fails closed on hash or terminal conflicts", async () => {
    const { proposal, service } = fixture();
    await expect(service.decide({
      proposalId: proposal.proposalId,
      expectedPayloadSha256: "a".repeat(64),
      decision: "REJECT",
      reason: "Wrong hash must fail.",
    })).rejects.toMatchObject({ code: "PAYLOAD_MISMATCH" });

    const rejected = await service.decide({
      proposalId: proposal.proposalId,
      expectedPayloadSha256: proposal.payloadSha256,
      decision: "REJECT",
      reason: "The source identity needs correction.",
    });
    expect(rejected).toMatchObject({ status: "REJECTED", promotion: null });
    await expect(service.decide({
      proposalId: proposal.proposalId,
      expectedPayloadSha256: proposal.payloadSha256,
      decision: "ACCEPT",
      reason: "A contradictory later decision.",
    })).rejects.toMatchObject({ code: "REVIEW_CONFLICT" });
  });

  it("authorizes the owner tool before service access and reports pending promotion", async () => {
    const { proposal, service } = fixture();
    const handler = createResearchContributionReviewHandler({
      service,
      resourceMetadataUrl: new URL("https://mcp.askrigor.test/.well-known/oauth-protected-resource"),
      allowedReviewerSubjects: new Set([OWNER]),
    });

    const unauthorized = await handler({ action: "inspect" });
    expect(unauthorized.isError).toBe(true);
    expect(unauthorized.structuredContent).toMatchObject({
      error: { code: "authorization_required" },
    });

    const forbidden = await handler({ action: "inspect" }, auth("auth0|other"));
    expect(forbidden.structuredContent).toMatchObject({
      error: { code: "insufficient_scope" },
    });

    const accepted = await handler({
      action: "accept",
      proposalId: proposal.proposalId,
      expectedPayloadSha256: proposal.payloadSha256,
      reason: "Owner reviewed the exact deidentified payload.",
    }, auth(OWNER));
    expect(accepted.isError).not.toBe(true);
    expect(accepted.structuredContent).toMatchObject({
      ok: true,
      outcome: "accepted_pending_promotion",
      canonicalEvidenceChangedByThisCall: false,
      proposal: {
        status: "ACCEPTED",
        promotion: { status: "PENDING" },
      },
    });
    expect(JSON.stringify(accepted)).not.toContain("accountKey");
  });
});

function auth(subject: string) {
  return {
    authInfo: {
      token: "synthetic-token",
      clientId: "synthetic-client",
      scopes: ["cases:review"],
      expiresAt: Math.floor(Date.now() / 1_000) + 60,
      extra: { subject },
    },
  };
}

function sourceAnalysis(): LivingEvidenceContribution {
  const content = "# Synthetic source analysis\nA complete formal-study method audit fixture.\n";
  return {
    schemaVersion: 1,
    idempotencyKey: "synthetic:owner-review:source-analysis",
    run: {
      runId: "11111111-1111-4111-a111-111111111111",
      runKind: "live_research",
      startedAt: "2026-09-01T02:00:00.000Z",
      completedAt: "2026-09-01T02:01:00.000Z",
      protocolManifests: [{
        name: "Synthetic protocol",
        version: "1",
        revisionDate: "2026-09-01",
        sha256: "1".repeat(64),
      }],
      provenanceNote: "Synthetic deidentified source analysis.",
    },
    topic: {
      topicId: "22222222-2222-4222-a222-222222222222",
      canonicalKey: "synthetic.owner-review",
      label: "Synthetic owner review",
    },
    source: {
      familyId: "33333333-3333-4333-a333-333333333333",
      versionId: "44444444-4444-4444-a444-444444444444",
      sourceKind: "study",
      identityHash: "2".repeat(64),
      displayTitle: "Synthetic formal source",
      identifiers: [{ scheme: "doi", value: "10.0000/owner-review" }],
      sourceContentSha256: "3".repeat(64),
      accessStatus: "complete",
      retrievedAt: "2026-09-01T02:00:10.000Z",
      sourceLocator: "Synthetic fixture",
      rawContentPersisted: false,
    },
    analysis: {
      analysisId: "55555555-5555-4555-a555-555555555555",
      versionId: "66666666-6666-4666-a666-666666666666",
      analysisKind: "study_method_audit",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "complete_performed_analysis",
      authoredAt: "2026-09-01T02:01:00.000Z",
      coverageStatement: "Complete synthetic performed analysis.",
      declaredWholeTextSha256: sha256(content),
      sections: [{
        ordinal: 0,
        sectionKey: "000-synthetic-owner-review",
        title: "Synthetic owner review",
        content,
      }],
      domains: [],
      claimCapabilities: [],
      futureAnalysisItems: [],
    },
    receipts: [],
  };
}
