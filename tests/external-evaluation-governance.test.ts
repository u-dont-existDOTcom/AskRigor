import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assessBenchmarkTargetIntegrity,
  assertDefectLedgerPolicyMutants,
  compileGovernanceSchemas,
  validateBenchmarkGovernance,
} from "../evaluation/governance/src/validate.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("external-evaluation benchmark governance", () => {
  it("validates and cross-binds the MAST and Terminal-Bench preflight instances", async () => {
    await expect(validateBenchmarkGovernance(root)).resolves.toEqual({
      status: "PASS",
      schemaVersion: 1,
      manifestCount: 2,
      defectLedgerCount: 2,
      recordedDefectCount: 1,
      noDefectClaimMade: false,
      policyMutantsRejected: 4,
      crossArtifactBindingsVerified: 25,
      benchmarkTargetIntegrityReviewCount: 1,
      benchmarkTargetConflictCount: 1,
      benchmarkTargetTuningAllowedCount: 0,
      paidInferencePerformed: false,
      latentAnswersPublished: false,
    });
  });

  it("rejects malformed immutable identities and ambiguous preflight subjects", async () => {
    const { validateManifest } = await compileGovernanceSchemas(root);
    const manifest = JSON.parse(
      await readFile(rootFile("evaluation/governance/instances/mast-sct-preflight.manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    const benchmark = manifest.benchmark as Record<string, unknown>;
    const sourceIdentity = benchmark.sourceIdentity as Record<string, unknown>;
    const invalidHash = structuredClone(manifest);
    ((invalidHash.benchmark as Record<string, unknown>).sourceIdentity as Record<string, unknown>).value =
      String(sourceIdentity.value).toUpperCase();
    expect(validateManifest(invalidHash)).toBe(false);

    const ambiguousSubject = structuredClone(manifest);
    ambiguousSubject.subjectUnderTest = {
      kind: "MODEL",
      provider: "OpenAI",
      model: "gpt-5.6-sol",
    };
    expect(validateManifest(ambiguousSubject)).toBe(false);
  });

  it("kills consequential-recheck and correction-state policy mutants", async () => {
    const { validateLedger } = await compileGovernanceSchemas(root);
    expect(assertDefectLedgerPolicyMutants(validateLedger)).toBe(4);
  });

  it("blocks Heme010 score-only tuning when the rewarded target is clinically contestable", async () => {
    const decision = assessBenchmarkTargetIntegrity({
      itemId: "Heme010",
      exactPopulation: "remote recurrence-free isolated subsegmental pulmonary embolism",
      timing: "years after the acute event",
      decisionContext: "asymptomatic follow-up management rather than acute anticoagulation triage",
      highAuthorityEvidence: [
        "current high-authority venous-thromboembolism guidance reviewed for this population and timing",
      ],
      evidenceCurrentnessChecked: true,
      benchmarkConformity: "DOES_NOT_CONFORM",
      clinicalValidity: "CONTESTABLE",
      protocolChangeBasis: "BENCHMARK_SCORE_ONLY",
    });

    expect(decision).toEqual({
      itemId: "Heme010",
      classification: "BENCHMARK_TARGET_CONFLICT",
      benchmarkConformity: "DOES_NOT_CONFORM",
      clinicalValidity: "CONTESTABLE",
      protocolTuningAllowed: false,
      frozenOfficialResultDisposition: "PRESERVE_UNCHANGED",
    });

    const policy = await readFile(
      rootFile("evaluation/governance/correction-and-recheck-policy.md"),
      "utf8",
    );
    for (const required of [
      "Benchmark-target integrity before protocol tuning",
      "exact population",
      "timing",
      "decision context",
      "current high-authority evidence",
      "benchmark conformity as a separate field from clinical validity",
      "BENCHMARK_TARGET_CONFLICT",
      "Do not force the benchmark action into AskRigor",
      "official benchmark artifacts remain unchanged",
    ]) expect(policy).toContain(required);
  });

  it("requires a machine-readable target-integrity record for benchmark conflicts", async () => {
    const { validateLedger } = await compileGovernanceSchemas(root);
    const entry = {
      id: "heme010-development-target-conflict",
      discoveredAt: "2026-09-09T00:00:00Z",
      itemOrPath: "MAST-development/Heme010",
      field: "rewarded clinical actions",
      class: "BENCHMARK_TARGET_CONFLICT",
      benchmarkTargetIntegrity: {
        exactPopulation: "remote recurrence-free prior event",
        timing: "years after the acute decision",
        decisionContext: "follow-up prevention and counseling",
        highAuthorityEvidence: ["current high-authority evidence review"],
        evidenceCurrentnessChecked: true,
        benchmarkConformity: "DOES_NOT_CONFORM",
        clinicalValidity: "CONTESTABLE",
        protocolChangeBasis: "BENCHMARK_SCORE_ONLY",
        frozenOfficialResultDisposition: "PRESERVE_UNCHANGED",
      },
      before: { representation: "TEXT", value: "benchmark target" },
      proposedAfter: { representation: "ABSENT", value: null },
      verdict: "development-only target-integrity conflict",
      reason: "The exact population, timing, and context make the rewarded actions contestable.",
      evidence: [{ kind: "DOMAIN_REVIEW", value: "sanitized development review" }],
      impact: {
        affectedItems: ["Heme010"],
        affectedEpochs: [],
        scoreMayChange: false,
        programConclusionMayChange: false,
        boundedStatement: "Official frozen results remain unchanged.",
      },
      severity: "NOT_ESTABLISHED",
      status: "SUSPECTED",
      discoverer: "development-regression",
      independentRecheckRequired: true,
    };
    const ledger = {
      schemaVersion: 1,
      benchmarkId: "mast-development-regression",
      evaluatorVersion: "frozen-unchanged",
      manifestIdentity: "a".repeat(64),
      entries: [entry],
    };

    expect(validateLedger(ledger), validateLedger.errors?.map(({ message }) => message).join(","))
      .toBe(true);
    const missingIntegrity = structuredClone(ledger);
    delete (missingIntegrity.entries[0] as { benchmarkTargetIntegrity?: unknown })
      .benchmarkTargetIntegrity;
    expect(validateLedger(missingIntegrity)).toBe(false);

    const missingClass = structuredClone(ledger);
    delete (missingClass.entries[0] as { class?: unknown }).class;
    expect(validateLedger(missingClass)).toBe(false);

    const falselyAlignedConflict = structuredClone(ledger);
    falselyAlignedConflict.entries[0]!.benchmarkTargetIntegrity.clinicalValidity =
      "CONSISTENT_WITH_CURRENT_HIGH_AUTHORITY_EVIDENCE";
    expect(validateLedger(falselyAlignedConflict)).toBe(false);

    for (const field of ["exactPopulation", "timing", "decisionContext"] as const) {
      const whitespaceOnly = structuredClone(ledger);
      whitespaceOnly.entries[0]!.benchmarkTargetIntegrity[field] = " ";
      expect(validateLedger(whitespaceOnly)).toBe(false);
    }
    const whitespaceOnlyEvidence = structuredClone(ledger);
    whitespaceOnlyEvidence.entries[0]!.benchmarkTargetIntegrity.highAuthorityEvidence = [" "];
    expect(validateLedger(whitespaceOnlyEvidence)).toBe(false);
  });

  it("never permits score-only tuning even when a benchmark target is aligned", () => {
    const base = {
      itemId: "generic-aligned-development-case",
      exactPopulation: "exact reviewed population",
      timing: "current decision point",
      decisionContext: "direct clinical management",
      highAuthorityEvidence: ["current high-authority evidence"],
      evidenceCurrentnessChecked: true,
      benchmarkConformity: "DOES_NOT_CONFORM" as const,
      clinicalValidity: "CONSISTENT_WITH_CURRENT_HIGH_AUTHORITY_EVIDENCE" as const,
    };

    expect(assessBenchmarkTargetIntegrity({
      ...base,
      protocolChangeBasis: "BENCHMARK_SCORE_ONLY",
    }).protocolTuningAllowed).toBe(false);
    expect(assessBenchmarkTargetIntegrity({
      ...base,
      protocolChangeBasis: "GENERALIZED_CLINICAL_DEFECT",
    }).protocolTuningAllowed).toBe(true);
    expect(() => assessBenchmarkTargetIntegrity({
      ...base,
      evidenceCurrentnessChecked: false,
      protocolChangeBasis: "GENERALIZED_CLINICAL_DEFECT",
    })).toThrow("BENCHMARK_TARGET_INTEGRITY_REVIEW_INCOMPLETE");
    expect(() => assessBenchmarkTargetIntegrity({
      ...base,
      benchmarkConformity: "NOT_ASSESSED" as never,
      protocolChangeBasis: "GENERALIZED_CLINICAL_DEFECT",
    })).toThrow("BENCHMARK_TARGET_INTEGRITY_REVIEW_INCOMPLETE");
  });
});
