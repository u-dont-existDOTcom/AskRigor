import { createHash } from "node:crypto";

import type { ProvenanceEnvelope } from "@askrigor/contracts";
import {
  fetchPubmedRecord,
  normalizeDoiIdentifier,
  searchEuropePmc,
  searchPubmed,
  type EuropePmcRecord,
  type PubmedConfig,
  type PubmedRecord,
  type PubmedSearchRecord
} from "@askrigor/sources";
import { z } from "zod";

import {
  assertCandidateScreeningComplete,
  candidateScreeningResultDigest,
  type ResearchCandidateDiscoveryState,
  type ResearchCandidateRecord
} from "./research-candidate-frontier.js";
import {
  availableOpenFullTextActionOutputSchema,
  noticeMethodAuditOutputSchema,
  openFullTextActionOutputSchema,
  reviewMethodAuditActionOutputSchema,
  studyMethodExternalAuditOutputSchema,
  studyMethodAuditActionOutputSchema,
  type OpenFullTextExecutor
} from "./open-full-text-route.js";
import {
  studyExternalEvidenceAuditOutputSchema,
  StudyExternalEvidenceIdentityError,
  verifyStudyExternalEvidenceReceipt,
  type StudyExternalEvidenceAuditOutput,
  type StudyExternalEvidenceCoordinator,
  type StudyExternalEvidenceProtocolTuple
} from "./study-external-evidence.js";
import { OpenFullTextHandleError } from "./open-full-text-handle-store.js";
import type { StudyMethodAuditExternalSubmission } from "./study-method-audit.js";
import {
  formalReaderEvidenceSchema,
  sourceRecordSha256
} from "./research-bounded-evidence.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);
const doi = z.string().regex(/^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/u);
const pmid = z.string().regex(/^[1-9]\d{0,15}$/u);
const pmcid = z.string().regex(/^PMC[1-9]\d{0,15}$/u);
const handle = z.string().regex(/^aft1_[A-Za-z0-9_-]{32}$/u);
const blockId = z.string().regex(/^(?:jats|pdf)_[0-9]{6}_[a-f0-9]{12}$/u);

export const FORMAL_EVIDENCE_PROVIDERS = ["pubmed", "europe_pmc"] as const;
export const FORMAL_SOURCE_KINDS = [
  "SCIENTIFIC_STUDY",
  "SYSTEMATIC_REVIEW",
  "GUIDELINE",
  "PUBLICATION_NOTICE",
  "OTHER"
] as const;

const programSchema = z.object({
  components: bounded(900),
  dose_or_intensity: bounded(240),
  frequency: bounded(240),
  duration: bounded(240),
  supervision: bounded(240),
  adherence_or_fidelity: bounded(240),
  cointerventions: bounded(240),
  stage_or_baseline: bounded(500),
  outcome: bounded(500),
  horizon: bounded(240),
  care_stage: bounded(240)
}).strict();

const formalProviderSearchSchema = z.object({
  provider: z.enum(FORMAL_EVIDENCE_PROVIDERS),
  query: bounded(5_000),
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE",
    "BLOCKED_RETRYABLE",
    "BLOCKED_TERMINAL"
  ]),
  pages_retrieved: z.number().int().nonnegative().max(10_000),
  records_returned_cumulative: z.number().int().nonnegative().max(100_000),
  next_cursor: z.string().min(1).max(4_096).optional(),
  page_receipt_hashes: z.array(digest).max(10_000),
  access_statuses: z.array(z.string().min(1).max(80)).max(10_000),
  limitations: z.array(bounded(1_000)).max(200),
  boundary: z.object({
    classification: z.enum(["RETRYABLE", "TERMINAL_NONRETRYABLE"]),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u),
    summary: bounded(1_000)
  }).strict().optional()
}).strict().superRefine((record, context) => {
  const blocked = record.status === "BLOCKED_RETRYABLE" ||
    record.status === "BLOCKED_TERMINAL";
  if (blocked !== (record.boundary !== undefined)) {
    context.addIssue({ code: "custom", message: "Formal provider boundary and status must agree" });
  }
  if (record.status === "COMPLETE" && record.next_cursor !== undefined) {
    context.addIssue({ code: "custom", message: "Completed formal provider search cannot retain a cursor" });
  }
  if (record.page_receipt_hashes.length !== record.pages_retrieved) {
    context.addIssue({ code: "custom", message: "Formal provider pages require exact receipt hashes" });
  }
});

const formalHypothesisSchema = z.object({
  hypothesis_id: digest,
  hypothesis_digest: digest,
  source_video_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).min(1).max(76),
  program_signature: digest,
  treatment_class: bounded(160),
  claim_summary: bounded(600),
  program: programSchema,
  formal_query: bounded(5_000),
  provider_searches: z.tuple([
    formalProviderSearchSchema.safeExtend({ provider: z.literal("pubmed") }).strict(),
    formalProviderSearchSchema.safeExtend({ provider: z.literal("europe_pmc") }).strict()
  ])
}).strict();

export const communityFormalHypothesisInputSchema = z.object({
  source_video_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).min(1).max(76),
  program_signature: digest,
  treatment_class: bounded(160),
  claim_summary: bounded(600),
  program: programSchema,
  formal_query: bounded(5_000)
}).strict();

export type CommunityFormalHypothesisInput = z.output<
  typeof communityFormalHypothesisInputSchema
>;

const sourceIdentitySchema = z.object({
  doi: doi.optional(),
  pmid: pmid.optional(),
  pmcid: pmcid.optional(),
  title: bounded(2_000).optional(),
  first_author: bounded(500).optional(),
  year: z.number().int().min(1600).max(3000).optional(),
  version: bounded(200).optional(),
  identity_status: z.enum(["PROVIDER_REPORTED", "CONTENT_VERIFIED", "EXTERNAL_VERIFIED", "UNRESOLVED"]),
  identity_hash: digest
}).strict().refine((identity) =>
  identity.doi !== undefined || identity.pmid !== undefined ||
  identity.pmcid !== undefined || identity.title !== undefined,
"Formal source identity needs an identifier or title");

const sourceOriginSchema = z.object({
  provider: z.enum(["pubmed", "europe_pmc", "external_evidence"]),
  provider_record_id: bounded(2_048),
  canonical_url: z.string().url().max(4_000),
  hypothesis_ids: z.array(digest).min(1).max(100),
  provider_access_status: bounded(80),
  source_record_hash: digest
}).strict();

const discoveryAttemptSchema = z.object({
  route: z.enum(["europe_pmc", "unpaywall"]),
  result: z.enum(["indexed", "not_found", "inaccessible", "error"]),
  identifier: bounded(2_048).optional()
}).strict();

const fullTextStateSchema = z.object({
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "EXHAUSTED",
    "LEAD_BOUNDARY",
    "BLOCKED_RETRYABLE",
    "NOT_APPLICABLE"
  ]),
  document_handle: handle.optional(),
  requested_doi: doi.optional(),
  discovery_attempts: z.array(discoveryAttemptSchema).max(20),
  source_primary_identifier: bounded(2_048).optional(),
  source_canonical_url: z.string().url().max(4_000).optional(),
  source_version: bounded(200).optional(),
  source_content_sha256: digest.optional(),
  source_block_count: z.number().int().positive().optional(),
  source_segment_count: z.number().int().positive().optional(),
  source_segments_retrieved_cumulative: z.number().int().nonnegative(),
  synthesis_lock: z.enum(["pass", "fail"]),
  access_boundary: bounded(2_000).optional(),
  unseen_content_used_as_evidence: z.literal(false)
}).strict().superRefine((record, context) => {
  if (record.status === "EXHAUSTED") {
    if (
      record.document_handle === undefined ||
      record.source_content_sha256 === undefined ||
      record.source_block_count === undefined ||
      record.source_segment_count === undefined ||
      record.source_segments_retrieved_cumulative !== record.source_segment_count ||
      record.synthesis_lock !== "pass"
    ) {
      context.addIssue({ code: "custom", message: "Exhausted full text needs one complete source-bound receipt chain" });
    }
  }
  if (record.status === "IN_PROGRESS" && record.synthesis_lock !== "fail") {
    context.addIssue({ code: "custom", message: "In-progress full text must keep synthesis locked" });
  }
  if (record.status === "LEAD_BOUNDARY" && record.access_boundary === undefined) {
    context.addIssue({ code: "custom", message: "Unseen full-text leads require an access boundary" });
  }
});

const methodAuditStateSchema = z.object({
  status: z.enum(["NOT_STARTED", "COMPLETE", "BOUNDARY", "INVALIDATED", "NOT_APPLICABLE"]),
  audit_kind: z.enum(["STUDY", "REVIEW", "NOTICE", "NOT_APPLICABLE"]),
  audit_sha256: digest.optional(),
  source_content_sha256: digest.optional(),
  source_primary_identifier: bounded(2_048).optional(),
  claim_capability_digest: digest.optional(),
  reader_evidence: formalReaderEvidenceSchema.optional(),
  external_receipt_payload_sha256: digest.optional(),
  external_bound_audit_sha256: digest.optional()
}).strict();

const linkedWorkSchema = z.object({
  linked_item_id: digest,
  item_kind: z.enum([
    "REPLICATION",
    "REPRODUCTION",
    "PUBLICATION_NOTICE",
    "POSTPUBLICATION_MESSAGE",
    "REVIEW"
  ]),
  source_item_hash: digest,
  linked_source_id: digest.optional(),
  linked_identity_hash: digest.optional(),
  provider_reported_outcome: bounded(100).optional(),
  possible_decision_impact: z.enum([
    "detail_only",
    "confidence_changing",
    "ranking_changing",
    "potentially_conclusion_changing",
    "unknown"
  ]),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "BOUNDED", "BLOCKED_RETRYABLE"]),
  limitation: bounded(2_000)
}).strict();

const externalProviderSchema = z.enum([
  "crossref",
  "forrt",
  "retraction_watch",
  "pubpeer",
  "epistemonikos",
  "scite"
]);

const providerCoverageStateSchema = z.object({
  provider: externalProviderSchema,
  provider_outcome: z.enum([
    "records_available",
    "no_match_in_provider",
    "partial",
    "rate_limited",
    "inaccessible",
    "not_found",
    "error",
    "not_configured"
  ]),
  access_status: bounded(80),
  attempt_sha256: digest
}).strict();

const publicationIntegritySummarySchema = z.object({
  record_state: z.enum([
    "active_retraction_or_withdrawal",
    "expression_of_concern_recorded",
    "correction_recorded",
    "update_recorded",
    "reinstatement_recorded",
    "other_update_recorded",
    "no_update_marker_found",
    "state_uncertain"
  ]),
  events: z.array(z.object({
    event_kind: z.enum([
      "retraction",
      "withdrawal",
      "expression_of_concern",
      "correction",
      "update",
      "reinstatement",
      "other"
    ]),
    event_hash: digest
  }).strict()).max(2_000)
}).strict();

const claimLocalLimitationStateSchema = z.object({
  claim_id: bounded(500),
  limitation: bounded(4_000),
  source_item_hashes: z.array(digest).max(100)
}).strict();

const externalEvidenceStateSchema = z.object({
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE",
    "PARTIAL",
    "BLOCKED_RETRYABLE",
    "BOUNDED_NONRETRYABLE",
    "NOT_APPLICABLE"
  ]),
  study_identity_hash: digest.optional(),
  receipt_payload_sha256: digest.optional(),
  bundle_hash: digest.optional(),
  provider_attempt_hashes: z.array(digest).max(32),
  provider_coverage: z.array(providerCoverageStateSchema).max(32),
  publication_integrity: publicationIntegritySummarySchema.optional(),
  controller_directives: z.array(z.object({
    directive: bounded(100),
    source_item_hash: digest
  }).strict()).max(2_000),
  unresolved_item_hashes: z.array(digest).max(2_000),
  claim_local_limitation_hashes: z.array(digest).max(2_000),
  claim_local_limitations: z.array(claimLocalLimitationStateSchema).max(2_000),
  linked_work: z.array(linkedWorkSchema).max(2_000),
  possible_decision_impact: z.enum([
    "detail_only",
    "confidence_changing",
    "ranking_changing",
    "potentially_conclusion_changing",
    "unknown"
  ]),
  effect_claims_excluded: z.boolean()
}).strict().superRefine((record, context) => {
  const coverageProviders = record.provider_coverage.map(({ provider }) => provider);
  const coverageHashes = record.provider_coverage.map(({ attempt_sha256 }) =>
    attempt_sha256
  );
  if (new Set(coverageProviders).size !== coverageProviders.length) {
    context.addIssue({ code: "custom", message: "External provider coverage identities must be unique" });
  }
  if (
    coverageHashes.length !== record.provider_attempt_hashes.length ||
    coverageHashes.some((hash) => !record.provider_attempt_hashes.includes(hash))
  ) {
    context.addIssue({ code: "custom", message: "External provider coverage must match exact attempt hashes" });
  }
  const limitationHashes = record.claim_local_limitations.map((limitation) =>
    sha256(JSON.stringify(limitation))
  );
  if (
    limitationHashes.length !== record.claim_local_limitation_hashes.length ||
    limitationHashes.some((hash) => !record.claim_local_limitation_hashes.includes(hash))
  ) {
    context.addIssue({ code: "custom", message: "Claim-local limitation text must match its exact bounded hashes" });
  }
  if (
    record.receipt_payload_sha256 !== undefined &&
    (record.provider_coverage.length === 0 || record.publication_integrity === undefined)
  ) {
    context.addIssue({ code: "custom", message: "Verified external evidence must preserve provider and publication summaries" });
  }
  if (
    record.publication_integrity !== undefined &&
    new Set(record.publication_integrity.events.map(({ event_hash }) => event_hash)).size !==
      record.publication_integrity.events.length
  ) {
    context.addIssue({ code: "custom", message: "Publication-integrity event identities must be unique" });
  }
  if (
    record.publication_integrity?.record_state === "active_retraction_or_withdrawal" &&
    !record.effect_claims_excluded
  ) {
    context.addIssue({ code: "custom", message: "Active retraction or withdrawal must exclude ordinary effect claims" });
  }
});

