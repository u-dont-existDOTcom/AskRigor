import { createHash } from "node:crypto";

import { ACCESS_STATUSES } from "@askrigor/contracts";
import type { YoutubeTranscriptEnvelope } from "@askrigor/sources";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import type { YoutubeVideoCommunityAuditOutput } from "../youtube-video-community-audit.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";

export const PROGRAM_NOT_DESCRIBED = "program not described";

const shortId = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/u);
const youtubeVideoId = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/u);
const channelId = z.union([
  z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/u),
  z.literal("not_reported")
]);
const shortText = z.string().trim().min(1).max(300);
const detailText = z.string().trim().min(1).max(800);
const outputDisplayText = z.string().trim().min(1).max(160);
const programField = z.string().trim().min(1).max(240);
const accessStatusSchema = z.enum(ACCESS_STATUSES);
const boundaryStatusSchema = z.enum([
  "partial", "abstract_only", "metadata_only", "comments_disabled", "inaccessible",
  "rate_limited", "not_found", "error"
]);
const materialitySchema = z.enum(["material", "not_material", "uncertain"]);
const omissionImpactSchema = z.enum([
  "not_decision_relevant", "confidence_changing", "ranking_changing",
  "potentially_conclusion_changing", "uncertain"
]);
const searchStatusSchema = z.enum(["searched", "unsearched", "inaccessible"]);
const followUpStatusSchema = z.enum([
  "complete", "support_not_located", "outcome_mismatch", "inaccessible",
  "incomplete", "not_applicable"
]);
const candidateSelectionStatusSchema = z.enum([
  "selected", "screened_not_selected", "inaccessible"
]);
const directionalStatusSchema = z.enum([
  "complete", "no_material_reports", "inaccessible", "incomplete", "not_applicable"
]);
const programFieldNameSchema = z.enum([
  "components", "dose_or_intensity", "frequency", "duration", "supervision",
  "adherence_or_fidelity", "cointerventions", "stage_or_baseline", "outcome",
  "horizon", "care_stage"
]);

const omissionSchema = {
  omission_impact: omissionImpactSchema,
  omission_rationale: detailText
} as const;

const accessBoundarySchema = z.object({
  boundary_id: shortId,
  scope_type: z.enum([
    "landscape_scope", "discovery_batch", "treatment_class", "program_fingerprint",
    "candidate_video", "video_transcript", "video_discussion", "formal_follow_up",
    "directional_search", "other"
  ]),
  scope_id: shortId,
  access_status: boundaryStatusSchema,
  materiality: materialitySchema,
  impact: omissionImpactSchema,
  terminal: z.boolean(),
  retryable: z.boolean(),
  recovery_attempted: z.boolean(),
  description: detailText
}).strict();

const discoveryBatchSchema = z.object({
  batch_id: shortId,
  query_or_scope: detailText,
  treatment_class_ids: z.array(shortId).min(1).max(30),
  access_status: accessStatusSchema,
  pagination: z.object({
    exhausted: z.boolean(),
    next_cursor_present: z.boolean()
  }).strict(),
  candidate_video_ids: z.array(youtubeVideoId).max(100),
  new_program_fingerprint_ids: z.array(shortId).max(40),
  access_boundary_id: shortId.optional()
}).strict();

const treatmentClassSchema = z.object({
  class_id: shortId,
  plain_language_label: shortText,
  materiality: materialitySchema,
  search_status: searchStatusSchema,
  formal_follow_up: followUpStatusSchema,
  ...omissionSchema,
  access_boundary_ids: z.array(shortId).max(4).default([])
}).strict();

const scoutSourceSchema = z.enum(["gemini_spark", "other_external_scout"]);

const externalScoutFrontierSchema = z.object({
  frontier_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  source: scoutSourceSchema,
  source_candidate_video_ids: z.array(youtubeVideoId).min(1).max(40),
  validated_candidate_video_ids: z.array(youtubeVideoId).max(40),
  terminally_rejected_video_ids: z.array(youtubeVideoId).max(40),
  unresolved_candidate_video_ids: z.array(youtubeVideoId).max(40)
}).strict();

const externalScoutCandidateSchema = z.object({
  frontier_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  source: scoutSourceSchema,
  video_id: youtubeVideoId,
  materiality: materialitySchema,
  redundancy: z.enum(["distinct", "duplicate", "unknown"]),
  screening_status: z.enum(["screened", "unscreened", "inaccessible"]),
  fingerprint_id: shortId.optional(),
  duplicate_of_video_id: youtubeVideoId.optional(),
  ...omissionSchema,
  access_boundary_id: shortId.optional()
}).strict();

const specificImplementationSearchSchema = z.object({
  search_id: shortId,
  discovery_batch_id: shortId,
  treatment_class_id: shortId,
  implementation_terms: z.array(programField).min(1).max(8),
  discriminator_terms: z.array(programField).min(1).max(8),
  candidate_video_ids: z.array(youtubeVideoId).max(100),
  result_status: z.enum([
    "specific_candidates_found", "exhausted_zero_results", "inaccessible"
  ]),
  access_boundary_id: shortId.optional()
}).strict();

const programFingerprintSchema = z.object({
  fingerprint_id: shortId,
  treatment_class_id: shortId,
  materiality: materialitySchema,
  availability_status: z.enum(["available", "inaccessible"]),
  formal_follow_up: followUpStatusSchema,
  ...omissionSchema,
  components: programField,
  dose_or_intensity: programField,
  frequency: programField,
  duration: programField,
  supervision: programField,
  adherence_or_fidelity: programField,
  cointerventions: programField,
  stage_or_baseline: programField,
  outcome: programField,
  horizon: programField,
  care_stage: programField,
  access_boundary_id: shortId.optional(),
  formal_follow_up_boundary_id: shortId.optional()
}).strict();

export type ProgramSignatureFields = Pick<
  z.output<typeof programFingerprintSchema>,
  z.output<typeof programFieldNameSchema>
>;

const candidateVideoSchema = z.object({
  video_id: youtubeVideoId,
  title: outputDisplayText,
  channel_id: channelId,
  channel_title: z.union([outputDisplayText, z.literal("not_reported")]),
  published_date: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    z.literal("not_reported")
  ]),
  treatment_class_id: shortId,
  fingerprint_id: shortId,
  discovery_batch_ids: z.array(shortId).min(1).max(12),
  materiality: materialitySchema,
  selection_status: candidateSelectionStatusSchema,
  ...omissionSchema,
  access_boundary_id: shortId.optional()
}).strict();

export const transcriptReceiptSchema = z.object({
  source_video_id: z.union([youtubeVideoId, z.literal("not_reported")]),
  access_status: accessStatusSchema,
  pagination: z.object({
    chain_started_at_first_page: z.boolean(),
    cursor_chain_reconciled: z.boolean(),
    page_count: z.union([
      z.number().int().min(1).max(10_000), z.literal("not_reported")
    ]),
    records_returned_cumulative: z.number().int().nonnegative(),
    exhausted: z.boolean(),
    next_cursor_present: z.boolean()
  }).strict(),
  selected_track: z.object({
    language_code: z.union([z.string().trim().min(2).max(35), z.literal("not_reported")]),
    language_name: z.union([shortText, z.literal("not_reported")]),
    is_auto_generated: z.union([z.boolean(), z.literal("not_reported")])
  }).strict(),
  timestamp_provenance: z.enum(["segment_timestamp_urls", "unavailable"]),
  error_retryable: z.union([z.boolean(), z.literal("not_reported")]),
  access_boundary_id: shortId.optional()
}).strict();

const replyMismatchSchema = z.object({
  parent_comment_id: z.string().trim().min(1).max(512),
  expected: z.number().int().nonnegative(),
  retrieved: z.number().int().nonnegative()
}).strict();

export const discussionReceiptSchema = z.object({
  source_video_id: youtubeVideoId,
  channel_id: channelId,
  metadata_access_status: accessStatusSchema,
  access_status: accessStatusSchema,
  extraction_coverage: z.enum([
    "api_visible_complete", "partial", "completed_with_access_boundary"
  ]),
  provider_reported_comments: z.string().regex(/^(0|[1-9][0-9]*)$/u).optional(),
  top_level_comments_retrieved_cumulative: z.number().int().nonnegative(),
  replies_retrieved_cumulative: z.number().int().nonnegative(),
  records_retrieved_cumulative: z.number().int().nonnegative(),
  records_returned_for_analysis: z.number().int().min(0).max(500),
  top_level_records_returned_for_analysis: z.number().int().min(0).max(500),
  reply_records_returned_for_analysis: z.number().int().min(0).max(500),
  reply_count_mismatches: z.array(replyMismatchSchema).max(500),
  continuation_recommended: z.boolean(),
  error_retryable: z.union([z.boolean(), z.literal("not_reported")]),
  receipt: z.object({
    completion_state: z.enum([
      "api_visible_complete", "completed_with_access_boundary", "incomplete"
    ]),
    synthesis_lock: z.enum(["pass", "block"]),
    chain_started_at_first_page: z.boolean(),
    top_level_pagination_exhausted: z.boolean(),
    replies_reconciled: z.boolean(),
    query_bounded_comments_used_as_corpus: z.literal(false),
    blockers: z.array(detailText).max(40)
  }).strict(),
  access_boundary_id: shortId.optional()
}).strict();

const selectedVideoSchema = z.object({
  video_id: youtubeVideoId,
  fingerprint_id: shortId,
  stage_or_baseline: outputDisplayText,
  outcome_and_horizon: outputDisplayText,
  nonredundant_value: outputDisplayText,
  transcript_receipt: transcriptReceiptSchema,
  discussion_receipt: discussionReceiptSchema,
  what_it_changed: outputDisplayText
}).strict();

const directionalSearchSchema = z.object({
  status: directionalStatusSchema,
  access_boundary_id: shortId.optional()
}).strict();

