import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_SHORT_TEXT = 200;
const MAX_MEDIUM_TEXT = 2_000;
const MAX_LONG_TEXT = 8_000;
const MAX_NARRATIVE = 50_000;
const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const shortTextSchema = z.string().trim().min(1).max(MAX_SHORT_TEXT);
const mediumTextSchema = z.string().trim().min(1).max(MAX_MEDIUM_TEXT);

export const storyIntakeChannelSchema = z.enum([
  "EXTERNAL_SECURE_PORTAL",
  "DEIDENTIFIED_APP_INTAKE",
  "RESEARCHER_MODERATED_INTERVIEW",
  "PUBLIC_SOURCE_EXTRACTION",
  "BULK_REGISTRY_IMPORT",
]);

export const storyRecordStateSchema = z.enum([
  "PARTIAL",
  "SUBMITTED",
  "FOLLOW_UP_REQUESTED",
  "REVIEWED",
  "DUPLICATE_OR_LINKED",
  "RESEARCH_LEAD",
  "WITHDRAWAL_REQUESTED",
  "WITHDRAWN",
  "SUPERSEDED",
]);

export const approximateDateSchema = z
  .object({
    value: z.string().max(30).nullable().optional(),
    precision: z.enum(["EXACT_DAY", "MONTH", "YEAR", "RELATIVE_ONLY", "UNKNOWN"]),
    relative_description: z.string().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.precision === "RELATIVE_ONLY" && !value.relative_description) {
      context.addIssue({
        code: "custom",
        path: ["relative_description"],
        message: "Relative dates require a relative description",
      });
    }
    if (value.precision === "UNKNOWN" && value.value !== null && value.value !== undefined) {
      context.addIssue({ code: "custom", path: ["value"], message: "Unknown dates cannot contain a date value" });
    }
  });

export const storyConditionEpisodeSchema = z
  .object({
    condition_episode_id: z.string().regex(/^ARC-[A-Z0-9_-]{4,64}$/u),
    condition_id: z.string().max(200).nullable().optional(),
    condition_name: z.string().trim().min(1).max(500),
    diagnostic_certainty: z.enum([
      "CLINICIAN_CONFIRMED",
      "LAB_OR_CRITERIA_SUPPORTED",
      "SELF_IDENTIFIED",
      "SUSPECTED",
      "UNKNOWN",
    ]),
    diagnosis_source_summary: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    onset: approximateDateSchema.optional(),
    baseline_severity: z.number().min(0).max(10).nullable().optional(),
    baseline_function_summary: z.string().max(4_000).nullable().optional(),
    natural_history_summary: z.string().max(4_000).nullable().optional(),
    major_comorbidities_summary: z.string().max(3_000).nullable().optional(),
  })
  .strict();

export const storyTimelineEventSchema = z
  .object({
    event_id: shortTextSchema,
    event_type: z.enum([
      "CONDITION_ONSET",
      "DIAGNOSIS",
      "INTERVENTION_START",
      "DOSE_CHANGE",
      "INTERVENTION_STOP",
      "INTERVENTION_RESTART",
      "OUTCOME_CHANGE",
      "ADVERSE_EVENT",
      "LIFE_CHANGE",
      "OTHER",
    ]),
    when: approximateDateSchema,
    description: mediumTextSchema,
    linked_episode_ids: z.array(z.string().max(100)).max(20).default([]),
  })
  .strict();

