import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const interviewEvidenceRoleSchema = z.enum([
  "DIRECT_RECURRENCE_SELF_REPORT",
  "BOUNDED_EPISODE",
  "EXCEPTION_OR_COUNTEREXAMPLE",
  "CONTEXT_OR_BOUNDARY_STATEMENT",
  "SAMPLED_OPPORTUNITY_OBSERVATION",
  "TRAIT_OR_INTERPRETIVE_LABEL",
  "CAUSAL_EXPLANATION",
  "ANALYST_OR_CODER_INFERENCE",
]);

export const interviewElicitationModeSchema = z.enum([
  "SPONTANEOUS",
  "OPEN_ENDED",
  "EXCEPTION_FIRST_PROBE",
  "CONFIRMING_EXAMPLE_REQUEST",
  "INCIDENT_CLARIFICATION",
  "VALID_SAMPLING_FRAME",
  "PUBLIC_SOURCE_EXTRACTION",
  "OTHER",
]);

export const evidentialIndependenceSchema = z.enum([
  "DIRECT_REPORT_ONLY",
  "CONDITIONALLY_SAMPLED_DETAIL",
  "INDEPENDENT_WITHIN_DEFINED_FRAME",
  "DEPENDENT_OR_CLUSTERED_WITHIN_DEFINED_FRAME",
  "NOT_APPLICABLE",
  "UNKNOWN",
]);

export const recurrenceClaimSchema = z
  .object({
    behavioral_or_symptom_proposition: requiredText(2_000),
    original_quantifier: requiredText(200),
    opportunity_scope_or_denominator: requiredText(2_000).nullable(),
    life_period_or_context: requiredText(2_000).nullable(),
    exceptions: z.array(requiredText(2_000)).max(50),
    exception_frequency: requiredText(500).nullable(),
    quantifier_uncertainty: requiredText(1_000).nullable(),
    calibration_status: z.enum([
      "NOT_YET_PROBED",
      "PROBED_NO_EXCEPTIONS_REPORTED",
      "PROBED_EXCEPTIONS_REPORTED",
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.calibration_status === "PROBED_EXCEPTIONS_REPORTED" && value.exceptions.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["exceptions"],
        message: "Exception-calibrated recurrence requires at least one preserved exception",
      });
    }
    if (value.calibration_status === "PROBED_NO_EXCEPTIONS_REPORTED" && value.exceptions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["calibration_status"],
        message: "PROBED_NO_EXCEPTIONS_REPORTED cannot carry preserved exceptions",
      });
    }
  });

export const opportunitySamplingFrameSchema = z
  .object({
    design: z.enum([
      "PROSPECTIVE_DIARY_OR_EVENT",
      "STRUCTURED_OPPORTUNITY",
      "RANDOM_OPPORTUNITY",
      "BOUNDED_EXHAUSTIVE_ENUMERATION",
      "EXTERNAL_LOG_OR_OBSERVATION",
      "REPEATED_MEASURES",
    ]),
    target_opportunity: requiredText(1_000),
    observation_period: requiredText(1_000),
    opportunities_with_target_event_observed: z.number().int().nonnegative().nullable(),
    opportunities_without_target_event_observed: z.number().int().nonnegative().nullable(),
    frame_limitations: requiredText(2_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.opportunities_with_target_event_observed === null)
      !== (value.opportunities_without_target_event_observed === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["opportunities_with_target_event_observed"],
        message: "Opportunity-frequency counts must provide both target-event and non-target-event opportunities or neither",
      });
    }
  });

