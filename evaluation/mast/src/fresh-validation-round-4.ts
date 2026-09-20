import { z } from "zod";

import { aggregateFreshValidation } from "./fresh-validation-round-4-base.js";
import {
  createDispatchRecords,
  joinFreshValidationRecords,
  sha256,
  type ConditionMapRecord,
  type FinalBlindedScoreRecord,
  type GenerationIdentityRecord,
} from "./fresh-validation.js";

export { sha256 } from "./fresh-validation.js";

export const ROUND_4_STUDY_ID = "askrigor-mast-fresh-validation-round-4-20260919";
export const ROUND_4_ARMS = ["A", "B", "C", "D"] as const;
export const ROUND_4_JUDGES = ["J1", "J2", "J3"] as const;
export const ROUND_4_GENERATION_COUNT = 120;
export const ROUND_4_PRIMARY_JUDGMENT_COUNT = 240;

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const familySchema = z.string().regex(/^[A-Za-z]+\d{3}$/u);
const opaqueInputSchema = z.string().regex(/^run-[0-9a-f]{24}$/u);
const opaqueResponseSchema = z.string().regex(/^EVAL-[0-9a-f]{24}$/u);
const instantSchema = z.string().datetime({ offset: true });
const scoreLexemeSchema = z.string().refine((value) => {
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u.test(value)) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1;
}, "score must be a decimal lexeme in [0,1]");

export const exposureKindSchema = z.enum([
  "IDENTIFIER_ONLY",
  "MECHANICAL_PAYLOAD_READ",
  "SEMANTIC_MODEL_EXPOSURE",
  "GENERATED_RESPONSE_EXPOSURE",
  "RUBRIC_JUDGE_EXPOSURE",
]);

export const exposureEventSchema = z.object({
  eventId: z.string().min(1),
  familyId: familySchema,
  kind: exposureKindSchema,
  actor: z.enum(["HUMAN", "MODEL", "GENERATION_CODE", "JUDGE_CODE", "PREPROCESSOR"]),
  stage: z.string().min(1),
  occurredAt: instantSchema,
  artifactSha256: digestSchema.nullable(),
  note: z.string().min(1),
}).strict();

export const exposureLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_4_STUDY_ID),
  events: z.array(exposureEventSchema),
}).strict().superRefine((ledger, context) => {
  const ids = ledger.events.map(({ eventId }) => eventId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "EXPOSURE_EVENT_ID_DUPLICATE" });
  }
});

export type ExposureLedger = z.infer<typeof exposureLedgerSchema>;

export const providerReceiptSchema = z.object({
  surface: z.literal("CHATGPT_CONSUMER"),
  modelVisibleLabel: z.string().min(1),
  reasoningVisibleLabel: z.string().min(1),
  reasoningOrdinal: z.string().nullable(),
  conversationId: z.string().min(1),
  submittedAt: instantSchema,
  completedAt: instantSchema,
  toolsUsed: z.literal(false),
  freshConversation: z.literal(true),
  personalization: z.literal("UNPERSONALIZED"),
}).strict();

export const generationCaptureSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_4_STUDY_ID),
  opaqueInputId: opaqueInputSchema,
  exactInputSha256: digestSchema,
  exactOutputSha256: digestSchema,
  outputUtf8Bytes: z.number().int().positive(),
  transportReceiptSha256: digestSchema,
  provider: providerReceiptSchema.extend({
    modelVisibleLabel: z.literal("GPT-5.6 Sol"),
    reasoningVisibleLabel: z.literal("Extra High"),
    reasoningOrdinal: z.null(),
    chatMode: z.literal("TEMPORARY"),
  }),
}).strict();

export const scoreVectorSchema = z.object({
  f1Lexeme: scoreLexemeSchema,
  omissionCount: z.number().int().nonnegative(),
  commissionCount: z.number().int().nonnegative(),
  severeCommission: z.boolean(),
  requiredActionMatches: z.array(z.string().min(1)),
  prohibitedActionMatches: z.array(z.string().min(1)),
}).strict();

