import { z } from "zod";

import { patientStoryEvidenceExtensionV020Schema } from "./patient-story-evidence-v0.2.js";

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const longitudinalObservationKindSchema = z.enum([
  "ONSET_RELATIVE_TO_EXPOSURE",
  "TEMPORAL_SEQUENCE",
  "PERSISTENCE",
  "RECURRENCE",
  "DECHALLENGE",
  "RECHALLENGE",
  "TREATMENT_CLASS_RESPONSE",
  "FUNCTIONAL_TRAJECTORY",
  "NEGATIVE_OR_TOLERATED_COMPARISON",
  "OTHER_HIGH_INFORMATION_LONGITUDINAL",
]);

export const longitudinalConstraintSchema = z.object({
  observation_id: z.string().regex(/^ARLO-[A-Z0-9_-]{4,64}$/u),
  kind: longitudinalObservationKindSchema,
  observation: requiredText(4_000),
  source_evidence_ids: z.array(z.string().regex(/^AREV-[A-Z0-9_-]{4,64}$/u)).min(1).max(20),
  high_information_reason: requiredText(2_000),
  uncertainty: requiredText(2_000).nullable(),
}).strict();

export const phenotypeObservationSchema = z.object({
  phenotype_observation_id: z.string().regex(/^ARPH-[A-Z0-9_-]{4,64}$/u),
  observation_type: z.enum([
    "PHOTOGRAPH",
    "EXAMINATION_MORPHOLOGY",
    "DIAGNOSTIC_LABEL",
    "COMMON_PATTERN",
    "BIOMARKER",
    "OTHER_CROSS_SECTIONAL_OBSERVATION",
  ]),
  description: requiredText(4_000),
  source_evidence_ids: z.array(z.string().regex(/^AREV-[A-Z0-9_-]{4,64}$/u)).min(1).max(20),
  etiology_status: z.enum([
    "PHENOTYPE_ONLY",
    "INDEPENDENT_ETIOLOGIC_EVIDENCE_PRESENT",
  ]),
  independent_etiology_evidence_ids: z.array(
    z.string().regex(/^AREV-[A-Z0-9_-]{4,64}$/u),
  ).max(20),
}).strict().superRefine((value, context) => {
  const requiresEtiologyEvidence = value.etiology_status === "INDEPENDENT_ETIOLOGIC_EVIDENCE_PRESENT";
  if (requiresEtiologyEvidence && value.independent_etiology_evidence_ids.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["independent_etiology_evidence_ids"],
      message: "Independent etiologic support requires at least one linked evidence item",
    });
  }
  if (!requiresEtiologyEvidence && value.independent_etiology_evidence_ids.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["independent_etiology_evidence_ids"],
      message: "A phenotype-only observation cannot carry independent etiologic evidence",
    });
  }
});

export const constraintPredictionSchema = z.object({
  observation_id: z.string().regex(/^ARLO-[A-Z0-9_-]{4,64}$/u),
  prediction: z.enum([
    "EXPECTED",
    "COMPATIBLE_BUT_NONSPECIFIC",
    "UNEXPECTED",
    "OPPOSITE_TO_PREDICTION",
    "UNRESOLVED",
  ]),
  explanation: requiredText(3_000),
}).strict();

export const causalHypothesisAssessmentSchema = z.object({
  hypothesis_id: z.string().regex(/^ARHY-[A-Z0-9_-]{4,64}$/u),
  hypothesis: requiredText(4_000),
  causal_role: z.enum(["INITIATING", "MAINTAINING", "BOTH"]),
  rank: z.number().int().positive(),
  overall_fit: z.enum([
    "FITS_COMPLETE_PATTERN",
    "PARTIAL_FIT",
    "CONFLICTS_WITH_HIGH_INFORMATION_EVIDENCE",
    "UNRESOLVED",
  ]),
  constraint_predictions: z.array(constraintPredictionSchema).min(3).max(7),
  ranking_exception_reason: requiredText(3_000).nullable(),
}).strict();

