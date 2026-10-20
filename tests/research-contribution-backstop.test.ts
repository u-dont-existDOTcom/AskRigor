import { describe, expect, it, vi } from "vitest";

import {
  CONTRIBUTION_EXAMPLES,
  CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributionRejectedError,
  ResearchContributorAccessService,
} from "../packages/evidence-repository/src/index.js";

// The assertions submitProposal runs before storage stand behind the collecting check (owner question 127). With
// the check made to report nothing, they alone must still refuse a contact pattern in a free name under
// receipts[].details, or in its value, and store nothing.
vi.mock("../packages/evidence-repository/src/research-contribution-check.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../packages/evidence-repository/src/research-contribution-check.js")>(),
  checkResearchContributionProposal: () => ({
    problems: [],
    total: 0,
    privacyRuleFailed: false,
    crossFieldRulesPending: false,
    payloadCheck: "checked",
  }),
}));

const SUBJECT = "auth0|synthetic-contribution-backstop";
type Details = Record<string, string | number | boolean | null>;

async function submitWithDetails(details?: Details) {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({
    store,
    identitySecret: new TextEncoder().encode("synthetic-contribution-backstop-secret-with-32-bytes"),
    now: () => "2026-10-20T12:00:00.000Z",
  });
  await service.acceptFreeContributor(SUBJECT, {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = structuredClone(CONTRIBUTION_EXAMPLES.SOURCE_ANALYSIS);
  if (details !== undefined) payload.receipts[0].details = details;
  const error = await service.submitProposal(SUBJECT, {
    proposalKind: "SOURCE_ANALYSIS",
    privacyBoundary: { ...CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE },
    payload,
  }).then(() => undefined, (caught: unknown) => caught);
  return { error, stored: store.allProposals().length };
}

describe("the assertions before storage, with the collecting check reporting nothing", () => {
  it("accept the example record", async () => {
    const { error, stored } = await submitWithDetails();
    expect(error).toBeUndefined();
    expect(stored).toBe(1);
  });

  it.each([
    ["a free name", { "sentinel.person@example.com": "count 3" }],
    ["the value under a free name", { status: "Write to sentinel.person@example.com" }],
  ])("refuse a contact pattern in %s and store nothing", async (_where, details: Details) => {
    const { error, stored } = await submitWithDetails(details);
    expect(error).toBeInstanceOf(ResearchAccessError);
    // Refused by the assertions themselves, not by the collecting check.
    expect(error).not.toBeInstanceOf(ResearchContributionRejectedError);
    expect(error).toMatchObject({ code: "CONTRIBUTION_PRIVACY_REJECTED" });
    expect(`${(error as Error).message}\n${JSON.stringify(error)}`).not.toContain("sentinel.person@example.com");
    expect(stored).toBe(0);
  });
});
