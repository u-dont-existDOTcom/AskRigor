import {
  studyInfluenceAnalysisSchema,
  type StudyInfluenceAnalysis,
} from "./study-lab.js";

export interface LeaveOneOutInfluenceInput {
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
  heterogeneity_changed: boolean;
  assumptions?: string[];
}

/**
 * Build a leave-one-out influence record without conflating confidence-interval
 * width with heterogeneity. Heterogeneity change must come from the synthesis
 * calculation that actually estimates it.
 */
export function createLeaveOneOutInfluence(
  input: LeaveOneOutInfluenceInput,
): StudyInfluenceAnalysis {
  return studyInfluenceAnalysisSchema.parse({
    analysis_id: input.analysis_id,
    estimate_id: input.estimate_id,
    method: "LEAVE_ONE_OUT",
    baseline_effect: input.baseline_effect,
    counterfactual_effect: input.counterfactual_effect,
    baseline_interval: [...input.baseline_interval],
    counterfactual_interval: [...input.counterfactual_interval],
    conclusion_changed:
      input.baseline_conclusion !== input.counterfactual_conclusion,
    certainty_changed:
      input.baseline_certainty !== input.counterfactual_certainty,
    heterogeneity_changed: input.heterogeneity_changed,
    decision_changed:
      input.baseline_decision !== input.counterfactual_decision,
    assumptions: input.assumptions ?? [],
    result_summary:
      `Removing the study changed the effect from ${input.baseline_effect} ` +
      `to ${input.counterfactual_effect}; conclusion changed: ` +
      `${input.baseline_conclusion !== input.counterfactual_conclusion}.`,
  });
}
