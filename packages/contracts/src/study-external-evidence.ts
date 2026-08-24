import { z } from "zod";

const MAX_PROVIDER_ITEMS = 32;
const MAX_EXTERNAL_ITEMS = 2_000;
const MAX_LIMITATIONS = 200;
const MAX_TEXT = 4_000;
const MAX_EXCERPT = 1_000;

export const externalEvidenceSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
export const externalEvidenceTimestampSchema = z.string().datetime({ offset: true });
export const canonicalDoiSchema = z
  .string()
  .max(2_048)
  .regex(/^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/u)
  .refine((value) => value === value.toLowerCase(), "DOI must be canonical lowercase");

const boundedTextSchema = z.string().trim().min(1).max(MAX_TEXT);
const boundedNullableTextSchema = boundedTextSchema.nullable();
const boundedUrlSchema = z.url().max(MAX_TEXT);
const limitationSchema = z.string().trim().min(1).max(MAX_TEXT);
const limitationsSchema = z.array(limitationSchema).max(MAX_LIMITATIONS);

export const providerClassificationProvenanceSchema = z
  .object({
    basis: z.enum(["provider_reported", "adapter_derived", "unavailable"]),
    raw_label: boundedNullableTextSchema,
    reported_by: z.enum([
      "provider",
      "moderator",
      "commenter",
      "curator",
      "automated",
      "unavailable",
    ]),
  })
  .strict();

export const externalEvidenceProviderSchema = z.enum([
  "crossref",
  "forrt",
  "retraction_watch",
  "pubpeer",
  "epistemonikos",
  "scite",
  "review_risk_of_bias",
]);

export const canonicalStudyIdentitySchema = z
  .object({
    doi: canonicalDoiSchema.optional(),
    pmid: z.string().regex(/^\d{1,12}$/u).optional(),
    pmcid: z.string().regex(/^PMC\d{1,12}$/u).optional(),
    arxiv_id: z.string().trim().min(1).max(100).optional(),
    title: boundedTextSchema.optional(),
    first_author: z.string().trim().min(1).max(300).optional(),
    year: z.number().int().min(1600).max(3000).optional(),
    identity_status: z.enum(["verified", "provider_reported", "ambiguous", "unresolved"]),
    identity_basis: z
      .array(
        z.enum([
          "crossref_exact_doi",
          "provider_reported_doi",
          "pubmed_identifier",
          "pmc_identifier",
          "arxiv_identifier",
          "title_author_year",
          "bibliographic_metadata",
          "unresolved",
        ]),
      )
      .min(1)
      .max(8),
    identity_hash: externalEvidenceSha256Schema,
  })
  .strict()
  .refine(
    (value) =>
      value.doi !== undefined ||
      value.pmid !== undefined ||
      value.pmcid !== undefined ||
      value.arxiv_id !== undefined ||
      value.title !== undefined,
    "Study identity must contain an identifier or title",
  );

const providerAccessStatusSchema = z.enum([
  "complete",
  "api_visible_complete",
  "partial",
  "abstract_only",
  "metadata_only",
  "comments_disabled",
  "inaccessible",
  "rate_limited",
  "not_found",
  "error",
]);