export const treatmentLandscapeCoverageInputSchema = z.object({
  research_target: detailText,
  broad_treatment_choice: z.boolean(),
  substantial_youtube_corpus: z.enum(["yes", "no", "unknown"]),
  discovery_batches: z.array(discoveryBatchSchema).min(1).max(40),
  specific_implementation_searches: z.array(specificImplementationSearchSchema).max(120),
  treatment_classes: z.array(treatmentClassSchema).min(1).max(80),
  program_fingerprints: z.array(programFingerprintSchema).max(120),
  candidate_videos: z.array(candidateVideoSchema).max(100),
  external_scout_frontiers: z.array(externalScoutFrontierSchema).max(8).default([]),
  external_scout_candidates: z.array(externalScoutCandidateSchema).max(40).default([]),
  selected_videos: z.array(selectedVideoSchema).max(15),
  further_expansion_likely_to_improve_answer: z.enum(["yes", "no", "blocked"]),
  directional_searches: z.object({
    benefit: directionalSearchSchema,
    no_effect_or_failure: directionalSearchSchema,
    harm: directionalSearchSchema,
    discontinuation: directionalSearchSchema,
    eventual_standard_treatment: directionalSearchSchema
  }).strict(),
  access_boundaries: z.array(accessBoundarySchema).max(80)
}).strict();

const auditedVideoSchema = z.object({
  video_id: youtubeVideoId,
  canonical_url: z.string().url().max(200),
  title: outputDisplayText,
  channel_id: channelId,
  channel_title: z.union([outputDisplayText, z.literal("not_reported")]),
  published_date: candidateVideoSchema.shape.published_date,
  treatment_class_id: shortId,
  fingerprint_id: shortId,
  derived_program_signature: z.string().regex(/^[a-f0-9]{64}$/u),
  program_fields_not_described: z.array(programFieldNameSchema),
  stage_or_baseline: outputDisplayText,
  outcome_and_horizon: outputDisplayText,
  nonredundant_value: outputDisplayText,
  transcript_access_status: accessStatusSchema,
  transcript_language_code: z.union([
    z.string().trim().min(2).max(35), z.literal("not_reported")
  ]),
  transcript_is_auto_generated: z.union([z.boolean(), z.literal("not_reported")]),
  transcript_timestamp_provenance: z.enum(["segment_timestamp_urls", "unavailable"]),
  discussion_access_status: accessStatusSchema,
  discussion_records_retrieved_cumulative: z.number().int().nonnegative(),
  discussion_records_returned_for_analysis: z.number().int().min(0).max(500),
  discussion_synthesis_lock: z.enum(["pass", "block"]),
  what_it_changed: outputDisplayText
}).strict();

const invalidRecordIdsSchema = z.object({
  discovery_batches: z.array(shortId),
  specific_implementation_searches: z.array(shortId),
  treatment_classes: z.array(shortId),
  program_fingerprints: z.array(shortId),
  candidate_videos: z.array(youtubeVideoId),
  external_scout_frontiers: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
  external_scout_candidates: z.array(youtubeVideoId),
  selected_videos: z.array(youtubeVideoId),
  access_boundaries: z.array(shortId)
}).strict();

export const treatmentLandscapeCoverageOutputSchema = z.object({
  coverage_claim: z.literal("ledger_consistency_only"),
  treatment_classes_discovered: z.number().int().nonnegative(),
  specific_implementation_search_status_by_class: z.array(z.object({
    treatment_class_id: shortId,
    status: z.enum([
      "specific_candidates_found", "exhausted_zero_results", "incomplete", "inaccessible"
    ])
  }).strict()),
  materially_distinct_program_fingerprints: z.number().int().nonnegative(),
  candidate_videos_screened: z.number().int().nonnegative(),
  external_scout_candidates_screened: z.number().int().nonnegative(),
  external_scout_candidates_pending: z.array(youtubeVideoId),
  broad_structural_minimums_applied: z.boolean(),
  broad_structural_minimums_met: z.boolean(),
  material_videos_selected: z.number().int().nonnegative(),
  material_videos_fully_audited: z.number().int().nonnegative(),
  materially_distinct_programs_fully_audited: z.number().int().nonnegative(),
  independent_channels_or_pools: z.number().int().nonnegative(),
  treatment_classes_with_no_selected_video: z.array(shortId),
  treatment_classes_with_no_formal_evidence_follow_up: z.array(shortId),
  program_fingerprints_with_no_formal_evidence_follow_up: z.array(shortId),
  program_fingerprints_available_but_not_selected: z.array(shortId),
  program_fingerprint_missing_fields: z.array(z.object({
    fingerprint_id: shortId,
    fields: z.array(programFieldNameSchema)
  }).strict()),
  uncovered_material_treatment_classes: z.array(shortId),
  redundancy_flags: z.array(detailText),
  further_expansion_likely_to_improve_answer: z.enum(["yes", "no", "blocked"]),
  videos_actually_audited: z.array(auditedVideoSchema),
  invalid_record_ids: invalidRecordIdsSchema,
  selection_coverage_lock: z.enum(["pass", "block"]),
  per_video_depth_lock: z.enum(["pass", "block"]),
  synthesis_lock: z.enum(["pass", "block"]),
  answer_boundary: z.enum([
    "ledger_consistent_for_synthesis", "bounded_nonranking_only", "continue_research"
  ]),
  selection_blockers: z.array(detailText),
  depth_blockers: z.array(detailText),
  boundary_blockers: z.array(detailText),
  blockers: z.array(detailText),
  planning_warnings: z.array(detailText),
  access_boundary_ids_used: z.array(shortId)
}).strict();

export type TreatmentLandscapeCoverageInput = z.output<
  typeof treatmentLandscapeCoverageInputSchema
>;
export type TreatmentLandscapeCoverageOutput = z.output<
  typeof treatmentLandscapeCoverageOutputSchema
>;
export type TranscriptCoverageReceipt = z.output<typeof transcriptReceiptSchema>;
export type DiscussionCoverageReceipt = z.output<typeof discussionReceiptSchema>;

export function deriveProgramSignature(
  fingerprint: ProgramSignatureFields
): string {
  const fields = programFieldEntries(fingerprint).map(([, value]) =>
    normalizeProgramValue(value)
  );
  return createHash("sha256").update(JSON.stringify(fields), "utf8").digest("hex");
}

export function projectTranscriptCoverageReceipt(
  pages: readonly YoutubeTranscriptEnvelope[],
  accessBoundaryId?: string
): TranscriptCoverageReceipt {
  if (pages.length === 0) throw new Error("Transcript receipt projection needs at least one page");
  const first = pages[0]!;
  const final = pages.at(-1)!;
  const sourceVideoId = final.primary_identifier ?? final.query?.video_id ?? "not_reported";
  const selectedTrack = final.raw_metadata?.selected_track ?? first.raw_metadata?.selected_track;
  const sameVideo = pages.every((page) =>
    (page.primary_identifier ?? page.query?.video_id ?? sourceVideoId) === sourceVideoId
  );
  const cursorChainReconciled = sameVideo && pages.slice(1).every((page, index) =>
    pages[index]!.pagination.next_cursor !== undefined &&
    pages[index]!.pagination.next_cursor === page.pagination.cursor
  );
  const timestampsPresent = pages.every((page) =>
    page.data.every((segment) => segment.timestamp_url.length > 0)
  ) && pages.some((page) => page.data.length > 0);
  return transcriptReceiptSchema.parse({
    source_video_id: sourceVideoId,
    access_status: final.access_status,
    pagination: {
      chain_started_at_first_page: first.pagination.cursor === undefined,
      cursor_chain_reconciled: cursorChainReconciled,
      page_count: pages.length,
      records_returned_cumulative: pages.reduce(
        (total, page) => total + page.pagination.returned, 0
      ),
      exhausted: final.pagination.exhausted,
      next_cursor_present: final.pagination.next_cursor !== undefined
    },
    selected_track: {
      language_code: selectedTrack?.language_code ?? "not_reported",
      language_name: selectedTrack?.language_name ?? "not_reported",
      is_auto_generated: selectedTrack?.is_auto_generated ?? "not_reported"
    },
    timestamp_provenance: timestampsPresent
      ? "segment_timestamp_urls"
      : "unavailable",
    error_retryable: final.error?.retryable ?? "not_reported",
    ...(accessBoundaryId === undefined ? {} : { access_boundary_id: accessBoundaryId })
  });
}

export function projectDiscussionCoverageReceipt(
  output: YoutubeVideoCommunityAuditOutput,
  accessBoundaryId?: string
): DiscussionCoverageReceipt {
  return discussionReceiptSchema.parse({
    source_video_id: output.video_id,
    channel_id: output.channel_id ?? "not_reported",
    metadata_access_status: output.metadata_access_status,
    access_status: output.access_status,
    extraction_coverage: output.extraction_coverage,
    ...(output.provider_reported_comments === undefined
      ? {}
      : { provider_reported_comments: output.provider_reported_comments }),
    top_level_comments_retrieved_cumulative:
      output.top_level_comments_retrieved_cumulative,
    replies_retrieved_cumulative: output.replies_retrieved_cumulative,
    records_retrieved_cumulative: output.records_retrieved_cumulative,
    records_returned_for_analysis: output.records_returned_for_analysis,
    top_level_records_returned_for_analysis:
      output.top_level_records_returned_for_analysis,
    reply_records_returned_for_analysis: output.reply_records_returned_for_analysis,
    reply_count_mismatches: output.reply_count_mismatches,
    continuation_recommended: output.continuation_recommended,
    error_retryable: output.error?.retryable ?? "not_reported",
    receipt: output.receipt,
    ...(accessBoundaryId === undefined ? {} : { access_boundary_id: accessBoundaryId })
  });
}

