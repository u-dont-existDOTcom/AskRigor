import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendExposureEvent,
  benchmarkConflictReviewSchema,
  buildMachineSummary,
  createRound2Dispatch,
  deriveRound2Selection,
  detectPrimaryDisagreements,
  exposureLedgerSchema,
  failureReceiptSchema,
  generationCaptureSchema,
  judgmentCaptureSchema,
  reconcileJudgments,
  ROUND_2_GENERATION_COUNT,
  ROUND_2_STUDY_ID,
  scoreRound2,
} from "../evaluation/mast/src/fresh-validation-round-2.js";
import type {
  ConditionMapRecord,
  GenerationIdentityRecord,
} from "../evaluation/mast/src/fresh-validation.js";
import {
  canonicalArmMap,
  joinFreshValidationRecords,
} from "../evaluation/mast/src/fresh-validation.js";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root,
  "evaluation/mast/fresh-validation-round-2-family-manifest.json"), "utf8"));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const instant = "2026-09-18T12:00:00.000Z";

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
    studyId: ROUND_2_STUDY_ID,
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

describe("MAST Fresh Validation Round 2 selection and exposure", () => {
  it("selects exactly 12 eligible families from identifiers only and retains all specialties", () => {
    const selected = deriveRound2Selection({
      allFamilies: manifest.allFamilies,
      developmentFamilies: manifest.excludedDevelopmentFamilies,
      generatedRound1Families: manifest.excludedRound1GeneratedFamilies,
      seedLabel: manifest.selection.seedLabel,
    });
    expect(selected).toEqual({
      eligibleFamilies: manifest.eligibleFamilies,
      validationFamilies: manifest.validationFamilies,
      confirmationFamilies: manifest.confirmationFamilies,
    });
    expect(selected.validationFamilies).toHaveLength(12);
    expect(new Set(selected.validationFamilies.map((id) => id.replace(/\d{3}$/u, ""))).size).toBe(10);
    expect(selected.confirmationFamilies).toEqual(["All008"]);
  });

  it("records access classes separately and rejects duplicate event identities", () => {
    const ledger = exposureLedgerSchema.parse({ schemaVersion: 1, studyId: ROUND_2_STUDY_ID, events: [] });
    const event = {
      eventId: "identifier:All006",
      familyId: "All006",
      kind: "IDENTIFIER_ONLY" as const,
      actor: "PREPROCESSOR" as const,
      stage: "SELECTION",
      occurredAt: instant,
      artifactSha256: digest("manifest"),
      note: "filename only",
    };
    const once = appendExposureEvent(ledger, event);
    expect(once.events).toHaveLength(1);
    expect(() => appendExposureEvent(once, event)).toThrow("EXPOSURE_EVENT_ID_DUPLICATE");
  });

  it("creates 144 stable, unique opaque generation slots", () => {
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index);
    const first = createRound2Dispatch(seed, manifest.validationFamilies);
    const second = createRound2Dispatch(seed, manifest.validationFamilies);
    expect(first).toEqual(second);
    expect(first).toHaveLength(ROUND_2_GENERATION_COUNT);
    expect(new Set(first.map(({ opaqueInputId }) => opaqueInputId)).size).toBe(ROUND_2_GENERATION_COUNT);
  });
});