const claimCapabilityStateSchema = z.object({
  status: z.enum([
    "UNAVAILABLE_UNSEEN_SOURCE",
    "METHOD_AUDIT_PENDING",
    "METHOD_AUDIT_ONLY",
    "EXTERNAL_AUDIT_PENDING",
    "LINKED_WORK_REQUIRED",
    "RECALCULATION_REQUIRED",
    "CURRENT",
    "EFFECT_CLAIMS_EXCLUDED",
    "BOUNDED_ONLY",
    "NOT_APPLICABLE"
  ]),
  capability_digest: digest.optional(),
  method_audit_sha256: digest.optional(),
  external_receipt_payload_sha256: digest.optional(),
  unrestricted_decision_use: z.boolean()
}).strict().superRefine((record, context) => {
  if (record.unrestricted_decision_use !== (record.status === "CURRENT")) {
    context.addIssue({ code: "custom", message: "Only a current claim capability permits unrestricted decision use" });
  }
});

const formalSourceSchema = z.object({
  source_id: digest,
  hypothesis_ids: z.array(digest).min(1).max(100),
  origins: z.array(sourceOriginSchema).min(1).max(20),
  identity: sourceIdentitySchema,
  source_kind: z.enum(["UNASSESSED", ...FORMAL_SOURCE_KINDS]),
  abstract_visibility: z.enum(["ABSTRACT_PRESENT", "ABSTRACT_NOT_REPORTED", "METADATA_ONLY"]),
  screening_status: z.enum(["PENDING", "SCREENED"]),
  decision_importance: z.enum(["UNASSESSED", "DECISION_IMPORTANT", "NOT_DECISION_IMPORTANT"]),
  possible_decision_impact: z.enum([
    "detail_only",
    "confidence_changing",
    "ranking_changing",
    "potentially_conclusion_changing",
    "unknown"
  ]),
  screening_rationale: bounded(1_000).optional(),
  full_text: fullTextStateSchema,
  method_audit: methodAuditStateSchema,
  external_evidence: externalEvidenceStateSchema,
  claim_capability: claimCapabilityStateSchema
}).strict().superRefine((record, context) => {
  if ((record.screening_status === "SCREENED") !== (record.screening_rationale !== undefined)) {
    context.addIssue({ code: "custom", message: "Formal source screening status and rationale must agree" });
  }
  if (
    record.screening_status === "PENDING" &&
    (record.decision_importance !== "UNASSESSED" || record.source_kind !== "UNASSESSED")
  ) {
    context.addIssue({ code: "custom", message: "Pending formal sources cannot contain semantic decisions" });
  }
  if (
    record.screening_status === "SCREENED" &&
    (record.decision_importance === "UNASSESSED" || record.source_kind === "UNASSESSED")
  ) {
    context.addIssue({ code: "custom", message: "Screened formal sources require complete semantic decisions" });
  }
});

export const researchFormalEvidenceStateSchema = z.object({
  frontier_version: z.literal("askrigor_formal_evidence_v1"),
  candidate_screening_digest: digest.optional(),
  hypothesis_frontier_digest: digest.optional(),
  hypotheses: z.array(formalHypothesisSchema).max(100),
  sources: z.array(formalSourceSchema).max(2_000)
}).strict().superRefine((state, context) => {
  if ((state.hypotheses.length > 0) !== (state.hypothesis_frontier_digest !== undefined)) {
    context.addIssue({ code: "custom", message: "Formal hypothesis frontier and digest must agree" });
  }
  const hypothesisIds = new Set(state.hypotheses.map(({ hypothesis_id }) => hypothesis_id));
  if (hypothesisIds.size !== state.hypotheses.length) {
    context.addIssue({ code: "custom", message: "Formal hypothesis identities must be unique" });
  }
  for (const hypothesis of state.hypotheses) {
    const core = formalHypothesisCore(hypothesis);
    const expectedDigest = sha256(JSON.stringify(core));
    if (
      hypothesis.hypothesis_digest !== expectedDigest ||
      hypothesis.hypothesis_id !== sha256(`formal-hypothesis:${expectedDigest}`)
    ) {
      context.addIssue({
        code: "custom",
        message: "Formal hypothesis identity must match its exact program/outcome/query core"
      });
    }
  }
  if (
    state.hypothesis_frontier_digest !== undefined &&
    state.candidate_screening_digest !== undefined &&
    state.hypothesis_frontier_digest !== formalHypothesisFrontierDigest(
      state.candidate_screening_digest,
      state.hypotheses
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Formal hypothesis frontier digest must match its exact immutable hypothesis cores"
    });
  }
  const sourceIds = new Set(state.sources.map(({ source_id }) => source_id));
  if (sourceIds.size !== state.sources.length) {
    context.addIssue({ code: "custom", message: "Formal source identities must be unique" });
  }
  for (const source of state.sources) {
    if (source.hypothesis_ids.some((id) => !hypothesisIds.has(id))) {
      context.addIssue({ code: "custom", message: "Formal source cites an unknown hypothesis" });
    }
  }
});

export type ResearchFormalEvidenceState = z.output<typeof researchFormalEvidenceStateSchema>;
export type ResearchFormalSource = z.output<typeof formalSourceSchema>;

export const formalEvidenceScreeningWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_formal_source_screening_v1"),
  formal_frontier_digest: digest,
  sources: z.array(z.object({
    source_id: digest,
    hypothesis_ids: z.array(digest).min(1),
    origins: z.array(sourceOriginSchema).min(1),
    identity: sourceIdentitySchema,
    abstract_visibility: formalSourceSchema.shape.abstract_visibility
  }).strict()).min(1).max(2_000)
}).strict();

export const formalEvidenceScreeningSubmissionSchema = z.object({
  package_version: z.literal("askrigor_formal_source_screening_v1"),
  formal_frontier_digest: digest,
  decisions: z.array(z.object({
    source_id: digest,
    source_kind: z.enum(FORMAL_SOURCE_KINDS),
    decision_importance: z.enum(["DECISION_IMPORTANT", "NOT_DECISION_IMPORTANT"]),
    possible_decision_impact: formalSourceSchema.shape.possible_decision_impact,
    rationale: bounded(1_000)
  }).strict()).min(1).max(2_000)
}).strict();

export type FormalEvidenceScreeningSubmission = z.output<
  typeof formalEvidenceScreeningSubmissionSchema
>;

export const formalMethodAuditWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_formal_method_audit_v1"),
  source_id: digest,
  source_kind: z.enum(FORMAL_SOURCE_KINDS),
  audit_kind: z.enum(["STUDY", "REVIEW", "NOTICE"]),
  document_handle: handle,
  source_primary_identifier: bounded(2_048),
  source_content_sha256: digest,
  source_block_count: z.number().int().positive(),
  source_segment_count: z.number().int().positive(),
  full_text_exhausted: z.literal(true)
}).strict();

export const formalExternalEvidenceWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_formal_external_evidence_v1"),
  source_id: digest,
  doi,
  source_content_sha256: digest,
  method_audit_sha256: digest,
  prior_external_status: externalEvidenceStateSchema.shape.status
}).strict();

export const formalClaimRecalculationWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_formal_claim_recalculation_v1"),
  source_id: digest,
  doi,
  document_handle: handle,
  source_primary_identifier: bounded(2_048),
  source_content_sha256: digest,
  method_audit_sha256: digest,
  external_receipt_payload_sha256: digest,
  external_bundle_hash: digest,
  external_study_identity_hash: digest,
  linked_work_complete: z.literal(true)
}).strict();

export const formalEvidenceDiagnosticsSchema = z.object({
  hypotheses: z.number().int().nonnegative(),
  hypotheses_search_complete: z.number().int().nonnegative(),
  sources: z.number().int().nonnegative(),
  sources_screening_pending: z.number().int().nonnegative(),
  decision_important_sources: z.number().int().nonnegative(),
  full_text_exhausted: z.number().int().nonnegative(),
  unseen_source_leads: z.number().int().nonnegative(),
  method_audits_complete: z.number().int().nonnegative(),
  external_audits_complete: z.number().int().nonnegative(),
  linked_work_open: z.number().int().nonnegative(),
  claim_capabilities_current: z.number().int().nonnegative(),
  unrestricted_decision_sources: z.number().int().nonnegative()
}).strict();

export type FormalEvidenceDiagnostics = z.output<typeof formalEvidenceDiagnosticsSchema>;

export interface FormalSearchExecutors {
  searchPubmed: typeof searchPubmed;
  fetchPubmedRecord: typeof fetchPubmedRecord;
  searchEuropePmc: typeof searchEuropePmc;
  pubmedConfig: PubmedConfig;
}

export function initialResearchFormalEvidenceState(): ResearchFormalEvidenceState {
  return researchFormalEvidenceStateSchema.parse({
    frontier_version: "askrigor_formal_evidence_v1",
    hypotheses: [],
    sources: []
  });
}

export function initializeResearchFormalEvidence(
  candidateState: ResearchCandidateDiscoveryState,
  researchTarget: string
): ResearchFormalEvidenceState {
  assertCandidateScreeningComplete(candidateState);
  const screeningDigest = candidateScreeningResultDigest(candidateState);
  const groups = materialHypothesisGroups(candidateState.candidates);
  if (groups.length === 0) {
    throw new Error("Formal evidence requires at least one material program/outcome hypothesis");
  }
  const hypotheses = groups.map((group) => formalHypothesis(group, researchTarget));
  const frontierDigest = formalHypothesisFrontierDigest(screeningDigest, hypotheses);
  return researchFormalEvidenceStateSchema.parse({
    frontier_version: "askrigor_formal_evidence_v1",
    candidate_screening_digest: screeningDigest,
    hypothesis_frontier_digest: frontierDigest,
    hypotheses,
    sources: []
  });
}

export function appendResearchFormalHypotheses(
  rawState: ResearchFormalEvidenceState,
  rawInputs: readonly CommunityFormalHypothesisInput[]
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  if (state.candidate_screening_digest === undefined) {
    throw new Error("Formal evidence must be initialized before bidirectional expansion");
  }
  const inputs = rawInputs.map((input) => communityFormalHypothesisInputSchema.parse(input));
  const existingDigests = new Set(state.hypotheses.map(({ hypothesis_digest }) =>
    hypothesis_digest
  ));
  const additions: z.output<typeof formalHypothesisSchema>[] = [];
  for (const input of inputs) {
    const core = {
      source_video_ids: [...new Set(input.source_video_ids)].sort(),
      program_signature: input.program_signature,
      treatment_class: input.treatment_class,
      claim_summary: input.claim_summary,
      program: input.program,
      formal_query: input.formal_query
    };
    const hypothesisDigest = sha256(JSON.stringify(core));
    if (existingDigests.has(hypothesisDigest)) continue;
    existingDigests.add(hypothesisDigest);
    additions.push(formalHypothesisSchema.parse({
      ...core,
      hypothesis_id: sha256(`formal-hypothesis:${hypothesisDigest}`),
      hypothesis_digest: hypothesisDigest,
      provider_searches: FORMAL_EVIDENCE_PROVIDERS.map((provider) => ({
        provider,
        query: core.formal_query,
        status: "NOT_STARTED",
        pages_retrieved: 0,
        records_returned_cumulative: 0,
        page_receipt_hashes: [],
        access_statuses: [],
        limitations: []
      }))
    }));
  }
  if (additions.length === 0) return state;
  const hypotheses = [...state.hypotheses, ...additions];
  return researchFormalEvidenceStateSchema.parse({
    ...state,
    hypotheses,
    hypothesis_frontier_digest: formalHypothesisFrontierDigest(
      state.candidate_screening_digest,
      hypotheses
    )
  });
}

export async function executeResearchFormalSearch(
  rawState: ResearchFormalEvidenceState,
  hypothesisId: string,
  executors: FormalSearchExecutors,
  maximumPagesPerProvider = 1
): Promise<ResearchFormalEvidenceState> {
  let state = researchFormalEvidenceStateSchema.parse(rawState);
  const hypothesis = state.hypotheses.find((item) => item.hypothesis_id === hypothesisId);
  if (hypothesis === undefined) throw new Error("Unknown formal-search hypothesis");
  if (!Number.isSafeInteger(maximumPagesPerProvider) || maximumPagesPerProvider < 1) {
    throw new Error("Invalid formal-search page limit");
  }
  for (const provider of FORMAL_EVIDENCE_PROVIDERS) {
    for (let page = 0; page < maximumPagesPerProvider; page += 1) {
      const current = providerSearch(state, hypothesisId, provider);
      if (current.status === "COMPLETE" || current.status === "BLOCKED_TERMINAL") break;
      state = provider === "pubmed"
        ? await executePubmedSearchPage(state, hypothesisId, executors)
        : await executeEuropePmcSearchPage(state, hypothesisId, executors);
      const after = providerSearch(state, hypothesisId, provider);
      if (after.status !== "IN_PROGRESS") break;
    }
  }
  return state;
}