export function assessTreatmentLandscapeCoverage(
  input: TreatmentLandscapeCoverageInput
): TreatmentLandscapeCoverageOutput {
  const selectionBlockers: string[] = [];
  const depthBlockers: string[] = [];
  const selectionBoundaryBlockers: string[] = [];
  const depthBoundaryBlockers: string[] = [];
  const planningWarnings: string[] = [];
  const usedBoundaryIds = new Set<string>();
  const invalid = {
    discovery_batches: new Set<string>(), specific_implementation_searches: new Set<string>(),
    treatment_classes: new Set<string>(),
    program_fingerprints: new Set<string>(), candidate_videos: new Set<string>(),
    external_scout_frontiers: new Set<string>(),
    external_scout_candidates: new Set<string>(), selected_videos: new Set<string>(),
    access_boundaries: new Set<string>()
  };

  markDuplicates(input.discovery_batches, ({ batch_id }) => batch_id,
    invalid.discovery_batches, selectionBlockers, "Discovery batch");
  markDuplicates(input.specific_implementation_searches, ({ search_id }) => search_id,
    invalid.specific_implementation_searches, selectionBlockers,
    "Specific-implementation search");
  markDuplicates(input.treatment_classes, ({ class_id }) => class_id,
    invalid.treatment_classes, selectionBlockers, "Treatment class");
  markDuplicates(input.program_fingerprints, ({ fingerprint_id }) => fingerprint_id,
    invalid.program_fingerprints, selectionBlockers, "Program fingerprint");
  markDuplicates(input.candidate_videos, ({ video_id }) => video_id,
    invalid.candidate_videos, selectionBlockers, "Candidate video");
  markDuplicates(input.external_scout_frontiers, ({ frontier_digest }) => frontier_digest,
    invalid.external_scout_frontiers, selectionBlockers, "External scout frontier");
  markDuplicates(input.external_scout_candidates, ({ video_id }) => video_id,
    invalid.external_scout_candidates, selectionBlockers, "External scout candidate");
  markDuplicates(input.selected_videos, ({ video_id }) => video_id,
    invalid.selected_videos, selectionBlockers, "Selected video");
  markDuplicates(input.access_boundaries, ({ boundary_id }) => boundary_id,
    invalid.access_boundaries, selectionBlockers, "Access boundary");

  let boundaryById = mapValid(
    input.access_boundaries, ({ boundary_id }) => boundary_id, invalid.access_boundaries
  );
  for (const boundary of boundaryById.values()) {
    if (boundary.retryable && boundary.terminal) {
      invalid.access_boundaries.add(boundary.boundary_id);
      selectionBlockers.push(
        `Access boundary ${boundary.boundary_id} cannot be both retryable and terminal.`
      );
    }
    if (boundary.terminal && !boundary.recovery_attempted) {
      invalid.access_boundaries.add(boundary.boundary_id);
      selectionBlockers.push(
        `Access boundary ${boundary.boundary_id} is terminal without a recorded recovery attempt.`
      );
    }
    if (boundary.access_status === "rate_limited" && !boundary.retryable) {
      invalid.access_boundaries.add(boundary.boundary_id);
      selectionBlockers.push(
        `Rate-limited boundary ${boundary.boundary_id} must remain retryable.`
      );
    }
  }
  boundaryById = mapValid(
    input.access_boundaries, ({ boundary_id }) => boundary_id, invalid.access_boundaries
  );

  const classById = mapValid(
    input.treatment_classes, ({ class_id }) => class_id, invalid.treatment_classes
  );
  const batchById = mapValid(
    input.discovery_batches, ({ batch_id }) => batch_id, invalid.discovery_batches
  );
  const rawFingerprintById = mapValid(
    input.program_fingerprints, ({ fingerprint_id }) => fingerprint_id,
    invalid.program_fingerprints
  );
  const rawCandidateById = mapValid(
    input.candidate_videos, ({ video_id }) => video_id, invalid.candidate_videos
  );
  const rawSpecificSearchById = mapValid(
    input.specific_implementation_searches, ({ search_id }) => search_id,
    invalid.specific_implementation_searches
  );
  const frontierByDigest = mapValid(
    input.external_scout_frontiers, ({ frontier_digest }) => frontier_digest,
    invalid.external_scout_frontiers
  );
  let externalScoutById = mapValid(
    input.external_scout_candidates, ({ video_id }) => video_id,
    invalid.external_scout_candidates
  );

  for (const frontier of frontierByDigest.values()) {
    const partition = [
      ...frontier.validated_candidate_video_ids,
      ...frontier.terminally_rejected_video_ids,
      ...frontier.unresolved_candidate_video_ids
    ];
    if (
      duplicates(frontier.source_candidate_video_ids).length > 0 ||
      duplicates(partition).length > 0 ||
      !sameStringSet(frontier.source_candidate_video_ids, partition) ||
      deriveExternalScoutFrontierDigest(frontier) !== frontier.frontier_digest
    ) {
      invalidate(
        invalid.external_scout_frontiers, frontier.frontier_digest, selectionBlockers,
        `External scout frontier ${frontier.frontier_digest.slice(0, 12)} has an invalid digest or candidate partition.`
      );
    }
  }
  const validFrontierByDigest = mapValid(
    input.external_scout_frontiers, ({ frontier_digest }) => frontier_digest,
    invalid.external_scout_frontiers
  );

  for (const frontier of validFrontierByDigest.values()) {
    for (const videoId of frontier.validated_candidate_video_ids) {
      const scout = externalScoutById.get(videoId);
      if (
        scout === undefined || scout.frontier_digest !== frontier.frontier_digest ||
        scout.source !== frontier.source
      ) {
        selectionBlockers.push(
          `Validated external scout candidate ${videoId} is missing from its complete frontier reconciliation.`
        );
      }
    }
    for (const videoId of frontier.unresolved_candidate_video_ids) {
      selectionBlockers.push(
        `External scout candidate ${videoId} has an unresolved identity-validation result.`
      );
    }
  }
  for (const scout of externalScoutById.values()) {
    const frontier = validFrontierByDigest.get(scout.frontier_digest);
    if (
      frontier === undefined || frontier.source !== scout.source ||
      !frontier.validated_candidate_video_ids.includes(scout.video_id)
    ) {
      invalidate(
        invalid.external_scout_candidates, scout.video_id, selectionBlockers,
        `External scout candidate ${scout.video_id} lacks a reciprocal validated-frontier link.`
      );
    }
  }
  externalScoutById = mapValid(
    input.external_scout_candidates, ({ video_id }) => video_id,
    invalid.external_scout_candidates
  );

  for (const fingerprint of rawFingerprintById.values()) {
    if (!classById.has(fingerprint.treatment_class_id)) {
      invalidate(invalid.program_fingerprints, fingerprint.fingerprint_id, selectionBlockers,
        `Program fingerprint ${fingerprint.fingerprint_id} has no valid treatment class.`);
    } else if (isProgramNotDescribed(fingerprint.components)) {
      invalidate(invalid.program_fingerprints, fingerprint.fingerprint_id, selectionBlockers,
        `Program fingerprint ${fingerprint.fingerprint_id} has no described components and cannot establish distinct treatment coverage.`);
    }
  }
  const fingerprintById = mapValid(
    input.program_fingerprints, ({ fingerprint_id }) => fingerprint_id,
    invalid.program_fingerprints
  );

  for (const batch of batchById.values()) {
    const duplicateCandidateIds = duplicates(batch.candidate_video_ids);
    if (duplicateCandidateIds.length > 0) {
      invalidate(invalid.discovery_batches, batch.batch_id, selectionBlockers,
        `Discovery batch ${batch.batch_id} repeats candidate video IDs.`);
      continue;
    }
    for (const classId of batch.treatment_class_ids) {
      if (!classById.has(classId)) {
        invalidate(invalid.discovery_batches, batch.batch_id, selectionBlockers,
          `Discovery batch ${batch.batch_id} references invalid treatment class ${classId}.`);
      }
    }
    for (const fingerprintId of batch.new_program_fingerprint_ids) {
      if (!fingerprintById.has(fingerprintId)) {
        invalidate(invalid.discovery_batches, batch.batch_id, selectionBlockers,
          `Discovery batch ${batch.batch_id} references invalid new program fingerprint ${fingerprintId}.`);
      }
    }
    const complete = isCompleteAccess(batch.access_status) &&
      batch.pagination.exhausted && !batch.pagination.next_cursor_present;
    if (complete) {
      if (batch.access_boundary_id !== undefined) {
        invalidate(invalid.discovery_batches, batch.batch_id, selectionBlockers,
          `Discovery batch ${batch.batch_id} cites an access boundary despite exhausted retrieval.`);
      }
    } else if (batch.pagination.next_cursor_present) {
      selectionBlockers.push(
        `Discovery batch ${batch.batch_id} still has an executable continuation cursor.`
      );
      reconcileBoundaryReference({
        boundaryId: batch.access_boundary_id,
        expectedScopeType: "discovery_batch", expectedScopeId: batch.batch_id,
        expectedAccessStatus: batch.access_status,
        boundaryById, usedBoundaryIds, blockers: selectionBlockers
      });
    } else {
      requireBoundary({
        boundaryId: batch.access_boundary_id,
        expectedScopeType: "discovery_batch", expectedScopeId: batch.batch_id,
        expectedAccessStatus: batch.access_status,
        boundaryById, usedBoundaryIds,
        substantiveTarget: selectionBlockers,
        boundedTarget: selectionBoundaryBlockers
      });
    }
  }

  const validBatchById = mapValid(
    input.discovery_batches, ({ batch_id }) => batch_id, invalid.discovery_batches
  );
  for (const candidate of rawCandidateById.values()) {
    const fingerprint = fingerprintById.get(candidate.fingerprint_id);
    if (
      !classById.has(candidate.treatment_class_id) || fingerprint === undefined ||
      fingerprint.treatment_class_id !== candidate.treatment_class_id
    ) {
      invalidate(invalid.candidate_videos, candidate.video_id, selectionBlockers,
        `Candidate video ${candidate.video_id} has inconsistent class or fingerprint links.`);
      continue;
    }
    for (const batchId of candidate.discovery_batch_ids) {
      const batch = validBatchById.get(batchId);
      if (
        batch === undefined || !batch.candidate_video_ids.includes(candidate.video_id) ||
        !batch.treatment_class_ids.includes(candidate.treatment_class_id)
      ) {
        invalidate(invalid.candidate_videos, candidate.video_id, selectionBlockers,
          `Candidate video ${candidate.video_id} lacks a reciprocal valid discovery-batch link.`);
      }
    }
    if (candidate.selection_status === "inaccessible") {
      requireBoundary({
        boundaryId: candidate.access_boundary_id,
        expectedScopeType: "candidate_video", expectedScopeId: candidate.video_id,
        boundaryById, usedBoundaryIds,
        substantiveTarget: selectionBlockers,
        boundedTarget: selectionBoundaryBlockers
      });
    } else if (candidate.access_boundary_id !== undefined) {
      invalidate(invalid.candidate_videos, candidate.video_id, selectionBlockers,
        `Candidate video ${candidate.video_id} cites an access boundary without an inaccessible state.`);
    }
  }
  let candidateById = mapValid(
    input.candidate_videos, ({ video_id }) => video_id, invalid.candidate_videos
  );
  for (const batch of validBatchById.values()) {
    for (const candidateId of batch.candidate_video_ids) {
      const candidate = candidateById.get(candidateId);
      if (candidate === undefined || !candidate.discovery_batch_ids.includes(batch.batch_id)) {
        invalidate(invalid.discovery_batches, batch.batch_id, selectionBlockers,
          `Discovery batch ${batch.batch_id} lacks a reciprocal valid candidate record for ${candidateId}.`);
      }
    }
  }
  for (const candidate of candidateById.values()) {
    if (candidate.discovery_batch_ids.some((id) => invalid.discovery_batches.has(id))) {
      invalidate(invalid.candidate_videos, candidate.video_id, selectionBlockers,
        `Candidate video ${candidate.video_id} depends on an invalid discovery batch.`);
    }
  }
  candidateById = mapValid(
    input.candidate_videos, ({ video_id }) => video_id, invalid.candidate_videos
  );
  const reconciledBatchById = mapValid(
    input.discovery_batches, ({ batch_id }) => batch_id, invalid.discovery_batches
  );

  for (const search of rawSpecificSearchById.values()) {
    const batch = reconciledBatchById.get(search.discovery_batch_id);
    const treatmentClass = classById.get(search.treatment_class_id);
    if (
      batch === undefined || treatmentClass === undefined ||
      !batch.treatment_class_ids.includes(search.treatment_class_id)
    ) {
      invalidate(
        invalid.specific_implementation_searches, search.search_id, selectionBlockers,
        `Specific-implementation search ${search.search_id} lacks reciprocal batch or class links.`
      );
      continue;
    }
    const allTerms = [...search.implementation_terms, ...search.discriminator_terms];
    if (
      duplicates(allTerms.map(normalizeSearchPhrase)).length > 0 ||
      search.implementation_terms.some(isGenericUmbrellaTerm) ||
      allTerms.some((term) => !normalizedTextContains(batch.query_or_scope, term))
    ) {
      invalidate(
        invalid.specific_implementation_searches, search.search_id, selectionBlockers,
        `Specific-implementation search ${search.search_id} lacks distinct non-generic terms reciprocally present in its executed query.`
      );
      continue;
    }
    const duplicateCandidateIds = duplicates(search.candidate_video_ids);
    const linkedCandidates = search.candidate_video_ids.map((videoId) => {
      const candidate = candidateById.get(videoId);
      const fingerprint = candidate === undefined
        ? undefined
        : fingerprintById.get(candidate.fingerprint_id);
      const reciprocal = candidate !== undefined &&
        batch.candidate_video_ids.includes(videoId) &&
        candidate.discovery_batch_ids.includes(batch.batch_id) &&
        candidate.treatment_class_id === search.treatment_class_id &&
        fingerprint !== undefined &&
        fingerprint.treatment_class_id === search.treatment_class_id &&
        !isProgramNotDescribed(fingerprint.components);
      const implementationMatch = reciprocal && search.implementation_terms.some((term) =>
        normalizedTextContains(fingerprint.components, term)
      );
      return { videoId, reciprocal, implementationMatch };
    });
    if (
      duplicateCandidateIds.length > 0 ||
      linkedCandidates.some(({ reciprocal }) => !reciprocal)
    ) {
      invalidate(
        invalid.specific_implementation_searches, search.search_id, selectionBlockers,
        `Specific-implementation search ${search.search_id} has duplicate, missing, or nonreciprocal candidate links.`
      );
      continue;
    }
    const batchComplete = isCompleteAccess(batch.access_status) &&
      batch.pagination.exhausted && !batch.pagination.next_cursor_present;
    if (search.result_status === "specific_candidates_found") {
      if (
        !batchComplete || search.candidate_video_ids.length === 0 ||
        linkedCandidates.some(({ implementationMatch }) => !implementationMatch) ||
        search.access_boundary_id !== undefined
      ) {
        invalidate(
          invalid.specific_implementation_searches, search.search_id, selectionBlockers,
          `Specific-implementation search ${search.search_id} claims candidates without an exhausted, reciprocal result whose described program matches the named implementation.`
        );
      }
    } else if (search.result_status === "exhausted_zero_results") {
      if (!batchComplete || search.candidate_video_ids.length !== 0 || search.access_boundary_id !== undefined) {
        invalidate(
          invalid.specific_implementation_searches, search.search_id, selectionBlockers,
          `Specific-implementation search ${search.search_id} claims exhausted zero results while its own candidate list is nonempty or retrieval is not exhausted.`
        );
      }
    } else {
      requireBoundary({
        boundaryId: search.access_boundary_id,
        expectedScopeType: "discovery_batch",
        expectedScopeId: search.discovery_batch_id,
        boundaryById,
        usedBoundaryIds,
        substantiveTarget: selectionBlockers,
        boundedTarget: selectionBoundaryBlockers
      });
    }
  }
  const specificSearchById = mapValid(
    input.specific_implementation_searches, ({ search_id }) => search_id,
    invalid.specific_implementation_searches
  );
  const specificSearchesByClass = new Map<string, Array<z.output<
    typeof specificImplementationSearchSchema
  >>>();
  for (const search of specificSearchById.values()) {
    const searches = specificSearchesByClass.get(search.treatment_class_id) ?? [];
    searches.push(search);
    specificSearchesByClass.set(search.treatment_class_id, searches);
  }
  const specificImplementationSearchStatusByClass = [...classById.values()].map(
    (treatmentClass) => {
      const searches = specificSearchesByClass.get(treatmentClass.class_id) ?? [];
      const status = searches.some(({ result_status }) =>
        result_status === "specific_candidates_found"
      )
        ? "specific_candidates_found" as const
        : searches.some(({ result_status }) => result_status === "exhausted_zero_results")
          ? "exhausted_zero_results" as const
          : searches.some(({ result_status }) => result_status === "inaccessible")
            ? "inaccessible" as const
            : "incomplete" as const;
      return { treatment_class_id: treatmentClass.class_id, status };
    }
  );
  const specificStatusByClass = new Map(
    specificImplementationSearchStatusByClass.map(({ treatment_class_id, status }) =>
      [treatment_class_id, status] as const
    )
  );

  const signatureByFingerprintId = new Map<string, string>();
  const fingerprintIdsBySignature = new Map<string, string[]>();
  for (const fingerprint of fingerprintById.values()) {
    const signature = deriveProgramSignature(fingerprint);
    signatureByFingerprintId.set(fingerprint.fingerprint_id, signature);
    const ids = fingerprintIdsBySignature.get(signature) ?? [];
    ids.push(fingerprint.fingerprint_id);
    fingerprintIdsBySignature.set(signature, ids);
    if (fingerprint.availability_status === "inaccessible") {
      requireBoundary({
        boundaryId: fingerprint.access_boundary_id,
        expectedScopeType: "program_fingerprint", expectedScopeId: fingerprint.fingerprint_id,
        boundaryById, usedBoundaryIds,
        substantiveTarget: selectionBlockers,
        boundedTarget: selectionBoundaryBlockers
      });
    } else if (fingerprint.access_boundary_id !== undefined) {
      selectionBlockers.push(
        `Program fingerprint ${fingerprint.fingerprint_id} cites an access boundary despite being available.`
      );
    }
  }

  const selectedById = mapValid(
    input.selected_videos, ({ video_id }) => video_id, invalid.selected_videos
  );
  const selectedClasses = new Set<string>();
  const selectedFingerprintIds = new Set<string>();
  const selectedSignatureCounts = new Map<string, number>();
  const fullyAuditedSignatures = new Set<string>();
  const videosActuallyAudited: z.output<typeof auditedVideoSchema>[] = [];
  let fullyAuditedVideos = 0;
  for (const video of selectedById.values()) {
    const candidate = candidateById.get(video.video_id);
    const fingerprint = fingerprintById.get(video.fingerprint_id);
    const signature = signatureByFingerprintId.get(video.fingerprint_id);
    if (
      candidate === undefined || candidate.selection_status !== "selected" ||
      fingerprint === undefined || signature === undefined ||
      candidate.fingerprint_id !== video.fingerprint_id ||
      candidate.materiality === "not_material" || fingerprint.materiality === "not_material"
    ) {
      invalidate(invalid.selected_videos, video.video_id, selectionBlockers,
        `Selected video ${video.video_id} has no state-consistent material candidate and fingerprint.`);
      continue;
    }
    if (
      video.transcript_receipt.source_video_id !== video.video_id ||
      video.discussion_receipt.source_video_id !== video.video_id
    ) {
      invalidate(invalid.selected_videos, video.video_id, depthBlockers,
        `Selected video ${video.video_id} has a mismatched source receipt.`);
      continue;
    }
    if (
      candidate.channel_id !== "not_reported" &&
      video.discussion_receipt.channel_id !== "not_reported" &&
      candidate.channel_id !== video.discussion_receipt.channel_id
    ) {
      invalidate(invalid.selected_videos, video.video_id, depthBlockers,
        `Selected video ${video.video_id} has a mismatched stable channel ID.`);
      continue;
    }
    selectedClasses.add(candidate.treatment_class_id);
    selectedFingerprintIds.add(candidate.fingerprint_id);
    selectedSignatureCounts.set(signature, (selectedSignatureCounts.get(signature) ?? 0) + 1);
    const transcriptComplete = evaluateTranscriptReceipt(
      video.video_id, video.transcript_receipt, boundaryById, usedBoundaryIds,
      depthBlockers, depthBoundaryBlockers
    );
    const discussionComplete = evaluateDiscussionReceipt(
      video.video_id, video.discussion_receipt, boundaryById, usedBoundaryIds,
      depthBlockers, depthBoundaryBlockers
    );
    if (transcriptComplete && discussionComplete) {
      fullyAuditedVideos += 1;
      fullyAuditedSignatures.add(signature);
    }
    videosActuallyAudited.push({
      video_id: video.video_id,
      canonical_url: `https://www.youtube.com/watch?v=${video.video_id}`,
      title: compactText(candidate.title),
      channel_id: candidate.channel_id,
      channel_title: candidate.channel_title === "not_reported"
        ? "not_reported"
        : compactText(candidate.channel_title),
      published_date: candidate.published_date,
      treatment_class_id: candidate.treatment_class_id,
      fingerprint_id: video.fingerprint_id,
      derived_program_signature: signature,
      program_fields_not_described: missingProgramFields(fingerprint),
      stage_or_baseline: compactText(video.stage_or_baseline),
      outcome_and_horizon: compactText(video.outcome_and_horizon),
      nonredundant_value: compactText(video.nonredundant_value),
      transcript_access_status: video.transcript_receipt.access_status,
      transcript_language_code: video.transcript_receipt.selected_track.language_code,
      transcript_is_auto_generated:
        video.transcript_receipt.selected_track.is_auto_generated,
      transcript_timestamp_provenance:
        video.transcript_receipt.timestamp_provenance,
      discussion_access_status: video.discussion_receipt.access_status,
      discussion_records_retrieved_cumulative:
        video.discussion_receipt.records_retrieved_cumulative,
      discussion_records_returned_for_analysis:
        video.discussion_receipt.records_returned_for_analysis,
      discussion_synthesis_lock: video.discussion_receipt.receipt.synthesis_lock,
      what_it_changed: compactText(video.what_it_changed)
    });
  }

  for (const candidate of candidateById.values()) {
    const selectedRecord = selectedById.has(candidate.video_id) &&
      !invalid.selected_videos.has(candidate.video_id);
    if (candidate.selection_status === "selected" && !selectedRecord) {
      selectionBlockers.push(
        `Candidate video ${candidate.video_id} is marked selected without a valid selected-video audit.`
      );
    }
    if (candidate.selection_status === "screened_not_selected") {
      const signature = signatureByFingerprintId.get(candidate.fingerprint_id);
      const nonrelevanceSupported = candidate.materiality === "not_material" ||
        (signature !== undefined && selectedSignatureCounts.has(signature));
      handleOmission(
        `Candidate video ${candidate.video_id} was screened but not selected`, candidate,
        nonrelevanceSupported, selectionBlockers, planningWarnings
      );
    }
    if (
      candidate.selection_status === "selected" && candidate.channel_id === "not_reported"
    ) {
      selectionBlockers.push(
        `Selected video ${candidate.video_id} lacks a stable channel ID, so source independence is unknown.`
      );
    }
  }

  const materialClasses = [...classById.values()].filter(({ materiality }) =>
    materiality !== "not_material"
  );
  const materialFingerprints = [...fingerprintById.values()].filter((fingerprint) => {
    const treatmentClass = classById.get(fingerprint.treatment_class_id);
    return fingerprint.materiality !== "not_material" &&
      treatmentClass !== undefined && treatmentClass.materiality !== "not_material";
  });
  const candidateCountByClass = countBy(
    [...candidateById.values()], ({ treatment_class_id }) => treatment_class_id
  );
  const candidatesByFingerprint = groupBy(
    [...candidateById.values()], ({ fingerprint_id }) => fingerprint_id
  );
  const batchesByClass = groupBy(
    [...reconciledBatchById.values()].flatMap((batch) =>
      batch.treatment_class_ids.map((classId) => ({ classId, batch }))
    ), ({ classId }) => classId
  );
  const uncovered = new Set<string>();
  const classesWithoutFormalFollowUp: string[] = [];
  for (const treatmentClass of materialClasses) {
    const classBatches = batchesByClass.get(treatmentClass.class_id) ?? [];
    if (treatmentClass.search_status === "searched" && classBatches.length === 0) {
      selectionBlockers.push(
        `Treatment class ${treatmentClass.class_id} is marked searched without a valid discovery batch.`
      );
    }
    if (treatmentClass.search_status === "unsearched") {
      uncovered.add(treatmentClass.class_id);
      handleOmission(
        `Treatment class ${treatmentClass.class_id} remains unsearched`, treatmentClass,
        false, selectionBlockers, planningWarnings
      );
    } else if (treatmentClass.search_status === "inaccessible") {
      uncovered.add(treatmentClass.class_id);
      requireClassBoundary(
        treatmentClass, "treatment_class", boundaryById, usedBoundaryIds,
        selectionBlockers, selectionBoundaryBlockers
      );
    }
    const specificSearchStatus = specificStatusByClass.get(treatmentClass.class_id) ??
      "incomplete";
    if (specificSearchStatus === "incomplete") {
      uncovered.add(treatmentClass.class_id);
      selectionBlockers.push(
        `Treatment class ${treatmentClass.class_id} has not completed specific-program discovery.`
      );
    } else if (specificSearchStatus === "inaccessible") {
      uncovered.add(treatmentClass.class_id);
    }
    if ((candidateCountByClass.get(treatmentClass.class_id) ?? 0) > 0 &&
      !selectedClasses.has(treatmentClass.class_id)) {
      uncovered.add(treatmentClass.class_id);
      handleOmission(
        `Treatment class ${treatmentClass.class_id} has candidates but no selected video`,
        treatmentClass, false, selectionBlockers, planningWarnings
      );
    }
    if (["incomplete", "inaccessible", "not_applicable"].includes(
      treatmentClass.formal_follow_up
    )) classesWithoutFormalFollowUp.push(treatmentClass.class_id);
    if (treatmentClass.formal_follow_up === "incomplete" ||
      treatmentClass.formal_follow_up === "not_applicable") {
      handleOmission(
        `Treatment class ${treatmentClass.class_id} lacks formal-evidence follow-up`,
        treatmentClass, false, selectionBlockers, planningWarnings
      );
    } else if (treatmentClass.formal_follow_up === "inaccessible") {
      requireClassBoundary(
        treatmentClass, "formal_follow_up", boundaryById, usedBoundaryIds,
        selectionBlockers, selectionBoundaryBlockers
      );
    }
  }

  const fingerprintsWithoutFormalFollowUp: string[] = [];
  for (const fingerprint of materialFingerprints) {
    if (["incomplete", "inaccessible", "not_applicable"].includes(
      fingerprint.formal_follow_up
    )) fingerprintsWithoutFormalFollowUp.push(fingerprint.fingerprint_id);
    if (
      fingerprint.formal_follow_up === "incomplete" ||
      fingerprint.formal_follow_up === "not_applicable"
    ) {
      handleOmission(
        `Program fingerprint ${fingerprint.fingerprint_id} lacks formal-evidence follow-up`,
        fingerprint, false, selectionBlockers, planningWarnings
      );
    } else if (fingerprint.formal_follow_up === "inaccessible") {
      requireBoundary({
        boundaryId: fingerprint.formal_follow_up_boundary_id,
        expectedScopeType: "formal_follow_up",
        expectedScopeId: fingerprint.fingerprint_id,
        boundaryById,
        usedBoundaryIds,
        substantiveTarget: selectionBlockers,
        boundedTarget: selectionBoundaryBlockers
      });
    } else if (fingerprint.formal_follow_up_boundary_id !== undefined) {
      selectionBlockers.push(
        `Program fingerprint ${fingerprint.fingerprint_id} cites a formal-follow-up boundary without an inaccessible state.`
      );
    }
  }

  const availableUnselectedFingerprints: string[] = [];
  for (const fingerprint of materialFingerprints) {
    const signature = signatureByFingerprintId.get(fingerprint.fingerprint_id)!;
    const sameProgramSelected = [...selectedFingerprintIds].some((id) =>
      signatureByFingerprintId.get(id) === signature
    );
    const hasAvailableCandidate = (candidatesByFingerprint.get(fingerprint.fingerprint_id) ?? [])
      .some(({ selection_status }) => selection_status !== "inaccessible");
    if (hasAvailableCandidate && !sameProgramSelected) {
      availableUnselectedFingerprints.push(fingerprint.fingerprint_id);
      handleOmission(
        `Program fingerprint ${fingerprint.fingerprint_id} is available but not selected`,
        fingerprint, false, selectionBlockers, planningWarnings
      );
    }
  }

  const pendingExternalScoutCandidates: string[] = [];
  let screenedExternalScoutCandidates = 0;
  for (const scout of externalScoutById.values()) {
    if (scout.screening_status !== "inaccessible" && scout.access_boundary_id !== undefined) {
      invalidate(
        invalid.external_scout_candidates, scout.video_id, selectionBlockers,
        `External scout candidate ${scout.video_id} cites an access boundary without an inaccessible state.`
      );
      continue;
    }
    if (scout.screening_status === "screened") {
      const candidate = candidateById.get(scout.video_id);
      if (
        candidate === undefined || scout.fingerprint_id !== candidate.fingerprint_id ||
        scout.materiality !== candidate.materiality
      ) {
        invalidate(
          invalid.external_scout_candidates, scout.video_id, selectionBlockers,
          `Screened external scout candidate ${scout.video_id} lacks a state-consistent candidate and fingerprint record.`
        );
      } else {
        screenedExternalScoutCandidates += 1;
        if (scout.redundancy === "unknown") {
          pendingExternalScoutCandidates.push(scout.video_id);
          selectionBlockers.push(
            `Screened external scout candidate ${scout.video_id} still has unresolved program redundancy.`
          );
        } else if (scout.redundancy === "duplicate") {
          const duplicate = scout.duplicate_of_video_id === undefined
            ? undefined
            : candidateById.get(scout.duplicate_of_video_id);
          if (
            duplicate === undefined ||
            signatureByFingerprintId.get(duplicate.fingerprint_id) !==
              signatureByFingerprintId.get(candidate.fingerprint_id)
          ) {
            selectionBlockers.push(
              `External scout candidate ${scout.video_id} claims duplication without a matching normalized program.`
            );
          }
        } else if (scout.duplicate_of_video_id !== undefined) {
          selectionBlockers.push(
            `Distinct external scout candidate ${scout.video_id} cites an inconsistent duplicate target.`
          );
        }
        if (scout.materiality === "not_material") {
          handleOmission(
            `External scout candidate ${scout.video_id} was screened as not material`,
            scout,
            true,
            selectionBlockers,
            planningWarnings
          );
        }
      }
    } else if (scout.screening_status === "inaccessible") {
      requireBoundary({
        boundaryId: scout.access_boundary_id,
        expectedScopeType: "candidate_video", expectedScopeId: scout.video_id,
        boundaryById, usedBoundaryIds,
        substantiveTarget: selectionBlockers,
        boundedTarget: selectionBoundaryBlockers
      });
      pendingExternalScoutCandidates.push(scout.video_id);
    } else {
      pendingExternalScoutCandidates.push(scout.video_id);
      selectionBlockers.push(
        `Validated external scout candidate ${scout.video_id} remains unscreened; materiality and redundancy cannot waive screening.`
      );
    }
  }

  const validMaterialSignatures = new Set(materialFingerprints.map((fingerprint) =>
    signatureByFingerprintId.get(fingerprint.fingerprint_id)!
  ));
  const ledgerShowsBroadTreatmentSpace = materialClasses.length > 1 ||
    validMaterialSignatures.size > 1 || candidateById.size >= 20 ||
    videosActuallyAudited.length >= 4;
  const effectiveBroadTreatmentChoice = input.broad_treatment_choice ||
    ledgerShowsBroadTreatmentSpace;
  if (!input.broad_treatment_choice && ledgerShowsBroadTreatmentSpace) {
    planningWarnings.push(
      "The caller's narrow-scope label was ignored because the valid ledger shows a broad treatment space."
    );
  }

  if (effectiveBroadTreatmentChoice) {
    for (const [direction, search] of Object.entries(input.directional_searches)) {
      if (search.status === "incomplete" || search.status === "not_applicable") {
        selectionBlockers.push(`Broad treatment choice requires a deliberate ${direction} search.`);
      } else if (search.status === "inaccessible") {
        requireBoundary({
          boundaryId: search.access_boundary_id,
          expectedScopeType: "directional_search", expectedScopeId: direction,
          boundaryById, usedBoundaryIds,
          substantiveTarget: selectionBlockers,
          boundedTarget: selectionBoundaryBlockers
        });
      } else if (search.access_boundary_id !== undefined) {
        selectionBlockers.push(
          `Directional search ${direction} cites an access boundary without an inaccessible state.`
        );
      }
    }
  }

  const validBatches = [...validBatchById.values()].filter((batch) =>
    !invalid.discovery_batches.has(batch.batch_id)
  );
  const unresolvedNewFingerprints = unique(validBatches.flatMap((batch) =>
    batch.new_program_fingerprint_ids
  )).map((id) => fingerprintById.get(id)).filter(
    (value): value is NonNullable<typeof value> => {
      if (value === undefined || value.materiality === "not_material") return false;
      const signature = signatureByFingerprintId.get(value.fingerprint_id);
      const selected = signature !== undefined && selectedSignatureCounts.has(signature);
      const formalResolved = [
        "complete", "support_not_located", "outcome_mismatch"
      ].includes(value.formal_follow_up);
      return !selected || !formalResolved;
    }
  );
  if (unresolvedNewFingerprints.length > 0) {
    selectionBlockers.push(
      `${unresolvedNewFingerprints.length} new material program hypothesis or hypotheses remain unresolved across discovery batches.`
    );
  }
  if (input.further_expansion_likely_to_improve_answer === "yes") {
    selectionBlockers.push("Further executable expansion is likely to improve the answer.");
  } else if (input.further_expansion_likely_to_improve_answer === "blocked") {
    const boundary = [...boundaryById.values()].find(({ scope_type }) =>
      scope_type === "landscape_scope"
    );
    requireBoundary({
      boundaryId: boundary?.boundary_id,
      expectedScopeType: "landscape_scope", expectedScopeId: "landscape",
      boundaryById, usedBoundaryIds,
      substantiveTarget: selectionBlockers,
      boundedTarget: selectionBoundaryBlockers
    });
  }

  const redundancyFlags = [
    ...[...fingerprintIdsBySignature.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([, ids]) => `Program fingerprint IDs ${ids.join(", ")} describe the same normalized program.`),
    ...[...selectedSignatureCounts.entries()]
      .filter(([, count]) => count > 2)
      .map(([signature, count]) =>
        `${count} selected videos repeat normalized program ${signature.slice(0, 12)}.`
      )
  ];
  if ([...fingerprintIdsBySignature.values()].some((ids) => ids.length > 1)) {
    selectionBlockers.push(
      "Multiple program fingerprint IDs describe the same normalized program and cannot establish diversity."
    );
  }
  const independentChannelIds = new Set(videosActuallyAudited
    .map(({ channel_id: id }) => id)
    .filter((id) => id !== "not_reported"));
  const ledgerShowsSubstantialCorpus = candidateById.size >= 20;
  const effectiveSubstantialCorpus =
    input.substantial_youtube_corpus === "yes" || ledgerShowsSubstantialCorpus;
  const geminiSparkFrontiers = [...validFrontierByDigest.values()].filter(
    ({ source }) => source === "gemini_spark"
  );
  const validatedGeminiSparkCandidates = unique(geminiSparkFrontiers.flatMap(
    ({ validated_candidate_video_ids }) => validated_candidate_video_ids
  ));
  const availableMaterialCandidateCount = [...candidateById.values()].filter((candidate) => {
    const treatmentClass = classById.get(candidate.treatment_class_id);
    const fingerprint = fingerprintById.get(candidate.fingerprint_id);
    return candidate.materiality !== "not_material" &&
      treatmentClass !== undefined && treatmentClass.materiality !== "not_material" &&
      fingerprint !== undefined && fingerprint.materiality !== "not_material" &&
      fingerprint.availability_status === "available";
  }).length;
  const broadStructuralMinimumsApplied = effectiveBroadTreatmentChoice &&
    effectiveSubstantialCorpus && availableMaterialCandidateCount >= 8 &&
    validMaterialSignatures.size >= 6;
  const broadStructuralMinimumsMet = !broadStructuralMinimumsApplied ||
    (fullyAuditedVideos >= 8 && fullyAuditedSignatures.size >= 6);
  if (
    effectiveBroadTreatmentChoice &&
    input.substantial_youtube_corpus === "no" &&
    ledgerShowsSubstantialCorpus
  ) {
    selectionBlockers.push(
      "The caller labels the YouTube corpus as not substantial, but the valid ledger contains at least 20 candidates; caller labels cannot waive structural coverage checks."
    );
  }
  if (
    effectiveBroadTreatmentChoice && effectiveSubstantialCorpus &&
    videosActuallyAudited.length <= 3
  ) {
    selectionBlockers.push(
      "Two or three videos cannot establish broad treatment-space coverage in a substantial corpus."
    );
  }
  if (effectiveBroadTreatmentChoice && effectiveSubstantialCorpus) {
    if (geminiSparkFrontiers.length === 0) {
      selectionBlockers.push(
        "Broad treatment-space completion requires a validated Gemini Spark candidate frontier; native generic discovery cannot silently substitute for the configured high-recall scout."
      );
    } else if (validatedGeminiSparkCandidates.length === 0) {
      selectionBlockers.push(
        "The Gemini Spark frontier contains no identity-validated candidate, so broad treatment-space completion remains open."
      );
    }
  }
  if (
    broadStructuralMinimumsApplied &&
    videosActuallyAudited.length < 8
  ) {
    selectionBlockers.push(
      "Broad completion requires selecting at least eight material videos for full audit when the valid ledger contains that many candidates across six distinct programs."
    );
  }
  if (
    broadStructuralMinimumsApplied &&
    selectedSignatureCounts.size < 6
  ) {
    selectionBlockers.push(
      "The valid ledger contains at least six available distinct programs; broad completion requires selecting at least six of them for full audit."
    );
  }
  if (
    effectiveBroadTreatmentChoice &&
    videosActuallyAudited.length > 3 && selectedSignatureCounts.size <= 2
  ) {
    selectionBlockers.push(
      "A broad selected set concentrated in one or two program fingerprints cannot establish treatment-space coverage."
    );
  }
  if (
    effectiveBroadTreatmentChoice && effectiveSubstantialCorpus &&
    selectedSignatureCounts.size < 6 &&
    [...selectedSignatureCounts.values()].some((count) => count > 2)
  ) {
    selectionBlockers.push(
      "More than two repeated videos from one program cannot substitute for broader program coverage."
    );
  }
  if (
    effectiveBroadTreatmentChoice && effectiveSubstantialCorpus &&
    videosActuallyAudited.length > 3 && independentChannelIds.size < 3
  ) {
    selectionBlockers.push(
      "Broad treatment-space coverage requires multiple independent channels or discussion pools."
    );
  }

  if (effectiveBroadTreatmentChoice && effectiveSubstantialCorpus) {
    if (candidateById.size < 20) planningWarnings.push(
      "Planning heuristic: broad questions ordinarily screen 20-40 candidate videos when material candidates exist."
    );
    if (validMaterialSignatures.size < 8) planningWarnings.push(
      "Planning heuristic: seek about 8 materially distinct program hypotheses when the corpus supports them."
    );
    if (videosActuallyAudited.length > 15) planningWarnings.push(
      "Planning heuristic: a broad deep audit ordinarily stays within about 8-15 material videos after minimum coverage is met."
    );
  }

  for (const boundary of boundaryById.values()) {
    if (!usedBoundaryIds.has(boundary.boundary_id)) {
      selectionBlockers.push(`Access boundary ${boundary.boundary_id} is not linked to its claimed scope.`);
    }
  }

  const uniqueSelectionBlockers = unique(selectionBlockers);
  const uniqueDepthBlockers = unique(depthBlockers);
  const uniqueBoundaryBlockers = unique([
    ...selectionBoundaryBlockers, ...depthBoundaryBlockers
  ]);
  const blockers = unique([
    ...uniqueSelectionBlockers, ...uniqueDepthBlockers, ...uniqueBoundaryBlockers
  ]);
  const selectionCoverageLock =
    uniqueSelectionBlockers.length === 0 && selectionBoundaryBlockers.length === 0
      ? "pass" : "block";
  const perVideoDepthLock =
    uniqueDepthBlockers.length === 0 && depthBoundaryBlockers.length === 0
      ? "pass" : "block";
  const synthesisLock = blockers.length === 0 ? "pass" : "block";
  const answerBoundary = synthesisLock === "pass"
    ? "ledger_consistent_for_synthesis"
    : uniqueSelectionBlockers.length > 0 || uniqueDepthBlockers.length > 0
      ? "continue_research"
      : "bounded_nonranking_only";

  return treatmentLandscapeCoverageOutputSchema.parse({
    coverage_claim: "ledger_consistency_only",
    treatment_classes_discovered: materialClasses.length,
    specific_implementation_search_status_by_class:
      specificImplementationSearchStatusByClass,
    materially_distinct_program_fingerprints: validMaterialSignatures.size,
    candidate_videos_screened: candidateById.size,
    external_scout_candidates_screened: screenedExternalScoutCandidates,
    external_scout_candidates_pending: unique(pendingExternalScoutCandidates),
    broad_structural_minimums_applied: broadStructuralMinimumsApplied,
    broad_structural_minimums_met: broadStructuralMinimumsMet,
    material_videos_selected: videosActuallyAudited.length,
    material_videos_fully_audited: fullyAuditedVideos,
    materially_distinct_programs_fully_audited: fullyAuditedSignatures.size,
    independent_channels_or_pools: independentChannelIds.size,
    treatment_classes_with_no_selected_video: materialClasses
      .filter(({ class_id }) => !selectedClasses.has(class_id))
      .map(({ class_id }) => class_id),
    treatment_classes_with_no_formal_evidence_follow_up: classesWithoutFormalFollowUp,
    program_fingerprints_with_no_formal_evidence_follow_up:
      fingerprintsWithoutFormalFollowUp,
    program_fingerprints_available_but_not_selected: availableUnselectedFingerprints,
    program_fingerprint_missing_fields: [...fingerprintById.values()].map((fingerprint) => ({
      fingerprint_id: fingerprint.fingerprint_id,
      fields: missingProgramFields(fingerprint)
    })),
    uncovered_material_treatment_classes: [...uncovered],
    redundancy_flags: compactMessages(redundancyFlags),
    further_expansion_likely_to_improve_answer:
      input.further_expansion_likely_to_improve_answer,
    videos_actually_audited: videosActuallyAudited,
    invalid_record_ids: {
      discovery_batches: [...invalid.discovery_batches],
      specific_implementation_searches: [...invalid.specific_implementation_searches],
      treatment_classes: [...invalid.treatment_classes],
      program_fingerprints: [...invalid.program_fingerprints],
      candidate_videos: [...invalid.candidate_videos],
      external_scout_frontiers: [...invalid.external_scout_frontiers],
      external_scout_candidates: [...invalid.external_scout_candidates],
      selected_videos: [...invalid.selected_videos],
      access_boundaries: [...invalid.access_boundaries]
    },
    selection_coverage_lock: selectionCoverageLock,
    per_video_depth_lock: perVideoDepthLock,
    synthesis_lock: synthesisLock,
    answer_boundary: answerBoundary,
    selection_blockers: compactMessages(uniqueSelectionBlockers),
    depth_blockers: compactMessages(uniqueDepthBlockers),
    boundary_blockers: compactMessages(uniqueBoundaryBlockers),
    blockers: compactMessages(blockers),
    planning_warnings: compactMessages(unique(planningWarnings).sort((left, right) =>
      Number(right.startsWith("Planning heuristic:")) -
      Number(left.startsWith("Planning heuristic:"))
    )),
    access_boundary_ids_used: [...usedBoundaryIds]
  });
}