describe("MAST Fresh Validation Round 2 runtime schemas", () => {
  it("binds every declared executable hash and detects a one-byte tamper", () => {
    const environment = JSON.parse(readFileSync(resolve(root,
      "evaluation/mast/fresh-validation-round-2-environment.json"), "utf8"));
    for (const [path, expected] of Object.entries(environment.executableHashManifest) as Array<[string, string]>) {
      const bytes = readFileSync(resolve(root, path));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
      expect(createHash("sha256").update(Buffer.concat([bytes, Buffer.from([0])])).digest("hex"))
        .not.toBe(expected);
    }
  });

  it("fails closed on generation model, reasoning, tool, and hash drift", () => {
    const base = {
      schemaVersion: 1,
      studyId: ROUND_2_STUDY_ID,
      opaqueInputId: "run-000000000000000000000001",
      exactInputSha256: digest("input"),
      exactOutputSha256: digest("output"),
      outputUtf8Bytes: 10,
      transportReceiptSha256: digest("transport"),
      provider: provider("GENERATION"),
    };
    base.provider = { ...base.provider, chatMode: "TEMPORARY" } as any;
    expect(generationCaptureSchema.parse(base).provider.toolsUsed).toBe(false);
    expect(() => generationCaptureSchema.parse({ ...base,
      provider: { ...base.provider, reasoningVisibleLabel: "High" } })).toThrow();
    expect(() => generationCaptureSchema.parse({ ...base,
      provider: { ...base.provider, toolsUsed: true } })).toThrow();
  });

  it("rejects scores outside [0,1], wrong boolean types, and judge configuration drift", () => {
    expect(judgmentCaptureSchema.parse(judgment("J1", "EVAL-000000000000000000000001"))
      .score.f1Lexeme).toBe("0.75");
    expect(() => judgmentCaptureSchema.parse(judgment("J1", "EVAL-000000000000000000000001", "1.01")))
      .toThrow();
    const wrongBoolean = judgment("J1", "EVAL-000000000000000000000001") as any;
    wrongBoolean.score.severeCommission = "false";
    expect(() => judgmentCaptureSchema.parse(wrongBoolean)).toThrow();
    const drift = judgment("J3", "EVAL-000000000000000000000001") as any;
    drift.provider.reasoningVisibleLabel = "Extra High";
    expect(() => judgmentCaptureSchema.parse(drift)).toThrow("ADJUDICATOR_CONFIGURATION_DRIFT");
  });

  it("validates structured failure receipts and benchmark reconciliation records", () => {
    expect(failureReceiptSchema.parse({
      schemaVersion: 1,
      studyId: ROUND_2_STUDY_ID,
      stage: "J1",
      inputArtifactSha256s: { packet: digest("packet") },
      failureCode: "STRUCTURED_OUTPUT_SYNTAX_FAILURE",
      validationErrors: ["line 1 column 2"],
      timestamp: instant,
      source: {
        askRigorCommit: "a".repeat(40), askRigorTree: "b".repeat(40),
        mastCommit: "c".repeat(40), mastTree: "d".repeat(40),
      },
      stoppedBeforeDownstreamArtifact: true,
    }).failureCode).toBe("STRUCTURED_OUTPUT_SYNTAX_FAILURE");
    expect(benchmarkConflictReviewSchema.parse({
      schemaVersion: 1,
      studyId: ROUND_2_STUDY_ID,
      familyId: "All006",
      actionId: "action-1",
      rawRubricRequirement: "Do X",
      rawBenchmarkConformity: "MET",
      evidence: [{ sourceId: "guideline", sourceUrl: "https://example.org/guideline",
        authority: "current guideline", exactPopulationTimingContext: "same population and timing",
        sourceSha256: digest("source") }],
      disposition: "NO_CONFLICT",
      uncertainty: "low",
      materiallyAffectsInterpretation: false,
      reviewerProvenance: { modelVisibleLabel: "Latest", reasoningVisibleLabel: "Pro",
        reasoningOrdinal: "5 of 5", reviewedAt: instant },
    }).disposition).toBe("NO_CONFLICT");
  });
});