export function createFormalEvidenceScreeningWorkPackage(
  rawState: ResearchFormalEvidenceState
): z.output<typeof formalEvidenceScreeningWorkPackageSchema> {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  if (!formalSearchProvidersTerminal(state)) {
    throw new Error("Formal provider searches are not ready for source screening");
  }
  if (state.sources.length === 0) {
    throw new Error("Formal search returned no identities to screen");
  }
  return formalEvidenceScreeningWorkPackageSchema.parse({
    package_version: "askrigor_formal_source_screening_v1",
    formal_frontier_digest: formalEvidenceFrontierDigest(state),
    sources: state.sources.map((source) => ({
      source_id: source.source_id,
      hypothesis_ids: source.hypothesis_ids,
      origins: source.origins,
      identity: source.identity,
      abstract_visibility: source.abstract_visibility
    }))
  });
}

export function ingestFormalEvidenceScreeningSubmission(
  rawState: ResearchFormalEvidenceState,
  rawSubmission: FormalEvidenceScreeningSubmission
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const work = createFormalEvidenceScreeningWorkPackage(state);
  const submission = formalEvidenceScreeningSubmissionSchema.parse(rawSubmission);
  if (submission.formal_frontier_digest !== work.formal_frontier_digest) {
    throw new Error("Formal source screening is bound to a different frontier");
  }
  if (!sameMembers(
    submission.decisions.map(({ source_id }) => source_id),
    state.sources.map(({ source_id }) => source_id)
  )) {
    throw new Error("Formal source screening must decide every provider identity exactly once");
  }
  const decisions = new Map(submission.decisions.map((decision) => [decision.source_id, decision]));
  const sources = state.sources.map((source) => {
    const decision = decisions.get(source.source_id)!;
    const selected = decision.decision_importance === "DECISION_IMPORTANT";
    return formalSourceSchema.parse({
      ...source,
      source_kind: decision.source_kind,
      screening_status: "SCREENED",
      decision_importance: decision.decision_importance,
      possible_decision_impact: decision.possible_decision_impact,
      screening_rationale: decision.rationale,
      full_text: selected ? source.full_text : notApplicableFullText(),
      method_audit: selected
        ? initialMethodAudit(decision.source_kind)
        : notApplicableMethodAudit(),
      external_evidence: selected
        ? initialExternalEvidence(decision.source_kind)
        : notApplicableExternalEvidence(),
      claim_capability: selected
        ? initialClaimCapability(decision.source_kind)
        : notApplicableClaimCapability()
    });
  });
  for (const hypothesis of state.hypotheses) {
    const candidates = sources.filter((source) => source.hypothesis_ids.includes(hypothesis.hypothesis_id));
    if (
      candidates.length > 0 &&
      !candidates.some(({ decision_importance }) => decision_importance === "DECISION_IMPORTANT")
    ) {
      throw new Error("Every formal hypothesis with candidates needs a decision-important source or further search");
    }
  }
  return researchFormalEvidenceStateSchema.parse({ ...state, sources });
}

export function formalEvidenceScreeningComplete(
  rawState: ResearchFormalEvidenceState
): boolean {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  if (state.sources.length === 0) return formalSearchProvidersTerminal(state);
  return formalSearchProvidersTerminal(state) && state.sources.every(({ screening_status }) =>
    screening_status === "SCREENED"
  );
}

export async function executeResearchSourceFullTextChain(
  rawState: ResearchFormalEvidenceState,
  sourceId: string,
  executor: OpenFullTextExecutor,
  maximumCalls = 1_000
): Promise<ResearchFormalEvidenceState> {
  let state = researchFormalEvidenceStateSchema.parse(rawState);
  const source = decisionSource(state, sourceId);
  if (source.identity.doi === undefined) {
    return replaceSource(state, sourceId, {
      ...source,
      full_text: fullTextStateSchema.parse({
        status: "LEAD_BOUNDARY",
        discovery_attempts: [],
        source_segments_retrieved_cumulative: 0,
        synthesis_lock: "fail",
        access_boundary: "The formal source has no exact DOI for the configured lawful full-text acquisition routes; its unseen contents remain a possibly useful lead.",
        unseen_content_used_as_evidence: false
      }),
      method_audit: boundaryMethodAudit(source.source_kind),
      external_evidence: boundaryExternalEvidence(source.source_kind),
      claim_capability: unseenClaimCapability()
    });
  }
  if (!Number.isSafeInteger(maximumCalls) || maximumCalls < 1) {
    throw new Error("Invalid open-full-text call limit");
  }
  const sourceDoi = source.identity.doi;
  for (let call = 0; call < maximumCalls; call += 1) {
    const current = decisionSource(state, sourceId);
    if (["EXHAUSTED", "LEAD_BOUNDARY", "NOT_APPLICABLE"].includes(current.full_text.status)) {
      return state;
    }
    let output: z.output<typeof openFullTextActionOutputSchema>;
    try {
      output = current.full_text.status === "NOT_STARTED" ||
        current.full_text.status === "BLOCKED_RETRYABLE"
        ? await executor.acquire({
          doi: sourceDoi,
          ...(current.identity.pmcid === undefined ? {} : { pmcid: current.identity.pmcid })
        })
        : await executor.continue({ document_handle: current.full_text.document_handle! });
    } catch (error) {
      if (error instanceof OpenFullTextHandleError) {
        return restartResearchSourceFullTextChain(
          state,
          sourceId,
          "The exact full-text continuation handle was invalid or expired. The prior partial chain was discarded and this source must restart from acquisition."
        );
      }
      throw error;
    }
    state = ingestOpenFullTextOutput(state, sourceId, output);
  }
  return state;
}

export function restartResearchSourceFullTextChain(
  rawState: ResearchFormalEvidenceState,
  sourceId: string,
  reason: string
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const source = decisionSource(state, sourceId);
  if (source.full_text.status !== "IN_PROGRESS") {
    throw new Error("Only an incomplete full-text continuation chain can be restarted");
  }
  return replaceSource(state, sourceId, {
    ...source,
    full_text: fullTextStateSchema.parse({
      status: "BLOCKED_RETRYABLE",
      requested_doi: source.identity.doi,
      discovery_attempts: [],
      source_segments_retrieved_cumulative: 0,
      synthesis_lock: "fail",
      access_boundary: bounded(2_000).parse(reason),
      unseen_content_used_as_evidence: false
    }),
    method_audit: initialMethodAudit(source.source_kind),
    external_evidence: initialExternalEvidence(source.source_kind),
    claim_capability: initialClaimCapability(source.source_kind)
  });
}

/**
 * The open-full-text document index is intentionally ephemeral. A restored
 * session may retain exact public identity and receipt hashes, but if later
 * work still needs the index it must reacquire and re-audit the exact source.
 */
export function reconcileFormalEvidenceAfterEphemeralLoss(
  rawState: ResearchFormalEvidenceState,
): ResearchFormalEvidenceState {
  let state = researchFormalEvidenceStateSchema.parse(rawState);
  for (const source of [...state.sources]) {
    const lostPartialChain = source.full_text.status === "IN_PROGRESS";
    const exhaustedNeedsReacquisition =
      source.full_text.status === "EXHAUSTED" &&
      (
        source.method_audit.status !== "COMPLETE" ||
        (
          source.source_kind === "SCIENTIFIC_STUDY" &&
          !["CURRENT", "EFFECT_CLAIMS_EXCLUDED", "BOUNDED_ONLY"].includes(
            source.claim_capability.status,
          )
        )
      );
    if (!lostPartialChain && !exhaustedNeedsReacquisition) continue;
    const preserveCompletedAudit =
      !lostPartialChain && source.method_audit.status === "COMPLETE";
    const reopenExternalEvidence =
      preserveCompletedAudit &&
      source.source_kind === "SCIENTIFIC_STUDY" &&
      source.identity.doi !== undefined &&
      source.external_evidence.status === "COMPLETE" &&
      (
        source.claim_capability.status === "LINKED_WORK_REQUIRED" ||
        source.claim_capability.status === "RECALCULATION_REQUIRED"
      );
    state = replaceSource(state, source.source_id, {
      ...source,
      full_text: fullTextStateSchema.parse({
        status: "BLOCKED_RETRYABLE",
        requested_doi: source.identity.doi,
        discovery_attempts: [],
        source_segments_retrieved_cumulative: 0,
        synthesis_lock: "fail",
        access_boundary: "The process-local full-text document handle was lost during restart. The exact source must be reacquired before method or claim-capability work continues.",
        unseen_content_used_as_evidence: false,
      }),
      method_audit: preserveCompletedAudit
        ? source.method_audit
        : initialMethodAudit(source.source_kind),
      external_evidence: reopenExternalEvidence
        ? initialExternalEvidence(source.source_kind)
        : preserveCompletedAudit
        ? source.external_evidence
        : initialExternalEvidence(source.source_kind),
      claim_capability: reopenExternalEvidence
        ? claimCapabilityStateSchema.parse({
          status: "EXTERNAL_AUDIT_PENDING",
          ...(source.method_audit.claim_capability_digest === undefined
            ? {}
            : {
              capability_digest: source.method_audit.claim_capability_digest,
            }),
          ...(source.method_audit.audit_sha256 === undefined
            ? {}
            : { method_audit_sha256: source.method_audit.audit_sha256 }),
          unrestricted_decision_use: false,
        })
        : preserveCompletedAudit
        ? source.claim_capability
        : initialClaimCapability(source.source_kind),
    });
  }
  return reconcileFormalEvidenceLinkedWork(state);
}

export function ingestOpenFullTextOutput(
  rawState: ResearchFormalEvidenceState,
  sourceId: string,
  rawOutput: z.output<typeof openFullTextActionOutputSchema>
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const source = decisionSource(state, sourceId);
  const output = openFullTextActionOutputSchema.parse(rawOutput);
  if (source.identity.doi === undefined || output.requested_doi !== source.identity.doi) {
    throw new Error("Open full-text output is bound to a different formal source DOI");
  }
  if (output.status === "possibly_useful_lead") {
    if (source.full_text.status === "IN_PROGRESS" || source.full_text.status === "EXHAUSTED") {
      throw new Error("An established full-text chain cannot be replaced by an unseen lead");
    }
    return replaceSource(state, sourceId, {
      ...source,
      full_text: fullTextStateSchema.parse({
        status: "LEAD_BOUNDARY",
        requested_doi: output.requested_doi,
        discovery_attempts: output.discovery_attempts,
        source_segments_retrieved_cumulative: 0,
        synthesis_lock: "fail",
        access_boundary: output.access_boundary,
        unseen_content_used_as_evidence: false
      }),
      method_audit: boundaryMethodAudit(source.source_kind),
      external_evidence: boundaryExternalEvidence(source.source_kind),
      claim_capability: unseenClaimCapability()
    });
  }
  const page = availableOpenFullTextActionOutputSchema.parse(output);
  const receipt = page.coverage_receipt;
  if (
    page.source.doi !== undefined && page.source.doi !== source.identity.doi ||
    receipt.source_segments_retrieved_cumulative > receipt.source_segment_count
  ) {
    throw new Error("Open full-text source identity or coverage is inconsistent");
  }
  const before = source.full_text;
  if (before.status === "IN_PROGRESS") {
    if (
      before.document_handle !== receipt.document_handle ||
      before.source_content_sha256 !== receipt.source_content_sha256 ||
      before.source_block_count !== receipt.source_block_count ||
      before.source_segment_count !== receipt.source_segment_count ||
      receipt.source_segments_retrieved_cumulative <=
        before.source_segments_retrieved_cumulative
    ) {
      throw new Error("Open full-text continuation mixed, replayed, or decreased its exact receipt chain");
    }
  } else if (before.status !== "NOT_STARTED" && before.status !== "BLOCKED_RETRYABLE") {
    throw new Error("Open full-text source has no executable continuation");
  }
  const exhausted = receipt.exhausted;
  if (exhausted !== (receipt.synthesis_lock === "pass")) {
    throw new Error("Full-text exhaustion and synthesis lock must agree");
  }
  const nextIdentity = contentVerifiedIdentity(source.identity, page.source);
  const preserveCompletedAudit =
    exhausted &&
    before.status === "BLOCKED_RETRYABLE" &&
    source.method_audit.status === "COMPLETE" &&
    source.method_audit.source_content_sha256 === receipt.source_content_sha256 &&
    source.method_audit.source_primary_identifier === page.source.primary_identifier;
  return replaceSource(state, sourceId, {
    ...source,
    identity: nextIdentity,
    full_text: fullTextStateSchema.parse({
      status: exhausted ? "EXHAUSTED" : "IN_PROGRESS",
      document_handle: receipt.document_handle,
      requested_doi: output.requested_doi,
      discovery_attempts: before.discovery_attempts.length === 0
        ? page.discovery_attempts
        : before.discovery_attempts,
      source_primary_identifier: page.source.primary_identifier,
      source_canonical_url: page.source.canonical_url,
      ...(page.source.version === undefined ? {} : { source_version: page.source.version }),
      source_content_sha256: receipt.source_content_sha256,
      source_block_count: receipt.source_block_count,
      source_segment_count: receipt.source_segment_count,
      source_segments_retrieved_cumulative: receipt.source_segments_retrieved_cumulative,
      synthesis_lock: receipt.synthesis_lock,
      unseen_content_used_as_evidence: false
    }),
    method_audit: exhausted && !preserveCompletedAudit
      ? initialMethodAudit(source.source_kind)
      : source.method_audit,
    external_evidence: exhausted && !preserveCompletedAudit
      ? initialExternalEvidence(source.source_kind)
      : source.external_evidence,
    claim_capability: exhausted
      ? preserveCompletedAudit
        ? source.claim_capability
        : { status: "METHOD_AUDIT_PENDING", unrestricted_decision_use: false }
      : source.claim_capability
  });
}