export function createTreatmentLandscapeCoverageActionRoute(): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: "/actions/research/assess_treatment_landscape_coverage",
    operationId: "assess_treatment_landscape_coverage",
    summary: "AskRigor assess treatment landscape coverage",
    description: "Check a supplied, receipt-linked treatment discovery ledger; derive normalized program diversity and separate selection, video-depth, and overall locks. This checks ledger consistency, not semantic completeness or medical truth.",
    consequential: false,
    public: true,
    publicResearch: true,
    maximumRequestBytes: 65_536,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(treatmentLandscapeCoverageInputSchema),
    responseSchemas: {
      200: actionJsonSchema(treatmentLandscapeCoverageOutputSchema),
      422: ACTION_INPUT_INVALID_SCHEMA
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsed = treatmentLandscapeCoverageInputSchema.safeParse(body);
      if (!parsed.success) {
        return {
          status: 422,
          body: { error: { code: "action_input_invalid", retryable: false } }
        };
      }
      return { status: 200, body: assessTreatmentLandscapeCoverage(parsed.data) };
    }
  });
}

const ACTION_INPUT_INVALID_SCHEMA = {
  type: "object", additionalProperties: false, required: ["error"],
  properties: {
    error: {
      type: "object", additionalProperties: false, required: ["code", "retryable"],
      properties: {
        code: { const: "action_input_invalid" }, retryable: { const: false }
      }
    }
  }
} as const;