export const longitudinalCausalAssessmentSchema = z.object({
  complete_supplied_history_reviewed: z.literal(true),
  longitudinal_constraints: z.array(longitudinalConstraintSchema).min(3).max(7),
  phenotype_observations: z.array(phenotypeObservationSchema).max(20),
  causal_hypotheses: z.array(causalHypothesisAssessmentSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  const observationIds = value.longitudinal_constraints.map(({ observation_id }) => observation_id);
  const observationSet = new Set(observationIds);
  if (observationSet.size !== observationIds.length) {
    context.addIssue({ code: "custom", path: ["longitudinal_constraints"], message: "Longitudinal observation IDs must be unique" });
  }

  const ranks = value.causal_hypotheses.map(({ rank }) => rank);
  const requiredRanks = Array.from({ length: ranks.length }, (_, index) => index + 1);
  if (new Set(ranks).size !== ranks.length || [...ranks].sort((a, b) => a - b).some((rank, index) => rank !== requiredRanks[index])) {
    context.addIssue({ code: "custom", path: ["causal_hypotheses"], message: "Hypothesis ranks must be unique and contiguous from one" });
  }

  for (const [hypothesisIndex, hypothesis] of value.causal_hypotheses.entries()) {
    const predictionIds = hypothesis.constraint_predictions.map(({ observation_id }) => observation_id);
    if (
      predictionIds.length !== observationIds.length
      || new Set(predictionIds).size !== predictionIds.length
      || predictionIds.some((id) => !observationSet.has(id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["causal_hypotheses", hypothesisIndex, "constraint_predictions"],
        message: "Every leading hypothesis must assess every longitudinal constraint exactly once",
      });
    }
  }

  const cleanFits = value.causal_hypotheses.filter(({ constraint_predictions }) =>
    constraint_predictions.every(({ prediction }) =>
      prediction === "EXPECTED" || prediction === "COMPATIBLE_BUT_NONSPECIFIC",
    ),
  );
  for (const [hypothesisIndex, hypothesis] of value.causal_hypotheses.entries()) {
    const hasConflict = hypothesis.constraint_predictions.some(({ prediction }) =>
      prediction === "UNEXPECTED" || prediction === "OPPOSITE_TO_PREDICTION",
    );
    const outranksCleanFit = cleanFits.some(({ rank }) => hypothesis.rank < rank);
    if (hasConflict && outranksCleanFit && !hypothesis.ranking_exception_reason) {
      context.addIssue({
        code: "custom",
        path: ["causal_hypotheses", hypothesisIndex, "ranking_exception_reason"],
        message: "A hypothesis that outranks a complete-pattern fit despite conflicting constraints requires an explicit evidence-supported reason",
      });
    }
  }
});

export const evidenceUpdateClassificationSchema = z.object({
  update_id: z.string().regex(/^ARUP-[A-Z0-9_-]{4,64}$/u),
  source_turn_or_record_id: requiredText(200),
  classification: z.enum([
    "NEW_EVIDENCE",
    "REWEIGHTING_OR_CORRECTION_OF_ALREADY_PRESENT_EVIDENCE",
  ]),
  decisive_evidence_ids: z.array(z.string().regex(/^AREV-[A-Z0-9_-]{4,64}$/u)).min(1).max(20),
  decisive_evidence_already_present: z.boolean(),
  earlier_failure: z.enum([
    "EVIDENCE_WEIGHTING_FAILURE",
    "SEMANTIC_REPRESENTATION_FAILURE",
    "BOTH",
  ]).nullable(),
  explanation: requiredText(4_000),
}).strict().superRefine((value, context) => {
  if (value.decisive_evidence_already_present) {
    if (value.classification !== "REWEIGHTING_OR_CORRECTION_OF_ALREADY_PRESENT_EVIDENCE") {
      context.addIssue({
        code: "custom",
        path: ["classification"],
        message: "Evidence already present before the update must be classified as reweighting or correction",
      });
    }
    if (!value.earlier_failure) {
      context.addIssue({
        code: "custom",
        path: ["earlier_failure"],
        message: "An already-present decisive fact requires the earlier weighting or representation failure",
      });
    }
  }
  if (value.classification === "NEW_EVIDENCE") {
    if (value.decisive_evidence_already_present) {
      context.addIssue({ code: "custom", path: ["decisive_evidence_already_present"], message: "New evidence cannot already have been present" });
    }
    if (value.earlier_failure !== null) {
      context.addIssue({ code: "custom", path: ["earlier_failure"], message: "A new-evidence update cannot invent an earlier weighting or representation failure" });
    }
  }
});

export const patientStoryEvidenceExtensionV030Schema = z.object({
  ...patientStoryEvidenceExtensionV020Schema.shape,
  schema_version: z.literal("0.3.0"),
  method_version: z.literal("patient-story-interview-method-0.3.0"),
  causal_assessment_status: z.enum([
    "NOT_REQUESTED",
    "DEFERRED_INSUFFICIENT_INFORMATION",
    "RANKED",
  ]),
  causal_assessment: longitudinalCausalAssessmentSchema.nullable(),
  evidence_updates: z.array(evidenceUpdateClassificationSchema).max(100),
}).strict().superRefine((value, context) => {
  if (
    (value.collection_actor === "HUMAN_RESPONDENT_INTERVIEW" || value.collection_actor === "HUMAN_REVIEWER")
    && value.human_interface === null
  ) {
    context.addIssue({
      code: "custom",
      path: ["human_interface"],
      message: "Human judgment requires a human-facing interface",
    });
  }
  if (value.causal_assessment_status === "RANKED" && value.causal_assessment === null) {
    context.addIssue({
      code: "custom",
      path: ["causal_assessment"],
      message: "A ranked differential requires the longitudinal causal assessment",
    });
  }
  if (value.causal_assessment_status !== "RANKED" && value.causal_assessment !== null) {
    context.addIssue({
      code: "custom",
      path: ["causal_assessment_status"],
      message: "A completed causal assessment must be labeled RANKED",
    });
  }

  const evidenceIds = new Set(value.evidence_items.map(({ evidence_id }) => evidence_id));
  const requireEvidenceIds = (ids: string[], path: (string | number)[]): void => {
    const unknown = ids.filter((id) => !evidenceIds.has(id));
    if (unknown.length > 0) {
      context.addIssue({ code: "custom", path, message: `Unknown linked evidence IDs: ${unknown.join(", ")}` });
    }
  };

  if (value.causal_assessment) {
    value.causal_assessment.longitudinal_constraints.forEach((observation, index) => {
      requireEvidenceIds(observation.source_evidence_ids, ["causal_assessment", "longitudinal_constraints", index, "source_evidence_ids"]);
    });
    value.causal_assessment.phenotype_observations.forEach((observation, index) => {
      requireEvidenceIds(observation.source_evidence_ids, ["causal_assessment", "phenotype_observations", index, "source_evidence_ids"]);
      requireEvidenceIds(observation.independent_etiology_evidence_ids, ["causal_assessment", "phenotype_observations", index, "independent_etiology_evidence_ids"]);
    });
  }
  value.evidence_updates.forEach((update, index) => {
    requireEvidenceIds(update.decisive_evidence_ids, ["evidence_updates", index, "decisive_evidence_ids"]);
  });
});

export type PatientStoryEvidenceExtensionV030 = z.infer<typeof patientStoryEvidenceExtensionV030Schema>;