export function createFormalMethodAuditWorkPackages(
  rawState: ResearchFormalEvidenceState
): z.output<typeof formalMethodAuditWorkPackageSchema>[] {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  return state.sources.flatMap((source) => {
    if (
      source.decision_importance !== "DECISION_IMPORTANT" ||
      source.full_text.status !== "EXHAUSTED" ||
      source.method_audit.status !== "NOT_STARTED"
    ) return [];
    return [formalMethodAuditWorkPackageSchema.parse({
      package_version: "askrigor_formal_method_audit_v1",
      source_id: source.source_id,
      source_kind: source.source_kind,
      audit_kind: source.method_audit.audit_kind,
      document_handle: source.full_text.document_handle,
      source_primary_identifier: source.full_text.source_primary_identifier,
      source_content_sha256: source.full_text.source_content_sha256,
      source_block_count: source.full_text.source_block_count,
      source_segment_count: source.full_text.source_segment_count,
      full_text_exhausted: true
    })];
  });
}

export function createFormalExternalEvidenceWorkPackages(
  rawState: ResearchFormalEvidenceState
): z.output<typeof formalExternalEvidenceWorkPackageSchema>[] {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  return state.sources.flatMap((source) => {
    if (
      source.decision_importance !== "DECISION_IMPORTANT" ||
      source.source_kind !== "SCIENTIFIC_STUDY" ||
      source.identity.doi === undefined ||
      source.method_audit.status !== "COMPLETE" ||
      source.method_audit.audit_sha256 === undefined ||
      source.full_text.source_content_sha256 === undefined ||
      !["NOT_STARTED", "PARTIAL", "BLOCKED_RETRYABLE"].includes(
        source.external_evidence.status
      )
    ) return [];
    return [formalExternalEvidenceWorkPackageSchema.parse({
      package_version: "askrigor_formal_external_evidence_v1",
      source_id: source.source_id,
      doi: source.identity.doi,
      source_content_sha256: source.full_text.source_content_sha256,
      method_audit_sha256: source.method_audit.audit_sha256,
      prior_external_status: source.external_evidence.status
    })];
  });
}

export function createFormalClaimRecalculationWorkPackages(
  rawState: ResearchFormalEvidenceState
): z.output<typeof formalClaimRecalculationWorkPackageSchema>[] {
  const state = reconcileFormalEvidenceLinkedWork(rawState);
  return state.sources.flatMap((source) => {
    if (
      source.decision_importance !== "DECISION_IMPORTANT" ||
      source.source_kind !== "SCIENTIFIC_STUDY" ||
      source.identity.doi === undefined ||
      source.claim_capability.status !== "RECALCULATION_REQUIRED" ||
      source.external_evidence.status !== "COMPLETE" ||
      source.full_text.document_handle === undefined ||
      source.full_text.source_primary_identifier === undefined ||
      source.full_text.source_content_sha256 === undefined ||
      source.method_audit.audit_sha256 === undefined ||
      source.external_evidence.receipt_payload_sha256 === undefined ||
      source.external_evidence.bundle_hash === undefined ||
      source.external_evidence.study_identity_hash === undefined ||
      source.external_evidence.linked_work.some(({ status }) => status !== "COMPLETE")
    ) return [];
    return [formalClaimRecalculationWorkPackageSchema.parse({
      package_version: "askrigor_formal_claim_recalculation_v1",
      source_id: source.source_id,
      doi: source.identity.doi,
      document_handle: source.full_text.document_handle,
      source_primary_identifier: source.full_text.source_primary_identifier,
      source_content_sha256: source.full_text.source_content_sha256,
      method_audit_sha256: source.method_audit.audit_sha256,
      external_receipt_payload_sha256:
        source.external_evidence.receipt_payload_sha256,
      external_bundle_hash: source.external_evidence.bundle_hash,
      external_study_identity_hash: source.external_evidence.study_identity_hash,
      linked_work_complete: true
    })];
  });
}

export function recordFormalMethodAudit(
  rawState: ResearchFormalEvidenceState,
  sourceId: string,
  rawOutput: z.output<typeof studyMethodAuditActionOutputSchema> |
    z.output<typeof reviewMethodAuditActionOutputSchema> |
    z.output<typeof noticeMethodAuditOutputSchema>
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const source = decisionSource(state, sourceId);
  if (source.full_text.status !== "EXHAUSTED" || source.method_audit.status !== "NOT_STARTED") {
    throw new Error("Formal method audit requires exact exhausted full text and pending audit state");
  }
  const study = studyMethodAuditActionOutputSchema.safeParse(rawOutput);
  const review = reviewMethodAuditActionOutputSchema.safeParse(rawOutput);
  const notice = noticeMethodAuditOutputSchema.safeParse(rawOutput);
  const parsed = source.method_audit.audit_kind === "STUDY"
    ? study.success ? study.data : undefined
    : source.method_audit.audit_kind === "REVIEW"
      ? review.success ? review.data : undefined
      : source.method_audit.audit_kind === "NOTICE"
        ? notice.success ? notice.data : undefined
        : undefined;
  if (parsed === undefined) throw new Error("Formal method audit kind does not match the selected source kind");
  const receipt = parsed.audit_receipt;
  if (parsed.coverage_receipt.document_handle !== source.full_text.document_handle) {
    throw new Error("Formal method audit receipt is bound to a different document handle");
  }
  if (
    parsed.coverage_receipt.source_content_sha256 !== source.full_text.source_content_sha256 ||
    receipt.source_content_sha256 !== source.full_text.source_content_sha256
  ) {
    throw new Error("Formal method audit receipt is bound to a different source version");
  }
  if (receipt.source_primary_identifier !== source.full_text.source_primary_identifier) {
    throw new Error("Formal method audit receipt is bound to a different source identity");
  }
  const capabilityDigest = sha256(JSON.stringify(
    "claim_capabilities" in receipt
      ? receipt.claim_capabilities
      : {
        plain_language_finding: receipt.plain_language_finding,
        possible_decision_impact: receipt.possible_decision_impact,
        unresolved_fields: receipt.unresolved_fields
      }
  ));
  return replaceSource(state, sourceId, {
    ...source,
    method_audit: methodAuditStateSchema.parse({
      status: "COMPLETE",
      audit_kind: source.method_audit.audit_kind,
      audit_sha256: receipt.audit_sha256,
      source_content_sha256: receipt.source_content_sha256,
      source_primary_identifier: receipt.source_primary_identifier,
      claim_capability_digest: capabilityDigest,
      reader_evidence: readerEvidenceFromMethodReceipt(
        source.method_audit.audit_kind,
        receipt
      )
    }),
    external_evidence: source.method_audit.audit_kind === "STUDY" &&
      source.identity.doi !== undefined
      ? { ...source.external_evidence, status: "NOT_STARTED" }
      : notApplicableExternalEvidence(),
    claim_capability: source.method_audit.audit_kind === "STUDY" &&
      source.identity.doi !== undefined
      ? {
        status: "EXTERNAL_AUDIT_PENDING",
        capability_digest: capabilityDigest,
        method_audit_sha256: receipt.audit_sha256,
        unrestricted_decision_use: false
      }
      : {
        status: "CURRENT",
        capability_digest: capabilityDigest,
        method_audit_sha256: receipt.audit_sha256,
        unrestricted_decision_use: true
      }
  });
}

export async function executeResearchSourceExternalEvidence(
  rawState: ResearchFormalEvidenceState,
  sessionId: string,
  sourceId: string,
  coordinator: StudyExternalEvidenceCoordinator,
  receiptSecret: string,
  protocolIdentities: StudyExternalEvidenceProtocolTuple
): Promise<ResearchFormalEvidenceState> {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const source = decisionSource(state, sourceId);
  if (
    source.method_audit.status !== "COMPLETE" ||
    source.method_audit.audit_kind !== "STUDY" ||
    source.identity.doi === undefined ||
    !["NOT_STARTED", "BLOCKED_RETRYABLE", "PARTIAL"].includes(source.external_evidence.status)
  ) {
    throw new Error("External study evidence requires one exact audited DOI study with executable work");
  }
  let output: StudyExternalEvidenceAuditOutput;
  try {
    output = await coordinator.audit({ session_id: sessionId, doi: source.identity.doi });
  } catch (error) {
    if (error instanceof StudyExternalEvidenceIdentityError) {
      return recordResearchSourceExternalEvidenceBoundary(
        state,
        sourceId,
        error.retryable,
        error.message
      );
    }
    throw error;
  }
  return ingestResearchSourceExternalEvidence(
    state,
    sessionId,
    sourceId,
    output,
    receiptSecret,
    protocolIdentities
  );
}

export function recordResearchSourceExternalEvidenceBoundary(
  rawState: ResearchFormalEvidenceState,
  sourceId: string,
  retryable: boolean,
  reason: string
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const source = decisionSource(state, sourceId);
  if (
    source.method_audit.status !== "COMPLETE" ||
    source.method_audit.audit_kind !== "STUDY" ||
    source.identity.doi === undefined ||
    !["NOT_STARTED", "PARTIAL", "BLOCKED_RETRYABLE"].includes(
      source.external_evidence.status
    )
  ) {
    throw new Error("External evidence boundary cannot replace non-executable study state");
  }
  const boundedReason = bounded(2_000).parse(reason);
  const limitation = claimLocalLimitationStateSchema.parse({
    claim_id: `external-evidence-boundary:${sourceId}`,
    limitation: boundedReason,
    source_item_hashes: [sha256(JSON.stringify({
      source_id: sourceId,
      doi: source.identity.doi,
      retryable,
      reason: boundedReason
    }))]
  });
  const limitationHash = sha256(JSON.stringify(limitation));
  const replacedLimitationHashes = new Set(
    source.external_evidence.claim_local_limitations
      .filter(({ claim_id }) => claim_id === limitation.claim_id)
      .map((item) => sha256(JSON.stringify(item)))
  );
  return replaceSource(state, sourceId, {
    ...source,
    external_evidence: externalEvidenceStateSchema.parse({
      ...source.external_evidence,
      status: retryable ? "BLOCKED_RETRYABLE" : "BOUNDED_NONRETRYABLE",
      claim_local_limitation_hashes: unique([
        ...source.external_evidence.claim_local_limitation_hashes.filter((hash) =>
          !replacedLimitationHashes.has(hash)
        ),
        limitationHash
      ]),
      claim_local_limitations: [
        ...source.external_evidence.claim_local_limitations.filter(({ claim_id }) =>
          claim_id !== limitation.claim_id
        ),
        limitation
      ],
      possible_decision_impact: "unknown"
    }),
    claim_capability: claimCapabilityStateSchema.parse({
      status: retryable ? "EXTERNAL_AUDIT_PENDING" : "BOUNDED_ONLY",
      ...(source.claim_capability.capability_digest === undefined
        ? {}
        : { capability_digest: source.claim_capability.capability_digest }),
      ...(source.method_audit.audit_sha256 === undefined
        ? {}
        : { method_audit_sha256: source.method_audit.audit_sha256 }),
      unrestricted_decision_use: false
    })
  });
}