export const judgmentCaptureSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_4_STUDY_ID),
  judge: z.enum(ROUND_4_JUDGES),
  opaqueResponseId: opaqueResponseSchema,
  exactPacketSha256: digestSchema,
  exactGenerationOutputSha256: digestSchema,
  score: scoreVectorSchema,
  benchmarkTargetConflictFlag: z.boolean(),
  benchmarkTargetConflictActionIds: z.array(z.string().min(1)),
  provider: providerReceiptSchema,
  rawOutputSha256: digestSchema,
}).strict().superRefine((record, context) => {
  const conflictActionIds = new Set(record.benchmarkTargetConflictActionIds);
  if (conflictActionIds.size !== record.benchmarkTargetConflictActionIds.length) {
    context.addIssue({ code: "custom", message: "BENCHMARK_TARGET_CONFLICT_ACTION_ID_DUPLICATE" });
  }
  if (record.benchmarkTargetConflictFlag !== (conflictActionIds.size > 0)) {
    context.addIssue({ code: "custom", message: "BENCHMARK_TARGET_CONFLICT_FLAG_ACTION_MISMATCH" });
  }
  if (record.judge === "J1" || record.judge === "J2") {
    if (record.provider.modelVisibleLabel !== "GPT-5.6 Sol"
      || record.provider.reasoningVisibleLabel !== "Extra High"
      || record.provider.reasoningOrdinal !== null) {
      context.addIssue({ code: "custom", message: "PRIMARY_JUDGE_CONFIGURATION_DRIFT" });
    }
  } else if (record.provider.modelVisibleLabel !== "Latest"
    || record.provider.reasoningVisibleLabel !== "Pro"
    || record.provider.reasoningOrdinal !== "5 of 5") {
    context.addIssue({ code: "custom", message: "ADJUDICATOR_CONFIGURATION_DRIFT" });
  }
});

export const benchmarkConflictReviewSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_4_STUDY_ID),
  familyId: familySchema,
  actionId: z.string().min(1),
  rawRubricRequirement: z.string().min(1),
  rawBenchmarkConformity: z.enum(["MET", "NOT_MET", "PARTIAL", "UNRESOLVED"]),
  evidence: z.array(z.object({
    sourceId: z.string().min(1),
    sourceUrl: z.string().url(),
    authority: z.string().min(1),
    exactPopulationTimingContext: z.string().min(1),
    sourceSha256: digestSchema,
  }).strict()).min(1),
  disposition: z.enum(["NO_CONFLICT", "BENCHMARK_TARGET_CONFLICT", "UNRESOLVED"]),
  uncertainty: z.string().min(1),
  materiallyAffectsInterpretation: z.boolean(),
  reviewerProvenance: z.object({
    modelVisibleLabel: z.literal("Latest"),
    reasoningVisibleLabel: z.literal("Pro"),
    reasoningOrdinal: z.literal("5 of 5"),
    reviewedAt: instantSchema,
  }).strict(),
}).strict();

export const failureReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_4_STUDY_ID),
  stage: z.string().min(1),
  inputArtifactSha256s: z.record(z.string(), digestSchema),
  failureCode: z.string().regex(/^[A-Z0-9_]+$/u),
  validationErrors: z.array(z.string().min(1)).min(1),
  timestamp: instantSchema,
  source: z.object({
    askRigorCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    askRigorTree: z.string().regex(/^[0-9a-f]{40}$/u),
    mastCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    mastTree: z.string().regex(/^[0-9a-f]{40}$/u),
  }).strict(),
  stoppedBeforeDownstreamArtifact: z.boolean(),
}).strict();

export type FailureReceipt = z.infer<typeof failureReceiptSchema>;
export type JudgmentCapture = z.infer<typeof judgmentCaptureSchema>;

const familyPrefix = (familyId: string): string => familyId.replace(/\d{3}$/u, "");