function evaluateTranscriptReceipt(
  videoId: string,
  receipt: TranscriptCoverageReceipt,
  boundaryById: ReadonlyMap<string, z.output<typeof accessBoundarySchema>>,
  usedBoundaryIds: Set<string>,
  depthBlockers: string[],
  boundaryBlockers: string[]
): boolean {
  const complete = receipt.access_status === "api_visible_complete" &&
    receipt.pagination.chain_started_at_first_page &&
    receipt.pagination.cursor_chain_reconciled &&
    receipt.pagination.exhausted && !receipt.pagination.next_cursor_present &&
    receipt.selected_track.language_code !== "not_reported" &&
    receipt.selected_track.language_name !== "not_reported" &&
    receipt.selected_track.is_auto_generated !== "not_reported" &&
    receipt.timestamp_provenance === "segment_timestamp_urls";
  if (complete && receipt.access_boundary_id === undefined) return true;
  if (complete) {
    depthBlockers.push(`Video ${videoId} transcript cites a boundary despite complete retrieval.`);
    return false;
  }
  if (receipt.pagination.next_cursor_present || receipt.error_retryable === true) {
    depthBlockers.push(`Video ${videoId} transcript retrieval still has executable work.`);
    reconcileBoundaryReference({
      boundaryId: receipt.access_boundary_id,
      expectedScopeType: "video_transcript", expectedScopeId: videoId,
      expectedAccessStatus: receipt.access_status,
      boundaryById, usedBoundaryIds, blockers: depthBlockers
    });
    return false;
  }
  requireBoundary({
    boundaryId: receipt.access_boundary_id,
    expectedScopeType: "video_transcript", expectedScopeId: videoId,
    expectedAccessStatus: receipt.access_status,
    boundaryById, usedBoundaryIds,
    substantiveTarget: depthBlockers, boundedTarget: boundaryBlockers
  });
  return false;
}

