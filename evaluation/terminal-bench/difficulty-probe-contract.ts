import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { canonicalSha256 } from "./verifier-contract.js";

export const AGENT_EVIDENCE_FIELDS = [
  "TRIAL_OR_SPONSOR_ID",
  "AUTHOR_OR_SITE",
  "RECRUITMENT_WINDOW",
  "PARTICIPANT_FLOW",
  "BASELINE_SUMMARY",
  "REPORT_RELATION_CLUE",
  "EXPOSURE_REGIMEN",
  "COMPARATOR",
  "OUTCOME_DEFINITION",
  "ASSESSMENT_HORIZON",
  "EFFECT_MEASURE",
  "EVENT_COUNTS",
  "PERSON_TIME",
] as const;

const requestedOutputs = [
  "report_lineage",
  "estimand_table",
  "selection_decisions",
  "effect_estimates",
  "meta_analysis",
  "sensitivity_matrix",
] as const;

const evidenceObservationSchema = z.object({
  field: z.enum(AGENT_EVIDENCE_FIELDS),
  value: z.union([z.string().min(1), z.number().finite()]),
  sourceCode: z.string().min(1),
});

const estimateInputSchema = z.object({
  estimateId: z.string().min(1),
  effectMeasure: z.enum(["RISK_RATIO", "RATE_RATIO"]),
  treatmentEvents: z.number().int().positive(),
  controlEvents: z.number().int().positive(),
  treatmentTotal: z.number().int().positive().optional(),
  controlTotal: z.number().int().positive().optional(),
  treatmentPersonTime: z.number().positive().optional(),
  controlPersonTime: z.number().positive().optional(),
}).superRefine((value, context) => {
  if (
    value.effectMeasure === "RISK_RATIO"
    && (value.treatmentTotal === undefined || value.controlTotal === undefined)
  ) {
    context.addIssue({ code: "custom", message: "risk estimates require participant denominators" });
  }
  if (
    value.effectMeasure === "RATE_RATIO"
    && (value.treatmentPersonTime === undefined || value.controlPersonTime === undefined)
  ) {
    context.addIssue({ code: "custom", message: "rate estimates require person-time denominators" });
  }
});

export const agentFacingDifficultyBundleSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureId: z.string().min(1),
  taskInstructions: z.string().min(100),
  targetEstimand: z.object({
    targetEstimandId: z.string().min(1),
    population: z.string().min(1),
    intervention: z.object({
      name: z.string().min(1),
      dose: z.string().min(1),
      unit: z.string().min(1),
      route: z.string().min(1),
      formulation: z.string().min(1),
      schedule: z.string().min(1),
      timing: z.string().min(1),
    }),
    comparator: z.string().min(1),
    outcome: z.string().min(1),
    horizon: z.string().min(1),
    effectMeasure: z.enum(["RISK_RATIO", "RATE_RATIO"]),
  }),
  reports: z.array(z.object({
    reportId: z.string().min(1),
    observedEvidence: z.array(evidenceObservationSchema).min(1),
    estimateInputs: z.array(estimateInputSchema).min(1),
  })).min(2),
  requestedOutputs: z.array(z.enum(requestedOutputs))
    .length(requestedOutputs.length)
    .refine((values) => new Set(values).size === requestedOutputs.length, {
      message: "every requested output must appear exactly once",
    }),
  requestedSensitivities: z.array(z.object({
    sensitivityId: z.string().min(1),
    question: z.string().min(1),
  })).min(1),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/u),
}).superRefine((value, context) => {
  const reportIds = value.reports.map(({ reportId }) => reportId);
  const estimateIds = value.reports.flatMap(({ estimateInputs }) =>
    estimateInputs.map(({ estimateId }) => estimateId));
  if (new Set(reportIds).size !== reportIds.length) {
    context.addIssue({ code: "custom", message: "report identifiers must be unique" });
  }
  if (new Set(estimateIds).size !== estimateIds.length) {
    context.addIssue({ code: "custom", message: "estimate identifiers must be unique" });
  }
});

