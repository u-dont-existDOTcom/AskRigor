import { describe, expect, it } from "vitest";

import { InMemoryAtlasGlanceRows, InMemoryAtlasPageSource, InMemoryAtlasPublicationStore } from "@askrigor/evidence-repository";

import { AtlasGlanceReview } from "../apps/research-mcp/src/atlas/glance-review.js";
import { loadAtlasSubcategory, renderAtlasSubcategory } from "../apps/research-mcp/src/atlas/health-pages.js";

// The owner, 3 Nov 2026, on GPT's practitioner scorecard: "make that prominent". A problem's rows at a glance: proposed
// privately, shown only on the owner's yes, withdrawn for good. Every figure, name and address here is invented.

const AT = "2026-11-04T09:00:00.000Z";
const ROW = {
  subcategory: "gut-health", rowClass: "practitioner", what: "An invented surgeon's published series for an invented fistula",
  result: "783 of 875 healed after the first procedure", comparison: null, followUp: "a median of 33 months",
  limits: "Only 875 of 1,250 operated were analysed; no matched comparison.",
  sources: ["PMID: 12345678", "https://journal.example/articles/invented-series"], namesAPerson: true,
} as const;

function setup() {
  const glance = new InMemoryAtlasGlanceRows();
  const review = new AtlasGlanceReview({ glance, now: () => new Date(AT) });
  const source = new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore(), glance });
  return { glance, review, source };
}

describe("a problem's rows at a glance (the owner, 3 Nov)", () => {
  it("stores a row privately and shows it only on the owner's yes, with its sources linked", async () => {
    const { review, source } = setup();
    const proposed = await review.run({ action: "propose_glance_row", glanceRow: { ...ROW } });
    expect(proposed).toMatchObject({ ok: true, outcome: "glance_row_proposed", glance: { changed: { row: "G-1001" } } });
    expect(proposed.text).toContain("published outcomes only");
    expect((await loadAtlasSubcategory(source, "gut-health"))!.glance.encouraging).toEqual([]);

    expect(await review.run({ action: "show_glance_row", glanceRowId: "G-1001" }))
      .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await review.run({ action: "show_glance_row", glanceRowId: "G-1001", confirm: true }))
      .toMatchObject({ ok: true, glance: { changed: { row: "G-1001", state: "shown" } } });
    const model = (await loadAtlasSubcategory(source, "gut-health"))!;
    expect(model.glance.encouraging).toMatchObject([{ publicationNumber: null, kind: "practitioner", claim: ROW.what,
      result: ROW.result, followUp: ROW.followUp, limits: ROW.limits }]);
    const page = renderAtlasSubcategory(model);
    expect(page).toContain("A named practitioner’s published results");
    expect(page).toContain('href="https://pubmed.ncbi.nlm.nih.gov/12345678/"');
    expect(page).toContain('href="https://journal.example/articles/invented-series"');

    expect(await review.run({ action: "withdraw_glance_row", glanceRowId: "G-1001" }))
      .toMatchObject({ ok: true, glance: { changed: { state: "withdrawn" } } });
    expect(await review.run({ action: "show_glance_row", glanceRowId: "G-1001", confirm: true }))
      .toMatchObject({ ok: false, error: { code: "decision_conflict" } });
    expect((await loadAtlasSubcategory(source, "gut-health"))!.glance.encouraging).toEqual([]);
  });

  it("refuses contact details in its texts, sources that aren't studies or plain https, and YouTube", async () => {
    const { review, glance } = setup();
    for (const row of [
      { ...ROW, limits: "Write to invented@example.com." },
      { ...ROW, sources: ["an invented journal, 2020"] },
      { ...ROW, sources: ["http://journal.example/plain"] },
      { ...ROW, sources: ["https://www.youtube.com/watch?v=invented0001"] },
      { ...ROW, subcategory: "not-a-subcategory" },
    ]) {
      expect(await review.run({ action: "propose_glance_row", glanceRow: row as never }))
        .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    }
    expect(await glance.inspect("proposed", undefined, 50)).toEqual([]);
  });
});