export const externalProviderAttemptSchema = z
  .object({
    provider: externalEvidenceProviderSchema,
    checked_at: externalEvidenceTimestampSchema,
    access_status: providerAccessStatusSchema,
    provider_outcome: z.enum([
      "records_available",
      "no_match_in_provider",
      "partial",
      "rate_limited",
      "inaccessible",
      "not_found",
      "error",
      "not_configured",
    ]),
    query_identifier: boundedTextSchema,
    provider_response_hash: externalEvidenceSha256Schema.optional(),
    snapshot_id: boundedTextSchema.optional(),
    coverage_statement: boundedTextSchema,
    limitations: limitationsSchema,
    error: z
      .object({
        code: z.string().trim().min(1).max(200),
        message: z.string().trim().min(1).max(500),
        retryable: z.boolean(),
        http_status: z.number().int().min(100).max(599).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const publicationIntegrityEventKindSchema = z.enum([
  "retraction",
  "withdrawal",
  "expression_of_concern",
  "correction",
  "update",
  "reinstatement",
  "other",
]);

export const publicationIntegrityAssertionSchema = z
  .object({
    provider: externalEvidenceProviderSchema,
    assertion_source: z.enum(["publisher", "retraction_watch", "other", "unknown"]),
    raw_source: boundedNullableTextSchema,
    relation_direction: z.enum(["inbound", "outbound"]),
    provider_record_id: boundedNullableTextSchema,
    raw_relation_type: boundedTextSchema,
    raw_type: boundedTextSchema,
    raw_label: boundedNullableTextSchema,
    asserted_at: externalEvidenceTimestampSchema.nullable(),
    assertion_hash: externalEvidenceSha256Schema,
  })
  .strict();

export const publicationIntegrityEventSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    event_kind: publicationIntegrityEventKindSchema,
    event_date: z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u).nullable(),
    original_doi: canonicalDoiSchema,
    notice_doi: canonicalDoiSchema.nullable(),
    reasons: z.array(boundedTextSchema).max(50),
    assertions: z.array(publicationIntegrityAssertionSchema).min(1).max(50),
    event_hash: externalEvidenceSha256Schema,
  })
  .strict();

export const publicationRecordStateSchema = z.enum([
  "active_retraction_or_withdrawal",
  "expression_of_concern_recorded",
  "correction_recorded",
  "update_recorded",
  "reinstatement_recorded",
  "other_update_recorded",
  "no_update_marker_found",
  "state_uncertain",
]);

export const providerReportedReplicationOutcomeSchema = z.enum([
  "successful",
  "failed",
  "mixed",
  "unclear",
  "not_reported",
]);

export const externalStudyRelationshipSchema = z
  .object({
    relationship_kind: z.enum(["replication", "reproduction"]),
    relation_direction: z.enum(["original_to_repetition", "repetition_to_original"]),
    original_identity: canonicalStudyIdentitySchema,
    repetition_identity: canonicalStudyIdentitySchema,
    provider: externalEvidenceProviderSchema,
    provider_record_id: boundedNullableTextSchema,
    provider_reported_outcome: providerReportedReplicationOutcomeSchema,
    raw_provider_outcome: boundedNullableTextSchema,
    implementation_match_audit_status: z.enum([
      "not_started",
      "in_progress",
      "complete",
      "not_applicable",
      "blocked",
    ]),
    linked_source_audit_status: z.enum([
      "not_started",
      "in_progress",
      "complete",
      "bounded",
      "blocked",
    ]),
    limitations: limitationsSchema,
    relationship_hash: externalEvidenceSha256Schema,
  })
  .strict();

export const postPublicationMessageSchema = z
  .object({
    message_id: boundedTextSchema,
    role: z.enum(["comment", "identified_author_reply"]),
    posted_at: externalEvidenceTimestampSchema.nullable(),
    updated_at: externalEvidenceTimestampSchema.nullable(),
    provider_revision_id: boundedNullableTextSchema,
    revision_state: z.enum([
      "current_visible",
      "edited_visible",
      "deleted_or_unavailable",
      "unknown",
    ]),
    classification_provenance: providerClassificationProvenanceSchema,
    content_hash: externalEvidenceSha256Schema,
    bounded_excerpt: z.string().max(MAX_EXCERPT).nullable(),
    audit_status: z.enum(["not_started", "in_progress", "complete", "bounded", "blocked"]),
    materiality: z.enum(["detail_only", "confidence_changing", "ranking_changing", "potentially_conclusion_changing", "unknown"]),
    links: z.array(boundedUrlSchema).max(50),
    limitations: limitationsSchema,
  })
  .strict();

export const postPublicationThreadSchema = z
  .object({
    provider: externalEvidenceProviderSchema,
    thread_id: boundedTextSchema,
    provider_record_id: boundedNullableTextSchema,
    canonical_url: boundedUrlSchema,
    provider_reported_message_count: z.number().int().nonnegative().nullable(),
    visible_message_count: z.number().int().nonnegative().max(MAX_EXTERNAL_ITEMS),
    deleted_or_unavailable_message_count: z.number().int().nonnegative().max(MAX_EXTERNAL_ITEMS),
    pagination_complete: z.boolean(),
    messages: z.array(postPublicationMessageSchema).max(MAX_EXTERNAL_ITEMS),
    thread_hash: externalEvidenceSha256Schema,
    limitations: limitationsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const visible = value.messages.filter(({ revision_state }) =>
      revision_state !== "deleted_or_unavailable"
    ).length;
    const unavailable = value.messages.length - visible;
    if (
      visible !== value.visible_message_count ||
      unavailable !== value.deleted_or_unavailable_message_count
    ) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "post-publication message-state counts do not reconcile",
      });
    }
  });

