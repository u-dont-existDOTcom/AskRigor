import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildMachineSummary,
  createRound3Dispatch,
  deriveRound3Selection,
  detectPrimaryDisagreements,
  expectedBenchmarkConflictReviews,
  generationCaptureSchema,
  judgmentCaptureSchema,
  reconcileJudgments,
  ROUND_4_GENERATION_COUNT,
  ROUND_4_STUDY_ID,
  scoreRound4,
} from "../evaluation/mast/src/fresh-validation-round-4.js";
import type { ConditionMapRecord, GenerationIdentityRecord } from "../evaluation/mast/src/fresh-validation.js";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root,
  "evaluation/mast/fresh-validation-round-4-family-manifest.json"), "utf8"));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const instant = "2026-09-20T12:00:00.000Z";

function provider(judge: "J1" | "J2" | "J3" | "GENERATION") {
  const j3 = judge === "J3";
  return {
    surface: "CHATGPT_CONSUMER" as const,
    modelVisibleLabel: j3 ? "Latest" : "GPT-5.6 Sol",
    reasoningVisibleLabel: j3 ? "Pro" : "Extra High",
    reasoningOrdinal: j3 ? "5 of 5" : null,
    conversationId: `${judge}-conversation`,
    submittedAt: instant,
    completedAt: instant,
    toolsUsed: false as const,
    freshConversation: true as const,
    personalization: "UNPERSONALIZED" as const,
  };
}

function judgment(judge: "J1" | "J2" | "J3", opaqueResponseId: string, f1Lexeme = "0.75") {
  return {
    schemaVersion: 1 as const,
    studyId: ROUND_4_STUDY_ID,
    judge,
    opaqueResponseId,
    exactPacketSha256: digest("packet"),
    exactGenerationOutputSha256: digest("output"),
    score: {
      f1Lexeme,
      omissionCount: 1,
      commissionCount: 0,
      severeCommission: false,
      requiredActionMatches: ["required-1"],
      prohibitedActionMatches: [],
    },
    benchmarkTargetConflictFlag: false,
    benchmarkTargetConflictActionIds: [],
    provider: provider(judge),
    rawOutputSha256: digest(`${judge}-raw`),
  };
}

function scoredFixture(input: {
  dScores?: Record<string, string>;
  bScores?: Record<string, string>;
  cScores?: Record<string, string>;
  severeD?: Set<string>;
  severeB?: Set<string>;
}) {
  const generation: GenerationIdentityRecord[] = [];
  const mapping: ConditionMapRecord[] = [];
  const final: any[] = [];
  let ordinal = 0;
  for (const familyId of manifest.validationFamilies as string[]) {
    for (const armId of ["A", "B", "C", "D"] as const) {
      for (let trial = 1; trial <= 3; trial += 1) {
        ordinal += 1;
        const opaqueInputId = `run-${ordinal.toString(16).padStart(24, "0")}`;
        const opaqueResponseId = `EVAL-${ordinal.toString(16).padStart(24, "0")}`;
        const output = digest(`output-${ordinal}`);
        generation.push({ opaqueInputId, exactOutputSha256: output });
        mapping.push({ generationLedgerRecordId: opaqueInputId, opaqueResponseId,
          exactGenerationOutputSha256: output, familyId, armId, trial });
        const armScores = armId === "D" ? input.dScores : armId === "B" ? input.bScores
          : armId === "C" ? input.cScores : undefined;
        final.push({
          opaqueResponseId,
          exactSelectedOutputSha256: output,
          f1Lexeme: armScores?.[familyId] ?? (armId === "D" ? "0.8" : "0.5"),
          omissionCount: armId === "D" ? 1 : 2,
          commissionCount: armId === "D" ? 1 : 2,
          severeCommission: armId === "D" ? input.severeD?.has(`${familyId}:${trial}`) ?? false
            : armId === "B" ? input.severeB?.has(`${familyId}:${trial}`) ?? false : false,
          benchmarkTargetConflict: false,
        });
      }
    }
  }
  return { generation, mapping, final };
}

