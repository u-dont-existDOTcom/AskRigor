import { describe, expect, it } from "vitest";
import { INOSITOL_DOSSIER } from "../apps/research-mcp/src/atlas/inositol-dossier.js";

describe("inositol comprehensive research dossier source and form identity", () => {
  const forms = INOSITOL_DOSSIER.forms;
  const all = forms.flatMap((form) => form.evidence);
  it("gives every stereoisomer a separate benefit, harm and quantified evidence boundary", () => {
    expect(forms.map((item) => item.key)).toEqual(["general", "d-chiro", "scyllo", "ip6", "myo", "pinitol"]);
    expect(INOSITOL_DOSSIER.comparisons).toHaveLength(6);
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const form of forms) {
      expect(form.bottomLine.length).toBeGreaterThan(55);
      expect(form.evidence.length).toBeGreaterThan(0);
      expect(form.safety.length).toBeGreaterThan(0);
      for (const item of form.evidence) {
        expect(item.quantified.length, item.title).toBeGreaterThan(45);
        expect(item.interpretation.length, item.title).toBeGreaterThan(35);
        expect(item.sources.length, item.title).toBeGreaterThan(0);
        for (const src of item.sources) {
          expect(src.url, item.title).toMatch(/^https:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov|askrigor\.com|www\.reddit\.com|www\.lesswrong\.com)\//u);
          expect(src.label.length).toBeGreaterThan(5);
        }
      }
    }
  });
  it("preserves important experimental vs human contrasts, null findings and ordinary adverse events", () => {
    const text = JSON.stringify(INOSITOL_DOSSIER);
    for (const phrase of ["56/224", "61/228", "25.0%", "26.8%", "40:1", "13/17",
      "23.1%", "13.3%", "222.8", "262.8", "4.1 visible motor seizures",
      "165.0", "60.9", "45 electrical seizures", "18 g/day", "18.0%",
      "no demonstrated", "not establish", "not an exhaustive"]) {
      expect(text, phrase).toContain(phrase);
    }
  });
  it("does not convert selected reports or study doses into treatment recommendations", () => {
    const text = JSON.stringify(INOSITOL_DOSSIER).toLowerCase();
    expect(text).toContain("unknown");
    expect(text).toContain("not a controlled");
    expect(text).toContain("not dose recommendations");
    expect(text).not.toContain("guaranteed cure");
  });
});