const GRADER_ONLY_NORMALIZED_KEYS = new Set([
  "studyid",
  "cohortid",
  "allowedrelations",
  "dependencygroupid",
  "targetcompatible",
  "incompatibilitycodes",
  "allowedprimarycontributionsets",
  "sensitivityanalyses",
  "includedestimateids",
  "numerictolerance",
  "pooledlogriskratio",
  "pooledvariance",
  "expectedconclusion",
  "oracle",
  "truth",
]);

export type DifficultyReadinessCode =
  | "TASK_INSTRUCTIONS_MISSING"
  | "TARGET_ESTIMAND_MISSING"
  | "REQUESTED_OUTPUTS_MISSING"
  | "REQUESTED_SENSITIVITIES_MISSING"
  | "REPORT_OBSERVED_EVIDENCE_MISSING"
  | "REPORT_NUMERICAL_INPUT_MISSING"
  | "AGENT_BUNDLE_EVIDENCE_COVERAGE_INCOMPLETE"
  | "AGENT_BUNDLE_SCHEMA_INVALID"
  | "AGENT_INPUT_HASH_MISMATCH"
  | "GRADER_ONLY_FIELD_DISCLOSED"
  | "GRADER_ARTIFACT_IDENTITY_DISCLOSED";

export interface DifficultyReadinessFinding {
  code: DifficultyReadinessCode;
  location: string;
}

export interface DifficultyReadinessResult {
  ready: boolean;
  agentInputSha256: string;
  findings: DifficultyReadinessFinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function scanForLeakage(
  value: unknown,
  forbiddenArtifactSha256: Set<string>,
  path = "$",
  findings: DifficultyReadinessFinding[] = [],
): DifficultyReadinessFinding[] {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => scanForLeakage(
      nested,
      forbiddenArtifactSha256,
      `${path}[${index}]`,
      findings,
    ));
    return findings;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = `${path}.${key}`;
      if (GRADER_ONLY_NORMALIZED_KEYS.has(normalizedKey(key))) {
        findings.push({ code: "GRADER_ONLY_FIELD_DISCLOSED", location: nestedPath });
      }
      scanForLeakage(nested, forbiddenArtifactSha256, nestedPath, findings);
    }
    return findings;
  }
  if (typeof value === "string" && forbiddenArtifactSha256.has(value)) {
    findings.push({ code: "GRADER_ARTIFACT_IDENTITY_DISCLOSED", location: path });
  }
  return findings;
}

function addMissingSurfaceFindings(
  input: unknown,
  findings: DifficultyReadinessFinding[],
): void {
  if (!isRecord(input)) {
    findings.push({ code: "AGENT_BUNDLE_SCHEMA_INVALID", location: "$" });
    return;
  }
  if (typeof input.taskInstructions !== "string" || input.taskInstructions.trim().length === 0) {
    findings.push({ code: "TASK_INSTRUCTIONS_MISSING", location: "$.taskInstructions" });
  }
  if (!isRecord(input.targetEstimand)) {
    findings.push({ code: "TARGET_ESTIMAND_MISSING", location: "$.targetEstimand" });
  }
  if (!Array.isArray(input.requestedOutputs) || input.requestedOutputs.length === 0) {
    findings.push({ code: "REQUESTED_OUTPUTS_MISSING", location: "$.requestedOutputs" });
  }
  if (!Array.isArray(input.requestedSensitivities) || input.requestedSensitivities.length === 0) {
    findings.push({ code: "REQUESTED_SENSITIVITIES_MISSING", location: "$.requestedSensitivities" });
  }
  if (Array.isArray(input.reports)) {
    input.reports.forEach((report, index) => {
      if (!isRecord(report) || !Array.isArray(report.observedEvidence) || report.observedEvidence.length === 0) {
        findings.push({
          code: "REPORT_OBSERVED_EVIDENCE_MISSING",
          location: `$.reports[${index}].observedEvidence`,
        });
      }
      if (!isRecord(report) || !Array.isArray(report.estimateInputs) || report.estimateInputs.length === 0) {
        findings.push({
          code: "REPORT_NUMERICAL_INPUT_MISSING",
          location: `$.reports[${index}].estimateInputs`,
        });
      }
    });
  }
}

