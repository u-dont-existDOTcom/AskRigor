import { z } from "zod";

import { AGENT_EVIDENCE_FIELDS } from "./difficulty-probe-contract.js";

export const REQUIRED_OBSERVABLE_EVIDENCE_REVIEW_QUESTIONS = [
  "SOLVABLE_FROM_DISCLOSED_INPUT",
  "OBSERVATIONS_SUPPORT_LINEAGE_REASONING_WITHOUT_REVEALING_LABELS",
  "TARGET_ESTIMAND_IS_OPERATIONAL",
  "RAW_NUMERICAL_INPUTS_SUPPORT_REQUESTED_CALCULATIONS",
  "UNCERTAINTY_CAN_BE_REPRESENTED_WITHOUT_FORCED_CLASSIFICATION",
  "REQUESTED_OUTPUTS_AND_SENSITIVITIES_MATCH_THE_SCIENTIFIC_TASK",
  "DIFFICULTY_COMES_FROM_SCIENTIFIC_REASONING_NOT_MISSING_CONTEXT",
  "NO_GRADER_OR_ANSWER_LEAKAGE_OBSERVED",
] as const;

export const WITHHELD_GRADER_SURFACES = [
  "latent study and cohort identifiers",
  "allowed relation labels",
  "dependency groups",
  "compatibility verdicts and incompatibility codes",
  "allowed primary contribution sets",
  "expected sensitivity inclusion sets",
  "numeric tolerance and expected pooled outputs",
  "oracle, alternate, invalid-candidate, proof, and truth values",
] as const;

const exactStringSet = <T extends readonly [string, ...string[]]>(expected: T) =>
  z.array(z.enum(expected)).length(expected.length).superRefine((values, context) => {
    if (new Set(values).size !== expected.length) {
      context.addIssue({ code: "custom", message: "every required value must appear exactly once" });
    }
  });

export const observableEvidenceReviewRequestSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.literal("terminal-bench-observable-evidence-method-review-v1"),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  state: z.literal("OPEN_AGENT_INPUT_AUTHORING_AND_INDEPENDENT_REVIEW_REQUIRED"),
  baseline: z.object({
    repository: z.literal("u-dont-existDOTcom/AskRigor"),
    mergeCommit: z.literal("4a1e740fd239491a18de8c503b4ccf1f2c6143ca"),
    blockingDefectId: z.literal("TB-MINI-001-agent-input-evidence-absent"),
  }),
  publicRequest: z.object({
    issueUrl: z.string().url().regex(/^https:\/\/github\.com\/u-dont-existDOTcom\/AskRigor\/issues\/\d+$/u),
    externalSubmission: z.literal(false),
  }),
  requiredAgentInput: z.object({
    schemaContract: z.literal("evaluation/terminal-bench/difficulty-probe-contract.ts"),
    evidenceFields: exactStringSet(AGENT_EVIDENCE_FIELDS),
    mustIncludeDeclaredTargetEstimand: z.literal(true),
    mustIncludeRawRiskOrRateInputs: z.literal(true),
    mustIncludeRequestedOutputs: z.literal(true),
    mustIncludeRequestedSensitivities: z.literal(true),
    answerFreePayloadHashRequired: z.literal(true),
  }),
  authoringBoundary: z.object({
    cleanSourceLayerExportRequired: z.literal(true),
    authorMayReadAgentVisibleSourceObservations: z.literal(true),
    authorMayReadGraderOnlyValues: z.literal(false),
    authorMayInferOrCopyLatentLabels: z.literal(false),
    currentImplementationWorkerIsIndependentReviewer: z.literal(false),
  }),
  reviewBoundary: z.object({
    reviewerIndependentFromInputAuthorAndVerifier: z.literal(true),
    reviewerReceivesOnlyCandidateAgentBundleAndPublicContracts: z.literal(true),
    reviewerReceivesGraderOnlyValues: z.literal(false),
    requiredQuestions: exactStringSet(REQUIRED_OBSERVABLE_EVIDENCE_REVIEW_QUESTIONS),
    permittedVerdicts: z.tuple([
      z.literal("PASS"),
      z.literal("NEEDS_REPAIR"),
      z.literal("BLOCKED"),
    ]),
    currentVerdict: z.literal("NOT_REVIEWED"),
  }),
  withheldFromAuthorAndReviewer: exactStringSet(WITHHELD_GRADER_SURFACES),
  releaseGate: z.object({
    mechanicalDifficultyPreflightMustPass: z.literal(true),
    independentMethodReviewMustPass: z.literal(true),
    frontierProbeBlockedUntilBothPass: z.literal(true),
    paidInferenceAuthorized: z.literal(false),
    externalTerminalBenchSubmissionAuthorized: z.literal(false),
    publicLatentFixtureAuthorized: z.literal(false),
  }),
  completion: z.object({
    typedClaim: z.literal("SUBTASK_COMPLETE_PARENT_OPEN"),
    operationalAlignment: z.literal("review_request_routed_frontier_probe_blocked"),
    scientificAdequacy: z.literal("not_yet_reviewed_agent_input_not_yet_constructed"),
    releaseAdequacy: z.literal("not_applicable_no_external_submission_or_production_release"),
  }),
});

export type ObservableEvidenceReviewRequest = z.infer<
  typeof observableEvidenceReviewRequestSchema
>;