function evaluateDiscussionReceipt(
  videoId: string,
  audit: DiscussionCoverageReceipt,
  boundaryById: ReadonlyMap<string, z.output<typeof accessBoundarySchema>>,
  usedBoundaryIds: Set<string>,
  depthBlockers: string[],
  boundaryBlockers: string[]
): boolean {
  const countsReconcile =
    audit.top_level_comments_retrieved_cumulative + audit.replies_retrieved_cumulative ===
      audit.records_retrieved_cumulative &&
    audit.top_level_records_returned_for_analysis +
      audit.reply_records_returned_for_analysis === audit.records_returned_for_analysis &&
    audit.records_returned_for_analysis <= audit.records_retrieved_cumulative;
  if (!countsReconcile) {
    depthBlockers.push(`Video ${videoId} discussion receipt counts do not reconcile.`);
    return false;
  }
  const providerCountReconciles = audit.provider_reported_comments === undefined ||
    Number(audit.provider_reported_comments) === audit.records_retrieved_cumulative;
  const receipt = audit.receipt;
  const complete = audit.metadata_access_status === "api_visible_complete" &&
    audit.access_status === "api_visible_complete" &&
    audit.extraction_coverage === "api_visible_complete" &&
    receipt.completion_state === "api_visible_complete" &&
    receipt.synthesis_lock === "pass" && receipt.chain_started_at_first_page &&
    receipt.top_level_pagination_exhausted && receipt.replies_reconciled &&
    receipt.blockers.length === 0 &&
    audit.reply_count_mismatches.length === 0 && !audit.continuation_recommended &&
    providerCountReconciles;
  if (complete && audit.access_boundary_id === undefined) return true;
  if (complete) {
    depthBlockers.push(`Video ${videoId} discussion cites a boundary despite complete retrieval.`);
    return false;
  }
  if (
    receipt.synthesis_lock === "block" || receipt.completion_state === "incomplete" ||
    audit.continuation_recommended || audit.error_retryable === true
  ) {
    depthBlockers.push(`Video ${videoId} discussion audit still has executable work.`);
    reconcileBoundaryReference({
      boundaryId: audit.access_boundary_id,
      expectedScopeType: "video_discussion", expectedScopeId: videoId,
      expectedAccessStatus: audit.access_status,
      boundaryById, usedBoundaryIds, blockers: depthBlockers
    });
    return false;
  }
  requireBoundary({
    boundaryId: audit.access_boundary_id,
    expectedScopeType: "video_discussion", expectedScopeId: videoId,
    expectedAccessStatus: audit.access_status,
    boundaryById, usedBoundaryIds,
    substantiveTarget: depthBlockers, boundedTarget: boundaryBlockers
  });
  return false;
}