export function assessAgentFacingDifficultyBundle(
  input: unknown,
  forbiddenArtifactSha256: string[] = [],
): DifficultyReadinessResult {
  const findings = scanForLeakage(input, new Set(forbiddenArtifactSha256));
  addMissingSurfaceFindings(input, findings);
  const parsed = agentFacingDifficultyBundleSchema.safeParse(input);
  if (!parsed.success) {
    findings.push({ code: "AGENT_BUNDLE_SCHEMA_INVALID", location: "$" });
  } else {
    const { inputSha256, ...hashPayload } = parsed.data;
    if (inputSha256 !== canonicalSha256(hashPayload)) {
      findings.push({ code: "AGENT_INPUT_HASH_MISMATCH", location: "$.inputSha256" });
    }
    const evidenceFields = new Set(
      parsed.data.reports.flatMap(({ observedEvidence }) => observedEvidence.map(({ field }) => field)),
    );
    const requiredCoverage = [
      "RECRUITMENT_WINDOW",
      "PARTICIPANT_FLOW",
      "REPORT_RELATION_CLUE",
      "EXPOSURE_REGIMEN",
      "COMPARATOR",
      "OUTCOME_DEFINITION",
      "ASSESSMENT_HORIZON",
      "EFFECT_MEASURE",
    ] as const;
    for (const field of requiredCoverage) {
      if (!evidenceFields.has(field)) {
        findings.push({
          code: "AGENT_BUNDLE_EVIDENCE_COVERAGE_INCOMPLETE",
          location: `$.reports.observedEvidence:${field}`,
        });
      }
    }
  }
  const uniqueFindings = [...new Map(
    findings.map((finding) => [`${finding.code}:${finding.location}`, finding]),
  ).values()];
  return {
    ready: uniqueFindings.length === 0,
    agentInputSha256: parsed.success
      ? canonicalSha256((({ inputSha256: _inputSha256, ...payload }) => payload)(parsed.data))
      : canonicalSha256(input),
    findings: uniqueFindings,
  };
}

const PRIVATE_FILE_ROLES: Record<string, "AGENT_INPUT" | "GRADER_ONLY"> = {
  "fixture.json": "AGENT_INPUT",
  "truth.json": "GRADER_ONLY",
  "oracle.json": "GRADER_ONLY",
  "alternate.json": "GRADER_ONLY",
  "invalid-candidates.json": "GRADER_ONLY",
  "proof-result.json": "GRADER_ONLY",
  "generate-and-prove.mts": "GRADER_ONLY",
};

export interface PrivateMiniatureInspection {
  directoryMode: "0700";
  fileMode: "0600";
  fileCount: 7;
  contentRead: ["fixture.json"];
  graderOnlyContentRead: false;
  fixtureSha256: string;
  readiness: DifficultyReadinessResult;
}

export async function inspectPrivateMiniatureForDifficulty(
  privateDirectory: string,
  expectedFixtureSha256: string,
  forbiddenArtifactSha256: string[],
): Promise<PrivateMiniatureInspection> {
  const directory = await lstat(privateDirectory);
  if (!directory.isDirectory() || (directory.mode & 0o777) !== 0o700) {
    throw new Error("PRIVATE_MINIATURE_DIRECTORY_MODE_INVALID");
  }
  const names = (await readdir(privateDirectory)).sort();
  const expectedNames = Object.keys(PRIVATE_FILE_ROLES).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error("PRIVATE_MINIATURE_FILE_INVENTORY_MISMATCH");
  }
  for (const name of names) {
    const file = await lstat(join(privateDirectory, name));
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o777) !== 0o600) {
      throw new Error(`PRIVATE_MINIATURE_FILE_MODE_INVALID file=${name}`);
    }
  }
  const fixtureBytes = await readFile(join(privateDirectory, "fixture.json"));
  const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
  if (fixtureSha256 !== expectedFixtureSha256) {
    throw new Error("PRIVATE_MINIATURE_FIXTURE_HASH_MISMATCH");
  }
  const fixture = JSON.parse(fixtureBytes.toString("utf8")) as unknown;
  return {
    directoryMode: "0700",
    fileMode: "0600",
    fileCount: 7,
    contentRead: ["fixture.json"],
    graderOnlyContentRead: false,
    fixtureSha256,
    readiness: assessAgentFacingDifficultyBundle(fixture, forbiddenArtifactSha256),
  };
}
