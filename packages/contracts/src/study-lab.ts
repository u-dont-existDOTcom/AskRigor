import { z } from "zod";

const MAX_TEXT = 4_000;
const MAX_ITEMS = 2_000;
const boundedTextSchema = z.string().trim().min(1).max(MAX_TEXT);
const boundedIdentifierSchema = z.string().trim().min(1).max(300);
const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const studyDesignClassSchema = z.enum([
  "RANDOMIZED_TRIAL",
  "NONRANDOMIZED_INTERVENTION",
  "OBSERVATIONAL_COHORT",
  "CASE_CONTROL",
  "CROSS_SECTIONAL",
  "DIAGNOSTIC_ACCURACY",
  "PROGNOSTIC_OR_PREDICTION_MODEL",
  "QUALITATIVE",
  "CASE_REPORT_OR_SERIES",
  "SYSTEMATIC_REVIEW",
  "OTHER",
]);

export const studyMethodJudgmentSchema = z.enum([
  "LOW_CONCERN",
  "SOME_CONCERNS",
  "HIGH_CONCERN",
  "CRITICAL_CONCERN",
  "NOT_APPLICABLE",
  "INSUFFICIENT_INFORMATION",
  "UNRESOLVED_DISAGREEMENT",
]);

export const studyAuditDomainFindingSchema = z
  .object({
    domain_id: boundedIdentifierSchema,
    question_id: boundedIdentifierSchema,
    judgment: studyMethodJudgmentSchema,
    source_locators: z.array(boundedTextSchema).max(100),
    rationale: boundedTextSchema,
    unresolved_items: z.array(boundedTextSchema).max(100),
    assessor_id: boundedIdentifierSchema,
    assessor_type: z.enum(["WORKER", "HUMAN_REVIEWER", "IMPORTED", "MIXED"]),
    independent_assessment_id: boundedIdentifierSchema.nullable(),
    adjudication_id: boundedIdentifierSchema.nullable(),
  })
  .strict();

export const studyAuditProfileSchema = z
  .object({
    audit_profile_id: boundedIdentifierSchema,
    study_id: boundedIdentifierSchema,
    study_version_id: boundedIdentifierSchema,
    design_class: studyDesignClassSchema,
    rubric_name: boundedIdentifierSchema,
    rubric_version: boundedIdentifierSchema,
    source_version_sha256: sha256Schema,
    assessed_at: timestampSchema,
    domain_findings: z.array(studyAuditDomainFindingSchema).min(1).max(500),
    applicability_summary: boundedTextSchema,
    can_support: z.array(boundedTextSchema).max(100),
    cannot_support: z.array(boundedTextSchema).max(100),
    uncertain: z.array(boundedTextSchema).max(100),
    disagreements: z.array(boundedTextSchema).max(100),
    supersedes_audit_profile_id: boundedIdentifierSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const domains = value.domain_findings.map((finding) => finding.domain_id);
    if (new Set(domains).size !== domains.length) {
      context.addIssue({ code: "custom", path: ["domain_findings"], message: "Audit domain IDs must be unique within a profile" });
    }
  });

const contributionLevelSchema = z.enum(["NONE", "LOW", "MODERATE", "HIGH", "VERY_HIGH", "UNKNOWN"]);

const contributionDimensionSchema = z
  .object({
    level: contributionLevelSchema,
    rationale: boundedTextSchema,
    calculation_or_method: z.string().max(MAX_TEXT).nullable(),
    uncertainty: z.string().max(MAX_TEXT).nullable(),
    evidence_refs: z.array(boundedIdentifierSchema).max(100),
  })
  .strict();

const synthesisWeightSchema = z
  .object({
    estimate_id: boundedIdentifierSchema,
    contribution_fraction: z.number().min(0).max(1),
    weighting_method: boundedIdentifierSchema,
    is_quality_interpretation: z.literal(false),
  })
  .strict();

export const studyInfluenceAnalysisSchema = z
  .object({
    analysis_id: boundedIdentifierSchema,
    estimate_id: boundedIdentifierSchema,
    method: z.enum([
      "LEAVE_ONE_OUT",
      "EXCLUDE_HIGH_CONCERN",
      "RECLASSIFY_OUTCOME",
      "ALTERNATIVE_MODEL",
      "ALTERNATIVE_BIAS_ASSUMPTION",
      "OTHER",
    ]),
    baseline_effect: z.number().finite().nullable(),
    counterfactual_effect: z.number().finite().nullable(),
    baseline_interval: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
    counterfactual_interval: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
    conclusion_changed: z.boolean(),
    certainty_changed: z.boolean(),
    heterogeneity_changed: z.boolean(),
    decision_changed: z.boolean(),
    assumptions: z.array(boundedTextSchema).max(100),
    result_summary: boundedTextSchema,
  })
  .strict();