function requireClassBoundary(
  treatmentClass: z.output<typeof treatmentClassSchema>,
  scopeType: "treatment_class" | "formal_follow_up",
  boundaryById: ReadonlyMap<string, z.output<typeof accessBoundarySchema>>,
  usedBoundaryIds: Set<string>,
  substantiveTarget: string[],
  boundedTarget: string[]
): void {
  const boundaryId = treatmentClass.access_boundary_ids.find((id) => {
    const boundary = boundaryById.get(id);
    return boundary?.scope_type === scopeType &&
      boundary.scope_id === treatmentClass.class_id;
  });
  requireBoundary({
    boundaryId, expectedScopeType: scopeType, expectedScopeId: treatmentClass.class_id,
    boundaryById, usedBoundaryIds, substantiveTarget, boundedTarget
  });
}

function requireBoundary(input: {
  boundaryId: string | undefined;
  expectedScopeType: z.output<typeof accessBoundarySchema>["scope_type"];
  expectedScopeId: string;
  expectedAccessStatus?: z.output<typeof accessStatusSchema>;
  boundaryById: ReadonlyMap<string, z.output<typeof accessBoundarySchema>>;
  usedBoundaryIds: Set<string>;
  substantiveTarget: string[];
  boundedTarget: string[];
}): void {
  if (input.boundaryId === undefined) {
    input.substantiveTarget.push(
      `${input.expectedScopeType} ${input.expectedScopeId} lacks a structured access boundary.`
    );
    return;
  }
  const boundary = input.boundaryById.get(input.boundaryId);
  if (
    boundary === undefined || boundary.scope_type !== input.expectedScopeType ||
    boundary.scope_id !== input.expectedScopeId ||
    (input.expectedAccessStatus !== undefined &&
      boundary.access_status !== input.expectedAccessStatus)
  ) {
    input.substantiveTarget.push(
      `${input.expectedScopeType} ${input.expectedScopeId} references a missing, mismatched, or status-inconsistent access boundary.`
    );
    return;
  }
  input.usedBoundaryIds.add(boundary.boundary_id);
  if (!boundary.terminal || boundary.retryable || !boundary.recovery_attempted) {
    input.substantiveTarget.push(
      `Access boundary ${boundary.boundary_id} still has executable recovery work.`
    );
    return;
  }
  input.boundedTarget.push(
    `Access boundary ${boundary.boundary_id} prevents complete coverage: ${boundary.description}`
  );
}

