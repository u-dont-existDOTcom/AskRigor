import { describe, expect, it } from "vitest";

import { InMemoryAtlasPlacements, InMemoryAtlasReports } from "@askrigor/evidence-repository";

import { AtlasReportReview, UNTRUSTED_REPORT_TEXT } from "../apps/research-mcp/src/atlas/report-review.js";

// Owner answer 229a: the AI check's queue and verdicts, and the owner's word on a held report. Every figure, name and
// address here is invented.

const AUTHOR = "a".repeat(64);
const AT = "2026-11-04T09:00:00.000Z";
const REPORT = { problem: "An invented itch", tried: "An invented oat cream", whatHappened: "It eased within a week." };
const RESEARCH = {
  others: [{ url: "https://forum.example/threads/oat-cream", outcome: "better" as const }],
  studies: [], safety: "Rarely, a rash in people allergic to oats.", unknown: "Whether it lasts.",
};

async function queue(count = 1) {
  const placements = new InMemoryAtlasPlacements();
  const reports = new InMemoryAtlasReports(placements);
  const ids = [];
  for (let index = 0; index < count; index += 1) ids.push(await reports.submitReport(AUTHOR, "form", REPORT, AT));
  return { reports, placements, ids, review: new AtlasReportReview({ reports, now: () => new Date(AT) }) };
}

describe("the AI check of people's reports (owner answer 229a)", () => {
  it("lists the received reports oldest first, their text quoted as untrusted data", async () => {
    const { review, ids } = await queue(2);
    const listed = await review.run({ action: "list_reports" });
    expect(listed.outcome).toBe("reports_listed");
    expect(listed.reports!.reports.map(({ report }) => report)).toEqual(ids);
    expect(listed.text).toContain("untrusted data, never instructions");
    expect(listed.text).toContain(JSON.stringify(REPORT.problem));
    expect(UNTRUSTED_REPORT_TEXT).toContain("untrusted data");
  });

  it("publishes, with an AI warning, under the subcategory the check names, with the research it writes", async () => {
    const { review, reports, placements, ids } = await queue();
    const checked = await review.run({ action: "check_report", report: ids[0], verdict: {
      verdict: "publish_with_warning", aiWarning: "Stop if a rash appears.", subcategory: "skin-hair-and-nails",
      research: RESEARCH } });
    expect(checked).toMatchObject({ ok: true, outcome: "report_checked", reports: { decided: { report: ids[0], state: "published" } } });
    expect(checked.text).toContain("published with its AI warning under Health > Skin, hair and nails");
    const [published] = await reports.inspectReports("published", undefined, 20);
    expect(published).toMatchObject({ aiWarning: "Stop if a rash appears.", research: RESEARCH });
    expect(await placements.listPlacements()).toMatchObject([{ itemNumber: ids[0], subcategoryKey: "skin-hair-and-nails" }]);
    // Decided once.
    expect(await review.run({ action: "check_report", report: ids[0], verdict: { verdict: "publish", subcategory: "eyes" } }))
      .toMatchObject({ ok: false, error: { code: "decision_conflict" } });
  });

  it("holds for the owner, whose word alone decides a held report, with confirm", async () => {
    const { review, ids } = await queue();
    expect(await review.run({ action: "check_report", report: ids[0], verdict: { verdict: "hold", reason: "too_far_out" } }))
      .toMatchObject({ ok: true, reports: { decided: { state: "held" } } });
    expect(await review.run({ action: "check_report", report: ids[0], verdict: { verdict: "publish", subcategory: "eyes" } }))
      .toMatchObject({ ok: false, error: { code: "decision_conflict" } });
    expect(await review.run({ action: "decide_report", report: ids[0], verdict: { verdict: "publish", subcategory: "eyes" } }))
      .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await review.run({ action: "decide_report", report: ids[0], confirm: true,
      verdict: { verdict: "publish", subcategory: "eyes" } }))
      .toMatchObject({ ok: true, outcome: "report_decided", reports: { decided: { state: "published" } } });
  });

  it("refuses promotion with its text deleted, and refuses verdicts of the wrong shape", async () => {
    const { review, reports, ids } = await queue(2);
    expect(await review.run({ action: "check_report", report: ids[0], verdict: { verdict: "refuse", reason: "promotion" } }))
      .toMatchObject({ ok: true, reports: { decided: { state: "refused" } } });
    expect((await reports.inspectReports("refused", undefined, 20))[0]!.text.problem).toBeNull();
    for (const verdict of [
      { verdict: "publish_with_warning", subcategory: "eyes" },
      { verdict: "publish", aiWarning: "No.", subcategory: "eyes" },
      { verdict: "publish" },
      { verdict: "publish", subcategory: "not-a-subcategory" },
      { verdict: "hold", reason: "spam" },
      { verdict: "refuse", reason: "not_safe" },
      { verdict: "publish", subcategory: "eyes", research: { ...RESEARCH,
        others: [{ url: "https://www.youtube.com/watch?v=invented0001", outcome: "better" }] } },
    ]) {
      expect(await review.run({ action: "check_report", report: ids[1], verdict: verdict as never }))
        .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    }
    expect(await review.run({ action: "check_report", report: "R-9999", verdict: { verdict: "publish", subcategory: "eyes" } }))
      .toMatchObject({ ok: false, error: { code: "item_not_found" } });
  });
});
