import { createHash } from "node:crypto";

import {
  InMemoryAtlasPlacements,
  InMemoryAtlasReports,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { describe, expect, it } from "vitest";

import { RESEARCH_USE_SCOPE } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createManageResearchAccessHandler } from "../apps/research-mcp/src/research-contributor-access-tool.js";

// Owner answer 229a, door 2: a person's own AI sends their confirmed report to the Atlas with manage_research_access
// action share_report, and takes it down with take_down_report. The handler reads later_inputs as the connector lifts
// them. Every figure, name and address here is invented.

const agreement = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
} as const;
const REPORT = {
  problem: "An invented itch", tried: "An invented oat cream", howUsed: "Twice a day", whatHappened: "It eased within a week.",
  displayName: null, confirmed: true,
  research: {
    others: [{ url: "https://forum.example/threads/oat-cream", outcome: "better" }],
    studies: [{ title: "An invented trial of oat cream", year: 2020, source: "PMID: 12345678", found: "Itch eased." }],
    safety: "Rarely, a rash in people allergic to oats.", unknown: "Whether it lasts.",
  },
};

function setup() {
  const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
    identitySecret: Buffer.alloc(32, 11) });
  const reports = new InMemoryAtlasReports(new InMemoryAtlasPlacements());
  const keyOf = (subject: string) => createHash("sha256").update(subject).digest("hex");
  const handler = createManageResearchAccessHandler({ service,
    atlasReports: { store: reports, participantKeyFor: keyOf, publicOrigin: "https://askrigor.example" } });
  const call = (input: Record<string, unknown>, subject = "auth0|reporter") => handler(input, { authInfo: {
    token: "synthetic", clientId: "synthetic-client", scopes: [RESEARCH_USE_SCOPE],
    expiresAt: Math.floor(Date.now() / 1_000) + 300, extra: { subject } } } as never);
  return { reports, call, keyOf };
}

const structured = (result: { structuredContent?: unknown }) => result.structuredContent as Record<string, any>;

describe("reports through a person's own AI (owner answer 229a)", () => {
  it("receives a confirmed report privately, with its research, under the account's Atlas key", async () => {
    const { reports, call } = setup();
    expect((await call({ action: "accept_free_contributor", agreement })).isError).not.toBe(true);
    const sent = await call({ action: "share_report", atlasReport: REPORT });
    expect(sent.isError).not.toBe(true);
    expect(structured(sent).atlasReport).toEqual({ report: "R-1001", state: "received",
      page: "https://askrigor.example/atlas/reports/R-1001" });
    const [received] = await reports.inspectReports("received", undefined, 20);
    expect(received).toMatchObject({ publicId: "R-1001", door: "ai_app", text: { problem: REPORT.problem, displayName: null },
      research: REPORT.research });
    // The same person takes it down; again, there's nothing of theirs to take down.
    const down = await call({ action: "take_down_report", reportNumber: "R-1001" });
    expect(structured(down).atlasReport).toEqual({ report: "R-1001", state: "taken_down", page: null });
    const again = await call({ action: "take_down_report", reportNumber: "R-1001" });
    expect(structured(again).error.code).toBe("invalid_request");
  });

  it("refuses contact details, YouTube research, an unconfirmed report, and an account without research access", async () => {
    const { reports, call } = setup();
    await call({ action: "accept_free_contributor", agreement });
    const linked = await call({ action: "share_report", atlasReport: { ...REPORT, whatHappened: "Write to invented@example.com." } });
    expect(linked.isError).toBe(true);
    expect(structured(linked).error.code).toBe("share_refused");
    expect(structured(linked).problems.join(" ")).toContain("whatHappened");
    const video = await call({ action: "share_report", atlasReport: { ...REPORT, research: { ...REPORT.research,
      others: [{ url: "https://youtu.be/invented0001", outcome: "better" }] } } });
    expect(structured(video).error.code).toBe("share_refused");
    const unconfirmed = await call({ action: "share_report", atlasReport: { ...REPORT, confirmed: false } });
    expect(unconfirmed.isError).toBe(true);
    const stranger = await call({ action: "share_report", atlasReport: REPORT }, "auth0|never-enrolled");
    expect(stranger.isError).toBe(true);
    expect(await reports.inspectReports("received", undefined, 20)).toEqual([]);
    // Each input goes only with its action.
    expect(structured(await call({ action: "share_report" })).error.code).toBe("invalid_request");
    expect(structured(await call({ action: "inspect", reportNumber: "R-1001" })).error.code).toBe("invalid_request");
  });
});