export const citationContextAggregateSchema = z
  .object({
    provider: externalEvidenceProviderSchema,
    provider_model_statement: boundedTextSchema,
    supporting_count: z.number().int().nonnegative(),
    contrasting_count: z.number().int().nonnegative(),
    mentioning_count: z.number().int().nonnegative(),
    audit_status: z.enum(["not_started", "in_progress", "complete", "bounded", "blocked"]),
    aggregate_hash: externalEvidenceSha256Schema,
    limitations: limitationsSchema,
  })
  .strict();

export const reviewAncestryLinkSchema = z
  .object({
    provider: externalEvidenceProviderSchema,
    provider_record_id: boundedNullableTextSchema,
    review_identity: canonicalStudyIdentitySchema,
    linked_study_identity: canonicalStudyIdentitySchema,
    relationship: z.enum(["review_includes_study", "review_excludes_study", "review_cites_study", "study_updates_review"]),
    raw_provider_relationship: boundedNullableTextSchema,
    relation_state: z.enum(["current", "removed", "unknown"]),
    classification_provenance: providerClassificationProvenanceSchema,
    audit_status: z.enum(["not_started", "in_progress", "complete", "bounded", "blocked"]),
    link_hash: externalEvidenceSha256Schema,
    limitations: limitationsSchema,
  })
  .strict();

export const importedRiskOfBiasJudgmentSchema = z
  .object({
    review_identity: canonicalStudyIdentitySchema,
    study_identity: canonicalStudyIdentitySchema,
    comparison: boundedTextSchema,
    outcome: boundedTextSchema,
    numerical_result: boundedTextSchema,
    follow_up: boundedTextSchema,
    domain: boundedTextSchema,
    judgment: boundedTextSchema,
    support: boundedTextSchema,
    source_location: boundedTextSchema,
    judgment_hash: externalEvidenceSha256Schema,
    limitations: limitationsSchema,
  })
  .strict();

export const externalEvidenceDirectiveSchema = z
  .object({
    directive: z.enum([
      "exclude_source_from_effect_claims",
      "require_update_notice_audit",
      "invalidate_prior_source_audit",
      "require_linked_replication_acquisition",
      "require_postpublication_message_audit",
      "require_review_acquisition",
      "disclose_provider_coverage_gap",
      "no_additional_work",
    ]),
    source_item_hash: externalEvidenceSha256Schema,
    reason: boundedTextSchema,
  })
  .strict();

export const unresolvedExternalEvidenceItemSchema = z
  .object({
    item_id: boundedTextSchema,
    source_item_hash: externalEvidenceSha256Schema.optional(),
    possible_decision_impact: z.enum([
      "detail_only",
      "confidence_changing",
      "ranking_changing",
      "potentially_conclusion_changing",
      "unknown",
    ]),
    reason: boundedTextSchema,
    retryable: z.boolean(),
  })
  .strict();

