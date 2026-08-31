import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const boundedTextSchema = z.string().trim().min(1).max(4_000);
const boundedIdentifierSchema = z.string().trim().min(1).max(300);

export const sourceFamilyMemberStateSchema = z.enum([
  "current",
  "redirect",
  "inactive",
  "blocked",
  "historical_unverified",
  "unknown",
]);

const currentCorpusSchema = z
  .object({
    family_member_id: boundedIdentifierSchema,
    url: z.url().max(2_048),
    observed_state: z.literal("current"),
    directly_verified: z.literal(true),
    observed_title: boundedTextSchema,
    observed_features: z.array(boundedIdentifierSchema).min(1).max(200),
    dynamic_enumeration_required: z.literal(true),
    reported_treatment_count: z.number().int().nonnegative(),
    reported_study_count_observed: z.number().int().nonnegative(),
    counts_are_time_sensitive: z.literal(true),
    scientific_status: z.literal("third_party_candidate_source_only"),
  })
  .strict();

const observedAliasSchema = z
  .object({
    family_member_id: boundedIdentifierSchema,
    url: z.url().max(2_048),
    observed_state: z.literal("redirect"),
    redirect_target: z.url().max(2_048),
    topic: boundedIdentifierSchema.optional(),
    directly_verified: z.literal(true),
  })
  .strict();

const historicalLeadSchema = z
  .object({
    domain: z.string().trim().min(3).max(253).regex(/^[a-z0-9.-]+$/u),
    topic: boundedIdentifierSchema,
  })
  .strict();

const importRulesSchema = z
  .object({
    default_record_class: z.literal("THIRD_PARTY_CANDIDATE"),
    never_treat_site_claim_as_askrigor_finding: z.literal(true),
    resolve_source_identities_independently: z.literal(true),
    revalidate_current_source_access: z.literal(true),
    audit_methods_and_integrity: z.literal(true),
    preserve_inclusion_exclusion_and_extraction_choices: z.literal(true),
    compare_rival_syntheses: z.literal(true),
    require_source_specific_license_manifest: z.literal(true),
    block_third_party_figure_or_fulltext_republication_by_default: z.literal(true),
    public_release_requires_askrigor_release_receipt: z.literal(true),
  })
  .strict();

const enumerationAcceptanceSchema = z
  .object({
    selector_exhausted: z.boolean(),
    all_meta_links_observed: z.boolean(),
    all_study_links_observed: z.boolean(),
    legacy_aliases_verified: z.boolean(),
    license_review_complete: z.boolean(),
    scientific_audits_complete: z.boolean(),
    public_import_authorized: z.boolean(),
  })
  .strict();

export const sourceFamilyManifestSchema = z
  .object({
    schema_version: z.literal("0.1.0"),
    manifest_id: boundedIdentifierSchema,
    observed_at: timestampSchema,
    status: z.literal("discovery_manifest_not_import_authority"),
    purpose: boundedTextSchema,
    canonical_current_corpus: currentCorpusSchema,
    directly_observed_aliases: z.array(observedAliasSchema).max(500),
    historical_discovery_leads: z.array(historicalLeadSchema).max(1_000),
    historical_lead_default_state: z.literal("secondary_source_reported_direct_verification_pending"),
    historical_lead_source_note: boundedTextSchema,
    dynamic_page_roles: z.array(boundedIdentifierSchema).min(1).max(100),
    required_observation_fields: z.array(boundedIdentifierSchema).min(1).max(100),
    import_rules: importRulesSchema,
    enumeration_acceptance: enumerationAcceptanceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const memberIds = [
      value.canonical_current_corpus.family_member_id,
      ...value.directly_observed_aliases.map((alias) => alias.family_member_id),
    ];
    if (new Set(memberIds).size !== memberIds.length) {
      context.addIssue({ code: "custom", path: ["directly_observed_aliases"], message: "Family member IDs must be unique" });
    }
    const domains = value.historical_discovery_leads.map((lead) => lead.domain);
    if (new Set(domains).size !== domains.length) {
      context.addIssue({ code: "custom", path: ["historical_discovery_leads"], message: "Historical lead domains must be unique" });
    }
    if (value.enumeration_acceptance.public_import_authorized) {
      context.addIssue({
        code: "custom",
        path: ["enumeration_acceptance", "public_import_authorized"],
        message: "The discovery manifest cannot itself authorize public import",
      });
    }
  });

export const sourceFamilyObservationSchema = z
  .object({
    observation_id: boundedIdentifierSchema,
    family_member_id: boundedIdentifierSchema,
    requested_url: z.url().max(2_048),
    final_url: z.url().max(2_048).nullable(),
    redirect_chain: z.array(z.url().max(2_048)).max(20),
    retrieved_at: timestampSchema,
    http_or_access_state: z.enum([
      "complete",
      "partial",
      "redirect",
      "blocked",
      "not_found",
      "rate_limited",
      "error",
    ]),
    page_role: boundedIdentifierSchema,
    topic_id: boundedIdentifierSchema.nullable(),
    content_sha256: sha256Schema.nullable(),
    parser_version: boundedIdentifierSchema,
    visible_license: z.string().max(1_000).nullable(),
    third_party_content_boundary: boundedTextSchema,
    candidate_record_ids: z.array(boundedIdentifierSchema).max(100_000),
    candidate_record_class: z.literal("THIRD_PARTY_CANDIDATE"),
    supersedes_observation_id: boundedIdentifierSchema.nullable(),
    unresolved_notes: z.array(boundedTextSchema).max(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.http_or_access_state === "complete" && value.content_sha256 === null) {
      context.addIssue({ code: "custom", path: ["content_sha256"], message: "Complete observations require a content hash" });
    }
    if (value.redirect_chain.length > 0 && value.final_url === null) {
      context.addIssue({ code: "custom", path: ["final_url"], message: "Redirect observations require a final URL when known" });
    }
  });

export type SourceFamilyManifest = z.infer<typeof sourceFamilyManifestSchema>;
export type SourceFamilyObservation = z.infer<typeof sourceFamilyObservationSchema>;