export function deriveRound3Selection(input: {
  allFamilies: string[];
  developmentFamilies: string[];
  generatedRound1Families: string[];
  exposedRound2Families: string[];
}): { eligibleFamilies: string[]; validationFamilies: string[]; reserveFamilies: string[] } {
  const allFamilies = [...input.allFamilies].sort();
  if (new Set(allFamilies).size !== allFamilies.length || allFamilies.some((id) => !familySchema.safeParse(id).success)) {
    throw new Error("ROUND_4_IDENTIFIER_MANIFEST_INVALID");
  }
  const excluded = new Set([
    ...input.developmentFamilies,
    ...input.generatedRound1Families,
    ...input.exposedRound2Families,
  ]);
  const eligibleFamilies = allFamilies.filter((id) => !excluded.has(id));
  if (eligibleFamilies.length !== 11) throw new Error("ROUND_4_ELIGIBLE_FAMILY_COUNT_INVALID");
  const reserveFamilies = ["All008"];
  if (!eligibleFamilies.includes(reserveFamilies[0]!)) throw new Error("ROUND_4_RESERVE_MISSING");
  const validationFamilies = eligibleFamilies.filter((id) => id !== reserveFamilies[0]);
  const expectedValidationFamilies = [
    "All006", "Card002", "Derm006", "Endo007", "GI002", "Heme002",
    "Nephro003", "Nephro009", "Neuro003", "Pulm001",
  ];
  if (validationFamilies.length !== 10
    || JSON.stringify(validationFamilies) !== JSON.stringify(expectedValidationFamilies)) {
    throw new Error("ROUND_4_VALIDATION_SELECTION_INVALID");
  }
  return { eligibleFamilies, validationFamilies, reserveFamilies };
}

export function appendExposureEvent(ledger: ExposureLedger, event: z.infer<typeof exposureEventSchema>): ExposureLedger {
  const parsed = exposureLedgerSchema.parse(ledger);
  return exposureLedgerSchema.parse({ ...parsed, events: [...parsed.events, exposureEventSchema.parse(event)] });
}

export function createRound3Dispatch(seed: Uint8Array, validationFamilies: string[]) {
  return createDispatchRecords({
    privateSeed: seed,
    freshFamilies: validationFamilies,
    regressionFamilies: [],
    trialsPerFamilyPerArm: 3,
  });
}

function canonicalScore(value: z.infer<typeof scoreVectorSchema>): string {
  return JSON.stringify({
    f1Lexeme: value.f1Lexeme,
    omissionCount: value.omissionCount,
    commissionCount: value.commissionCount,
    severeCommission: value.severeCommission,
    requiredActionMatches: [...value.requiredActionMatches].sort(),
    prohibitedActionMatches: [...value.prohibitedActionMatches].sort(),
  });
}

export function detectPrimaryDisagreements(j1Input: unknown[], j2Input: unknown[]): Array<{
  opaqueResponseId: string;
  j1: JudgmentCapture;
  j2: JudgmentCapture;
}> {
  const j1 = j1Input.map((value) => judgmentCaptureSchema.parse(value));
  const j2 = j2Input.map((value) => judgmentCaptureSchema.parse(value));
  const byJ2 = new Map(j2.map((record) => [record.opaqueResponseId, record]));
  if (new Set(j1.map(({ opaqueResponseId }) => opaqueResponseId)).size !== j1.length
    || byJ2.size !== j2.length) throw new Error("ROUND_4_PRIMARY_JUDGE_ID_DUPLICATE");
  const disagreements = [];
  for (const left of j1) {
    const right = byJ2.get(left.opaqueResponseId);
    if (!right) throw new Error("ROUND_4_PRIMARY_JUDGE_COVERAGE_INVALID");
    if (left.exactGenerationOutputSha256 !== right.exactGenerationOutputSha256
      || left.exactPacketSha256 !== right.exactPacketSha256) {
      throw new Error("ROUND_4_PRIMARY_JUDGE_SOURCE_MISMATCH");
    }
    if (canonicalScore(left.score) !== canonicalScore(right.score)
      || left.benchmarkTargetConflictFlag !== right.benchmarkTargetConflictFlag
      || JSON.stringify([...left.benchmarkTargetConflictActionIds].sort())
        !== JSON.stringify([...right.benchmarkTargetConflictActionIds].sort())) {
      disagreements.push({ opaqueResponseId: left.opaqueResponseId, j1: left, j2: right });
    }
  }
  if (j1.length !== j2.length) throw new Error("ROUND_4_PRIMARY_JUDGE_COVERAGE_INVALID");
  return disagreements;
}