export const patientInterviewEvidenceItemV020Schema = z
  .object({
    evidence_id: z.string().regex(/^AREV-[A-Z0-9_-]{4,64}$/u),
    role: interviewEvidenceRoleSchema,
    source_text: requiredText(8_000),
    elicitation_mode: interviewElicitationModeSchema,
    evidential_independence: evidentialIndependenceSchema,
    recurrence_claim: recurrenceClaimSchema.nullable(),
    bounded_episode_ref: requiredText(200).nullable(),
    context_or_boundary: requiredText(2_000).nullable(),
    sampling_frame: opportunitySamplingFrameSchema.nullable(),
    trait_or_interpretive_label: requiredText(2_000).nullable(),
    causal_explanation: requiredText(4_000).nullable(),
    analyst_or_coder_inference: requiredText(4_000).nullable(),
    source_turn_or_record_id: requiredText(200).nullable(),
    collected_at: timestampSchema.nullable(),
    notes: requiredText(4_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const requiredPayload: Partial<Record<z.infer<typeof interviewEvidenceRoleSchema>, keyof typeof value>> = {
      DIRECT_RECURRENCE_SELF_REPORT: "recurrence_claim",
      BOUNDED_EPISODE: "bounded_episode_ref",
      EXCEPTION_OR_COUNTEREXAMPLE: "context_or_boundary",
      CONTEXT_OR_BOUNDARY_STATEMENT: "context_or_boundary",
      SAMPLED_OPPORTUNITY_OBSERVATION: "sampling_frame",
      TRAIT_OR_INTERPRETIVE_LABEL: "trait_or_interpretive_label",
      CAUSAL_EXPLANATION: "causal_explanation",
      ANALYST_OR_CODER_INFERENCE: "analyst_or_coder_inference",
    };
    const field = requiredPayload[value.role];
    if (field && (value[field] === null || value[field] === undefined)) {
      context.addIssue({ code: "custom", path: [field], message: `${value.role} requires ${field}` });
    }
    const rolePayloadFields = [
      "recurrence_claim",
      "bounded_episode_ref",
      "context_or_boundary",
      "sampling_frame",
      "trait_or_interpretive_label",
      "causal_explanation",
      "analyst_or_coder_inference",
    ] as const;
    for (const candidate of rolePayloadFields) {
      if (candidate !== field && value[candidate] !== null) {
        context.addIssue({
          code: "custom",
          path: [candidate],
          message: `${value.role} cannot carry the payload of another evidence role`,
        });
      }
    }
    if (
      value.elicitation_mode === "CONFIRMING_EXAMPLE_REQUEST"
      && value.evidential_independence !== "CONDITIONALLY_SAMPLED_DETAIL"
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidential_independence"],
        message: "A self-selected confirming example must remain conditionally sampled detail",
      });
    }
    if (
      value.role === "SAMPLED_OPPORTUNITY_OBSERVATION"
      && (
        value.evidential_independence === "DIRECT_REPORT_ONLY"
        || value.evidential_independence === "CONDITIONALLY_SAMPLED_DETAIL"
        || value.evidential_independence === "NOT_APPLICABLE"
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidential_independence"],
        message: "Sampled opportunity observations require an explicit independent, dependent/clustered, or unknown dependence status within their defined frame",
      });
    }
    if (
      value.role !== "SAMPLED_OPPORTUNITY_OBSERVATION"
      && (
        value.evidential_independence === "INDEPENDENT_WITHIN_DEFINED_FRAME"
        || value.evidential_independence === "DEPENDENT_OR_CLUSTERED_WITHIN_DEFINED_FRAME"
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidential_independence"],
        message: "Defined-frame independence statuses are reserved for sampled opportunity observations",
      });
    }
  });

export const interviewFollowUpDecisionV020Schema = z
  .object({
    follow_up_id: z.string().regex(/^ARFU-[A-Z0-9_-]{4,64}$/u),
    question: requiredText(2_000),
    status: z.enum(["PLANNED", "ASKED", "SKIPPED"]),
    basis: z.enum([
      "EXPECTED_INFORMATION_GAIN",
      "CONSENT",
      "SAFETY",
      "LEGAL",
      "PROVENANCE",
      "OWNER_REQUESTED",
      "PREDETERMINED_VALID_STUDY_FIELD",
    ]),
    uncertainty_target: requiredText(2_000).nullable(),
    plausible_answer_that_changes_next_step: requiredText(2_000).nullable(),
    could_change: z.array(z.enum([
      "INFERENCE",
      "DIFFERENTIAL",
      "RECOMMENDATION",
      "EVIDENCE_CODE",
      "NEXT_QUESTION",
    ])).max(5),
    skip_reason: requiredText(2_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.basis === "EXPECTED_INFORMATION_GAIN" && value.status !== "SKIPPED") {
      if (!value.uncertainty_target || !value.plausible_answer_that_changes_next_step || value.could_change.length === 0) {
        context.addIssue({
          code: "custom",
          path: [],
          message: "A nonmandatory follow-up requires an uncertainty target, a plausible changing answer, and an affected decision",
        });
      }
    }
    if (value.status === "SKIPPED" && !value.skip_reason) {
      context.addIssue({ code: "custom", path: ["skip_reason"], message: "Skipped follow-ups require a reason" });
    }
  });

export const patientStoryEvidenceExtensionV020Schema = z
  .object({
    schema_version: z.literal("0.2.0"),
    extension_id: z.string().regex(/^ARIE-[A-Z0-9_-]{4,64}$/u),
    story_id: z.string().regex(/^ARS-[A-Z0-9_-]{8,64}$/u),
    source_story_schema_version: z.literal("0.1.0"),
    source_story_payload_sha256: sha256Schema,
    method_version: z.literal("patient-story-interview-method-0.2.0"),
    collection_actor: z.enum([
      "HUMAN_RESPONDENT_INTERVIEW",
      "HUMAN_REVIEWER",
      "AUTOMATED_EXTRACTION",
      "STRUCTURED_IMPORT",
    ]),
    human_interface: z.object({
      interface_id: requiredText(200),
      interface_version: requiredText(100),
      ordinary_controls_confirmed: z.literal(true),
      raw_serialization_required: z.literal(false),
      blinding_preserved: z.boolean().nullable(),
    }).strict().nullable(),
    evidence_items: z.array(patientInterviewEvidenceItemV020Schema).min(1).max(1_000),
    follow_up_decisions: z.array(interviewFollowUpDecisionV020Schema).max(200),
    prior_data_reinterpreted: z.literal(false),
    created_at: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
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
  });

export type PatientInterviewEvidenceItemV020 = z.infer<typeof patientInterviewEvidenceItemV020Schema>;
export type PatientStoryEvidenceExtensionV020 = z.infer<typeof patientStoryEvidenceExtensionV020Schema>;
