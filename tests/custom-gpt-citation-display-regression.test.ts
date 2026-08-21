import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

type Control =
  | "materiality_threshold"
  | "direct_claim_link"
  | "no_citation_prose"
  | "inference_label"
  | "material_basis_links"
  | "no_decorative_citation"
  | "obvious_group_mapping"
  | "unverified_or_omit"
  | "citation_entailment";

interface RegressionCase {
  id: string;
  prompt: string;
  required_controls: Control[];
}

interface RegressionFixture {
  schema_version: number;
  purpose: string;
  cases: RegressionCase[];
}

async function loadFixture(): Promise<RegressionFixture> {
  return JSON.parse(await readFile(
    rootFile("docs/custom-gpt-citation-display-regression-v0.1.0.json"),
    "utf8",
  )) as RegressionFixture;
}

async function loadInstructionSurfaces(): Promise<string[]> {
  return Promise.all([
    readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
    readFile(rootFile("project/FORUM_SIGNAL_MODULE.md"), "utf8"),
    readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
    readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
  ]);
}

describe("Custom GPT compact citation-display regressions", () => {
  it("keeps the matrix sanitized and covers every display control", async () => {
    const fixture = await loadFixture();

    expect(fixture.schema_version).toBe(1);
    expect(fixture.purpose).toContain("no private research output or chat content");
    expect(fixture.cases).toHaveLength(7);
    expect(new Set(fixture.cases.map(({ id }) => id)).size).toBe(7);

    const observed = new Set(fixture.cases.flatMap(({ required_controls }) =>
      required_controls
    ));
    const expected = new Set<Control>([
      "materiality_threshold",
      "direct_claim_link",
      "no_citation_prose",
      "inference_label",
      "material_basis_links",
      "no_decorative_citation",
      "obvious_group_mapping",
      "unverified_or_omit",
      "citation_entailment",
    ]);

    expect(observed).toEqual(expected);
  });

  it("applies the same compact citation threshold on every instruction surface", async () => {
    const surfaces = await loadInstructionSurfaces();

    for (const surface of surfaces) {
      expect(surface).toContain("decision-important");
      expect(surface).toContain("quantitative");
      expect(surface).toContain("comparative");
      expect(surface).toContain("safety");
      expect(surface).toContain("causal");
      expect(surface).toContain("contested");
      expect(surface).toContain("time-sensitive");
      expect(surface).toContain("surprising");
      expect(surface).toContain("shortest meaningful phrase");
      expect(surface).toContain("citation prose");
      expect(surface).toContain("`(inferred)`");
      expect(surface).toContain("each material basis");
      expect(surface).toContain("mapping is obvious");
    }
  });

  it("keeps threshold exceptions and unsupported-claim handling explicit", async () => {
    const [project, forum] = (await loadInstructionSurfaces()).slice(0, 2);

    for (const surface of [project, forum]) {
      expect(surface).toContain("Stable connective reasoning");
      expect(surface).toContain("user-supplied facts");
      expect(surface).toContain("decorative citations");
      expect(surface).toContain("unverified or omit it");
      expect(surface).toContain("adjacent source");
      expect(surface).toContain("does not entail");
    }
  });
});
