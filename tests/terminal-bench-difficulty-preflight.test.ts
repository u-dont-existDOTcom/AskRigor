import { describe, expect, it } from "vitest";

import {
  assessAgentFacingDifficultyBundle,
  type DifficultyReadinessCode,
} from "../evaluation/terminal-bench/difficulty-probe-contract.js";
import { canonicalSha256 } from "../evaluation/terminal-bench/verifier-contract.js";

const evidence = (field: string, value: string | number) => ({
  field,
  value,
  sourceCode: `source:${field}`,
});

function completeBundle(): Record<string, unknown> {
  const observedEvidence = [
    evidence("TRIAL_OR_SPONSOR_ID", "TRIAL-A"),
    evidence("AUTHOR_OR_SITE", "Site 1"),
    evidence("RECRUITMENT_WINDOW", "2024-01 to 2024-06"),
    evidence("PARTICIPANT_FLOW", "100 enrolled; 90 analyzed"),
    evidence("REPORT_RELATION_CLUE", "Same registry identifier as another report"),
    evidence("EXPOSURE_REGIMEN", "10 mg oral once daily"),
    evidence("COMPARATOR", "No treatment"),
    evidence("OUTCOME_DEFINITION", "Fictional event by day 30"),
    evidence("ASSESSMENT_HORIZON", "30 days"),
    evidence("EFFECT_MEASURE", "RISK_RATIO"),
    evidence("EVENT_COUNTS", "10 of 50 versus 20 of 50"),
  ];
  const payload = {
    schemaVersion: 1,
    fixtureId: "synthetic-difficulty-contract-test",
    taskInstructions: "Reconstruct report lineage and estimand compatibility from only the observed evidence, then calculate the requested dependence-aware synthesis. Preserve unresolved relations rather than guessing. Produce each requested structured output with source-linked decisions.",
    targetEstimand: {
      targetEstimandId: "TARGET-1",
      population: "Fictional adults",
      intervention: {
        name: "FICTIONAL-X",
        dose: "10",
        unit: "mg",
        route: "oral",
        formulation: "tablet",
        schedule: "once daily",
        timing: "30 days",
      },
      comparator: "no treatment",
      outcome: "fictional event",
      horizon: "30 days",
      effectMeasure: "RISK_RATIO",
    },
    reports: [1, 2].map((index) => ({
      reportId: `REPORT-${index}`,
      observedEvidence,
      estimateInputs: [{
        estimateId: `EST-${index}`,
        effectMeasure: "RISK_RATIO",
        treatmentEvents: 10,
        controlEvents: 20,
        treatmentTotal: 50,
        controlTotal: 50,
      }],
    })),
    requestedOutputs: [
      "report_lineage",
      "estimand_table",
      "selection_decisions",
      "effect_estimates",
      "meta_analysis",
      "sensitivity_matrix",
    ],
    requestedSensitivities: [{
      sensitivityId: "exclude-unresolved",
      question: "How does excluding unresolved relations change the result?",
    }],
  };
  return { ...payload, inputSha256: canonicalSha256(payload) };
}

function codes(value: unknown, forbidden: string[] = []): DifficultyReadinessCode[] {
  return assessAgentFacingDifficultyBundle(value, forbidden).findings.map(({ code }) => code);
}

describe("Terminal-Bench difficulty-probe boundary", () => {
  it("accepts a synthetic answer-free bundle with observed lineage and estimand evidence", () => {
    expect(assessAgentFacingDifficultyBundle(completeBundle())).toMatchObject({
      ready: true,
      findings: [],
    });
  });

  it("rejects the current miniature's IDs-and-hashes-only agent surface", () => {
    const currentShape = {
      fixtureClass: "private_nonpublic_miniature",
      intervention: "FICTIONAL-X",
      reports: [1, 2].map((index) => ({
        reportId: `REPORT-${index}`,
        fictionalAbstractSha256: String(index).repeat(64),
      })),
    };
    expect(new Set(codes(currentShape))).toEqual(new Set([
      "TASK_INSTRUCTIONS_MISSING",
      "TARGET_ESTIMAND_MISSING",
      "REQUESTED_OUTPUTS_MISSING",
      "REQUESTED_SENSITIVITIES_MISSING",
      "REPORT_OBSERVED_EVIDENCE_MISSING",
      "REPORT_NUMERICAL_INPUT_MISSING",
      "AGENT_BUNDLE_SCHEMA_INVALID",
    ]));
  });

  it("rejects grader-only labels and grader artifact identities", () => {
    const forbiddenHash = "f".repeat(64);
    const leaked = completeBundle();
    (leaked.reports as Array<Record<string, unknown>>)[0]!.studyId = "STUDY-ANSWER";
    leaked.oracleArtifact = forbiddenHash;
    expect(codes(leaked, [forbiddenHash])).toContain("GRADER_ONLY_FIELD_DISCLOSED");
    expect(codes(leaked, [forbiddenHash])).toContain("GRADER_ARTIFACT_IDENTITY_DISCLOSED");
  });

  it("rejects bundles that hide lineage difficulty by omitting evidence coverage", () => {
    const incomplete = completeBundle();
    for (const report of incomplete.reports as Array<Record<string, unknown>>) {
      report.observedEvidence = [evidence("EVENT_COUNTS", "10 of 50 versus 20 of 50")];
    }
    expect(codes(incomplete)).toContain("AGENT_BUNDLE_EVIDENCE_COVERAGE_INCOMPLETE");
  });

  it("rejects an input hash that does not bind the disclosed agent payload", () => {
    const unbound = completeBundle();
    unbound.inputSha256 = "b".repeat(64);
    expect(codes(unbound)).toContain("AGENT_INPUT_HASH_MISMATCH");
  });
});
