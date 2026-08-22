import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const EXPECTED_REASONS = new Set([
  "personal_treatment_decision",
  "timing_or_delay_decision",
  "real_world_outcome",
  "safety_or_tolerability",
  "alternatives_or_comparison",
  "population_treatment_decision",
  "implicit_alternatives_or_decision",
  "user_scope_cannot_deselect",
  "formal_evidence_cannot_deselect",
  "uncertain_defaults_to_required",
  "treatment_decision_criteria",
  "simple_definition_or_terminology",
  "pure_mechanism_without_real_world_claim",
  "emergency_triage_before_stabilization",
  "no_meaningful_user_experience_corpus",
  "direct_transformation_without_research",
]);

interface RoutingCase {
  id: string;
  prompt: string;
  expected_forum_signal: "required" | "not_required";
  reason: string;
  live_acceptance_priority: boolean;
}

interface RoutingMatrix {
  schema_version: number;
  purpose: string;
  cases: RoutingCase[];
}

async function loadMatrix(): Promise<RoutingMatrix> {
  return JSON.parse(await readFile(
    rootFile("docs/forum-signal-routing-matrix-v0.1.0.json"),
    "utf8",
  )) as RoutingMatrix;
}

describe("Forum Signal routing prompt matrix", () => {
  it("keeps a synthetic, balanced, uniquely identified routing corpus", async () => {
    const matrix = await loadMatrix();
    expect(matrix.schema_version).toBe(1);
    expect(matrix.purpose).toContain("does not prove Custom GPT behavior");
    expect(matrix.cases).toHaveLength(24);
    expect(new Set(matrix.cases.map(({ id }) => id)).size).toBe(matrix.cases.length);
    expect(matrix.cases.filter(({ expected_forum_signal }) =>
      expected_forum_signal === "required"
    )).toHaveLength(15);
    expect(matrix.cases.filter(({ expected_forum_signal }) =>
      expected_forum_signal === "not_required"
    )).toHaveLength(9);
    for (const testCase of matrix.cases) {
      expect(testCase.id).toMatch(/^(?:required|not-required)-[a-z0-9-]+$/u);
      expect(testCase.prompt.trim().length).toBeGreaterThan(10);
      expect(EXPECTED_REASONS.has(testCase.reason)).toBe(true);
    }
  });

  it("treats unstated alternatives, formal-only scope, and population wording as required", async () => {
    const matrix = await loadMatrix();
    const expectedRequired = new Map(matrix.cases.map((testCase) => [
      testCase.prompt,
      testCase.expected_forum_signal,
    ]));

    for (const prompt of [
      "Is hip replacement a good idea for me?",
      "My surgeon recommended a hip replacement. What should I consider before deciding?",
      "Is hip replacement generally a good idea for active adults with severe osteoarthritis?",
      "Use only trials and do not check forums: is hip replacement worth it?",
      "Tell me about hip replacement.",
    ]) {
      expect(expectedRequired.get(prompt), prompt).toBe("required");
    }
  });

  it("limits nonactivation to affirmative irrelevant-crowd findings", async () => {
    const matrix = await loadMatrix();
    const nontriggers = matrix.cases.filter(({ expected_forum_signal }) =>
      expected_forum_signal === "not_required"
    );
    expect(new Set(nontriggers.map(({ reason }) => reason))).toEqual(new Set([
      "simple_definition_or_terminology",
      "pure_mechanism_without_real_world_claim",
      "emergency_triage_before_stabilization",
      "no_meaningful_user_experience_corpus",
      "direct_transformation_without_research",
    ]));
  });

  it("preserves internal routing while the public surface stays educational-only", async () => {
    const [projectRouter, skill, generated] = await Promise.all([
      readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
      readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
    ]);
    for (const instruction of [projectRouter, skill]) {
      for (const fragment of [
        "personal or practical treatment decision",
        "good idea for me",
        "now versus wait or delay",
        "even if alternatives are unstated",
        "A request to exclude forums limits execution, not applicability",
        "simple definition or terminology",
        "pure chemistry or mechanism with no real-world outcome or safety claim",
        "emergency triage before stabilization",
        "no meaningful user-experience corpus",
        "If uncertain, require it",
      ]) {
        expect(instruction, fragment).toContain(fragment);
      }
    }

    for (const fragment of [
      "For general population-level health research, require Forum Signal",
      "treatment alternatives",
      "avoiding joint replacement or other surgery",
      "A request to exclude forums limits execution, not applicability",
      "simple definition or terminology",
      "pure chemistry or mechanism with no real-world outcome or safety claim",
      "emergency triage before stabilization",
      "no meaningful user-experience corpus",
      "If uncertain, require it",
      "never a recommendation or ranking for a person",
    ]) {
      expect(generated, fragment).toContain(fragment);
    }
    for (const fragment of [
      "personal or practical treatment decision",
      "good idea for me",
      "now versus wait or delay",
      "even if alternatives are unstated",
      "`do you agree`",
    ]) {
      expect(generated, fragment).not.toContain(fragment);
    }
  });

  it("selects both positive and negative boundary cases for later live acceptance", async () => {
    const matrix = await loadMatrix();
    const priority = matrix.cases.filter(({ live_acceptance_priority }) =>
      live_acceptance_priority
    );
    expect(priority).toHaveLength(9);
    expect(priority.some(({ expected_forum_signal }) =>
      expected_forum_signal === "required"
    )).toBe(true);
    expect(priority.some(({ expected_forum_signal }) =>
      expected_forum_signal === "not_required"
    )).toBe(true);
    expect(priority.map(({ id }) => id)).toContain("required-personal-good-idea");
    expect(priority.map(({ id }) => id)).toContain("not-required-emergency-triage");
  });
});
