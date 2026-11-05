import { describe, expect, it } from "vitest";

import {
  AtlasReportError,
  InMemoryAtlasPageSource,
  InMemoryAtlasPlacements,
  InMemoryAtlasPublicationStore,
  InMemoryAtlasReports,
  type AtlasReportDecision,
} from "@askrigor/evidence-repository";

// Owner answer 229a: people's reports in memory, with migration 0026's semantics (the PostgreSQL functions themselves
// run in scripts/research-contributor-access-postgres-acceptance.mts against a real database).

const AUTHOR = "a".repeat(64);
const OTHER = "b".repeat(64);
const AT = "2026-11-04T09:00:00.000Z";
const REPORT = { problem: "An invented itch", tried: "An invented cream", whatHappened: "It eased within a week." };

const decision = (publicId: string, overrides: Partial<AtlasReportDecision> = {}): AtlasReportDecision => ({
  publicId, verdict: "publish", aiWarning: null, reason: null, research: null, categoryKey: "health",
  subcategoryKey: "skin-hair-and-nails", at: AT, ...overrides,
});

function stores() {
  const placements = new InMemoryAtlasPlacements();
  const reports = new InMemoryAtlasReports(placements);
  const source = new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore(), placements, reports });
  return { placements, reports, source };
}

describe("people's reports in memory (owner answer 229a)", () => {
  it("receives a report privately and publishes it only on the check's verdict, placed where it says", async () => {
    const { reports, placements, source } = stores();
    const id = await reports.submitReport(AUTHOR, "form", { ...REPORT, displayName: "Invented name" }, AT);
    expect(id).toBe("R-1001");
    expect(await source.read((reads) => reads.readReport(id, null))).toBeNull();
    expect((await reports.inspectReports("received", undefined, 20)).map(({ publicId }) => publicId)).toEqual([id]);
    expect(await reports.decideReport(decision(id, { verdict: "publish_with_warning", aiWarning: "An invented caution." })))
      .toBe("published");
    const shown = (await source.read((reads) => reads.readReport(id, OTHER)))!;
    expect(shown).toMatchObject({ displayName: "Invented name", aiWarning: "An invented caution.",
      viewer: { own: false, answer: null } });
    expect(shown.text.problem).toBe(REPORT.problem);
    expect(await placements.listPlacements()).toMatchObject([{ itemNumber: id, subcategoryKey: "skin-hair-and-nails" }]);
    // Decided once: a published report is not checked again.
    await expect(reports.decideReport(decision(id))).rejects.toThrow(AtlasReportError);
  });

  it("holds a report for the owner, whose word publishes it; a refusal deletes its text", async () => {
    const { reports, source } = stores();
    const held = await reports.submitReport(AUTHOR, "ai_app", { ...REPORT, research: { safety: "invented" } }, AT);
    const spam = await reports.submitReport(AUTHOR, "form", REPORT, AT);
    expect(await reports.decideReport(decision(held, { verdict: "hold", reason: "too_far_out", categoryKey: null,
      subcategoryKey: null }))).toBe("held");
    await expect(reports.decideReport(decision(held, { verdict: "hold", reason: "unsure", categoryKey: null,
      subcategoryKey: null }))).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    expect(await reports.decideReport(decision(held))).toBe("published");
    expect(await reports.decideReport(decision(spam, { verdict: "refuse", reason: "spam", categoryKey: null,
      subcategoryKey: null }))).toBe("refused");
    const [refused] = await reports.inspectReports("refused", undefined, 20);
    expect(refused!.text).toEqual(Object.fromEntries(Object.keys(refused!.text).map((field) => [field, null])));
    expect(await source.read((reads) => reads.listOwnReports(AUTHOR))).toMatchObject([
      { publicId: spam, state: "refused", refuseReason: "spam", problem: null },
      { publicId: held, state: "published", problem: REPORT.problem },
    ]);
  });

  it("refuses malformed reports and verdicts, and keeps to five a day", async () => {
    const { reports } = stores();
    for (const bad of [{ ...REPORT, problem: " padded " }, { ...REPORT, tried: "" }, { tried: "x", whatHappened: "y" },
      { ...REPORT, dose: "x".repeat(301) }, { ...REPORT, extra: "no" }]) {
      await expect(reports.submitReport(AUTHOR, "form", bad as never, AT)).rejects.toMatchObject({ code: "INPUT_INVALID" });
    }
    const ids = [];
    for (let index = 0; index < 5; index += 1) ids.push(await reports.submitReport(AUTHOR, "form", REPORT, AT));
    await expect(reports.submitReport(AUTHOR, "form", REPORT, AT)).rejects.toMatchObject({ code: "LIMIT" });
    expect(await reports.submitReport(AUTHOR, "form", REPORT, "2026-11-05T09:00:00.000Z")).toBe("R-1006");
    for (const bad of [decision(ids[0]!, { verdict: "publish_with_warning" }), decision(ids[0]!, { reason: "spam" }),
      decision(ids[0]!, { verdict: "refuse", reason: "not_safe", categoryKey: null, subcategoryKey: null }),
      decision(ids[0]!, { categoryKey: null })]) {
      await expect(reports.decideReport(bad as AtlasReportDecision)).rejects.toMatchObject({ code: "INPUT_INVALID" });
    }
    expect(await reports.decideReport(decision("R-9999"))).toBeNull();
  });

  it("counts other people's answers, never its author's, and only on a published report", async () => {
    const { reports, source } = stores();
    const id = await reports.submitReport(AUTHOR, "form", REPORT, AT);
    await expect(reports.setAnswer(OTHER, id, "worked", AT)).rejects.toMatchObject({ code: "NOT_SHOWN" });
    await reports.decideReport(decision(id));
    await expect(reports.setAnswer(AUTHOR, id, "worked", AT)).rejects.toMatchObject({ code: "OWN" });
    expect(await reports.setAnswer(OTHER, id, "did_not", AT)).toEqual({ worked: 0, didNot: 1 });
    expect(await reports.setAnswer(OTHER, id, "worked", AT)).toEqual({ worked: 1, didNot: 0 });
    expect((await source.read((reads) => reads.readReport(id, OTHER)))!.viewer).toEqual({ own: false, answer: "worked" });
    expect((await source.read((reads) => reads.readReport(id, AUTHOR)))!.viewer).toEqual({ own: true, answer: null });
    expect(await reports.setAnswer(OTHER, id, null, AT)).toEqual({ worked: 0, didNot: 0 });
  });

  it("lets only its author take a report down, with its answers and place; forgetting deletes all of theirs", async () => {
    const { reports, placements } = stores();
    const first = await reports.submitReport(AUTHOR, "form", REPORT, AT);
    const second = await reports.submitReport(AUTHOR, "form", REPORT, AT);
    const theirs = await reports.submitReport(OTHER, "form", REPORT, AT);
    await reports.decideReport(decision(first));
    await reports.decideReport(decision(theirs));
    await reports.setAnswer(AUTHOR, theirs, "worked", AT);
    expect(await reports.takeDown(OTHER, first)).toBe(false);
    expect(await reports.takeDown(AUTHOR, first)).toBe(true);
    expect((await placements.listPlacements()).map(({ itemNumber }) => itemNumber)).toEqual([theirs]);
    expect(await reports.forgetReports(AUTHOR)).toEqual({ reports: 1, answers: 1 });
    expect((await reports.inspectReports("received", undefined, 20)).map(({ publicId }) => publicId)).not.toContain(second);
    expect((await reports.inspectReports("published", undefined, 20))[0]!.answers).toEqual({ worked: 0, didNot: 0 });
  });
});