export const studyInformationContributionProfileSchema = z
  .object({
    contribution_profile_id: boundedIdentifierSchema,
    study_id: boundedIdentifierSchema,
    study_version_id: boundedIdentifierSchema,
    synthesis_id: boundedIdentifierSchema,
    synthesis_version_id: boundedIdentifierSchema,
    scope: z
      .object({
        population: boundedTextSchema,
        intervention_or_exposure: boundedTextSchema,
        comparator: boundedTextSchema,
        outcome: boundedTextSchema,
        horizon: boundedTextSchema,
        setting: boundedTextSchema,
      })
      .strict(),
    precision_contribution: contributionDimensionSchema,
    scope_directness: contributionDimensionSchema,
    unique_coverage: contributionDimensionSchema,
    independence: z
      .object({
        status: z.enum(["INDEPENDENT", "PARTIALLY_OVERLAPPING", "DUPLICATE_POPULATION", "DEPENDENT_ANALYSIS", "UNKNOWN"]),
        related_study_ids: z.array(boundedIdentifierSchema).max(500),
        rationale: boundedTextSchema,
      })
      .strict(),
    synthesis_weights: z.array(synthesisWeightSchema).max(MAX_ITEMS),
    influence_analyses: z.array(studyInfluenceAnalysisSchema).max(500),
    bias_sensitivity: contributionDimensionSchema,
    replication_role: z.enum([
      "ORIGINAL",
      "DIRECT_REPLICATION",
      "CONCEPTUAL_REPLICATION",
      "CONTRADICTION",
      "EXTENSION",
      "NOT_APPLICABLE",
      "UNKNOWN",
    ]),
    decision_impact: contributionDimensionSchema,
    gap_resolution: contributionDimensionSchema,
    reproducibility_contribution: contributionDimensionSchema,
    future_information_value: contributionDimensionSchema,
    source_access_completeness: z.enum(["COMPLETE", "PARTIAL", "ABSTRACT_OR_REGISTRY_ONLY", "INACCESSIBLE", "UNKNOWN"]),
    assessed_at: timestampSchema,
    method_version: boundedIdentifierSchema,
    limitations: z.array(boundedTextSchema).max(200),
    supersedes_contribution_profile_id: boundedIdentifierSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const estimateIds = value.synthesis_weights.map((weight) => weight.estimate_id);
    if (new Set(estimateIds).size !== estimateIds.length) {
      context.addIssue({ code: "custom", path: ["synthesis_weights"], message: "Each estimate may have only one contribution weight per study profile" });
    }
    if (value.independence.status === "DUPLICATE_POPULATION" && value.independence.related_study_ids.length === 0) {
      context.addIssue({ code: "custom", path: ["independence", "related_study_ids"], message: "Duplicate-population status requires related study IDs" });
    }
  });

export const studyLabComparisonEntrySchema = z
  .object({
    study_id: boundedIdentifierSchema,
    audit_profile_id: boundedIdentifierSchema,
    contribution_profile_id: boundedIdentifierSchema,
    method_summary: boundedTextSchema,
    information_summary: boundedTextSchema,
    strongest_validity_limitation: boundedTextSchema,
    most_unique_information: boundedTextSchema,
    changes_overall_conclusion: z.boolean(),
  })
  .strict();

export const studyLabComparisonSchema = z
  .object({
    comparison_id: boundedIdentifierSchema,
    synthesis_id: boundedIdentifierSchema,
    entries: z.array(studyLabComparisonEntrySchema).min(2).max(500),
    sorting_view: z.enum([
      "METHODS_FIRST",
      "MOST_DECISION_INFORMATIVE",
      "MOST_DIRECT",
      "LARGEST_BUT_FRAGILE",
      "BEST_LONG_TERM_INFORMATION",
      "BEST_HARMS_INFORMATION",
      "WHAT_CHANGES_CONCLUSION",
    ]),
    no_universal_quality_ranking: z.literal(true),
  })
  .strict();

export type StudyAuditProfile = z.infer<typeof studyAuditProfileSchema>;
export type StudyInformationContributionProfile = z.infer<typeof studyInformationContributionProfileSchema>;
export type StudyInfluenceAnalysis = z.infer<typeof studyInfluenceAnalysisSchema>;
export type StudyLabComparison = z.infer<typeof studyLabComparisonSchema>;

export interface LeaveOneOutDeltaInput {
  analysis_id: string;
  estimate_id: string;
  baseline_effect: number;
  counterfactual_effect: number;
  baseline_interval: readonly [number, number];
  counterfactual_interval: readonly [number, number];
  baseline_conclusion: string;
  counterfactual_conclusion: string;
  baseline_certainty: string;
  counterfactual_certainty: string;
  baseline_decision: string;
  counterfactual_decision: string;
  assumptions?: string[];
}

export function createLeaveOneOutInfluence(input: LeaveOneOutDeltaInput): StudyInfluenceAnalysis {
  const baselineWidth = input.baseline_interval[1] - input.baseline_interval[0];
  const counterfactualWidth = input.counterfactual_interval[1] - input.counterfactual_interval[0];
  return studyInfluenceAnalysisSchema.parse({
    analysis_id: input.analysis_id,
    estimate_id: input.estimate_id,
    method: "LEAVE_ONE_OUT",
    baseline_effect: input.baseline_effect,
    counterfactual_effect: input.counterfactual_effect,
    baseline_interval: [...input.baseline_interval],
    counterfactual_interval: [...input.counterfactual_interval],
    conclusion_changed: input.baseline_conclusion !== input.counterfactual_conclusion,
    certainty_changed: input.baseline_certainty !== input.counterfactual_certainty,
    heterogeneity_changed: Math.abs(counterfactualWidth - baselineWidth) > 1e-12,
    decision_changed: input.baseline_decision !== input.counterfactual_decision,
    assumptions: input.assumptions ?? [],
    result_summary: `Removing the study changed the effect from ${input.baseline_effect} to ${input.counterfactual_effect}; conclusion changed: ${input.baseline_conclusion !== input.counterfactual_conclusion}.`,
  });
}