export const storyInterventionEpisodeSchema = z
  .object({
    intervention_episode_id: z.string().regex(/^ARI-[A-Z0-9_-]{4,64}$/u),
    parent_combination_id: z.string().regex(/^ARCOMBO-[A-Z0-9_-]{4,64}$/u).nullable().optional(),
    name: z.string().trim().min(1).max(500),
    normalized_intervention_id: z.string().max(200).nullable().optional(),
    episode_role: z.enum(["PRIMARY_REPORTED", "COMBINATION_COMPONENT", "BACKGROUND", "RESCUE", "UNKNOWN"]),
    formulation: z.string().max(500).nullable().optional(),
    route: z.string().max(200).nullable().optional(),
    dose_known: z.boolean(),
    dose_value: z.number().finite().nullable().optional(),
    dose_unit: z.string().max(100).nullable().optional(),
    frequency: z.string().max(500).nullable().optional(),
    start: approximateDateSchema,
    end: approximateDateSchema.nullable().optional(),
    dose_or_schedule_changes: z.array(storyTimelineEventSchema).max(100).default([]),
    adherence_known: z.boolean(),
    adherence_summary: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    stopped_and_restarted: z.boolean().nullable().optional(),
    dechallenge_summary: z.string().max(3_000).nullable().optional(),
    rechallenge_summary: z.string().max(3_000).nullable().optional(),
    prescribed_or_supervised: z.enum(["CLINICIAN", "RESEARCH_PROTOCOL", "SELF_DIRECTED", "OTHER", "UNKNOWN"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.episode_role === "COMBINATION_COMPONENT" && !value.parent_combination_id) {
      context.addIssue({
        code: "custom",
        path: ["parent_combination_id"],
        message: "Combination components require a parent combination ID",
      });
    }
    if (value.dose_known && (value.dose_value === null || value.dose_value === undefined || !value.dose_unit)) {
      context.addIssue({ code: "custom", path: ["dose_value"], message: "Known dose requires value and unit" });
    }
    if (!value.dose_known && (value.dose_value !== null && value.dose_value !== undefined)) {
      context.addIssue({ code: "custom", path: ["dose_value"], message: "Unknown dose cannot contain a dose value" });
    }
  });

export const storyOutcomeSchema = z
  .object({
    outcome_id: z.string().regex(/^ARO-[A-Z0-9_-]{4,64}$/u),
    name: z.string().trim().min(1).max(500),
    normalized_outcome_id: z.string().max(200).nullable().optional(),
    reported_direction: z.enum(["IMPROVED", "WORSENED", "NO_CLEAR_CHANGE", "MIXED", "UNKNOWN"]),
    measurement_type: z.enum([
      "SUBJECTIVE_GLOBAL",
      "VALIDATED_PATIENT_REPORTED",
      "DEVICE",
      "LAB",
      "CLINICIAN_ASSESSED",
      "HEALTHCARE_USE",
      "OTHER",
      "UNKNOWN",
    ]),
    baseline_value: z.union([z.number().finite(), z.string().max(1_000)]).nullable().optional(),
    follow_up_value: z.union([z.number().finite(), z.string().max(1_000)]).nullable().optional(),
    unit_or_scale: z.string().max(200).nullable().optional(),
    onset_after_intervention: z.string().max(500).nullable().optional(),
    peak_change_timing: z.string().max(500).nullable().optional(),
    duration_or_persistence: z.string().max(1_000).nullable().optional(),
    current_status: z.enum([
      "PERSISTED",
      "PARTIALLY_PERSISTED",
      "LOST_EFFECT",
      "REVERSED",
      "ONGOING_UNKNOWN",
      "NOT_APPLICABLE",
      "UNKNOWN",
    ]),
    clinically_meaningful_to_reporter: z.boolean().nullable().optional(),
    notes: z.string().max(3_000).nullable().optional(),
  })
  .strict();

export const storyAdverseEventSchema = z
  .object({
    event_id: z.string().regex(/^ARAE-[A-Z0-9_-]{4,64}$/u),
    description: mediumTextSchema,
    severity: z.enum(["MILD", "MODERATE", "SEVERE", "LIFE_THREATENING", "UNKNOWN"]),
    serious: z.boolean().nullable().optional(),
    onset: approximateDateSchema.nullable().optional(),
    resolution: z.string().max(1_000).nullable().optional(),
    relationship_reported: z.enum([
      "DEFINITE_BY_REPORTER",
      "PROBABLE_BY_REPORTER",
      "POSSIBLE_BY_REPORTER",
      "UNLIKELY_BY_REPORTER",
      "UNKNOWN",
    ]),
    clinician_assessed: z.boolean().nullable().optional(),
    reported_to_regulator: z.boolean().nullable().optional(),
  })
  .strict();

export const storyMeasurementSchema = z
  .object({
    measurement_id: z.string().regex(/^ARM-[A-Z0-9_-]{4,64}$/u),
    name: z.string().trim().min(1).max(500),
    value: z.union([z.number().finite(), z.string().max(1_000)]).nullable().optional(),
    unit_or_scale: z.string().max(200).nullable().optional(),
    measured_at: approximateDateSchema,
    source_type: z.enum(["SELF_REPORT", "VALIDATED_INSTRUMENT", "LAB", "DEVICE", "CLINICIAN", "DOCUMENT", "OTHER"]),
    source_document_id: z.string().max(200).nullable().optional(),
  })
  .strict();

export const storyConsentDecisionSchema = z
  .object({
    decision: z.enum(["YES", "NO", "WITHDRAWN", "NOT_ASKED"]),
    notice_version: shortTextSchema,
    consent_text_sha256: sha256Schema,
    decided_at: timestampSchema,
    channel: z.enum(["SECURE_PORTAL", "APP_DEIDENTIFIED", "INTERVIEW", "WRITTEN_EXTERNAL"]),
    withdrawn_at: timestampSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "WITHDRAWN" && !value.withdrawn_at) {
      context.addIssue({ code: "custom", path: ["withdrawn_at"], message: "Withdrawn consent requires a withdrawal timestamp" });
    }
  });