function reconcileBoundaryReference(input: {
  boundaryId: string | undefined;
  expectedScopeType: z.output<typeof accessBoundarySchema>["scope_type"];
  expectedScopeId: string;
  expectedAccessStatus: z.output<typeof accessStatusSchema>;
  boundaryById: ReadonlyMap<string, z.output<typeof accessBoundarySchema>>;
  usedBoundaryIds: Set<string>;
  blockers: string[];
}): void {
  if (input.boundaryId === undefined) return;
  const boundary = input.boundaryById.get(input.boundaryId);
  if (
    boundary === undefined || boundary.scope_type !== input.expectedScopeType ||
    boundary.scope_id !== input.expectedScopeId ||
    boundary.access_status !== input.expectedAccessStatus
  ) {
    input.blockers.push(
      `${input.expectedScopeType} ${input.expectedScopeId} references a missing, mismatched, or status-inconsistent access boundary.`
    );
    return;
  }
  input.usedBoundaryIds.add(boundary.boundary_id);
}

function handleOmission(
  subject: string,
  record: { omission_impact: z.output<typeof omissionImpactSchema>; omission_rationale: string },
  nonrelevanceSupported: boolean,
  blockers: string[],
  warnings: string[]
): void {
  const message = `${subject}: ${record.omission_rationale}`;
  (
    record.omission_impact === "not_decision_relevant" && nonrelevanceSupported
      ? warnings
      : blockers
  ).push(message);
}

function isCompleteAccess(status: z.output<typeof accessStatusSchema>): boolean {
  return status === "complete" || status === "api_visible_complete";
}

function isProgramNotDescribed(value: string): boolean {
  return normalizeProgramValue(value) === PROGRAM_NOT_DESCRIBED;
}

function normalizeProgramValue(value: string): string {
  return value.trim().toLocaleLowerCase("en-US")
    .replaceAll(/[_-]+/gu, " ").replaceAll(/\s+/gu, " ");
}

const GENERIC_UMBRELLA_TERMS = new Set([
  "adverse effects", "alternative treatment", "approach", "approaches", "benefit",
  "benefits", "care", "conservative care", "diet", "exercise", "failure", "function",
  "functional outcome", "harm", "harms", "injection", "injections", "intervention",
  "interventions", "lifestyle", "management", "mechanical", "method", "methods",
  "mobility", "modality", "modalities", "no effect", "outcome", "outcomes", "pain",
  "physical therapy", "procedure", "procedures", "program", "programs", "progression",
  "protocol", "protocols", "pt", "recovery", "regimen", "regimens", "rehab",
  "rehabilitation", "results", "routine", "routines", "safety", "specific program",
  "strategy", "strategies", "surgery", "symptoms", "therapy", "treatment"
]);

const GENERIC_IMPLEMENTATION_TOKENS = new Set([
  "a", "an", "and", "approach", "approaches", "care", "conservative", "diet",
  "exercise", "general", "home", "injection", "injections", "intervention",
  "interventions", "lifestyle", "management", "mechanical", "method", "methods",
  "modality", "modalities", "or", "physical", "procedure", "procedures", "program",
  "programs", "protocol", "protocols", "pt", "regimen", "regimens", "rehab",
  "rehabilitation", "routine", "routines", "specific", "standard", "strategy",
  "strategies", "surgery", "therapy", "treatment", "usual"
]);

function isGenericUmbrellaTerm(value: string): boolean {
  const normalized = normalizeSearchPhrase(value);
  return GENERIC_UMBRELLA_TERMS.has(normalized) ||
    normalized.split(" ").every((token) => GENERIC_IMPLEMENTATION_TOKENS.has(token));
}

function normalizedTextContains(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeSearchPhrase(haystack);
  const normalizedNeedle = normalizeSearchPhrase(needle);
  return normalizedHaystack === normalizedNeedle ||
    normalizedHaystack.startsWith(`${normalizedNeedle} `) ||
    normalizedHaystack.endsWith(` ${normalizedNeedle}`) ||
    normalizedHaystack.includes(` ${normalizedNeedle} `);
}

function normalizeSearchPhrase(value: string): string {
  return normalizeProgramValue(value)
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ").trim().replaceAll(/\s+/gu, " ");
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function deriveExternalScoutFrontierDigest(
  frontier: z.output<typeof externalScoutFrontierSchema>
): string {
  return createHash("sha256").update(JSON.stringify({
    source_candidate_video_ids: frontier.source_candidate_video_ids,
    validated_candidate_video_ids: frontier.validated_candidate_video_ids,
    terminally_rejected_video_ids: frontier.terminally_rejected_video_ids,
    unresolved_candidate_video_ids: frontier.unresolved_candidate_video_ids
  }), "utf8").digest("hex");
}

function programFieldEntries(
  fingerprint: ProgramSignatureFields
): Array<[z.output<typeof programFieldNameSchema>, string]> {
  return [
    ["components", fingerprint.components],
    ["dose_or_intensity", fingerprint.dose_or_intensity],
    ["frequency", fingerprint.frequency],
    ["duration", fingerprint.duration],
    ["supervision", fingerprint.supervision],
    ["adherence_or_fidelity", fingerprint.adherence_or_fidelity],
    ["cointerventions", fingerprint.cointerventions],
    ["stage_or_baseline", fingerprint.stage_or_baseline],
    ["outcome", fingerprint.outcome],
    ["horizon", fingerprint.horizon],
    ["care_stage", fingerprint.care_stage]
  ];
}

function missingProgramFields(
  fingerprint: z.output<typeof programFingerprintSchema>
): z.output<typeof programFieldNameSchema>[] {
  return programFieldEntries(fingerprint)
    .filter(([, value]) => isProgramNotDescribed(value))
    .map(([field]) => field);
}

function invalidate(
  target: Set<string>, id: string, blockers: string[], message: string
): void {
  target.add(id);
  blockers.push(message);
}

function markDuplicates<T>(
  values: readonly T[], key: (value: T) => string, target: Set<string>,
  blockers: string[], label: string
): void {
  for (const id of duplicates(values.map(key))) {
    target.add(id);
    blockers.push(`${label} ID ${id} is duplicated.`);
  }
}

function mapValid<T>(
  values: readonly T[], key: (value: T) => string, invalidIds: ReadonlySet<string>
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (!invalidIds.has(id)) result.set(id, value);
  }
  return result;
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const id = key(value);
    const group = result.get(id) ?? [];
    group.push(value);
    result.set(id, group);
  }
  return result;
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) {
    const id = key(value);
    result.set(id, (result.get(id) ?? 0) + 1);
  }
  return result;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function compactMessages(values: readonly string[]): string[] {
  const compact = unique(values).map((value) =>
    value.length <= 160 ? value : `${value.slice(0, 157)}...`
  );
  if (compact.length <= 12) return compact;
  return [
    ...compact.slice(0, 11),
    `${compact.length - 11} additional record-specific message(s) remain in the supplied ledger.`
  ];
}

function compactText(value: string): string {
  return value.length <= 160 ? value : `${value.slice(0, 157)}...`;
}

function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _dialect, ...openApiSchema } = converted;
  return openApiSchema;
}