describe("MAST Fresh Validation Round 2 judging, joining, and frozen rule", () => {
  it("fails closed on alias collisions, orphan mappings, and bound-output hash mismatches", () => {
    expect(() => canonicalArmMap({ A: ["same"], B: ["same"], C: ["C"], D: ["D"] }))
      .toThrow("FRESH_VALIDATION_ARM_ALIAS_COLLISION");
    const output = digest("output");
    const joined = joinFreshValidationRecords({
      generation: [{ opaqueInputId: "run-000000000000000000000001", exactOutputSha256: output }],
      mapping: [{ generationLedgerRecordId: "run-000000000000000000000001",
        opaqueResponseId: "EVAL-000000000000000000000001",
        exactGenerationOutputSha256: digest("other"), familyId: "All006", armId: "A", trial: 1 }],
      final: [],
      aliases: { A: ["A"], B: ["B"], C: ["C"], D: ["D"] },
    });
    expect(joined.integrityErrors).toContain("FRESH_VALIDATION_EXPLICIT_ID_JOIN_MISSING");
    expect(joined.integrityErrors).toContain("FRESH_VALIDATION_EXPLICIT_ID_COVERAGE_INVALID");
  });

  it("adjudicates every vector disagreement and preserves primary raw judgments", () => {
    const id = "EVAL-000000000000000000000001";
    const j1 = judgment("J1", id, "0.75");
    const j2 = judgment("J2", id, "0.50");
    const j3 = judgment("J3", id, "0.60");
    expect(detectPrimaryDisagreements([j1], [j2])).toHaveLength(1);
    const reconciled = reconcileJudgments({ generation: [], mapping: [], j1: [j1], j2: [j2], j3: [j3] });
    expect(reconciled).toMatchObject({ disagreementCount: 1, adjudicationCount: 1 });
    expect(reconciled.final[0]?.f1Lexeme).toBe("0.60");
    expect(j1.score.f1Lexeme).toBe("0.75");
    expect(j2.score.f1Lexeme).toBe("0.50");
    expect(() => reconcileJudgments({ generation: [], mapping: [], j1: [j1], j2: [j2], j3: [] }))
      .toThrow("ROUND_2_ADJUDICATION_COVERAGE_INVALID");
  });

  it("fails closed on orphan, duplicate, hash, and coverage defects", () => {
    const id = "EVAL-000000000000000000000001";
    const j1 = judgment("J1", id);
    const j2 = judgment("J2", id);
    expect(() => detectPrimaryDisagreements([j1], [])).toThrow("ROUND_2_PRIMARY_JUDGE_COVERAGE_INVALID");
    expect(() => detectPrimaryDisagreements([j1, j1], [j2, j2]))
      .toThrow("ROUND_2_PRIMARY_JUDGE_ID_DUPLICATE");
    const mismatched = structuredClone(j2);
    mismatched.exactPacketSha256 = digest("other");
    expect(() => detectPrimaryDisagreements([j1], [mismatched]))
      .toThrow("ROUND_2_PRIMARY_JUDGE_SOURCE_MISMATCH");
  });

  it("calculates the frozen PASS rule with exact rational arithmetic", () => {
    const generation: GenerationIdentityRecord[] = [];
    const mapping: ConditionMapRecord[] = [];
    const final: any[] = [];
    let ordinal = 0;
    for (const familyId of manifest.validationFamilies as string[]) {
      for (const armId of ["A", "B", "C", "D"] as const) {
        for (const trial of [1, 2, 3]) {
          ordinal += 1;
          const suffix = ordinal.toString(16).padStart(24, "0");
          const opaqueInputId = `run-${suffix}`;
          const opaqueResponseId = `EVAL-${suffix}`;
          const outputHash = digest(`output-${ordinal}`);
          generation.push({ opaqueInputId, exactOutputSha256: outputHash });
          mapping.push({ generationLedgerRecordId: opaqueInputId, opaqueResponseId,
            exactGenerationOutputSha256: outputHash, familyId, armId, trial });
          final.push({ opaqueResponseId, exactSelectedOutputSha256: outputHash,
            f1Lexeme: { A: "0.40", B: "0.50", C: "0.55", D: "0.60" }[armId],
            omissionCount: armId === "D" ? 0 : 1, commissionCount: 0,
            severeCommission: false, benchmarkTargetConflict: false });
        }
      }
    }
    const result = scoreRound2({ generation, mapping, final, expectedFamilies: manifest.validationFamilies });
    expect(result.integrityErrors).toEqual([]);
    expect(result.interpretation).toBe("PASS");
    expect(result.primaryDMinusB.mean?.display6).toBe("0.100000");
    expect(result.secondaryDMinusC.mean?.display6).toBe("0.050000");
    const summary = buildMachineSummary({ result, plannedResponses: 144, completedResponses: 144,
      j1Count: 144, j2Count: 144, j3Count: 0, failureReceiptCount: 0,
      benchmarkReviews: [], materialComponentChangedAfterResponse1: false });
    expect(summary).toMatchObject({ frozenRuleDisposition: "PASS", validationEligible: true });
  });

  it("forces an indeterminate, ineligible result after a material post-response change", () => {
    const result = scoreRound2({ generation: [], mapping: [], final: [],
      expectedFamilies: manifest.validationFamilies });
    const summary = buildMachineSummary({ result, plannedResponses: 144, completedResponses: 0,
      j1Count: 0, j2Count: 0, j3Count: 0, failureReceiptCount: 1,
      benchmarkReviews: [], materialComponentChangedAfterResponse1: true });
    expect(summary).toMatchObject({ frozenRuleDisposition: "INDETERMINATE", validationEligible: false });
  });
});