export function ingestResearchSourceExternalEvidence(
  rawState: ResearchFormalEvidenceState,
  sessionId: string,
  sourceId: string,
  rawOutput: StudyExternalEvidenceAuditOutput,
  receiptSecret: string,
  protocolIdentities: StudyExternalEvidenceProtocolTuple
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const source = decisionSource(state, sourceId);
  if (
    source.method_audit.status !== "COMPLETE" ||
    source.identity.doi === undefined
  ) {
    throw new Error("External evidence cannot precede exact DOI method audit");
  }
  const output = studyExternalEvidenceAuditOutputSchema.parse(rawOutput);
  if (output.study_identity.doi !== source.identity.doi) {
    throw new Error("External evidence identity does not match the formal source DOI");
  }
  const expectedProtocols = protocolIdentities;
  verifyStudyExternalEvidenceReceipt(output.receipt, {
    sessionId,
    studyIdentityHash: output.study_identity.identity_hash,
    protocolIdentities: expectedProtocols,
    providerAttempts: output.bundle.provider_attempts,
    providerArtifacts: output.provider_artifacts,
    bundleHash: output.bundle.bundle_hash
  }, receiptSecret);
  const mandatory = output.bundle.provider_attempts.filter(({ provider }) =>
    provider === "crossref" || provider === "forrt"
  );
  if (
    mandatory.length !== 2 ||
    new Set(mandatory.map(({ provider }) => provider)).size !== 2
  ) {
    throw new Error("External evidence requires unique Crossref and FORRT attempts");
  }
  const linkedWork = deriveLinkedWork(output);
  const excluded = output.bundle.controller_directives.some(({ directive }) =>
    directive === "exclude_source_from_effect_claims"
  );
  const providerAttemptHashes = output.bundle.provider_attempts.map((attempt) =>
    sha256(canonicalJson(attempt))
  );
  const status = externalStatus(output.status);
  let next = replaceSource(state, sourceId, {
    ...source,
    identity: sourceIdentitySchema.parse({
      ...source.identity,
      title: output.study_identity.title ?? source.identity.title,
      first_author: output.study_identity.first_author ?? source.identity.first_author,
      year: output.study_identity.year ?? source.identity.year,
      identity_status: "EXTERNAL_VERIFIED",
      identity_hash: output.study_identity.identity_hash
    }),
    external_evidence: externalEvidenceStateSchema.parse({
      status,
      study_identity_hash: output.study_identity.identity_hash,
      receipt_payload_sha256: output.receipt.receipt_payload_sha256,
      bundle_hash: output.bundle.bundle_hash,
      provider_attempt_hashes: providerAttemptHashes,
      provider_coverage: output.bundle.provider_attempts.map((attempt) => ({
        provider: attempt.provider,
        provider_outcome: attempt.provider_outcome,
        access_status: attempt.access_status,
        attempt_sha256: sha256(canonicalJson(attempt))
      })),
      publication_integrity: {
        record_state: output.bundle.publication_integrity.record_state,
        events: output.bundle.publication_integrity.events.map(({ event_kind, event_hash }) => ({
          event_kind,
          event_hash
        }))
      },
      controller_directives: output.bundle.controller_directives.map(({ directive, source_item_hash }) => ({
        directive,
        source_item_hash
      })),
      unresolved_item_hashes: output.bundle.unresolved_items.map((item) =>
        sha256(JSON.stringify(item))
      ),
      claim_local_limitation_hashes: output.bundle.claim_local_limitations.map((item) =>
        sha256(JSON.stringify(item))
      ),
      claim_local_limitations: output.bundle.claim_local_limitations,
      linked_work: linkedWork,
      possible_decision_impact: maximumImpact(output.bundle.unresolved_items.map((item) =>
        item.possible_decision_impact
      )),
      effect_claims_excluded: excluded
    }),
    claim_capability: derivePostExternalClaimCapability(source, output, linkedWork)
  });
  next = materializeLinkedFormalSources(next, sourceId, output);
  return next;
}

export function deriveFormalEvidenceDiagnostics(
  rawState: ResearchFormalEvidenceState
): FormalEvidenceDiagnostics {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const decisionSources = state.sources.filter(({ decision_importance }) =>
    decision_importance === "DECISION_IMPORTANT"
  );
  return formalEvidenceDiagnosticsSchema.parse({
    hypotheses: state.hypotheses.length,
    hypotheses_search_complete: state.hypotheses.filter((hypothesis) =>
      hypothesis.provider_searches.every(({ status }) =>
        status === "COMPLETE" || status === "BLOCKED_TERMINAL"
      )
    ).length,
    sources: state.sources.length,
    sources_screening_pending: state.sources.filter(({ screening_status }) =>
      screening_status === "PENDING"
    ).length,
    decision_important_sources: decisionSources.length,
    full_text_exhausted: decisionSources.filter(({ full_text }) =>
      full_text.status === "EXHAUSTED"
    ).length,
    unseen_source_leads: decisionSources.filter(({ full_text }) =>
      full_text.status === "LEAD_BOUNDARY"
    ).length,
    method_audits_complete: decisionSources.filter(({ method_audit }) =>
      method_audit.status === "COMPLETE"
    ).length,
    external_audits_complete: decisionSources.filter(({ external_evidence }) =>
      external_evidence.status === "COMPLETE" ||
      external_evidence.status === "NOT_APPLICABLE"
    ).length,
    linked_work_open: decisionSources.flatMap(({ external_evidence }) =>
      external_evidence.linked_work
    ).filter(({ status }) => status === "NOT_STARTED" || status === "IN_PROGRESS" ||
      status === "BLOCKED_RETRYABLE").length,
    claim_capabilities_current: decisionSources.filter(({ claim_capability }) =>
      claim_capability.status === "CURRENT"
    ).length,
    unrestricted_decision_sources: decisionSources.filter(({ claim_capability }) =>
      claim_capability.unrestricted_decision_use
    ).length
  });
}

export function reconcileFormalEvidenceLinkedWork(
  rawState: ResearchFormalEvidenceState
): ResearchFormalEvidenceState {
  let state = researchFormalEvidenceStateSchema.parse(rawState);
  const sourceIds = state.sources.map(({ source_id }) => source_id);
  for (const sourceId of sourceIds) {
    const source = state.sources.find((item) => item.source_id === sourceId)!;
    if (source.external_evidence.linked_work.length === 0) continue;
    const linkedWork = source.external_evidence.linked_work.map((work) => {
      if (work.linked_source_id === undefined) return work;
      const linked = state.sources.find(({ source_id }) => source_id === work.linked_source_id);
      if (linked === undefined) throw new Error("Linked formal source identity disappeared");
      const status = linked.claim_capability.status === "CURRENT" ||
        linked.claim_capability.status === "EFFECT_CLAIMS_EXCLUDED"
        ? "COMPLETE" as const
        : linked.claim_capability.status === "UNAVAILABLE_UNSEEN_SOURCE" ||
            linked.claim_capability.status === "BOUNDED_ONLY"
          ? "BOUNDED" as const
          : linked.full_text.status === "BLOCKED_RETRYABLE" ||
              linked.external_evidence.status === "BLOCKED_RETRYABLE"
            ? "BLOCKED_RETRYABLE" as const
            : "IN_PROGRESS" as const;
      return linkedWorkSchema.parse({ ...work, status });
    });
    const open = linkedWork.some(({ status }) =>
      status === "NOT_STARTED" || status === "IN_PROGRESS" ||
      status === "BLOCKED_RETRYABLE"
    );
    const bounded = linkedWork.some(({ status }) => status === "BOUNDED");
    let claimCapability = source.claim_capability;
    if (claimCapability.status !== "EFFECT_CLAIMS_EXCLUDED") {
      if (open) {
        claimCapability = { ...claimCapability, status: "LINKED_WORK_REQUIRED", unrestricted_decision_use: false };
      } else if (bounded) {
        claimCapability = { ...claimCapability, status: "BOUNDED_ONLY", unrestricted_decision_use: false };
      } else if (claimCapability.status === "LINKED_WORK_REQUIRED") {
        claimCapability = source.external_evidence.status === "COMPLETE"
          ? {
            ...claimCapability,
            status: "RECALCULATION_REQUIRED",
            unrestricted_decision_use: false
          }
          : {
            ...claimCapability,
            status: "BOUNDED_ONLY",
            unrestricted_decision_use: false
          };
      }
    }
    state = replaceSource(state, sourceId, {
      ...source,
      external_evidence: externalEvidenceStateSchema.parse({
        ...source.external_evidence,
        linked_work: linkedWork
      }),
      claim_capability: claimCapabilityStateSchema.parse(claimCapability)
    });
  }
  return state;
}

export async function recalculateResearchSourceClaimCapability(
  rawState: ResearchFormalEvidenceState,
  input: {
    sessionId: string;
    sourceId: string;
    submission: StudyMethodAuditExternalSubmission;
    executor: OpenFullTextExecutor;
    externalAudit: StudyExternalEvidenceAuditOutput;
    receiptSecret: string;
  }
): Promise<ResearchFormalEvidenceState> {
  const state = reconcileFormalEvidenceLinkedWork(rawState);
  const source = decisionSource(state, input.sourceId);
  if (
    source.claim_capability.status !== "RECALCULATION_REQUIRED" ||
    source.full_text.status !== "EXHAUSTED" ||
    source.method_audit.status !== "COMPLETE" ||
    source.external_evidence.status !== "COMPLETE" ||
    input.externalAudit.status !== "complete" ||
    source.external_evidence.receipt_payload_sha256 === undefined
  ) {
    throw new Error("Claim capability recalculation requires completed linked work and the exact current source/external receipts");
  }
  const referencedExternalItems = new Set(input.submission.domain_findings.flatMap((finding) =>
    finding.external_evidence_references.map(({ item_hash }) => item_hash)
  ));
  const missingDirective = source.external_evidence.controller_directives.find(({ source_item_hash }) =>
    !referencedExternalItems.has(source_item_hash)
  );
  if (missingDirective !== undefined) {
    throw new Error("Claim capability recalculation omitted required external-evidence work or coverage");
  }
  const output = await input.executor.validateExternalStudyAudit({
    document_handle: source.full_text.document_handle!,
    audit: input.submission,
    external_audit: input.externalAudit,
    expected: {
      session_id: input.sessionId,
      protocol_identities: input.externalAudit.receipt.protocol_identities
    },
    receipt_secret: input.receiptSecret
  });
  const receipt = studyMethodExternalAuditOutputSchema.parse(output).audit_receipt;
  if (
    output.coverage_receipt.document_handle !== source.full_text.document_handle ||
    output.coverage_receipt.source_content_sha256 !== source.full_text.source_content_sha256 ||
    receipt.source_primary_identifier !== source.full_text.source_primary_identifier ||
    receipt.source_content_sha256 !== source.full_text.source_content_sha256 ||
    receipt.external_evidence_binding.external_receipt_payload_sha256 !==
      source.external_evidence.receipt_payload_sha256 ||
    receipt.external_evidence_binding.bundle_hash !== source.external_evidence.bundle_hash ||
    receipt.external_evidence_binding.study_identity_hash !==
      source.external_evidence.study_identity_hash
  ) {
    throw new Error("Recalculated claim capability is bound to stale or mismatched source/external evidence");
  }
  const capabilityDigest = sha256(JSON.stringify(receipt.claim_capabilities));
  return replaceSource(state, source.source_id, {
    ...source,
    method_audit: methodAuditStateSchema.parse({
      ...source.method_audit,
      external_receipt_payload_sha256:
        receipt.external_evidence_binding.external_receipt_payload_sha256,
      external_bound_audit_sha256: receipt.audit_sha256
    }),
    claim_capability: claimCapabilityStateSchema.parse({
      status: "CURRENT",
      capability_digest: capabilityDigest,
      method_audit_sha256: receipt.audit_sha256,
      external_receipt_payload_sha256:
        receipt.external_evidence_binding.external_receipt_payload_sha256,
      unrestricted_decision_use: true
    })
  });
}

export function deriveFormalEvidenceOperationStatus(
  rawState: ResearchFormalEvidenceState,
  capability:
    | "formal_evidence_search"
    | "accessible_full_text_acquisition"
    | "study_method_audit"
    | "external_study_evidence_audit"
    | "linked_replication_and_review_audit"
    | "claim_capability_recalculation"
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED_RETRYABLE" | "BLOCKED_TERMINAL" {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  if (capability === "formal_evidence_search") {
    if (state.hypotheses.length === 0) return "NOT_STARTED";
    if (state.hypotheses.some((hypothesis) => hypothesis.provider_searches.some(({ status }) =>
      status === "BLOCKED_RETRYABLE"
    ))) return "BLOCKED_RETRYABLE";
    if (!formalEvidenceScreeningComplete(state)) return "IN_PROGRESS";
    return state.hypotheses.some((hypothesis) => hypothesis.provider_searches.some(({ status }) =>
      status === "BLOCKED_TERMINAL"
    )) ? "BLOCKED_TERMINAL" : "COMPLETE";
  }
  const sources = state.sources.filter(({ decision_importance }) =>
    decision_importance === "DECISION_IMPORTANT"
  );
  if (sources.length === 0) return formalEvidenceScreeningComplete(state) ? "COMPLETE" : "NOT_STARTED";
  if (capability === "accessible_full_text_acquisition") {
    return aggregateStatuses(sources.map(({ full_text }) => full_text.status), {
      complete: ["EXHAUSTED", "LEAD_BOUNDARY", "NOT_APPLICABLE"],
      retryable: ["BLOCKED_RETRYABLE"],
      terminal: []
    });
  }
  if (capability === "study_method_audit") {
    return aggregateStatuses(sources.map(({ method_audit }) => method_audit.status), {
      complete: ["COMPLETE", "BOUNDARY", "NOT_APPLICABLE"],
      retryable: [],
      terminal: ["INVALIDATED"]
    });
  }
  if (capability === "external_study_evidence_audit") {
    return aggregateStatuses(sources.map(({ external_evidence }) => external_evidence.status), {
      complete: ["COMPLETE", "PARTIAL", "BOUNDED_NONRETRYABLE", "NOT_APPLICABLE"],
      retryable: ["BLOCKED_RETRYABLE"],
      terminal: []
    });
  }
  if (capability === "linked_replication_and_review_audit") {
    const linked = sources.flatMap(({ external_evidence }) => external_evidence.linked_work);
    if (linked.length === 0) return "COMPLETE";
    return aggregateStatuses(linked.map(({ status }) => status), {
      complete: ["COMPLETE", "BOUNDED"],
      retryable: ["BLOCKED_RETRYABLE"],
      terminal: []
    });
  }
  return aggregateStatuses(sources.map(({ claim_capability }) => claim_capability.status), {
    complete: ["CURRENT", "EFFECT_CLAIMS_EXCLUDED", "NOT_APPLICABLE"],
    retryable: [],
    terminal: ["UNAVAILABLE_UNSEEN_SOURCE", "BOUNDED_ONLY"]
  });
}

