import { createHash } from "node:crypto";

import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

export const causalCouplingDimensionSchema = z.enum([
  "NECESSITY",
  "SUFFICIENCY_OR_SPECIFICITY",
  "DOSE_OR_SEVERITY_COVARIATION",
  "MEDIATION",
  "COMMON_CAUSE"
]);

export const causalOutcomeMatchSchema = z.enum([
  "SIDE_EFFECT_OUTCOME_ONLY",
  "BENEFIT_OUTCOME_ONLY",
  "BOTH",
  "NEITHER"
]);

export const discriminatorSearchStatusSchema = z.enum([
  "PLANNED",
  "COMPLETED",
  "INACCESSIBLE_DOCUMENTED"
]);

const discriminatorSchema = z.object({
  discriminator_id: bounded(120),
  prediction_tested: bounded(1_000),
  dimension: causalCouplingDimensionSchema,
  search_query_or_test: bounded(5_000),
  evidence_tier: z.enum([
    "IDEAL_RANDOMIZED_MARKER_MANIPULATION",
    "RANDOMIZED_MATCHED_EXPOSURE_WITH_BENEFIT",
    "CONTROLLED_LOW_MARKER_EFFICACY",
    "WITHIN_PERSON_MANIPULATION",
    "REACTION_RESPONSE_ASSOCIATION",
    "EFFICACY_BELOW_MARKER_THRESHOLD",
    "COMMUNITY_SAME_PERSON_COMPARISON",
    "LOWER_GRADE_CROSS_STUDY"
  ]),
  status: discriminatorSearchStatusSchema,
  outcome_match: causalOutcomeMatchSchema,
  evidence_refs: z.array(bounded(2_048)).max(100),
  inaccessible_reason: bounded(2_000).optional(),
  used_for_efficacy_preservation: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.status === "COMPLETED" && value.evidence_refs.length === 0) {
    context.addIssue({ code: "custom", message: "Completed discriminator needs evidence" });
  }
  if (
    (value.status === "INACCESSIBLE_DOCUMENTED") !==
    (value.inaccessible_reason !== undefined)
  ) {
    context.addIssue({ code: "custom", message: "Inaccessible discriminator needs one explicit reason" });
  }
});

const hypothesisSchema = z.object({
  hypothesis_id: bounded(120),
  statement: bounded(2_000),
  serious_live_hypothesis: z.boolean(),
  distinguishing_predictions: z.array(bounded(1_000)).min(1).max(30),
  discriminators: z.array(discriminatorSchema).max(30)
}).strict();

const challengeObservationSchema = z.object({
  observation: bounded(2_000),
  direction: z.enum(["STRENGTHEN", "WEAKEN"]),
  search_or_test: bounded(5_000),
  status: discriminatorSearchStatusSchema,
  evidence_refs: z.array(bounded(2_048)).max(100),
  inaccessible_reason: bounded(2_000).optional()
}).strict().superRefine((value, context) => {
  if (value.status === "COMPLETED" && value.evidence_refs.length === 0) {
    context.addIssue({ code: "custom", message: "Completed challenge needs evidence" });
  }
  if (
    (value.status === "INACCESSIBLE_DOCUMENTED") !==
    (value.inaccessible_reason !== undefined)
  ) {
    context.addIssue({ code: "custom", message: "Inaccessible challenge needs one explicit reason" });
  }
});