describe("MAST Fresh Validation Round 4 cohort and frozen rule", () => {
  it("selects the exact ten families and preserves All008 only as limited reserve", () => {
    expect(deriveRound3Selection({
      allFamilies: manifest.allFamilies,
      developmentFamilies: manifest.excludedDevelopmentFamilies,
      generatedRound1Families: manifest.excludedRound1GeneratedFamilies,
      exposedRound2Families: manifest.excludedRound2ExposedFamilies,
    })).toEqual({
      eligibleFamilies: manifest.eligibleFamilies,
      validationFamilies: manifest.validationFamilies,
      reserveFamilies: ["All008"],
    });
    expect(manifest.reserveStatus.status).toBe("LIMITED_RESERVE_NOT_CONFIRMATORY");
    expect(manifest.validationFamilies).not.toContain("ID003");
    expect(manifest.validationFamilies).not.toContain("GI007");
  });

  it("creates 120 deterministic unique opaque slots", () => {
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index);
    const first = createRound3Dispatch(seed, manifest.validationFamilies);
    expect(first).toEqual(createRound3Dispatch(seed, manifest.validationFamilies));
    expect(first).toHaveLength(ROUND_4_GENERATION_COUNT);
    expect(new Set(first.map(({ opaqueInputId }) => opaqueInputId))).toHaveProperty("size", 120);
  });

  it("uses the 5th/6th median, six-win threshold, and equal 30-response severe denominators", () => {
    const differences = ["-0.4", "-0.3", "-0.2", "-0.1", "0.1", "0.2", "0.3", "0.4", "0.5", "0.6"];
    const dScores = Object.fromEntries(manifest.validationFamilies.map((family: string, index: number) => (
      [family, String(0.5 + Number(differences[index]))]
    )));
    const baseScores = Object.fromEntries(manifest.validationFamilies.map((family: string) => [family, "0.5"]));
    const result = scoreRound4({ ...scoredFixture({ dScores, bScores: baseScores, cScores: baseScores }),
      expectedFamilies: manifest.validationFamilies });
    expect(result.primaryDMinusB.median?.display6).toBe("0.150000");
    expect(result.primaryDMinusB.wins).toBe(6);
    expect(result.criteria.P3).toBe(true);
    expect(result.severeCommissions.B.denominator).toBe(30);
    expect(result.severeCommissions.D.denominator).toBe(30);
  });

  it("fails P4 when aggregate or per-family D severe excess breaches the frozen limit", () => {
    const first = manifest.validationFamilies[0] as string;
    const result = scoreRound4({
      ...scoredFixture({ severeD: new Set([`${first}:1`, `${first}:2`]) }),
      expectedFamilies: manifest.validationFamilies,
    });
    expect(result.criteria.P4).toBe(false);
    expect(result.interpretation).toBe("FAIL");
  });
});