export const storyConsentLedgerSchema = z
  .object({
    private_service_storage: storyConsentDecisionSchema,
    deidentified_aggregate_research: storyConsentDecisionSchema,
    human_reviewer_access: storyConsentDecisionSchema,
    recontact: storyConsentDecisionSchema,
    public_redacted_story: storyConsentDecisionSchema,
    direct_quotation: storyConsentDecisionSchema,
    document_or_media_publication: storyConsentDecisionSchema,
    external_record_linkage: storyConsentDecisionSchema,
    future_related_research: storyConsentDecisionSchema,
    generalized_product_improvement: storyConsentDecisionSchema,
    model_training: storyConsentDecisionSchema,
  })
  .strict();

export const publicStorySchema = z
  .object({
    publication_state: z.enum([
      "PRIVATE_DRAFT",
      "PRIVACY_REVIEW",
      "REDACTED_PREVIEW",
      "SUBJECT_APPROVED",
      "EDITORIAL_REVIEW",
      "PUBLISHED",
      "REVISION_REQUESTED",
      "WITHDRAWAL_REQUESTED",
      "PUBLIC_WITHDRAWN",
      "LEGAL_OR_SAFETY_HOLD",
    ]),
    attribution_mode: z.enum(["ANONYMOUS", "PSEUDONYM", "REAL_NAME"]),
    display_name: z.string().max(200).nullable().optional(),
    redacted_version_id: shortTextSchema,
    redacted_payload_sha256: sha256Schema.nullable().optional(),
    exact_version_approved: z.boolean(),
    approved_at: timestampSchema.nullable().optional(),
    published_at: timestampSchema.nullable().optional(),
    withdrawal_policy_version: z.string().max(100).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.attribution_mode !== "ANONYMOUS" && !value.display_name) {
      context.addIssue({ code: "custom", path: ["display_name"], message: "Named or pseudonymous publication requires a display name" });
    }
    if (value.publication_state === "PUBLISHED") {
      if (!value.exact_version_approved || !value.redacted_payload_sha256 || !value.approved_at || !value.published_at) {
        context.addIssue({
          code: "custom",
          path: [],
          message: "Published stories require exact-version approval, redacted hash, approval time, and publication time",
        });
      }
    }
  });

const completenessFieldSchema = z.enum(["PRESENT", "PARTIAL", "MISSING", "NOT_APPLICABLE"]);

export const storyCompletenessSchema = z
  .object({
    overall_tier: z.enum(["MINIMAL", "MODERATE", "HIGH_DETAIL", "PROSPECTIVE", "UNKNOWN"]),
    fields: z
      .object({
        diagnosis_detail: completenessFieldSchema,
        baseline: completenessFieldSchema,
        intervention_specificity: completenessFieldSchema,
        timeline_resolution: completenessFieldSchema,
        cointervention_coverage: completenessFieldSchema,
        outcome_measurement: completenessFieldSchema,
        follow_up_duration: completenessFieldSchema,
        adverse_event_coverage: completenessFieldSchema,
        dechallenge_rechallenge: completenessFieldSchema,
        objective_corroboration: completenessFieldSchema,
        prospective_collection: completenessFieldSchema,
      })
      .strict(),
    highest_value_missing_questions: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
  })
  .strict();