export function formalEvidenceFrontierDigest(
  rawState: ResearchFormalEvidenceState
): string {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  return sha256(JSON.stringify({
    candidate_screening_digest: state.candidate_screening_digest,
    hypothesis_frontier_digest: state.hypothesis_frontier_digest,
    hypotheses: state.hypotheses,
    sources: state.sources.map((source) => ({
      source_id: source.source_id,
      hypothesis_ids: source.hypothesis_ids,
      origins: source.origins,
      identity: source.identity,
      abstract_visibility: source.abstract_visibility
    }))
  }));
}

function materialHypothesisGroups(candidates: ResearchCandidateRecord[]): ResearchCandidateRecord[][] {
  const groups = new Map<string, ResearchCandidateRecord[]>();
  for (const candidate of candidates.filter(({ materiality }) => materiality === "MATERIAL")) {
    const undescribed = candidate.program_description_status === "NOT_DESCRIBED";
    const key = undescribed
      ? `${candidate.program_signature}:${candidate.video_id}:${candidate.provisional_claim_summary}`
      : candidate.program_signature;
    const values = groups.get(key) ?? [];
    values.push(candidate);
    groups.set(key, values);
  }
  return [...groups.values()].sort((left, right) =>
    left[0]!.video_id.localeCompare(right[0]!.video_id)
  );
}

function formalHypothesis(
  candidates: ResearchCandidateRecord[],
  researchTarget: string
): z.output<typeof formalHypothesisSchema> {
  const first = candidates[0]!;
  const sourceVideoIds = candidates.map(({ video_id }) => video_id).sort();
  const core = {
    source_video_ids: sourceVideoIds,
    program_signature: first.program_signature,
    treatment_class: first.provisional_treatment_class,
    claim_summary: first.provisional_claim_summary,
    program: first.program,
    formal_query: formalQuery(researchTarget, first)
  };
  const hypothesisDigest = sha256(JSON.stringify(core));
  return formalHypothesisSchema.parse({
    ...core,
    hypothesis_id: sha256(`formal-hypothesis:${hypothesisDigest}`),
    hypothesis_digest: hypothesisDigest,
    provider_searches: FORMAL_EVIDENCE_PROVIDERS.map((provider) => ({
      provider,
      query: core.formal_query,
      status: "NOT_STARTED",
      pages_retrieved: 0,
      records_returned_cumulative: 0,
      page_receipt_hashes: [],
      access_statuses: [],
      limitations: []
    }))
  });
}

function formalHypothesisFrontierDigest(
  candidateScreeningDigest: string,
  hypotheses: readonly z.output<typeof formalHypothesisSchema>[]
): string {
  return sha256(JSON.stringify({
    screeningDigest: candidateScreeningDigest,
    hypotheses: hypotheses.map((hypothesis) => ({
      ...formalHypothesisCore(hypothesis),
      hypothesis_id: hypothesis.hypothesis_id,
      hypothesis_digest: hypothesis.hypothesis_digest
    }))
  }));
}

function formalHypothesisCore(
  hypothesis: z.output<typeof formalHypothesisSchema>
): Omit<z.output<typeof formalHypothesisSchema>, "hypothesis_id" | "hypothesis_digest" | "provider_searches"> {
  return {
    source_video_ids: hypothesis.source_video_ids,
    program_signature: hypothesis.program_signature,
    treatment_class: hypothesis.treatment_class,
    claim_summary: hypothesis.claim_summary,
    program: hypothesis.program,
    formal_query: hypothesis.formal_query
  };
}

function formalQuery(researchTarget: string, candidate: ResearchCandidateRecord): string {
  const values = [
    researchTarget,
    candidate.provisional_treatment_class,
    candidate.program.components,
    candidate.program.stage_or_baseline,
    candidate.program.outcome,
    candidate.program.horizon
  ].map((value) => value.trim()).filter((value, index, all) =>
    value.length > 0 && value !== "program not described" && all.indexOf(value) === index
  );
  return values.join(" ").slice(0, 5_000);
}

async function executePubmedSearchPage(
  state: ResearchFormalEvidenceState,
  hypothesisId: string,
  executors: FormalSearchExecutors
): Promise<ResearchFormalEvidenceState> {
  const search = providerSearch(state, hypothesisId, "pubmed");
  const envelope = await executors.searchPubmed({
    query: search.query,
    pageSize: 100,
    ...(search.next_cursor === undefined ? {} : { cursor: search.next_cursor })
  }, executors.pubmedConfig);
  const records = await Promise.all(envelope.data.map(async ({ pmid: identifier }) => ({
    identifier,
    envelope: await executors.fetchPubmedRecord(identifier, executors.pubmedConfig)
  })));
  let next = state;
  for (const record of records) {
    next = ingestPubmedSource(next, hypothesisId, record.identifier, record.envelope);
  }
  return recordFormalProviderPage(next, hypothesisId, "pubmed", envelope);
}

async function executeEuropePmcSearchPage(
  state: ResearchFormalEvidenceState,
  hypothesisId: string,
  executors: FormalSearchExecutors
): Promise<ResearchFormalEvidenceState> {
  const search = providerSearch(state, hypothesisId, "europe_pmc");
  const envelope = await executors.searchEuropePmc({
    query: search.query,
    pageSize: 100,
    ...(search.next_cursor === undefined ? {} : { cursor: search.next_cursor })
  });
  let next = state;
  for (const record of envelope.data) {
    next = ingestEuropePmcSource(next, hypothesisId, record, envelope.access_status);
  }
  return recordFormalProviderPage(next, hypothesisId, "europe_pmc", envelope);
}

function recordFormalProviderPage(
  rawState: ResearchFormalEvidenceState,
  hypothesisId: string,
  provider: typeof FORMAL_EVIDENCE_PROVIDERS[number],
  envelope: ProvenanceEnvelope<unknown[]>
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const hypothesisIndex = state.hypotheses.findIndex(({ hypothesis_id }) =>
    hypothesis_id === hypothesisId
  );
  if (hypothesisIndex < 0) throw new Error("Unknown formal-search hypothesis");
  const hypothesis = state.hypotheses[hypothesisIndex]!;
  const searchIndex = hypothesis.provider_searches.findIndex((item) => item.provider === provider);
  const before = hypothesis.provider_searches[searchIndex]!;
  if (before.status === "COMPLETE" || before.status === "BLOCKED_TERMINAL") {
    throw new Error("Completed formal provider search is immutable");
  }
  const error = envelope.error;
  const nextCursor = envelope.pagination.next_cursor;
  const status = error !== undefined
    ? error.retryable ? "BLOCKED_RETRYABLE" as const : "BLOCKED_TERMINAL" as const
    : envelope.access_status === "partial" && envelope.pagination.exhausted
      ? "BLOCKED_TERMINAL" as const
      : envelope.pagination.exhausted
        ? "COMPLETE" as const
        : "IN_PROGRESS" as const;
  const boundary = status === "BLOCKED_RETRYABLE" || status === "BLOCKED_TERMINAL"
    ? {
      classification: status === "BLOCKED_RETRYABLE"
        ? "RETRYABLE" as const
        : "TERMINAL_NONRETRYABLE" as const,
      code: error !== undefined
        ? `FORMAL_${provider.toUpperCase()}_${error.code.replace(/[^A-Za-z0-9]+/gu, "_").toUpperCase()}`.slice(0, 80)
        : "FORMAL_PROVIDER_RESULT_LIMIT",
      summary: error?.message ??
        "The exact provider query reached a provider result boundary; unseen records were not treated as evidence."
    }
    : undefined;
  const receiptHash = sha256(JSON.stringify({
    provider,
    query: envelope.query,
    primary_identifier: envelope.primary_identifier,
    access_status: envelope.access_status,
    pagination: envelope.pagination,
    limitations: envelope.limitations,
    error: envelope.error,
    data: envelope.data
  }));
  const updated = formalProviderSearchSchema.parse({
    ...before,
    status,
    pages_retrieved: before.pages_retrieved + 1,
    records_returned_cumulative: before.records_returned_cumulative + envelope.data.length,
    ...(nextCursor === undefined || status !== "IN_PROGRESS" ? {} : { next_cursor: nextCursor }),
    page_receipt_hashes: [...before.page_receipt_hashes, receiptHash],
    access_statuses: [...before.access_statuses, envelope.access_status],
    limitations: unique([...before.limitations, ...envelope.limitations]),
    ...(boundary === undefined ? {} : { boundary })
  });
  const hypotheses = [...state.hypotheses];
  const searches = [...hypothesis.provider_searches] as [
    z.output<typeof formalProviderSearchSchema>,
    z.output<typeof formalProviderSearchSchema>
  ];
  searches[searchIndex] = updated;
  hypotheses[hypothesisIndex] = formalHypothesisSchema.parse({
    ...hypothesis,
    provider_searches: searches
  });
  return researchFormalEvidenceStateSchema.parse({ ...state, hypotheses });
}

