import { describe, expect, it } from "vitest";

import {
  CONTRIBUTION_EXAMPLES,
  CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  InMemoryResearchContributionReviewStore,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributionRejectedError,
  ResearchContributionReviewService,
  ResearchContributorAccessService,
} from "../packages/evidence-repository/src/index.js";
import { createResearchContributionReviewHandler } from "../apps/research-mcp/src/research-contribution-review-tool.js";

// Owner answer 138b (2026-10-20): "a finished version replaces the same account's draft".

const OWNER = "auth0|synthetic-owner-reviewer";
const DRAFTER = "auth0|synthetic-drafter";
const OTHER = "auth0|synthetic-other-contributor";

async function setup() {
  const store = new InMemoryResearchContributorAccessStore();
  let sequence = 0;
  const service = new ResearchContributorAccessService({
    store,
    identitySecret: new TextEncoder().encode("synthetic-supersession-identity-secret-of-32-bytes"),
    now: () => `2026-10-21T01:00:${String(sequence).padStart(2, "0")}.000Z`,
    randomUuid: () => `30000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
  for (const subject of [DRAFTER, OTHER]) {
    await service.acceptFreeContributor(subject, {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
  }
  return { store, service };
}

function frontier(label: string, supersedesProposalId?: string) {
  const payload = structuredClone(CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER) as Record<string, any>;
  payload.question.normalizedQuestion = label;
  return {
    proposalKind: "RESEARCH_FRONTIER",
    privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
    payload,
    ...(supersedesProposalId === undefined ? {} : { supersedesProposalId }),
  };
}

const sourceAnalysis = () => ({
  proposalKind: "SOURCE_ANALYSIS",
  privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  payload: structuredClone(CONTRIBUTION_EXAMPLES.SOURCE_ANALYSIS),
});

describe("a finished version names the draft it replaces", () => {
  it("links the account's own pending draft of the same kind", async () => {
    const { store, service } = await setup();
    const draft = await service.submitProposal(DRAFTER, frontier("A draft search map"));
    const finished = await service.submitProposal(DRAFTER, frontier("The finished search map", draft.record.proposalId));
    expect(finished.record).toMatchObject({ status: "PENDING_REVIEW", supersedesProposalId: draft.record.proposalId });
    expect(store.allProposals()).toHaveLength(2);
    // The same record again is a replay, with its link as stored.
    expect(await service.submitProposal(DRAFTER, frontier("The finished search map", draft.record.proposalId)))
      .toMatchObject({ status: "idempotent_replay", record: { proposalId: finished.record.proposalId } });
  });

  it("refuses anything else with one problem that says nothing about another account's proposals", async () => {
    const { store, service } = await setup();
    const own = await service.submitProposal(DRAFTER, frontier("A draft search map"));
    const others = await service.submitProposal(OTHER, frontier("Another account's draft"));
    const ownAnalysis = await service.submitProposal(DRAFTER, sourceAnalysis());
    const rejected = await service.submitProposal(DRAFTER, frontier("A draft the owner rejected"));
    (store as unknown as { proposals: Map<string, { status: string }> }).proposals.get(rejected.record.proposalId)!
      .status = "REJECTED";
    const problems = [];
    for (const target of [
      others.record.proposalId,
      ownAnalysis.record.proposalId,
      rejected.record.proposalId,
      "30000000-0000-4000-8000-000000009999",
    ]) {
      const error = await service.submitProposal(DRAFTER, frontier(`Replacing ${target}`, target))
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ResearchContributionRejectedError);
      problems.push((error as ResearchContributionRejectedError).problems);
    }
    expect(new Set(problems.map((problem) => JSON.stringify(problem))).size).toBe(1);
    expect(problems[0]).toEqual([{
      path: "supersedesProposalId",
      rule: "superseded_proposal",
      expected: "the UUID of one of this account's own proposals of the same kind that is still pending review, or " +
        "no supersedesProposalId: only such a draft can be replaced",
      example: JSON.stringify("00000000-0000-4000-8000-000000000050"),
    }]);
    expect(JSON.stringify(problems)).not.toContain(others.record.proposalId);
    expect(store.allProposals()).toHaveLength(4);
    expect(own.record.supersedesProposalId).toBeNull();
  });

  it("checks the field's shape with the rest of the call", async () => {
    const { service } = await setup();
    const error = await service.submitProposal(DRAFTER, frontier("A finished map", "not-a-uuid"))
      .catch((caught: unknown) => caught) as ResearchContributionRejectedError;
    expect(error.problems.map(({ path, rule }) => `${path} ${rule}`)).toEqual(["supersedesProposalId format"]);
  });
});

describe("accepting the finished version rejects the draft as superseded, in the same decision", () => {
  async function review() {
    const { store, service } = await setup();
    const draft = await service.submitProposal(DRAFTER, frontier("A draft search map"));
    const finished = await service.submitProposal(DRAFTER, frontier("The finished search map", draft.record.proposalId));
    const reviewStore = new InMemoryResearchContributionReviewStore(store.allProposals());
    const reviewer = new ResearchContributionReviewService(reviewStore, {
      now: () => "2026-10-21T02:00:00.000Z",
      randomUuid: () => "40000000-0000-4000-8000-000000000001",
    });
    return { draft: draft.record, finished: finished.record, reviewer };
  }

  it("shows the owner both links, by proposal ID only", async () => {
    const { draft, finished, reviewer } = await review();
    expect(await reviewer.inspect(draft.proposalId)).toMatchObject({
      supersedesProposalId: null,
      supersededByProposalIds: [finished.proposalId],
    });
    const view = await reviewer.inspect(finished.proposalId);
    expect(view).toMatchObject({ supersedesProposalId: draft.proposalId, supersededByProposalIds: [] });
    expect(JSON.stringify(view)).not.toContain(finished.accountKey);
  });

  it("rejects the draft only when the finished version is accepted", async () => {
    const { draft, finished, reviewer } = await review();
    const accepted = await reviewer.decide({
      proposalId: finished.proposalId,
      expectedPayloadSha256: finished.payloadSha256,
      decision: "ACCEPT",
      reason: "The finished search map, which replaces its draft.",
    });
    expect(accepted).toMatchObject({ status: "ACCEPTED", promotion: { status: "PENDING" } });
    expect(await reviewer.inspect(draft.proposalId)).toMatchObject({
      status: "REJECTED",
      reviewedAt: "2026-10-21T02:00:00.000Z",
      reviewReason: `superseded by ${finished.proposalId}`,
      promotion: null,
    });

    const second = await review();
    await second.reviewer.decide({
      proposalId: second.finished.proposalId,
      expectedPayloadSha256: second.finished.payloadSha256,
      decision: "REJECT",
      reason: "Not yet.",
    });
    expect(await second.reviewer.inspect(second.draft.proposalId)).toMatchObject({ status: "PENDING_REVIEW" });
  });

  it("names the link in the owner tool's result", async () => {
    const { finished, reviewer } = await review();
    const handler = createResearchContributionReviewHandler({ service: reviewer, allowedReviewerSubjects: new Set([OWNER]) });
    const result = await handler({ action: "inspect", proposalId: finished.proposalId }, {
      authInfo: {
        token: "synthetic-token",
        clientId: "synthetic-client",
        scopes: ["cases:review"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        extra: { subject: OWNER },
      },
    });
    expect(result.structuredContent).toMatchObject({
      outcome: "pending_review",
      proposal: { supersedesProposalId: expect.any(String), supersededByProposalIds: [] },
    });
  });
});