const storySourceDocumentSchema = z
  .object({
    source_document_id: z.string().regex(/^ARDOC-[A-Z0-9_-]{4,64}$/u),
    document_type: z.enum(["LAB", "CLINIC_NOTE", "PRESCRIPTION", "DEVICE_EXPORT", "PHOTO", "VIDEO", "OTHER"]),
    storage_state: z.enum(["NOT_UPLOADED", "PRIVATE_ENCRYPTED", "REDACTED_RESEARCH_COPY", "DELETED", "UNAVAILABLE"]),
    separate_consent_record_id: shortTextSchema,
    content_sha256: sha256Schema.nullable().optional(),
    public_use_allowed: z.boolean().default(false),
  })
  .strict();

const storyNarrativeSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_NARRATIVE),
    contains_identifiers_reviewed: z.boolean(),
    separate_consent_record_id: shortTextSchema,
    public_quote_allowed: z.boolean().default(false),
  })
  .strict();

const subjectSummarySchema = z
  .object({
    age_range: z.enum(["UNDER_18", "18_29", "30_44", "45_59", "60_74", "75_PLUS", "UNKNOWN"]).nullable().optional(),
    sex_at_birth: z.enum(["FEMALE", "MALE", "INTERSEX", "UNKNOWN", "PREFER_NOT_TO_SAY"]).nullable().optional(),
    gender_identity: z.string().max(100).nullable().optional(),
    country_or_broad_region: z.string().max(100).nullable().optional(),
    public_demographic_detail_allowed: z.boolean().default(false),
  })
  .strict();

const minimalReportSchema = z
  .object({
    what_happened: z.string().max(4_000).nullable().optional(),
    reported_direction: z.enum(["HELPED", "HARMED", "NO_CLEAR_CHANGE", "MIXED", "UNCLEAR"]).nullable().optional(),
    approximate_timing: z.string().max(1_000).nullable().optional(),
    incomplete_submission_acknowledged: z.boolean().default(true),
  })
  .strict();

const reporterAttributionSchema = z
  .object({
    what_reporter_believes_helped_or_harmed: z.string().max(4_000).nullable().optional(),
    confidence: z.number().int().min(0).max(100).nullable().optional(),
    reasoning: z.string().max(6_000).nullable().optional(),
  })
  .strict();

const clinicianInvolvementSchema = z
  .object({
    involved: z.boolean().nullable().optional(),
    role_summary: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    clinician_observed_change: z.boolean().nullable().optional(),
    clinician_assessment_summary: z.string().max(3_000).nullable().optional(),
  })
  .strict();

const cointerventionSchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    timing_known: z.boolean(),
    timing_summary: z.string().max(1_000).nullable().optional(),
    possible_effect_on_outcome: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
  })
  .strict();

