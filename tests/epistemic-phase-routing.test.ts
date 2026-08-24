import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url);

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function xmlCase(text: string, tag: "case" | "Case", id: string): string {
  const start = text.indexOf(`<${tag} id="${id}">`);
  const end = text.indexOf(`</${tag}>`, start);
  expect(start, `missing ${id}`).toBeGreaterThanOrEqual(0);
  expect(end, `unterminated ${id}`).toBeGreaterThan(start);
  return text.slice(start, end).replace(/\s+/gu, " ");
}

describe("canonical epistemic phase and heuristic-attractor routing", () => {
  it("makes phase classification and heuristic scope controlling in Universal", async () => {
    const universal = await readFile(
      new URL("protocols/Universal_Instructions.xml", ROOT),
      "utf8",
    );

    expect(universal).toMatch(
      /version="20\.5\.15" revisionDate="2026-08-24"/u,
    );
    for (const singleton of [
      '<revision version="20.5.15" priority="Critical">',
      '<heuristic_attractor_check priority="Critical">',
      '<epistemic_phase_router priority="Critical">',
    ]) {
      expect(occurrences(universal, singleton), singleton).toBe(1);
    }

    for (const required of [
      "Optimize DEVELOPMENT; freeze VALIDATION.",
      "DEVELOPMENT data may influence the hypothesis or model but cannot independently confirm that it generalizes",
      "VALIDATION data may confirm or refute a frozen model but may not influence that frozen model",
      "Cross-validation within DEVELOPMENT is a model-selection and search instrument, not independent confirmation",
      "Freeze before VALIDATION, not before DISCOVERY",
      "default current exploratory data to DEVELOPMENT unless explicitly designated otherwise",
      "merely for ritual purity",
      "A model discovered post hoc on Dataset A becomes scientifically testable",
      "A correct heuristic applied to the wrong phase is an error. Do not confuse rigor with indiscriminate constraint.",
      "treat recurrence as evidence that a higher-level heuristic is hijacking task interpretation",
      "What useful action would this heuristic suppress if misapplied?",
      "Is there a more specific instruction or first-principles objective that should override it?",
      "Heuristic-attractor check:",
      "Epistemic-phase check:",
    ]) {
      expect(universal).toContain(required);
    }
  });

  it("prevents HRP precedence from erasing the Universal phase distinction", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");

    expect(hrp).toMatch(/version="20\.5\.23" revisionDate="2026-08-24"/u);
    for (const required of [
      '<Revision version="20.5.23" priority="Critical">',
      '<HeuristicAttractorCheck priority="Critical">',
      '<EpistemicPhaseRouter priority="Critical">',
      'name="WrongPhaseAntiPattern"',
      'name="RecurringCorrectionDiagnosesAttractor"',
      'name="OptimizeDevelopmentFreezeValidation"',
      'name="DevelopmentCrossValidationIsSearch"',
      'name="ValidationFirewall"',
      'name="NoDiscoverySuppression"',
      'id="heuristic_attractor_scope"',
      'id="epistemic_phase_routing"',
      "Future revisions must also preserve the bounded heuristic-attractor check",
      '<Check id="FS196">',
    ]) {
      expect(hrp).toContain(required);
    }
  });

  it("routes post-hoc Dataset A search to DEVELOPMENT and reserves Dataset B", async () => {
    const [universal, hrp] = await Promise.all([
      readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8"),
      readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"),
    ]);

    for (const scenario of [
      xmlCase(universal, "case", "PostHocFormulaSearchWithIndependentFutureValidation"),
      xmlCase(hrp, "Case", "PostHocFormulaSearchWithIndependentFutureValidation"),
    ]) {
      expect(scenario).toContain("exact birth data and personality traits");
      expect(scenario).toContain("Treat Dataset A as DEVELOPMENT");
      expect(scenario).toContain("Search it aggressively");
      expect(scenario).toContain("cross-validation");
      expect(scenario).toContain("complexity");
      expect(scenario).toContain("stability");
      expect(scenario).toContain("reserve independent Dataset B for confirmation");
      expect(scenario).toContain("Do not refuse or unnecessarily restrict the search");
    }
  });

  it("does not apply a blind-validation freeze to revealed DEVELOPMENT cases", async () => {
    const [universal, hrp] = await Promise.all([
      readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8"),
      readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"),
    ]);

    for (const scenario of [
      xmlCase(universal, "case", "RevealedDevelopmentCasesDoNotTriggerBlindValidationFreeze"),
      xmlCase(hrp, "Case", "RevealedDevelopmentCasesDoNotTriggerBlindValidationFreeze"),
    ]) {
      expect(scenario).toContain("already revealed development cases");
      expect(scenario).toContain("Do not apply the blind-validation freeze rule");
      expect(scenario).toContain("optimize and inspect errors");
      expect(scenario).toContain("freeze before a genuinely uninspected VALIDATION test");
    }
  });

  it("projects the canonical precedence to worker and project routing", async () => {
    const [agents, router, generatedInstructions] = await Promise.all([
      readFile(new URL("AGENTS.md", ROOT), "utf8"),
      readFile(new URL("project/PROJECT_INSTRUCTIONS.md", ROOT), "utf8"),
      readFile(new URL("docs/custom-gpt-instructions.md", ROOT), "utf8"),
    ]);

    const normalizedAgents = agents.replace(/\s+/gu, " ");
    expect(agents).toContain("## Pre-reasoning epistemic routing");
    expect(normalizedAgents).toContain("Freeze before VALIDATION, not before DISCOVERY");
    expect(router).toContain("## 0. Epistemic phase and heuristic routing");
    expect(router).toContain("DEVELOPMENT=`YES/NO`");
    expect(router).toContain("HRP cannot erase this distinction");

    // The Custom GPT projection deliberately loads the complete runtime
    // protocols instead of embedding a competing or version-pinned excerpt.
    expect(generatedInstructions).toContain("Load Universal first; use its activation boundary");
    expect(generatedInstructions).toContain("then load HRP. HRP wins");
    expect(generatedInstructions).not.toMatch(/Universal (?:20\.5\.14|20\.5\.15)/u);
  });

  it("removes obsolete self-modifying one-shot machinery", async () => {
    await expect(access(new URL(
      ".github/workflows/epistemic-phase-router-one-shot.yml",
      ROOT,
    ))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(new URL(
      "scripts/protocol/apply_epistemic_phase_attractor_2026_08_24.py",
      ROOT,
    ))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