export const causalCouplingPlanSchema = z.object({
  contract_version: z.literal("askrigor_causal_coupling_plan_v1"),
  applies: z.boolean(),
  research_question: bounded(5_000),
  marker_or_response: bounded(1_000),
  desired_benefit: bounded(1_000),
  marker_cause_question: bounded(2_000),
  benefit_coupling_question: bounded(2_000),
  hypotheses: z.array(hypothesisSchema).max(20),
  challenge_observations: z.array(challengeObservationSchema).max(2),
  formal_evidence_searched_first: z.boolean(),
  community_gap: z.object({
    could_materially_discriminate: z.boolean(),
    targeted_queries: z.array(bounded(5_000)).max(30),
    status: discriminatorSearchStatusSchema,
    evidence_refs: z.array(bounded(2_048)).max(100),
    inaccessible_reason: bounded(2_000).optional()
  }).strict(),
  follow_up_replan: z.object({
    triggered: z.boolean(),
    prior_plan_omitted_dimension: z.boolean(),
    omitted_dimension: causalCouplingDimensionSchema.optional(),
    correction_receipt: bounded(2_000).optional()
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.applies) {
    if (value.hypotheses.filter(({ serious_live_hypothesis }) => serious_live_hypothesis).length < 2) {
      context.addIssue({ code: "custom", message: "Applicable coupling plan needs competing serious hypotheses" });
    }
    const directions = new Set(value.challenge_observations.map(({ direction }) => direction));
    if (!directions.has("STRENGTHEN") || !directions.has("WEAKEN")) {
      context.addIssue({ code: "custom", message: "Applicable coupling plan needs strengthen and weaken challenges" });
    }
  }
  const gap = value.community_gap;
  if (gap.could_materially_discriminate && gap.targeted_queries.length === 0) {
    context.addIssue({ code: "custom", message: "A material community gap needs targeted discriminator queries" });
  }
  if (gap.status === "COMPLETED" && gap.evidence_refs.length === 0) {
    context.addIssue({ code: "custom", message: "Completed community discriminator needs evidence" });
  }
  if ((gap.status === "INACCESSIBLE_DOCUMENTED") !== (gap.inaccessible_reason !== undefined)) {
    context.addIssue({ code: "custom", message: "Inaccessible community discriminator needs a reason" });
  }
  const replan = value.follow_up_replan;
  if (replan.triggered && (!replan.correction_receipt ||
    (replan.prior_plan_omitted_dimension && !replan.omitted_dimension))) {
    context.addIssue({ code: "custom", message: "Follow-up replanning must preserve the original omission" });
  }
});

export const causalCouplingCheckIdSchema = z.enum([
  "FS-COUPLING-01",
  "FS-NECESSITY-01",
  "FS-SUFFICIENCY-01",
  "FS-MEDIATION-01",
  "FS-OUTCOME-MATCH-01",
  "FS-STRENGTHEN-01",
  "FS-FORUM-01"
]);

export const causalCouplingCheckStatusSchema = z.enum([
  "PASS",
  "NOT_APPLICABLE",
  "INACCESSIBLE_DOCUMENTED",
  "FAIL"
]);

const coverageCheckSchema = z.object({
  check_id: causalCouplingCheckIdSchema,
  status: causalCouplingCheckStatusSchema,
  rationale: bounded(2_000)
}).strict();

export const causalCouplingCoverageReceiptSchema = z.object({
  receipt_version: z.literal("askrigor_causal_coupling_coverage_v1"),
  plan_sha256: digest,
  checks: z.array(coverageCheckSchema).length(7),
  serious_hypotheses: z.number().int().nonnegative(),
  serious_hypotheses_with_discriminator: z.number().int().nonnegative(),
  synthesis_lock: z.enum([
    "PASS",
    "QUALIFIED_INACCESSIBLE",
    "BLOCK"
  ]),
  failure_codes: z.array(z.enum([
    "OMITTED_BENEFIT_MARKER_CAUSAL_COUPLING_TEST",
    "OMITTED_TARGETED_COMMUNITY_DISCRIMINATOR",
    "OUTCOME_MISMATCH_EFFICACY_CLAIM",
    "FORMAL_EVIDENCE_ORDER_VIOLATION",
    "SERIOUS_HYPOTHESIS_UNTESTED"
  ])).max(5)
}).strict().superRefine((value, context) => {
  const ids = value.checks.map(({ check_id }) => check_id);
  if (new Set(ids).size !== 7) {
    context.addIssue({ code: "custom", message: "Coverage receipt needs every check exactly once" });
  }
});

export type CausalCouplingPlan = z.output<typeof causalCouplingPlanSchema>;
export type CausalCouplingCoverageReceipt = z.output<
  typeof causalCouplingCoverageReceiptSchema
>;

export function assessCausalCouplingCoverage(
  rawPlan: CausalCouplingPlan
): CausalCouplingCoverageReceipt {
  const plan = causalCouplingPlanSchema.parse(rawPlan);
  const planSha256 = sha256(canonicalJson(plan));
  if (!plan.applies) {
    return causalCouplingCoverageReceiptSchema.parse({
      receipt_version: "askrigor_causal_coupling_coverage_v1",
      plan_sha256: planSha256,
      checks: causalCouplingCheckIdSchema.options.map((check_id) => ({
        check_id,
        status: "NOT_APPLICABLE",
        rationale: "The research question does not propose or depend on causal coupling."
      })),
      serious_hypotheses: 0,
      serious_hypotheses_with_discriminator: 0,
      synthesis_lock: "PASS",
      failure_codes: []
    });
  }

  const serious = plan.hypotheses.filter(({ serious_live_hypothesis }) =>
    serious_live_hypothesis
  );
  const resolvedDiscriminator = (dimension: z.output<typeof causalCouplingDimensionSchema>) =>
    serious.flatMap(({ discriminators }) => discriminators)
      .filter((item) => item.dimension === dimension && item.status !== "PLANNED");
  const outcomeMismatch = serious.flatMap(({ discriminators }) => discriminators).some((item) =>
    item.used_for_efficacy_preservation &&
    !["BENEFIT_OUTCOME_ONLY", "BOTH"].includes(item.outcome_match)
  );
  const dimensions = [
    "NECESSITY",
    "SUFFICIENCY_OR_SPECIFICITY",
    "DOSE_OR_SEVERITY_COVARIATION",
    "MEDIATION",
    "COMMON_CAUSE"
  ] as const;
  const hypothesisResolved = serious.filter(({ discriminators }) =>
    discriminators.some(({ status }) => status !== "PLANNED")
  ).length;
  const dimensionStatus = (
    dimension: typeof dimensions[number],
    matchedBenefitOutcomeRequired = false
  ) => {
    const tests = resolvedDiscriminator(dimension);
    if (tests.some(({ status, outcome_match }) =>
      status === "COMPLETED" &&
      (!matchedBenefitOutcomeRequired || ["BENEFIT_OUTCOME_ONLY", "BOTH"].includes(outcome_match))
    )) return "PASS" as const;
    if (tests.some(({ status }) => status === "INACCESSIBLE_DOCUMENTED")) {
      return "INACCESSIBLE_DOCUMENTED" as const;
    }
    return "FAIL" as const;
  };
  const challenges = (direction: "STRENGTHEN" | "WEAKEN") =>
    plan.challenge_observations.filter((item) => item.direction === direction);
  const challengeStatus = (() => {
    const required = [...challenges("STRENGTHEN"), ...challenges("WEAKEN")];
    if (required.some(({ status }) => status === "PLANNED")) return "FAIL" as const;
    if (required.some(({ status }) => status === "INACCESSIBLE_DOCUMENTED")) {
      return "INACCESSIBLE_DOCUMENTED" as const;
    }
    return "PASS" as const;
  })();
  const forumStatus = !plan.community_gap.could_materially_discriminate
    ? "NOT_APPLICABLE" as const
    : plan.community_gap.status === "COMPLETED"
      ? "PASS" as const
      : plan.community_gap.status === "INACCESSIBLE_DOCUMENTED"
        ? "INACCESSIBLE_DOCUMENTED" as const
        : "FAIL" as const;
  const checks: z.output<typeof coverageCheckSchema>[] = [
    {
      check_id: "FS-COUPLING-01",
      status: dimensionStatus("DOSE_OR_SEVERITY_COVARIATION"),
      rationale: "Marker magnitude versus benefit covariation was searched or its inaccessibility recorded."
    },
    {
      check_id: "FS-NECESSITY-01",
      status: dimensionStatus("NECESSITY", true),
      rationale: "Benefit with absent or reduced marker was searched or its inaccessibility recorded."
    },
    {
      check_id: "FS-SUFFICIENCY-01",
      status: dimensionStatus("SUFFICIENCY_OR_SPECIFICITY"),
      rationale: "Marker among nonresponders or no-benefit cases was searched or its inaccessibility recorded."
    },
    {
      check_id: "FS-MEDIATION-01",
      status: dimensionStatus("MEDIATION", true),
      rationale: "A marker-reducing manipulation with matched benefit outcome was searched or bounded."
    },
    {
      check_id: "FS-OUTCOME-MATCH-01",
      status: outcomeMismatch ? "FAIL" : "PASS",
      rationale: outcomeMismatch
        ? "An efficacy-preservation claim uses evidence without a benefit outcome."
        : "Every efficacy-preservation use has a benefit outcome."
    },
    {
      check_id: "FS-STRENGTHEN-01",
      status: challengeStatus,
      rationale: "The strongest feasible strengthening and weakening observations were addressed."
    },
    {
      check_id: "FS-FORUM-01",
      status: forumStatus,
      rationale: plan.community_gap.could_materially_discriminate
        ? "The targeted community discriminator was searched or its boundary recorded."
        : "Firsthand evidence cannot materially discriminate the remaining hypotheses."
    }
  ];
  const failureCodes: z.input<typeof causalCouplingCoverageReceiptSchema>["failure_codes"] = [];
  if (["FS-COUPLING-01", "FS-NECESSITY-01", "FS-SUFFICIENCY-01", "FS-MEDIATION-01"]
    .some((id) => checks.find(({ check_id }) => check_id === id)?.status === "FAIL")) {
    failureCodes.push("OMITTED_BENEFIT_MARKER_CAUSAL_COUPLING_TEST");
  }
  if (forumStatus === "FAIL") failureCodes.push("OMITTED_TARGETED_COMMUNITY_DISCRIMINATOR");
  if (outcomeMismatch) failureCodes.push("OUTCOME_MISMATCH_EFFICACY_CLAIM");
  if (!plan.formal_evidence_searched_first) {
    failureCodes.push("FORMAL_EVIDENCE_ORDER_VIOLATION");
  }
  if (hypothesisResolved !== serious.length) failureCodes.push("SERIOUS_HYPOTHESIS_UNTESTED");
  const hasFail = checks.some(({ status }) => status === "FAIL") ||
    hypothesisResolved !== serious.length ||
    dimensions.some((dimension) => resolvedDiscriminator(dimension).length === 0) ||
    !plan.formal_evidence_searched_first;
  const hasInaccessible = checks.some(({ status }) => status === "INACCESSIBLE_DOCUMENTED");
  return causalCouplingCoverageReceiptSchema.parse({
    receipt_version: "askrigor_causal_coupling_coverage_v1",
    plan_sha256: planSha256,
    checks,
    serious_hypotheses: serious.length,
    serious_hypotheses_with_discriminator: hypothesisResolved,
    synthesis_lock: hasFail ? "BLOCK" : hasInaccessible ? "QUALIFIED_INACCESSIBLE" : "PASS",
    failure_codes: [...new Set(failureCodes)]
  });
}

export function causalCouplingPlanSha256(rawPlan: CausalCouplingPlan): string {
  return sha256(canonicalJson(causalCouplingPlanSchema.parse(rawPlan)));
}

export function causalCouplingCoverageReceiptSha256(
  receipt: CausalCouplingCoverageReceipt
): string {
  return sha256(canonicalJson(causalCouplingCoverageReceiptSchema.parse(receipt)));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