export const claimLocalExternalEvidenceLimitationSchema = z
  .object({
    claim_id: boundedTextSchema,
    limitation: limitationSchema,
    source_item_hashes: z.array(externalEvidenceSha256Schema).max(100),
  })
  .strict();

export const studyExternalEvidenceBundleSchema = z
  .object({
    packet_name: z.literal("study_external_evidence_bundle"),
    packet_version: z.literal("1.0"),
    study_identity: canonicalStudyIdentitySchema,
    provider_attempts: z.array(externalProviderAttemptSchema).max(MAX_PROVIDER_ITEMS),
    publication_integrity: z
      .object({
        record_state: publicationRecordStateSchema,
        events: z.array(publicationIntegrityEventSchema).max(MAX_EXTERNAL_ITEMS),
        limitations: limitationsSchema,
      })
      .strict(),
    replication_relationships: z.array(externalStudyRelationshipSchema).max(MAX_EXTERNAL_ITEMS),
    postpublication_threads: z.array(postPublicationThreadSchema).max(MAX_PROVIDER_ITEMS),
    citation_contexts: z.array(citationContextAggregateSchema).max(MAX_PROVIDER_ITEMS),
    review_ancestry: z.array(reviewAncestryLinkSchema).max(MAX_EXTERNAL_ITEMS),
    imported_risk_of_bias: z.array(importedRiskOfBiasJudgmentSchema).max(MAX_EXTERNAL_ITEMS),
    controller_directives: z.array(externalEvidenceDirectiveSchema).max(MAX_EXTERNAL_ITEMS),
    unresolved_items: z.array(unresolvedExternalEvidenceItemSchema).max(MAX_EXTERNAL_ITEMS),
    claim_local_limitations: z.array(claimLocalExternalEvidenceLimitationSchema).max(MAX_EXTERNAL_ITEMS),
    bundle_hash: externalEvidenceSha256Schema,
  })
  .strict();

export type ExternalEvidenceProvider = z.infer<typeof externalEvidenceProviderSchema>;
export type CanonicalStudyIdentity = z.infer<typeof canonicalStudyIdentitySchema>;
export type ExternalProviderAttempt = z.infer<typeof externalProviderAttemptSchema>;
export type PublicationIntegrityAssertion = z.infer<typeof publicationIntegrityAssertionSchema>;
export type PublicationIntegrityEvent = z.infer<typeof publicationIntegrityEventSchema>;
export type PublicationRecordState = z.infer<typeof publicationRecordStateSchema>;
export type ProviderClassificationProvenance = z.infer<typeof providerClassificationProvenanceSchema>;
export type ProviderReportedReplicationOutcome = z.infer<typeof providerReportedReplicationOutcomeSchema>;
export type ExternalStudyRelationship = z.infer<typeof externalStudyRelationshipSchema>;
export type PostPublicationMessage = z.infer<typeof postPublicationMessageSchema>;
export type PostPublicationThread = z.infer<typeof postPublicationThreadSchema>;
export type CitationContextAggregate = z.infer<typeof citationContextAggregateSchema>;
export type ReviewAncestryLink = z.infer<typeof reviewAncestryLinkSchema>;
export type ImportedRiskOfBiasJudgment = z.infer<typeof importedRiskOfBiasJudgmentSchema>;
export type ExternalEvidenceDirective = z.infer<typeof externalEvidenceDirectiveSchema>;
export type UnresolvedExternalEvidenceItem = z.infer<typeof unresolvedExternalEvidenceItemSchema>;
export type ClaimLocalExternalEvidenceLimitation = z.infer<typeof claimLocalExternalEvidenceLimitationSchema>;
export type StudyExternalEvidenceBundle = z.infer<typeof studyExternalEvidenceBundleSchema>;
