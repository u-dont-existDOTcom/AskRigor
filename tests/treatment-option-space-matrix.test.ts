import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

interface OptionSpaceCase {
  id: string;
  prompt: string;
  expected_option_space_review: "required" | "not_required";
  reason: string;
  live_acceptance_priority: boolean;
}

interface OptionSpaceMatrix {
  schema_version: number;
  purpose: string;
  cases: OptionSpaceCase[];
}

async function loadMatrix(): Promise<OptionSpaceMatrix> {
  return JSON.parse(await readFile(
    rootFile("docs/treatment-option-space-matrix-v0.1.0.json"),
    "utf8",
  )) as OptionSpaceMatrix;
}

describe("treatment option-space prompt matrix", () => {
  it("keeps decision breadth separate from narrow intervention analysis", async () => {
    const matrix = await loadMatrix();
    expect(matrix.schema_version).toBe(1);
    expect(matrix.purpose).toContain("does not prove Custom GPT behavior");
    expect(matrix.cases).toHaveLength(15);
    expect(new Set(matrix.cases.map(({ id }) => id)).size).toBe(15);
    expect(matrix.cases.filter(({ expected_option_space_review }) =>
      expected_option_space_review === "required"
    )).toHaveLength(9);
    expect(matrix.cases.filter(({ expected_option_space_review }) =>
      expected_option_space_review === "not_required"
    )).toHaveLength(6);
  });

  it("requires broad discovery for the observed clinician-pathway endorsement failure", async () => {
    const matrix = await loadMatrix();
    const observed = matrix.cases.find(({ id }) =>
      id === "required-do-you-agree-with-pathway"
    );
    expect(observed).toMatchObject({
      prompt: "I have hip arthritis. My doctor tells me to take celecoxib and eventually get hip surgery. Do you agree?",
      expected_option_space_review: "required",
      live_acceptance_priority: true,
    });
  });

  it("does not turn every Forum Signal question into a full treatment-landscape review", async () => {
    const matrix = await loadMatrix();
    expect(matrix.cases.find(({ id }) =>
      id === "not-required-narrow-experience"
    )).toMatchObject({
      expected_option_space_review: "not_required",
      live_acceptance_priority: true,
    });
    expect(matrix.cases.find(({ id }) =>
      id === "not-required-narrow-time-to-effect"
    )).toMatchObject({
      expected_option_space_review: "not_required",
      live_acceptance_priority: true,
    });
  });

  it("preserves internal breadth triggers while keeping the public comparison educational", async () => {
    const [projectRouter, skill, generated] = await Promise.all([
      readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
      readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
    ]);
    for (const instruction of [projectRouter, skill]) {
      for (const fragment of [
        "option-space ledger",
        "do you agree",
        "named or prescribed treatment",
        "proposed care",
        "diagnosis alternatives",
        "nonaction/natural history",
        "conventional nonsurgical",
        "lifestyle/rehab/mechanical",
        "relevant heterodox/adjunct",
        "procedural/surgical",
        "across plausible classes",
        "A request to omit alternatives limits execution, not applicability or the no-verdict gate",
        "No verdict",
        "realistic alternatives and nonaction risk",
      ]) {
        expect(instruction, fragment).toContain(fragment);
      }
    }

    for (const fragment of [
      "option-space ledger",
      "the named approach",
      "diagnosis alternatives",
      "nonaction/natural history",
      "conventional nonsurgical",
      "lifestyle/rehab/mechanical",
      "relevant heterodox/adjunct",
      "procedural/surgical",
      "across plausible classes",
      "A request to omit alternatives limits execution, not applicability",
      "educational evidence comparison",
      "never a recommendation or ranking for a person",
    ]) {
      expect(generated, fragment).toContain(fragment);
    }
    for (const fragment of [
      "do you agree",
      "named or prescribed treatment",
      "proposed care",
      "no-verdict gate",
      "No verdict",
    ]) {
      expect(generated, fragment).not.toContain(fragment);
    }
  });

  it("reserves both broadening and narrow-scope controls for live acceptance", async () => {
    const matrix = await loadMatrix();
    const priority = matrix.cases.filter(({ live_acceptance_priority }) =>
      live_acceptance_priority
    );
    expect(priority).toHaveLength(6);
    expect(priority.filter(({ expected_option_space_review }) =>
      expected_option_space_review === "required"
    )).toHaveLength(4);
    expect(priority.filter(({ expected_option_space_review }) =>
      expected_option_space_review === "not_required"
    )).toHaveLength(2);
  });
});