export const patientStorySchema = z
  .object({
    schema_version: z.literal("0.1.0"),
    story_id: z.string().regex(/^ARS-[A-Z0-9_-]{8,64}$/u),
    story_version: z.number().int().min(1).default(1),
    intake_channel: storyIntakeChannelSchema,
    record_state: storyRecordStateSchema,
    reporter_role: z.enum(["SELF", "CAREGIVER", "CLINICIAN", "RESEARCHER", "PUBLIC_SOURCE_AUTHOR", "OTHER"]),
    subject_private_ref: z.string().max(200).nullable().optional(),
    subject_summary: subjectSummarySchema.nullable().optional(),
    minimal_report: minimalReportSchema.nullable().optional(),
    condition_episodes: z.array(storyConditionEpisodeSchema).min(1).max(20),
    intervention_episodes: z.array(storyInterventionEpisodeSchema).min(1).max(100),
    outcomes: z.array(storyOutcomeSchema).min(1).max(100),
    adverse_events: z.array(storyAdverseEventSchema).max(100).default([]),
    measurements: z.array(storyMeasurementSchema).max(1_000).default([]),
    timeline_events: z.array(storyTimelineEventSchema).max(1_000).default([]),
    cointerventions_and_changes: z.array(cointerventionSchema).max(100).default([]),
    reporter_attribution: reporterAttributionSchema.nullable().optional(),
    alternative_explanations: z.array(z.string().trim().min(1).max(MAX_MEDIUM_TEXT)).max(50).default([]),
    clinician_involvement: clinicianInvolvementSchema.nullable().optional(),
    source_documents: z.array(storySourceDocumentSchema).max(100).default([]),
    narrative: storyNarrativeSchema.nullable().optional(),
    completeness: storyCompletenessSchema,
    askrigor_capability: z.enum([
      "DESCRIPTIVE_REPORT_ONLY",
      "TEMPORAL_ASSOCIATION_ONLY",
      "COMBINATION_ASSOCIATION_ONLY",
      "DECHALLENGE_SIGNAL",
      "RECHALLENGE_SIGNAL",
      "PROSPECTIVE_N_OF_1_SIGNAL",
      "FORMAL_EVIDENCE_LINKED",
      "UNRESOLVED",
    ]),
    duplicate_or_linked_story_ids: z.array(z.string().regex(/^ARS-[A-Z0-9_-]{8,64}$/u)).max(100).default([]),
    consents: storyConsentLedgerSchema,
    public_story: publicStorySchema.nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema.nullable().optional(),
    record_payload_sha256: sha256Schema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.intake_channel === "DEIDENTIFIED_APP_INTAKE") {
      if (value.subject_private_ref !== null && value.subject_private_ref !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["subject_private_ref"],
          message: "De-identified app intake cannot contain a private subject reference",
        });
      }
      if (value.source_documents.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["source_documents"],
          message: "De-identified app intake cannot contain source documents",
        });
      }
      if (value.narrative !== null && value.narrative !== undefined && !value.narrative.contains_identifiers_reviewed) {
        context.addIssue({
          code: "custom",
          path: ["narrative", "contains_identifiers_reviewed"],
          message: "App narratives must be reviewed for identifiers",
        });
      }
    }

    const combinationGroups = new Map<string, number>();
    for (const episode of value.intervention_episodes) {
      if (episode.parent_combination_id) {
        combinationGroups.set(
          episode.parent_combination_id,
          (combinationGroups.get(episode.parent_combination_id) ?? 0) + 1,
        );
      }
    }
    for (const [combinationId, count] of combinationGroups.entries()) {
      if (count < 2) {
        context.addIssue({
          code: "custom",
          path: ["intervention_episodes"],
          message: `Combination ${combinationId} must contain at least two linked components`,
        });
      }
    }
    if (combinationGroups.size > 0 && value.askrigor_capability === "FORMAL_EVIDENCE_LINKED") {
      context.addIssue({
        code: "custom",
        path: ["askrigor_capability"],
        message: "A combination story cannot itself claim formal evidence linkage as its causal capability",
      });
    }

    if (value.public_story?.publication_state === "PUBLISHED") {
      if (value.consents.public_redacted_story.decision !== "YES") {
        context.addIssue({
          code: "custom",
          path: ["consents", "public_redacted_story"],
          message: "Public story publication requires specific public-story consent",
        });
      }
      if (
        value.public_story.attribution_mode !== "ANONYMOUS" &&
        value.consents.direct_quotation.decision !== "YES" &&
        value.public_story.display_name
      ) {
        context.addIssue({
          code: "custom",
          path: ["consents", "direct_quotation"],
          message: "Named public presentation requires the relevant public attribution/quotation consent",
        });
      }
    }
  });

export type PatientStory = z.infer<typeof patientStorySchema>;
export type StoryConsentLedger = z.infer<typeof storyConsentLedgerSchema>;

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical story JSON does not permit non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        result[key] = canonicalize(child);
      }
    }
    return result;
  }
  throw new TypeError(`Canonical story JSON does not permit values of type ${typeof value}`);
}

export function patientStorySha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

export function sealPatientStory(input: PatientStory): PatientStory {
  const parsed = patientStorySchema.parse(input);
  const withoutHash = { ...parsed, record_payload_sha256: null };
  return patientStorySchema.parse({
    ...withoutHash,
    record_payload_sha256: patientStorySha256(withoutHash),
  });
}

export function storyIsEligibleForAggregateResearch(storyInput: PatientStory): boolean {
  const story = patientStorySchema.parse(storyInput);
  return (
    story.record_state !== "WITHDRAWN" &&
    story.consents.deidentified_aggregate_research.decision === "YES"
  );
}

export function storyIsEligibleForPublicRelease(storyInput: PatientStory): boolean {
  const story = patientStorySchema.parse(storyInput);
  return (
    story.public_story?.publication_state === "PUBLISHED" &&
    story.public_story.exact_version_approved &&
    story.consents.public_redacted_story.decision === "YES"
  );
}