export function reconcileJudgments(input: {
  generation: GenerationIdentityRecord[];
  mapping: ConditionMapRecord[];
  j1: unknown[];
  j2: unknown[];
  j3: unknown[];
}): { final: FinalBlindedScoreRecord[]; disagreementCount: number; adjudicationCount: number;
  benchmarkConflictTargets: Array<{ opaqueResponseId: string; actionIds: string[] }> } {
  const j1 = input.j1.map((value) => judgmentCaptureSchema.parse(value));
  const j2 = input.j2.map((value) => judgmentCaptureSchema.parse(value));
  const j3 = input.j3.map((value) => judgmentCaptureSchema.parse(value));
  const disagreements = detectPrimaryDisagreements(j1, j2);
  const disagreementIds = new Set(disagreements.map(({ opaqueResponseId }) => opaqueResponseId));
  const j3ById = new Map(j3.map((record) => [record.opaqueResponseId, record]));
  if (j3ById.size !== j3.length || j3.length !== disagreements.length
    || disagreements.some(({ opaqueResponseId }) => !j3ById.has(opaqueResponseId))) {
    throw new Error("ROUND_4_ADJUDICATION_COVERAGE_INVALID");
  }
  const final = j1.map((record): FinalBlindedScoreRecord => {
    const selected = disagreementIds.has(record.opaqueResponseId) ? j3ById.get(record.opaqueResponseId)! : record;
    return {
      opaqueResponseId: selected.opaqueResponseId,
      exactSelectedOutputSha256: selected.exactGenerationOutputSha256,
      f1Lexeme: selected.score.f1Lexeme,
      omissionCount: selected.score.omissionCount,
      commissionCount: selected.score.commissionCount,
      severeCommission: selected.score.severeCommission,
      benchmarkTargetConflict: selected.benchmarkTargetConflictFlag,
    };
  });
  const benchmarkConflictTargets = j1.map((record) => (
    disagreementIds.has(record.opaqueResponseId) ? j3ById.get(record.opaqueResponseId)! : record
  )).filter(({ benchmarkTargetConflictFlag }) => benchmarkTargetConflictFlag)
    .map((record) => ({ opaqueResponseId: record.opaqueResponseId,
      actionIds: [...record.benchmarkTargetConflictActionIds].sort() }));
  return { final, disagreementCount: disagreements.length, adjudicationCount: j3.length,
    benchmarkConflictTargets };
}

export function expectedBenchmarkConflictReviews(input: {
  targets: Array<{ opaqueResponseId: string; actionIds: string[] }>;
  mapping: ConditionMapRecord[];
}): Array<{ familyId: string; actionId: string }> {
  const byOpaque = new Map(input.mapping.map((record) => [record.opaqueResponseId, record]));
  if (byOpaque.size !== input.mapping.length) throw new Error("ROUND_4_CONFLICT_REVIEW_MAPPING_DUPLICATE");
  const keys = new Map<string, { familyId: string; actionId: string }>();
  for (const target of input.targets) {
    const mapped = byOpaque.get(target.opaqueResponseId);
    if (!mapped) throw new Error("ROUND_4_CONFLICT_REVIEW_MAPPING_ORPHAN");
    if (target.actionIds.length === 0 || new Set(target.actionIds).size !== target.actionIds.length) {
      throw new Error("ROUND_4_CONFLICT_REVIEW_ACTION_INVALID");
    }
    for (const actionId of target.actionIds) {
      keys.set(`${mapped.familyId}\0${actionId}`, { familyId: mapped.familyId, actionId });
    }
  }
  return [...keys.values()].sort((left, right) => (
    left.familyId.localeCompare(right.familyId) || left.actionId.localeCompare(right.actionId)
  ));
}