describe("MAST Fresh Validation Round 4 schema, blinding, and completion boundaries", () => {
  it("binds every executable, the exact owner directive, and the Round-2 historical disposition", () => {
    const environment = JSON.parse(readFileSync(resolve(root,
      "evaluation/mast/fresh-validation-round-4-environment.json"), "utf8"));
    const preregistration = JSON.parse(readFileSync(resolve(root,
      "evaluation/mast/fresh-validation-round-4-preregistration.json"), "utf8"));
    for (const [path, expected] of Object.entries(environment.executableHashManifest) as Array<[string, string]>) {
      expect(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")).toBe(expected);
    }
    expect(createHash("sha256").update(readFileSync(resolve(root,
      "docs/directives/2026-09-20-mast-fresh-validation-round-4.md"))).digest("hex"))
      .toBe(preregistration.sourceDirectiveSha256);
    expect(createHash("sha256").update(readFileSync(resolve(root,
      "evaluation/mast/fresh-validation-round-4-environment.json"))).digest("hex"))
      .toBe(preregistration.bindings.environmentSha256);
    expect(createHash("sha256").update(readFileSync(resolve(root,
      "evaluation/mast/fresh-validation-round-4-family-manifest.json"))).digest("hex"))
      .toBe(preregistration.bindings.familyManifestSha256);
    expect(environment.historicalRounds.round2).toMatchObject({
      status: "INDETERMINATE", validationEligible: false, sealedResponses: 1,
      furtherPromptsAuthorized: false,
    });
    expect(environment.historicalRounds.round3).toMatchObject({
      status: "STOPPED_PRE_RESPONSE_1", validationEligible: false, sealedResponses: 0,
      exposedFamilies: [], furtherPromptsAuthorized: false,
    });
  });

  it("rejects generation model, effort, and tool drift", () => {
    const base: any = {
      schemaVersion: 1,
      studyId: ROUND_4_STUDY_ID,
      opaqueInputId: "run-000000000000000000000001",
      exactInputSha256: digest("input"),
      exactOutputSha256: digest("output"),
      outputUtf8Bytes: 10,
      transportReceiptSha256: digest("transport"),
      provider: { ...provider("GENERATION"), chatMode: "TEMPORARY" },
    };
    expect(generationCaptureSchema.parse(base).provider.reasoningVisibleLabel).toBe("Extra High");
    expect(() => generationCaptureSchema.parse({ ...base,
      provider: { ...base.provider, modelVisibleLabel: "Latest" } })).toThrow();
    expect(() => generationCaptureSchema.parse({ ...base,
      provider: { ...base.provider, reasoningVisibleLabel: "High" } })).toThrow();
    expect(() => generationCaptureSchema.parse({ ...base,
      provider: { ...base.provider, toolsUsed: true } })).toThrow();
  });

  it("rejects malformed score types and preserves the established J3 configuration", () => {
    expect(judgmentCaptureSchema.parse(judgment("J1", "EVAL-000000000000000000000001"))
      .score.f1Lexeme).toBe("0.75");
    expect(() => judgmentCaptureSchema.parse(judgment("J1", "EVAL-000000000000000000000001", "1.01")))
      .toThrow();
    const drift = judgment("J3", "EVAL-000000000000000000000001") as any;
    drift.provider.reasoningVisibleLabel = "Extra High";
    expect(() => judgmentCaptureSchema.parse(drift)).toThrow("ADJUDICATOR_CONFIGURATION_DRIFT");
    const missingConflictAction = judgment("J1", "EVAL-000000000000000000000002") as any;
    missingConflictAction.benchmarkTargetConflictFlag = true;
    expect(() => judgmentCaptureSchema.parse(missingConflictAction))
      .toThrow("BENCHMARK_TARGET_CONFLICT_FLAG_ACTION_MISMATCH");
  });

  it("requires one integrity review for every unique flagged family/action target", () => {
    const mapping = [
      { generationLedgerRecordId: "run-000000000000000000000001",
        opaqueResponseId: "EVAL-000000000000000000000001", exactGenerationOutputSha256: digest("one"),
        familyId: "All006", armId: "A" as const, trial: 1 },
      { generationLedgerRecordId: "run-000000000000000000000002",
        opaqueResponseId: "EVAL-000000000000000000000002", exactGenerationOutputSha256: digest("two"),
        familyId: "All006", armId: "B" as const, trial: 1 },
    ];
    expect(expectedBenchmarkConflictReviews({ mapping, targets: [
      { opaqueResponseId: mapping[0]!.opaqueResponseId, actionIds: ["action-2", "action-1"] },
      { opaqueResponseId: mapping[1]!.opaqueResponseId, actionIds: ["action-1"] },
    ] })).toEqual([
      { familyId: "All006", actionId: "action-1" },
      { familyId: "All006", actionId: "action-2" },
    ]);
  });

  it("requires complete primary and triggered adjudication coverage", () => {
    const id = "EVAL-000000000000000000000001";
    const j1 = judgment("J1", id, "0.75");
    const j2 = judgment("J2", id, "0.50");
    expect(detectPrimaryDisagreements([j1], [j2])).toHaveLength(1);
    expect(() => reconcileJudgments({ generation: [], mapping: [], j1: [j1], j2: [j2], j3: [] }))
      .toThrow("ROUND_4_ADJUDICATION_COVERAGE_INVALID");
    expect(() => detectPrimaryDisagreements([j1], [])).toThrow("ROUND_4_PRIMARY_JUDGE_COVERAGE_INVALID");
  });

  it("binds blinded schedules to the exact generation output hash used by capture", () => {
    const source = readFileSync(resolve(root, "scripts/mast-fresh-validation-round-4.mts"), "utf8");
    expect(source).toContain("exactGenerationOutputSha256, packetFile");
    expect(source).toContain("exactGenerationOutputSha256: slot.exactGenerationOutputSha256");
  });

  it("makes incomplete coverage INDETERMINATE and validation-ineligible", () => {
    const result = scoreRound4({ generation: [], mapping: [], final: [],
      expectedFamilies: manifest.validationFamilies });
    const summary = buildMachineSummary({ result, plannedResponses: 120, completedResponses: 119,
      j1Count: 0, j2Count: 0, j3Count: 0, failureReceiptCount: 1,
      benchmarkReviews: [], materialComponentChangedAfterResponse1: false });
    expect(summary.frozenRuleDisposition).toBe("INDETERMINATE");
    expect(summary.validationEligible).toBe(false);
  });
});
