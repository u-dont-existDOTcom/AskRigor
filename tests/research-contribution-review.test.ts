import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  InMemoryResearchContributionReviewStore,
  RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES,
  ResearchContributionReviewService,
  prepareResearchContributionProposal,
  promotionFailureCode,
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

describe("a promotion that conflicts ends FAILED with its code (owner answer 138b)", () => {
  const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });

  it("names the writer's conflicts, the canonical triggers and the constraint classes", () => {
    for (const code of ["RESEARCH_RUN_CONFLICT", "SOURCE_VERSION_ID_CONFLICT", "TOPIC_KEY_CONFLICT",
      "ANALYSIS_ALREADY_HAS_INITIAL_VERSION", "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH", "FRONTIER_CANDIDATE_IDENTITY_CONFLICT"]) {
      expect(promotionFailureCode(new Error(code))).toBe(code);
    }
    expect(promotionFailureCode(pgError("23514", "FRONTIER_LANE_COVERAGE_BASIS_MISMATCH")))
      .toBe("FRONTIER_LANE_COVERAGE_BASIS_MISMATCH");
    expect(promotionFailureCode(pgError("23514", 'new row for relation "discovery_passes" violates check constraint')))
      .toBe("CANONICAL_CHECK_VIOLATION");
    expect(promotionFailureCode(pgError("23505", 'duplicate key value violates unique constraint "topics_canonical_key_key"')))
      .toBe("CANONICAL_UNIQUE_CONFLICT");
    expect(promotionFailureCode(pgError("23503", "insert or update violates foreign key constraint")))
      .toBe("CANONICAL_REFERENCE_MISSING");
    expect(promotionFailureCode(pgError("22008", "date/time field value out of range"))).toBe("CANONICAL_VALUE_INVALID");
  });

  it("leaves transient, contract and unexpected errors pending, so a fix or a retry can still promote them", () => {
    for (const error of [
      pgError("40001", "could not serialize access due to concurrent update"),
      pgError("40P01", "deadlock detected"),
      pgError("57014", "canceling statement due to statement timeout"),
      pgError("08006", "connection failure"),
      pgError("53300", "too many connections"),
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      new Error("Connection terminated unexpectedly"),
      new Error("Query read timeout"),
      // Re-preparing the reviewed payload is the runtime's own check, not a conflict with the store.
      new Error("PROMOTION_REVIEWED_PAYLOAD_SHA256_MISMATCH"),
      new Error("INJECTED_FAILURE_AFTER_PROMOTION_WRITER"),
      new z.ZodError([]),
      "a thrown string",
    ]) {
      expect(promotionFailureCode(error)).toBeUndefined();
    }
  });

  it("keeps the code list closed and the same in the migration's check", async () => {
    const migration = await readFile(
      new URL("../packages/evidence-repository/migrations/0012_research_contribution_merging.sql", import.meta.url),
      "utf8",
    );
    const check = migration.slice(migration.indexOf("failure_code IS NULL OR failure_code IN ("));
    const listed = [...check.slice(0, check.indexOf(")\n")).matchAll(/'([A-Z_]+)'/gu)].map(([, code]) => code);
    expect(listed).toEqual([...RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES]);
    expect(new Set(listed).size).toBe(listed.length);
    for (const code of RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES) expect(code).toMatch(/^[A-Z][A-Z_]{2,63}$/u);
  });

  it("shows the owner the failed promotion and its code", async () => {
    const { proposal, service, store } = fixture();
    await service.decide({
      proposalId: proposal.proposalId,
      expectedPayloadSha256: proposal.payloadSha256,
      decision: "ACCEPT",
      reason: "Validated deidentified formal-source analysis.",
    });
    store.seedPromotion(proposal.proposalId, {
      promotionId: "99999999-9999-4999-a999-999999999999",
      status: "FAILED",
      createdAt: NOW,
      completedAt: null,
      receipt: null,
      receiptSha256: null,
      failureCode: "SOURCE_VERSION_ID_CONFLICT",
      failedAt: "2026-09-01T03:05:00.000Z",
    });
    const handler = createResearchContributionReviewHandler({
      service,
      allowedReviewerSubjects: new Set([OWNER]),
    });
    const status = await handler({ action: "status", proposalId: proposal.proposalId }, auth(OWNER));
    expect(status.structuredContent).toMatchObject({
      ok: true,
      outcome: "accepted_promotion_failed",
      proposal: {
        status: "ACCEPTED",
        promotion: { status: "FAILED", failureCode: "SOURCE_VERSION_ID_CONFLICT", failedAt: "2026-09-01T03:05:00.000Z" },
      },
    });
    expect(JSON.stringify(status.content)).toContain("SOURCE_VERSION_ID_CONFLICT");
    expect(JSON.stringify(status)).not.toContain("8".repeat(64));
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

describe("the owner sees related records and a promotion preflight before deciding (owner answer 138b)", () => {
  const second = (): ResearchContributionProposalRecord => {
    const payload = sourceAnalysis();
    payload.idempotencyKey = "synthetic:owner-review:second-audit";
    payload.analysis.analysisId = "55555555-5555-4555-a555-555555555556";
    payload.analysis.versionId = "66666666-6666-4666-a666-666666666667";
    const prepared = prepareResearchContributionProposal("SOURCE_ANALYSIS", payload);
    return {
      proposalId: "77777777-7777-4777-a777-777777777778",
      accountKey: "9".repeat(64),
      proposalKind: "SOURCE_ANALYSIS",
      payloadSha256: prepared.payloadSha256,
      payload: prepared.payload,
      privacyBoundary: PRIVACY_BOUNDARY,
      partial: prepared.partial,
      status: "PENDING_REVIEW",
      createdAt: "2026-09-01T02:59:30.000Z",
      reviewedAt: null,
      reviewReason: null,
    };
  };

  it("lists another account's pending proposal on the same study by proposal ID only", async () => {
    const { proposal, service, store } = fixture();
    store.seed(second());
    const view = await service.inspect(proposal.proposalId);
    expect(view?.related).toEqual({
      proposals: [{
        proposalId: "77777777-7777-4777-a777-777777777778",
        proposalKind: "SOURCE_ANALYSIS",
        status: "PENDING_REVIEW",
        promotionStatus: null,
        shared: ["identifier", "source_family_id", "topic_id", "topic_key"],
      }],
      proposalsNotShown: 0,
      canonical: null,
    });
    expect(view?.preflight).toBeNull();
    expect(JSON.stringify(view)).not.toContain("9".repeat(64));
    expect(JSON.stringify(view)).not.toContain("8".repeat(64));
  });

  it("names what promotion would meet, from the canonical store as it is now", async () => {
    const { proposal, service, store } = fixture();
    store.seed(second());
    const payload = proposal.payload as LivingEvidenceContribution;
    const state = {
      idempotency: null, manifests: [], run: null, topics: [], questions: [], frontiers: [], lanes: [],
      contributionIds: [], passIds: [], candidates: [], candidateVersions: [], trails: [], trailVersions: [],
      identifierCandidates: [], sourceVersions: [], freshnessPolicies: [], analysisVersionIds: [], claims: [],
      receiptVersions: [],
      sourceFamilies: [{
        familyId: "33333333-3333-4333-a333-333333333333", sourceKind: "study", identityHash: "2".repeat(64),
        displayTitle: "A canonical title the payload does not repeat", identifiers: [{ scheme: "doi", value: "10.0000/owner-review" }],
      }],
      analyses: [{
        analysisId: payload.analysis.analysisId, analysisKind: "study_method_audit", topicId: null,
        sourceFamilyId: "33333333-3333-4333-a333-333333333333",
      }],
    };
    const handler = createResearchContributionReviewHandler({
      service,
      allowedReviewerSubjects: new Set([OWNER]),
      canonical: { readCanonicalIdentity: async () => state },
    });
    const result = await handler({ action: "inspect", proposalId: proposal.proposalId }, auth(OWNER));
    expect(result.structuredContent).toMatchObject({
      outcome: "pending_review",
      proposal: {
        related: { canonical: { records: [{ record: "source_family", id: "33333333-3333-4333-a333-333333333333", shared: "identifier" }], notShown: 0 } },
        preflight: {
          status: "conflicts",
          conflicts: [
            { code: "SOURCE_FAMILY_ID_CONFLICT", path: "payload.source.familyId" },
            { code: "ANALYSIS_ALREADY_HAS_INITIAL_VERSION", path: "payload.analysis.analysisId" },
          ],
        },
      },
    });
    const text = JSON.stringify(result.content);
    expect(text).toContain("Promotion preflight: promotion would end FAILED with SOURCE_FAMILY_ID_CONFLICT at payload.source.familyId (2 conflicts");
    expect(text).toContain("1 other pending or queued proposal and 1 canonical record share");
    expect(JSON.stringify(result)).not.toContain("9".repeat(64));

    const unavailable = createResearchContributionReviewHandler({
      service,
      allowedReviewerSubjects: new Set([OWNER]),
      canonical: { readCanonicalIdentity: async () => { throw new Error("reader down"); } },
    });
    expect((await unavailable({ action: "inspect", proposalId: proposal.proposalId }, auth(OWNER))).structuredContent)
      .toMatchObject({ proposal: { preflight: { status: "unavailable" }, related: { canonical: null } } });
  });
});