export function scoreRound4(input: {
  generation: GenerationIdentityRecord[];
  mapping: ConditionMapRecord[];
  final: FinalBlindedScoreRecord[];
  expectedFamilies: string[];
}) {
  const joined = joinFreshValidationRecords({
    generation: input.generation,
    mapping: input.mapping,
    final: input.final,
    aliases: {
      A: ["A", "MAST_DEFAULT"],
      B: ["B", "MAST_THOROUGH"],
      C: ["C", "UNIVERSAL_ONLY"],
      D: ["D", "UNIVERSAL_PLUS_HRP"],
    },
  });
  if (joined.integrityErrors.length > 0) {
    return { ...aggregateFreshValidation({
      records: [],
      expectedFamilies: input.expectedFamilies,
      rule: { familyCount: 10, responseCount: 120, primaryWinThreshold: 6, severeArmDenominator: 30 },
    }),
      integrityErrors: joined.integrityErrors };
  }
  return aggregateFreshValidation({
    records: joined.records,
    expectedFamilies: input.expectedFamilies,
    rule: { familyCount: 10, responseCount: 120, primaryWinThreshold: 6, severeArmDenominator: 30 },
  });
}

export function makeFailureReceipt(input: Omit<FailureReceipt, "schemaVersion" | "studyId">): FailureReceipt {
  return failureReceiptSchema.parse({ schemaVersion: 1, studyId: ROUND_4_STUDY_ID, ...input });
}

export function verifyCapturedBytes(bytes: Uint8Array, expectedSha256: string, expectedLength: number): void {
  if (bytes.byteLength !== expectedLength || sha256(bytes) !== expectedSha256) {
    throw new Error("ROUND_4_CAPTURE_BYTES_MISMATCH");
  }
}

export function buildMachineSummary(input: {
  result: ReturnType<typeof scoreRound4>;
  plannedResponses: number;
  completedResponses: number;
  j1Count: number;
  j2Count: number;
  j3Count: number;
  failureReceiptCount: number;
  benchmarkReviews: unknown[];
  materialComponentChangedAfterResponse1: boolean;
}) {
  const reviews = input.benchmarkReviews.map((value) => benchmarkConflictReviewSchema.parse(value));
  const materialConflicts = reviews.filter((record) => record.disposition === "BENCHMARK_TARGET_CONFLICT"
    && record.materiallyAffectsInterpretation);
  const eligible = !input.materialComponentChangedAfterResponse1
    && input.result.integrityErrors.length === 0
    && input.completedResponses === input.plannedResponses;
  return {
    schemaVersion: 1,
    studyId: ROUND_4_STUDY_ID,
    plannedResponses: input.plannedResponses,
    completedResponses: input.completedResponses,
    judgments: { J1: input.j1Count, J2: input.j2Count, J3: input.j3Count },
    failureReceiptCount: input.failureReceiptCount,
    rawBenchmarkResult: input.result,
    clinicalReconciliation: {
      reviewCount: reviews.length,
      materialConflictCount: materialConflicts.length,
      materialConflicts: materialConflicts.map(({ familyId, actionId }) => ({ familyId, actionId })),
      rawScoresUnchanged: true,
    },
    frozenRuleDisposition: eligible ? input.result.interpretation : "INDETERMINATE",
    materialComponentChangedAfterResponse1: input.materialComponentChangedAfterResponse1,
    validationEligible: eligible,
  };
}