function ingestPubmedSource(
  state: ResearchFormalEvidenceState,
  hypothesisId: string,
  identifier: string,
  envelope: ProvenanceEnvelope<PubmedRecord>
): ResearchFormalEvidenceState {
  const record = envelope.data;
  const normalizedDoi = record.doi === undefined ? undefined : normalizeDoiIdentifier(record.doi);
  const identity = sourceIdentity({
    ...(normalizedDoi === undefined ? {} : { doi: normalizedDoi }),
    pmid: identifier,
    ...(record.title === undefined ? {} : { title: record.title }),
    ...(record.authors?.[0] === undefined ? {} : { first_author: record.authors[0] }),
    ...(publicationYear(record) === undefined ? {} : { year: publicationYear(record) }),
    identity_status: envelope.error === undefined ? "PROVIDER_REPORTED" : "UNRESOLVED"
  });
  return upsertFormalSource(state, {
    hypothesisId,
    identity,
    origin: {
      provider: "pubmed",
      provider_record_id: identifier,
      canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${identifier}/`,
      provider_access_status: envelope.access_status,
      source_record_hash: sha256(JSON.stringify(envelope))
    },
    abstractVisibility: record.abstract === undefined
      ? envelope.error === undefined ? "ABSTRACT_NOT_REPORTED" : "METADATA_ONLY"
      : "ABSTRACT_PRESENT"
  });
}

function ingestEuropePmcSource(
  state: ResearchFormalEvidenceState,
  hypothesisId: string,
  record: EuropePmcRecord,
  accessStatus: string
): ResearchFormalEvidenceState {
  const normalizedDoi = record.doi === undefined ? undefined : normalizeDoiIdentifier(record.doi);
  const identity = sourceIdentity({
    ...(normalizedDoi === undefined ? {} : { doi: normalizedDoi }),
    ...(record.pmid === undefined ? {} : { pmid: record.pmid }),
    ...(record.pmcid === undefined ? {} : { pmcid: record.pmcid.toUpperCase() }),
    ...(record.title === undefined ? {} : { title: record.title }),
    ...(record.authors?.[0] === undefined ? {} : { first_author: record.authors[0] }),
    ...(record.year === undefined || !/^\d{4}$/u.test(record.year)
      ? {}
      : { year: Number(record.year) }),
    identity_status: "PROVIDER_REPORTED"
  });
  const canonicalUrl = record.pmcid !== undefined
    ? `https://europepmc.org/article/PMC/${record.pmcid.replace(/^PMC/u, "")}`
    : `https://europepmc.org/article/${record.source}/${record.id}`;
  return upsertFormalSource(state, {
    hypothesisId,
    identity,
    origin: {
      provider: "europe_pmc",
      provider_record_id: `${record.source}:${record.id}`,
      canonical_url: canonicalUrl,
      provider_access_status: accessStatus,
      source_record_hash: sha256(JSON.stringify(record))
    },
    abstractVisibility: "METADATA_ONLY"
  });
}

function upsertFormalSource(
  rawState: ResearchFormalEvidenceState,
  input: {
    hypothesisId: string;
    identity: z.output<typeof sourceIdentitySchema>;
    origin: Omit<z.output<typeof sourceOriginSchema>, "hypothesis_ids">;
    abstractVisibility: z.output<typeof formalSourceSchema>["abstract_visibility"];
  }
): ResearchFormalEvidenceState {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const match = state.sources.find((source) => identitiesOverlap(source.identity, input.identity));
  const origin = sourceOriginSchema.parse({
    ...input.origin,
    hypothesis_ids: [input.hypothesisId]
  });
  if (match === undefined) {
    const sourceId = sha256(`formal-source:${identityKey(input.identity)}`);
    const source = formalSourceSchema.parse({
      source_id: sourceId,
      hypothesis_ids: [input.hypothesisId],
      origins: [origin],
      identity: input.identity,
      source_kind: "UNASSESSED",
      abstract_visibility: input.abstractVisibility,
      screening_status: "PENDING",
      decision_importance: "UNASSESSED",
      possible_decision_impact: "unknown",
      full_text: initialFullText(),
      method_audit: notApplicableMethodAudit(),
      external_evidence: notApplicableExternalEvidence(),
      claim_capability: notApplicableClaimCapability()
    });
    return researchFormalEvidenceStateSchema.parse({
      ...state,
      sources: [...state.sources, source].sort((left, right) =>
        left.source_id.localeCompare(right.source_id)
      )
    });
  }
  const origins = mergeOrigins(match.origins, origin);
  const mergedIdentity = mergeIdentity(match.identity, input.identity);
  const source = formalSourceSchema.parse({
    ...match,
    hypothesis_ids: unique([...match.hypothesis_ids, input.hypothesisId]).sort(),
    origins,
    identity: mergedIdentity,
    abstract_visibility: match.abstract_visibility === "ABSTRACT_PRESENT" ||
      input.abstractVisibility === "ABSTRACT_PRESENT"
      ? "ABSTRACT_PRESENT"
      : match.abstract_visibility === "ABSTRACT_NOT_REPORTED" ||
          input.abstractVisibility === "ABSTRACT_NOT_REPORTED"
        ? "ABSTRACT_NOT_REPORTED"
        : "METADATA_ONLY"
  });
  return replaceSource(state, match.source_id, source);
}

function providerSearch(
  state: ResearchFormalEvidenceState,
  hypothesisId: string,
  provider: typeof FORMAL_EVIDENCE_PROVIDERS[number]
) {
  const hypothesis = state.hypotheses.find(({ hypothesis_id }) => hypothesis_id === hypothesisId);
  const search = hypothesis?.provider_searches.find((item) => item.provider === provider);
  if (search === undefined) throw new Error("Unknown formal provider search");
  return search;
}

function formalSearchProvidersTerminal(state: ResearchFormalEvidenceState): boolean {
  return state.hypotheses.length > 0 && state.hypotheses.every((hypothesis) =>
    hypothesis.provider_searches.every(({ status }) =>
      status === "COMPLETE" || status === "BLOCKED_TERMINAL"
    )
  );
}

function decisionSource(state: ResearchFormalEvidenceState, sourceId: string): ResearchFormalSource {
  const source = state.sources.find(({ source_id }) => source_id === sourceId);
  if (source === undefined) throw new Error("Unknown formal source");
  if (source.decision_importance !== "DECISION_IMPORTANT") {
    throw new Error("Formal source was not selected as decision-important");
  }
  return source;
}

function replaceSource(
  state: ResearchFormalEvidenceState,
  sourceId: string,
  source: ResearchFormalSource
): ResearchFormalEvidenceState {
  const index = state.sources.findIndex(({ source_id }) => source_id === sourceId);
  if (index < 0) throw new Error("Unknown formal source");
  const sources = [...state.sources];
  sources[index] = formalSourceSchema.parse(source);
  return researchFormalEvidenceStateSchema.parse({ ...state, sources });
}

function sourceIdentity(input: Omit<z.input<typeof sourceIdentitySchema>, "identity_hash">) {
  const core = { ...input };
  return sourceIdentitySchema.parse({
    ...core,
    identity_hash: sha256(JSON.stringify(core))
  });
}

function mergeIdentity(
  left: z.output<typeof sourceIdentitySchema>,
  right: z.output<typeof sourceIdentitySchema>
) {
  const statusRank = {
    UNRESOLVED: 0,
    PROVIDER_REPORTED: 1,
    CONTENT_VERIFIED: 2,
    EXTERNAL_VERIFIED: 3
  } as const;
  return sourceIdentity({
    ...(left.doi ?? right.doi) === undefined ? {} : { doi: left.doi ?? right.doi },
    ...(left.pmid ?? right.pmid) === undefined ? {} : { pmid: left.pmid ?? right.pmid },
    ...(left.pmcid ?? right.pmcid) === undefined ? {} : { pmcid: left.pmcid ?? right.pmcid },
    ...(left.title ?? right.title) === undefined ? {} : { title: left.title ?? right.title },
    ...(left.first_author ?? right.first_author) === undefined
      ? {}
      : { first_author: left.first_author ?? right.first_author },
    ...(left.year ?? right.year) === undefined ? {} : { year: left.year ?? right.year },
    ...(left.version ?? right.version) === undefined ? {} : { version: left.version ?? right.version },
    identity_status: statusRank[left.identity_status] >= statusRank[right.identity_status]
      ? left.identity_status
      : right.identity_status
  });
}

function contentVerifiedIdentity(
  identity: z.output<typeof sourceIdentitySchema>,
  source: z.output<typeof availableOpenFullTextActionOutputSchema>["source"]
) {
  return sourceIdentity({
    ...identity,
    ...(source.doi === undefined ? {} : { doi: source.doi }),
    ...(source.pmid === undefined ? {} : { pmid: source.pmid }),
    ...(source.pmcid === undefined ? {} : { pmcid: source.pmcid }),
    ...(source.title === undefined ? {} : { title: source.title }),
    ...(source.version === undefined ? {} : { version: source.version }),
    identity_status: "CONTENT_VERIFIED"
  });
}

function identitiesOverlap(
  left: z.output<typeof sourceIdentitySchema>,
  right: z.output<typeof sourceIdentitySchema>
): boolean {
  return left.doi !== undefined && left.doi === right.doi ||
    left.pmid !== undefined && left.pmid === right.pmid ||
    left.pmcid !== undefined && left.pmcid === right.pmcid;
}

function identityKey(identity: z.output<typeof sourceIdentitySchema>): string {
  return identity.doi === undefined
    ? identity.pmid === undefined
      ? identity.pmcid === undefined
        ? `title:${identity.title ?? identity.identity_hash}`
        : `pmcid:${identity.pmcid}`
      : `pmid:${identity.pmid}`
    : `doi:${identity.doi}`;
}

function mergeOrigins(
  left: z.output<typeof sourceOriginSchema>[],
  right: z.output<typeof sourceOriginSchema>
) {
  const match = left.find((origin) =>
    origin.provider === right.provider &&
    origin.provider_record_id === right.provider_record_id
  );
  if (match === undefined) return [...left, right].sort((a, b) =>
    `${a.provider}:${a.provider_record_id}`.localeCompare(`${b.provider}:${b.provider_record_id}`)
  );
  return left.map((origin) => origin === match
    ? sourceOriginSchema.parse({
      ...origin,
      hypothesis_ids: unique([...origin.hypothesis_ids, ...right.hypothesis_ids]).sort()
    })
    : origin);
}

function publicationYear(record: PubmedRecord): number | undefined {
  const year = record.dates?.map(({ value }) => value.match(/\b(1[6-9]\d{2}|20\d{2}|2\d{3})\b/u)?.[1])
    .find((value) => value !== undefined);
  return year === undefined ? undefined : Number(year);
}

function initialFullText(): z.output<typeof fullTextStateSchema> {
  return {
    status: "NOT_STARTED",
    discovery_attempts: [],
    source_segments_retrieved_cumulative: 0,
    synthesis_lock: "fail",
    unseen_content_used_as_evidence: false
  };
}

function notApplicableFullText(): z.output<typeof fullTextStateSchema> {
  return { ...initialFullText(), status: "NOT_APPLICABLE" };
}

function initialMethodAudit(kind: z.output<typeof formalSourceSchema>["source_kind"]): z.output<typeof methodAuditStateSchema> {
  return {
    status: "NOT_STARTED",
    audit_kind: kind === "SCIENTIFIC_STUDY"
      ? "STUDY"
      : kind === "SYSTEMATIC_REVIEW" || kind === "GUIDELINE" || kind === "OTHER"
        ? "REVIEW"
        : kind === "PUBLICATION_NOTICE"
          ? "NOTICE"
          : "NOT_APPLICABLE"
  };
}

function boundaryMethodAudit(kind: z.output<typeof formalSourceSchema>["source_kind"]): z.output<typeof methodAuditStateSchema> {
  return { status: "BOUNDARY", audit_kind: initialMethodAudit(kind).audit_kind };
}

function notApplicableMethodAudit(): z.output<typeof methodAuditStateSchema> {
  return { status: "NOT_APPLICABLE", audit_kind: "NOT_APPLICABLE" };
}

function initialExternalEvidence(kind: z.output<typeof formalSourceSchema>["source_kind"]): z.output<typeof externalEvidenceStateSchema> {
  return {
    status: kind === "SCIENTIFIC_STUDY" ? "NOT_STARTED" : "NOT_APPLICABLE",
    provider_attempt_hashes: [],
    provider_coverage: [],
    controller_directives: [],
    unresolved_item_hashes: [],
    claim_local_limitation_hashes: [],
    claim_local_limitations: [],
    linked_work: [],
    possible_decision_impact: "detail_only",
    effect_claims_excluded: false
  };
}

function notApplicableExternalEvidence(): z.output<typeof externalEvidenceStateSchema> {
  return { ...initialExternalEvidence("OTHER"), status: "NOT_APPLICABLE" };
}

function boundaryExternalEvidence(kind: z.output<typeof formalSourceSchema>["source_kind"]): z.output<typeof externalEvidenceStateSchema> {
  return {
    ...initialExternalEvidence(kind),
    status: kind === "SCIENTIFIC_STUDY" ? "BOUNDED_NONRETRYABLE" : "NOT_APPLICABLE",
    possible_decision_impact: "unknown"
  };
}

function initialClaimCapability(kind: z.output<typeof formalSourceSchema>["source_kind"]): z.output<typeof claimCapabilityStateSchema> {
  return {
    status: kind === "PUBLICATION_NOTICE" ? "METHOD_AUDIT_PENDING" : "METHOD_AUDIT_PENDING",
    unrestricted_decision_use: false
  };
}

function notApplicableClaimCapability(): z.output<typeof claimCapabilityStateSchema> {
  return { status: "NOT_APPLICABLE", unrestricted_decision_use: false };
}

function unseenClaimCapability(): z.output<typeof claimCapabilityStateSchema> {
  return { status: "UNAVAILABLE_UNSEEN_SOURCE", unrestricted_decision_use: false };
}

function externalStatus(status: StudyExternalEvidenceAuditOutput["status"]): z.output<typeof externalEvidenceStateSchema>["status"] {
  if (status === "complete") return "COMPLETE";
  if (status === "partial") return "PARTIAL";
  if (status === "blocked_retryable") return "BLOCKED_RETRYABLE";
  return "BOUNDED_NONRETRYABLE";
}

function materializeLinkedFormalSources(
  rawState: ResearchFormalEvidenceState,
  parentSourceId: string,
  output: StudyExternalEvidenceAuditOutput
): ResearchFormalEvidenceState {
  let state = researchFormalEvidenceStateSchema.parse(rawState);
  const parent = decisionSource(state, parentSourceId);
  const linkedIds = new Map<string, string>();
  for (const relationship of output.bundle.replication_relationships) {
    const linked = relationship.relation_direction === "original_to_repetition"
      ? relationship.repetition_identity
      : relationship.original_identity;
    if (linked.doi === undefined) continue;
    const result = upsertLinkedFormalSource(state, parent, {
      doi: linked.doi,
      pmid: linked.pmid,
      pmcid: linked.pmcid,
      title: linked.title,
      firstAuthor: linked.first_author,
      year: linked.year,
      identityHash: linked.identity_hash,
      sourceItemHash: relationship.relationship_hash,
      sourceKind: "SCIENTIFIC_STUDY",
      possibleDecisionImpact: "confidence_changing",
      rationale: "A server-verified external provider relationship made this exact linked study decision-important; its reported outcome remains unaudited."
    });
    state = result.state;
    linkedIds.set(relationship.relationship_hash, result.sourceId);
  }
  for (const event of output.bundle.publication_integrity.events) {
    if (event.notice_doi === null) continue;
    const result = upsertLinkedFormalSource(state, parent, {
      doi: event.notice_doi,
      identityHash: sha256(`notice-identity:${event.notice_doi}`),
      sourceItemHash: event.event_hash,
      sourceKind: "PUBLICATION_NOTICE",
      possibleDecisionImpact: event.event_kind === "correction" || event.event_kind === "update"
        ? "confidence_changing"
        : "potentially_conclusion_changing",
      rationale: `The exact ${event.event_kind.replaceAll("_", " ")} notice is required by server-owned publication-integrity state.`
    });
    state = result.state;
    linkedIds.set(event.event_hash, result.sourceId);
  }
  for (const link of output.bundle.review_ancestry) {
    if (link.review_identity.doi === undefined) continue;
    const review = link.review_identity;
    const reviewDoi = link.review_identity.doi;
    const result = upsertLinkedFormalSource(state, parent, {
      doi: reviewDoi,
      pmid: review.pmid,
      pmcid: review.pmcid,
      title: review.title,
      firstAuthor: review.first_author,
      year: review.year,
      identityHash: review.identity_hash,
      sourceItemHash: link.link_hash,
      sourceKind: "SYSTEMATIC_REVIEW",
      possibleDecisionImpact: "confidence_changing",
      rationale: "The exact linked review requires source acquisition and review-method audit; inclusion is not approval."
    });
    state = result.state;
    linkedIds.set(link.link_hash, result.sourceId);
  }
  const refreshedParent = decisionSource(state, parentSourceId);
  return replaceSource(state, parentSourceId, {
    ...refreshedParent,
    external_evidence: externalEvidenceStateSchema.parse({
      ...refreshedParent.external_evidence,
      linked_work: refreshedParent.external_evidence.linked_work.map((work) => {
        const linkedSourceId = linkedIds.get(work.source_item_hash);
        return linkedSourceId === undefined ? work : { ...work, linked_source_id: linkedSourceId };
      })
    })
  });
}

function upsertLinkedFormalSource(
  rawState: ResearchFormalEvidenceState,
  parent: ResearchFormalSource,
  input: {
    doi: string;
    pmid?: string;
    pmcid?: string;
    title?: string;
    firstAuthor?: string;
    year?: number;
    identityHash: string;
    sourceItemHash: string;
    sourceKind: "SCIENTIFIC_STUDY" | "SYSTEMATIC_REVIEW" | "PUBLICATION_NOTICE";
    possibleDecisionImpact: z.output<typeof formalSourceSchema>["possible_decision_impact"];
    rationale: string;
  }
): { state: ResearchFormalEvidenceState; sourceId: string } {
  const state = researchFormalEvidenceStateSchema.parse(rawState);
  const canonicalDoi = doi.parse(input.doi);
  const existing = state.sources.find((source) => source.identity.doi === canonicalDoi);
  const origin = sourceOriginSchema.parse({
    provider: "external_evidence",
    provider_record_id: input.sourceItemHash,
    canonical_url: `https://doi.org/${canonicalDoi}`,
    hypothesis_ids: parent.hypothesis_ids,
    provider_access_status: "metadata_only",
    source_record_hash: sha256(JSON.stringify(input))
  });
  if (existing !== undefined) {
    const upgraded = formalSourceSchema.parse({
      ...existing,
      hypothesis_ids: unique([...existing.hypothesis_ids, ...parent.hypothesis_ids]).sort(),
      origins: mergeOrigins(existing.origins, origin),
      source_kind: existing.source_kind === "UNASSESSED" ? input.sourceKind : existing.source_kind,
      screening_status: "SCREENED",
      decision_importance: "DECISION_IMPORTANT",
      possible_decision_impact: maximumImpact([
        existing.possible_decision_impact,
        input.possibleDecisionImpact
      ]),
      screening_rationale: existing.screening_rationale ?? input.rationale,
      full_text: existing.decision_importance === "DECISION_IMPORTANT"
        ? existing.full_text
        : initialFullText(),
      method_audit: existing.decision_importance === "DECISION_IMPORTANT"
        ? existing.method_audit
        : initialMethodAudit(input.sourceKind),
      external_evidence: existing.decision_importance === "DECISION_IMPORTANT"
        ? existing.external_evidence
        : initialExternalEvidence(input.sourceKind),
      claim_capability: existing.decision_importance === "DECISION_IMPORTANT"
        ? existing.claim_capability
        : initialClaimCapability(input.sourceKind)
    });
    return { state: replaceSource(state, existing.source_id, upgraded), sourceId: existing.source_id };
  }
  const sourceId = sha256(`formal-source:doi:${canonicalDoi}`);
  const identity = sourceIdentitySchema.parse({
    doi: canonicalDoi,
    ...(input.pmid === undefined ? {} : { pmid: input.pmid }),
    ...(input.pmcid === undefined ? {} : { pmcid: input.pmcid }),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.firstAuthor === undefined ? {} : { first_author: input.firstAuthor }),
    ...(input.year === undefined ? {} : { year: input.year }),
    identity_status: "PROVIDER_REPORTED",
    identity_hash: input.identityHash
  });
  const source = formalSourceSchema.parse({
    source_id: sourceId,
    hypothesis_ids: parent.hypothesis_ids,
    origins: [origin],
    identity,
    source_kind: input.sourceKind,
    abstract_visibility: "METADATA_ONLY",
    screening_status: "SCREENED",
    decision_importance: "DECISION_IMPORTANT",
    possible_decision_impact: input.possibleDecisionImpact,
    screening_rationale: input.rationale,
    full_text: initialFullText(),
    method_audit: initialMethodAudit(input.sourceKind),
    external_evidence: initialExternalEvidence(input.sourceKind),
    claim_capability: initialClaimCapability(input.sourceKind)
  });
  return {
    state: researchFormalEvidenceStateSchema.parse({
      ...state,
      sources: [...state.sources, source].sort((left, right) =>
        left.source_id.localeCompare(right.source_id)
      )
    }),
    sourceId
  };
}

function deriveLinkedWork(
  output: StudyExternalEvidenceAuditOutput
): z.output<typeof linkedWorkSchema>[] {
  const work: z.output<typeof linkedWorkSchema>[] = [];
  for (const relationship of output.bundle.replication_relationships) {
    const linked = relationship.relation_direction === "original_to_repetition"
      ? relationship.repetition_identity
      : relationship.original_identity;
    work.push(linkedWorkSchema.parse({
      linked_item_id: sha256(`linked:${relationship.relationship_hash}`),
      item_kind: relationship.relationship_kind === "replication"
        ? "REPLICATION"
        : "REPRODUCTION",
      source_item_hash: relationship.relationship_hash,
      linked_identity_hash: linked.identity_hash,
      provider_reported_outcome: relationship.provider_reported_outcome,
      possible_decision_impact: "confidence_changing",
      status: linked.doi === undefined ? "BOUNDED" : "NOT_STARTED",
      limitation: linked.doi === undefined
        ? "The provider-reported linked source lacks an exact DOI and remains an unaudited claim-local lead."
        : "The provider-reported outcome remains unaudited until the linked source's implementation, methods, and result are inspected."
    }));
  }
  for (const event of output.bundle.publication_integrity.events) {
    work.push(linkedWorkSchema.parse({
      linked_item_id: sha256(`notice:${event.event_hash}`),
      item_kind: "PUBLICATION_NOTICE",
      source_item_hash: event.event_hash,
      possible_decision_impact: maximumImpact([event.event_kind === "correction" || event.event_kind === "update"
        ? "confidence_changing"
        : "potentially_conclusion_changing"]),
      status: event.notice_doi === null ? "BOUNDED" : "NOT_STARTED",
      limitation: event.notice_doi === null
        ? "The provider exposed no exact notice DOI; the event remains a claim-local unresolved limitation."
        : `The ${event.event_kind.replaceAll("_", " ")} notice must be acquired and compared with the audited source version.`
    }));
  }
  for (const thread of output.bundle.postpublication_threads) {
    for (const message of thread.messages.filter(({ materiality }) => materiality !== "detail_only")) {
      const unavailable = message.revision_state === "deleted_or_unavailable";
      work.push(linkedWorkSchema.parse({
        linked_item_id: sha256(`message:${thread.thread_hash}:${message.content_hash}`),
        item_kind: "POSTPUBLICATION_MESSAGE",
        source_item_hash: message.content_hash,
        possible_decision_impact: message.materiality,
        status: unavailable ? "BOUNDED" : "NOT_STARTED",
        limitation: unavailable
          ? "The provider reports this post-publication message as deleted or unavailable; absent content cannot support a claim."
          : "The exact post-publication message and any referenced artifact require source-linked audit before decision use."
      }));
    }
  }
  for (const link of output.bundle.review_ancestry) {
    const exactCurrentReview = link.relation_state === "current" &&
      link.review_identity.doi !== undefined;
    work.push(linkedWorkSchema.parse({
      linked_item_id: sha256(`review:${link.link_hash}`),
      item_kind: "REVIEW",
      source_item_hash: link.link_hash,
      linked_identity_hash: link.review_identity.identity_hash,
      possible_decision_impact: "confidence_changing",
      status: exactCurrentReview ? "NOT_STARTED" : "BOUNDED",
      limitation: exactCurrentReview
        ? "Review inclusion is not approval; the exact review source and methods require separate audit."
        : "The removed, unresolved, or bibliographic-only review relation remains a bounded lead and cannot support a claim."
    }));
  }
  return [...new Map(work.map((item) => [item.linked_item_id, item])).values()]
    .sort((left, right) => left.linked_item_id.localeCompare(right.linked_item_id));
}

function derivePostExternalClaimCapability(
  source: ResearchFormalSource,
  output: StudyExternalEvidenceAuditOutput,
  linkedWork: z.output<typeof linkedWorkSchema>[]
): z.output<typeof claimCapabilityStateSchema> {
  const base = {
    capability_digest: source.method_audit.claim_capability_digest,
    method_audit_sha256: source.method_audit.audit_sha256,
    external_receipt_payload_sha256: output.receipt.receipt_payload_sha256,
    unrestricted_decision_use: false
  };
  if (output.bundle.controller_directives.some(({ directive }) =>
    directive === "exclude_source_from_effect_claims"
  )) return { ...base, status: "EFFECT_CLAIMS_EXCLUDED" };
  if (output.status !== "complete") return { ...base, status: "BOUNDED_ONLY" };
  if (linkedWork.some(({ status }) => status === "NOT_STARTED" || status === "IN_PROGRESS" ||
    status === "BLOCKED_RETRYABLE")) {
    return { ...base, status: "LINKED_WORK_REQUIRED" };
  }
  return { ...base, status: "RECALCULATION_REQUIRED" };
}

function maximumImpact(
  values: Array<z.output<typeof formalSourceSchema>["possible_decision_impact"]>
): z.output<typeof formalSourceSchema>["possible_decision_impact"] {
  const rank = {
    detail_only: 0,
    confidence_changing: 1,
    ranking_changing: 2,
    potentially_conclusion_changing: 3,
    unknown: 4
  } as const;
  return values.reduce((highest, value) =>
    rank[value] > rank[highest] ? value : highest, "detail_only" as const
  );
}

function aggregateStatuses<T extends string>(
  values: T[],
  groups: { complete: T[]; retryable: T[]; terminal: T[] }
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED_RETRYABLE" | "BLOCKED_TERMINAL" {
  if (values.every((value) => groups.complete.includes(value))) return "COMPLETE";
  if (values.some((value) => groups.retryable.includes(value))) return "BLOCKED_RETRYABLE";
  if (values.some((value) => groups.terminal.includes(value))) return "BLOCKED_TERMINAL";
  return values.every((value) => value === "NOT_STARTED") ? "NOT_STARTED" : "IN_PROGRESS";
}

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readerEvidenceFromMethodReceipt(
  auditKind: "STUDY" | "REVIEW" | "NOTICE" | "NOT_APPLICABLE",
  rawReceipt: unknown
) {
  if (auditKind === "STUDY") {
    const receipt = studyMethodAuditActionOutputSchema.shape.audit_receipt.parse(
      rawReceipt
    );
    return formalReaderEvidenceSchema.parse({
      audit_kind: "STUDY",
      source_content_sha256: receipt.source_content_sha256,
      audit_sha256: receipt.audit_sha256,
      design_label: receipt.design_label,
      design_capability_statement: receipt.design_capability_statement,
      population_and_stage: receipt.population_and_stage,
      intervention_program: receipt.intervention_program,
      comparator_program: receipt.comparator_program,
      outcome_and_horizon: receipt.outcome_and_horizon,
      method_findings: receipt.domain_findings.map((finding) => ({
        finding_id: sourceRecordSha256(finding),
        domain: finding.domain,
        status: finding.status,
        plain_language_finding: finding.plain_language_finding,
        evidence_block_ids: finding.evidence_block_ids,
        unresolved_fields: finding.unresolved_fields
      })),
      claim_capabilities: receipt.claim_capabilities.map((capability) => ({
        capability_id: sourceRecordSha256(capability),
        ...capability
      }))
    });
  }
  if (auditKind === "REVIEW") {
    const receipt = reviewMethodAuditActionOutputSchema.shape.audit_receipt.parse(
      rawReceipt
    );
    return formalReaderEvidenceSchema.parse({
      audit_kind: "REVIEW",
      source_content_sha256: receipt.source_content_sha256,
      audit_sha256: receipt.audit_sha256,
      review_type: receipt.review_type,
      search_end_date: receipt.search_end_date,
      included_source_families: receipt.included_source_families,
      program_fingerprints: receipt.program_fingerprints,
      method_findings: receipt.domain_findings.map((finding) => ({
        finding_id: sourceRecordSha256(finding),
        domain: finding.domain,
        status: finding.status,
        plain_language_finding: finding.plain_language_finding,
        evidence_block_ids: finding.evidence_block_ids,
        unresolved_fields: finding.unresolved_fields
      })),
      claim_capabilities: receipt.claim_capabilities.map((capability) => ({
        capability_id: sourceRecordSha256(capability),
        ...capability
      }))
    });
  }
  if (auditKind === "NOTICE") {
    const receipt = noticeMethodAuditOutputSchema.shape.audit_receipt.parse(rawReceipt);
    return formalReaderEvidenceSchema.parse({
      audit_kind: "NOTICE",
      source_content_sha256: receipt.source_content_sha256,
      audit_sha256: receipt.audit_sha256,
      notice_type: receipt.notice_type,
      affected_source_identity: receipt.affected_source_identity,
      plain_language_finding: receipt.plain_language_finding,
      evidence_block_ids: receipt.evidence_block_ids,
      possible_decision_impact: receipt.possible_decision_impact,
      unresolved_fields: receipt.unresolved_fields
    });
  }
  throw new Error("A not-applicable source cannot produce reader evidence");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
