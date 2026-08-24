import { createHash } from "node:crypto";

import { z } from "zod";

import type { ResearchBidirectionalIterationState } from "./research-bidirectional-iteration.js";
import { deriveBidirectionalIterationStatus } from "./research-bidirectional-iteration.js";
import type {
  ResearchCandidateDiscoveryState,
  ResearchCandidateRecord
} from "./research-candidate-frontier.js";
import {
  formalEvidenceScreeningComplete,
  type ResearchFormalEvidenceState
} from "./research-formal-evidence.js";
import type { ResearchVideoDepthState } from "./research-video-depth-controller.js";
import {
  assessTreatmentLandscapeCoverage,
  deriveProgramSignature,
  treatmentLandscapeCoverageOutputSchema,
  type TreatmentLandscapeCoverageInput,
  type TreatmentLandscapeCoverageOutput
} from "./treatment-landscape-coverage-route.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const shortId = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/u);
const youtubeVideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

const directionSchema = z.enum([
  "benefit",
  "no_effect_or_failure",
  "harm",
  "discontinuation",
  "eventual_standard_treatment"
]);

const batchReferenceSchema = z.object({
  batch_id: shortId,
  query_or_scope: bounded(800),
  candidate_video_ids: z.array(youtubeVideoId).max(100),
  access_status: bounded(80),
  exhausted: z.boolean(),
  next_cursor_present: z.boolean(),
  server_direction_hints: z.array(directionSchema).max(5)
}).strict();

const candidateReferenceSchema = z.object({
  video_id: youtubeVideoId,
  title: bounded(500),
  channel_id: bounded(100),
  channel_title: bounded(500),
  published_at: bounded(100),
  treatment_class_id: shortId,
  treatment_class_label: bounded(160),
  fingerprint_id: shortId,
  program: z.object({
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
  }).strict(),
  materiality: z.enum(["MATERIAL", "NOT_MATERIAL"]),
  selection_status: z.enum(["SELECTED", "NOT_SELECTED"]),
  discovery_batch_ids: z.array(shortId).min(1).max(18),
  screening_rationale: bounded(1_000)
}).strict();

const selectedVideoReferenceSchema = z.object({
  video_id: youtubeVideoId,
  fingerprint_id: shortId,
  transcript_receipt_sha256: digest,
  discussion_receipt_sha256: digest
}).strict();

export const treatmentLandscapeWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_treatment_landscape_v1"),
  evidence_basis_digest: digest,
  attempt: z.number().int().positive().max(100),
  research_target: bounded(1_000),
  discovery_batches: z.array(batchReferenceSchema).min(1).max(40),
  candidates: z.array(candidateReferenceSchema).min(1).max(100),
  selected_videos: z.array(selectedVideoReferenceSchema).min(1).max(76),
  bidirectional_status: z.enum(["COMPLETE", "BLOCKED_TERMINAL"])
}).strict();

const specificSearchAnnotationSchema = z.object({
  search_id: shortId,
  discovery_batch_id: shortId,
  treatment_class_id: shortId,
  implementation_terms: z.array(bounded(240)).min(1).max(8),
  discriminator_terms: z.array(bounded(240)).min(1).max(8),
  candidate_video_ids: z.array(youtubeVideoId).max(100)
}).strict();

const selectedVideoInterpretationSchema = z.object({
  video_id: youtubeVideoId,
  stage_or_baseline: bounded(160),
  outcome_and_horizon: bounded(160),
  nonredundant_value: bounded(160),
  what_it_changed: bounded(160)
}).strict();

export const treatmentLandscapeSubmissionSchema = z.object({
  package_version: z.literal("askrigor_treatment_landscape_v1"),
  evidence_basis_digest: digest,
  attempt: z.number().int().positive().max(100),
  broad_treatment_choice: z.boolean(),
  specific_implementation_searches: z.array(specificSearchAnnotationSchema).max(120),
  directional_search_batches: z.object({
    benefit: z.array(shortId).max(40),
    no_effect_or_failure: z.array(shortId).max(40),
    harm: z.array(shortId).max(40),
    discontinuation: z.array(shortId).max(40),
    eventual_standard_treatment: z.array(shortId).max(40)
  }).strict(),
  selected_video_interpretations:
    z.array(selectedVideoInterpretationSchema).min(1).max(76),
  further_expansion_likely_to_improve_answer: z.enum(["yes", "no", "blocked"])
}).strict();

const treatmentAttemptSchema = z.object({
  attempt: z.number().int().positive().max(100),
  evidence_basis_digest: digest,
  semantic_submission_digest: digest,
  assessor_input_digest: digest,
  assessment: treatmentLandscapeCoverageOutputSchema
}).strict();

export const researchTreatmentFinalizationStateSchema = z.object({
  state_version: z.literal("askrigor_treatment_finalization_v1"),
  attempts: z.array(treatmentAttemptSchema).max(100)
}).strict();

export type ResearchTreatmentFinalizationState = z.output<
  typeof researchTreatmentFinalizationStateSchema
>;
export type TreatmentLandscapeWorkPackage = z.output<
  typeof treatmentLandscapeWorkPackageSchema
>;
export type TreatmentLandscapeSubmission = z.output<
  typeof treatmentLandscapeSubmissionSchema
>;

export const treatmentFinalizationDiagnosticsSchema = z.object({
  attempts: z.number().int().nonnegative(),
  current_evidence_basis_assessed: z.boolean(),
  selection_coverage_lock: z.enum(["pass", "block", "not_assessed"]),
  per_video_depth_lock: z.enum(["pass", "block", "not_assessed"]),
  synthesis_lock: z.enum(["pass", "block", "not_assessed"]),
  answer_boundary: z.enum([
    "ledger_consistent_for_synthesis",
    "bounded_nonranking_only",
    "continue_research",
    "not_assessed"
  ]),
  blockers: z.array(bounded(800)).max(500)
}).strict();

export interface TreatmentFinalizationEvidence {
  researchTarget: string;
  candidates: ResearchCandidateDiscoveryState;
  videoDepth: ResearchVideoDepthState;
  formalEvidence: ResearchFormalEvidenceState;
  bidirectional: ResearchBidirectionalIterationState;
}

export function initialResearchTreatmentFinalizationState(): ResearchTreatmentFinalizationState {
  return researchTreatmentFinalizationStateSchema.parse({
    state_version: "askrigor_treatment_finalization_v1",
    attempts: []
  });
}

export function createTreatmentLandscapeWorkPackage(
  rawState: ResearchTreatmentFinalizationState,
  evidence: TreatmentFinalizationEvidence
): TreatmentLandscapeWorkPackage {
  const state = researchTreatmentFinalizationStateSchema.parse(rawState);
  const bidirectionalStatus = deriveBidirectionalIterationStatus(
    evidence.bidirectional,
    bidirectionalEvidence(evidence)
  );
  if (!["COMPLETE", "BLOCKED_TERMINAL"].includes(bidirectionalStatus)) {
    throw new Error("Treatment finalization requires resolved or terminally bounded bidirectional work");
  }
  const structural = deriveStructuralLedger(evidence);
  return treatmentLandscapeWorkPackageSchema.parse({
    package_version: "askrigor_treatment_landscape_v1",
    evidence_basis_digest: treatmentEvidenceBasisDigest(evidence),
    attempt: state.attempts.length + 1,
    research_target: evidence.researchTarget,
    discovery_batches: structural.batchReferences,
    candidates: structural.candidateReferences,
    selected_videos: structural.selectedVideoReferences,
    bidirectional_status: bidirectionalStatus
  });
}

export function ingestTreatmentLandscapeSubmission(
  rawState: ResearchTreatmentFinalizationState,
  evidence: TreatmentFinalizationEvidence,
  rawSubmission: TreatmentLandscapeSubmission
): ResearchTreatmentFinalizationState {
  const state = researchTreatmentFinalizationStateSchema.parse(rawState);
  const work = createTreatmentLandscapeWorkPackage(state, evidence);
  const submission = treatmentLandscapeSubmissionSchema.parse(rawSubmission);
  if (
    submission.evidence_basis_digest !== work.evidence_basis_digest ||
    submission.attempt !== work.attempt
  ) {
    throw new Error("Treatment-landscape submission is stale or bound to another evidence frontier");
  }
  assertExactSet(
    submission.selected_video_interpretations.map(({ video_id }) => video_id),
    work.selected_videos.map(({ video_id }) => video_id),
    "Every selected video requires one exact treatment-landscape interpretation"
  );
  const batches = new Map(work.discovery_batches.map((batch) => [batch.batch_id, batch]));
  const candidates = new Map(work.candidates.map((candidate) => [
    candidate.video_id,
    candidate
  ]));
  for (const search of submission.specific_implementation_searches) {
    const batch = batches.get(search.discovery_batch_id);
    if (
      batch === undefined ||
      search.candidate_video_ids.some((id) => !batch.candidate_video_ids.includes(id)) ||
      search.candidate_video_ids.some((id) =>
        candidates.get(id)?.treatment_class_id !== search.treatment_class_id
      )
    ) {
      throw new Error("Specific-program search annotation is not bound to exact discovery receipts");
    }
  }
  for (const [direction, batchIds] of Object.entries(
    submission.directional_search_batches
  ) as Array<[z.output<typeof directionSchema>, string[]]>) {
    for (const batchId of batchIds) {
      const batch = batches.get(batchId);
      if (batch === undefined) {
        throw new Error("Directional search annotation cites an unknown discovery receipt");
      }
      if (
        !batch.server_direction_hints.includes(direction) &&
        !semanticDirectionSupported(direction, batch.query_or_scope)
      ) {
        throw new Error("Directional search annotation is unsupported by its exact query receipt");
      }
    }
  }
  const assessorInput = buildTreatmentLandscapeInput(evidence, work, submission);
  const assessment = assessTreatmentLandscapeCoverage(assessorInput);
  const attempt = treatmentAttemptSchema.parse({
    attempt: submission.attempt,
    evidence_basis_digest: submission.evidence_basis_digest,
    semantic_submission_digest: sha256(JSON.stringify(submission)),
    assessor_input_digest: sha256(JSON.stringify(assessorInput)),
    assessment
  });
  return researchTreatmentFinalizationStateSchema.parse({
    ...state,
    attempts: [...state.attempts, attempt]
  });
}

export function deriveTreatmentFinalizationStatus(
  rawState: ResearchTreatmentFinalizationState,
  evidence: TreatmentFinalizationEvidence
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED_TERMINAL" {
  const state = researchTreatmentFinalizationStateSchema.parse(rawState);
  if (state.attempts.length === 0) return "NOT_STARTED";
  const latest = state.attempts.at(-1)!;
  if (latest.evidence_basis_digest !== treatmentEvidenceBasisDigest(evidence)) {
    return "IN_PROGRESS";
  }
  if (latest.assessment.answer_boundary === "ledger_consistent_for_synthesis") {
    return "COMPLETE";
  }
  if (latest.assessment.answer_boundary === "bounded_nonranking_only") {
    return "BLOCKED_TERMINAL";
  }
  return "IN_PROGRESS";
}

export function deriveTreatmentFinalizationDiagnostics(
  rawState: ResearchTreatmentFinalizationState,
  evidence: TreatmentFinalizationEvidence
): z.output<typeof treatmentFinalizationDiagnosticsSchema> {
  const state = researchTreatmentFinalizationStateSchema.parse(rawState);
  const latest = state.attempts.at(-1);
  const current = latest !== undefined &&
    latest.evidence_basis_digest === treatmentEvidenceBasisDigest(evidence);
  return treatmentFinalizationDiagnosticsSchema.parse({
    attempts: state.attempts.length,
    current_evidence_basis_assessed: current,
    selection_coverage_lock: current
      ? latest.assessment.selection_coverage_lock
      : "not_assessed",
    per_video_depth_lock: current
      ? latest.assessment.per_video_depth_lock
      : "not_assessed",
    synthesis_lock: current ? latest.assessment.synthesis_lock : "not_assessed",
    answer_boundary: current ? latest.assessment.answer_boundary : "not_assessed",
    blockers: current ? latest.assessment.blockers : []
  });
}

export function currentTreatmentLandscapeAssessment(
  rawState: ResearchTreatmentFinalizationState,
  evidence: TreatmentFinalizationEvidence
): TreatmentLandscapeCoverageOutput | undefined {
  const state = researchTreatmentFinalizationStateSchema.parse(rawState);
  const latest = state.attempts.at(-1);
  if (latest === undefined) return undefined;
  return latest.evidence_basis_digest === treatmentEvidenceBasisDigest(evidence)
    ? latest.assessment
    : undefined;
}

export function treatmentEvidenceBasisDigest(evidence: TreatmentFinalizationEvidence): string {
  const structural = deriveStructuralLedger(evidence);
  return sha256(JSON.stringify({
    research_target: evidence.researchTarget,
    discovery_batches: structural.batchReferences,
    candidates: structural.candidateReferences,
    selected_videos: structural.selectedVideoReferences,
    formal: evidence.formalEvidence,
    bidirectional: evidence.bidirectional
  }));
}

function deriveStructuralLedger(evidence: TreatmentFinalizationEvidence) {
  const classIdByLabel = new Map<string, string>();
  const classId = (label: string) => {
    const existing = classIdByLabel.get(label);
    if (existing !== undefined) return existing;
    const id = `class_${sha256(label).slice(0, 24)}`;
    classIdByLabel.set(label, id);
    return id;
  };
  const fingerprintId = (candidate: ResearchCandidateRecord) =>
    `program_${sha256(`${candidate.provisional_treatment_class}:${candidate.program_signature}`)
      .slice(0, 24)}`;

  const externalIds = evidence.candidates.external_scout.validated_candidate_video_ids;
  const batchReferences: z.output<typeof batchReferenceSchema>[] = [];
  for (const query of evidence.candidates.external_scout.queries) {
    batchReferences.push(batchReferenceSchema.parse({
      batch_id: `external_${query.query_id}`,
      query_or_scope: query.query,
      candidate_video_ids: externalIds,
      access_status: evidence.candidates.external_scout.status === "COMPLETE"
        ? "api_visible_complete"
        : "partial",
      exhausted: evidence.candidates.external_scout.status === "COMPLETE",
      next_cursor_present: false,
      server_direction_hints: externalDirectionHints(query.purpose, query.query)
    }));
  }
  for (const search of evidence.candidates.native_youtube.searches) {
    batchReferences.push(batchReferenceSchema.parse({
      batch_id: `native_${search.query_id}`,
      query_or_scope: search.query,
      candidate_video_ids: search.candidate_video_ids,
      access_status: search.access_status,
      exhausted: search.exhausted,
      next_cursor_present: search.next_cursor_present,
      server_direction_hints: search.directions.flatMap(nativeDirectionHint)
    }));
  }
  const candidateReferences = evidence.candidates.candidates.map((candidate) => {
    const discoveryBatchIds = candidate.origins.flatMap((origin) =>
      origin.query_ids.map((queryId) => origin.source === "GEMINI_SCOUT"
        ? `external_${queryId}`
        : `native_${queryId}`)
    );
    return candidateReferenceSchema.parse({
      video_id: candidate.video_id,
      title: candidate.title,
      channel_id: candidate.channel_id,
      channel_title: candidate.channel_title,
      published_at: candidate.published_at,
      treatment_class_id: classId(candidate.provisional_treatment_class),
      treatment_class_label: candidate.provisional_treatment_class,
      fingerprint_id: fingerprintId(candidate),
      program: candidate.program,
      materiality: candidate.materiality,
      selection_status: candidate.selection_status,
      discovery_batch_ids: [...new Set(discoveryBatchIds)],
      screening_rationale: candidate.screening_rationale ??
        "Candidate semantic screening is not complete."
    });
  });
  const candidateById = new Map(candidateReferences.map((candidate) => [
    candidate.video_id,
    candidate
  ]));
  const selectedVideoReferences = evidence.videoDepth.selected_video_ids.map((videoId) => {
    const candidate = candidateById.get(videoId);
    const transcript = evidence.videoDepth.transcripts.find(({ source }) =>
      source.video_id === videoId
    );
    const discussion = evidence.videoDepth.discussions.find(({ source }) =>
      source.video_id === videoId
    );
    if (
      candidate === undefined || transcript?.receipt === undefined ||
      discussion?.receipt === undefined
    ) {
      throw new Error("Treatment projection requires exact selected-video receipts");
    }
    return selectedVideoReferenceSchema.parse({
      video_id: videoId,
      fingerprint_id: candidate.fingerprint_id,
      transcript_receipt_sha256: sha256(JSON.stringify(transcript.receipt)),
      discussion_receipt_sha256: sha256(JSON.stringify(discussion.receipt))
    });
  });
  return { classIdByLabel, batchReferences, candidateReferences, selectedVideoReferences };
}

function buildTreatmentLandscapeInput(
  evidence: TreatmentFinalizationEvidence,
  work: TreatmentLandscapeWorkPackage,
  submission: TreatmentLandscapeSubmission
): TreatmentLandscapeCoverageInput {
  const candidateById = new Map(work.candidates.map((candidate) => [
    candidate.video_id,
    candidate
  ]));
  const batchById = new Map(work.discovery_batches.map((batch) => [batch.batch_id, batch]));
  const classEntries = [...new Map(work.candidates.map((candidate) => [
    candidate.treatment_class_id,
    candidate.treatment_class_label
  ])).entries()];
  const fingerprintEntries = [...new Map(work.candidates.map((candidate) => [
    candidate.fingerprint_id,
    candidate
  ])).values()];
  const interpretationByVideo = new Map(
    submission.selected_video_interpretations.map((item) => [item.video_id, item])
  );
  const transcriptById = new Map(evidence.videoDepth.transcripts.map((record) => [
    record.source.video_id,
    record
  ]));
  const discussionById = new Map(evidence.videoDepth.discussions.map((record) => [
    record.source.video_id,
    record
  ]));
  const assessmentForFingerprint = (candidate: z.output<typeof candidateReferenceSchema>) =>
    formalFollowUp(
      evidence.formalEvidence,
      candidate.program,
      candidate.fingerprint_id,
      candidate.materiality
    );
  const formalAssessments = new Map(work.candidates.map((candidate) => [
    candidate.fingerprint_id,
    assessmentForFingerprint(candidate)
  ]));
  const classFormalAssessments = new Map(classEntries.map(([id]) => {
    const candidates = work.candidates.filter(({ treatment_class_id }) => id === treatment_class_id);
    const status = aggregateFormalFollowUp(candidates.map((candidate) =>
      formalAssessments.get(candidate.fingerprint_id)!.status
    ));
    const material = candidates.some(({ materiality }) => materiality === "MATERIAL");
    return [id, {
      status,
      ...(status !== "inaccessible"
        ? {}
        : {
          boundary: {
            boundary_id: `formal_class_${id}`,
            scope_type: "formal_follow_up" as const,
            scope_id: id,
            access_status: "inaccessible" as const,
            materiality: material ? "material" as const : "not_material" as const,
            impact: material ? "ranking_changing" as const : "not_decision_relevant" as const,
            terminal: true,
            retryable: false,
            recovery_attempted: true,
            description: "At least one decision-relevant formal follow-up path in this treatment class reached a nonretryable source boundary."
          }
        })
    }];
  }));
  const formalBoundaries = [...formalAssessments.values()].flatMap(({ boundary }) =>
    boundary === undefined ? [] : [boundary]
  ).concat([...classFormalAssessments.values()].flatMap(({ boundary }) =>
    boundary === undefined ? [] : [boundary]
  ));
  const bidirectionalBoundary = work.bidirectional_status === "BLOCKED_TERMINAL"
    ? {
      boundary_id: "bidirectional_landscape_boundary",
      scope_type: "landscape_scope" as const,
      scope_id: "landscape",
      access_status: "inaccessible" as const,
      materiality: "uncertain" as const,
      impact: "uncertain" as const,
      terminal: true,
      retryable: false,
      recovery_attempted: true,
      description: "Cross-layer return searching reached a source-specific nonretryable boundary, so only bounded nonranking synthesis can be considered."
    }
    : undefined;

  const discoveryBatches: TreatmentLandscapeCoverageInput["discovery_batches"] =
    work.discovery_batches.map((batch) => ({
      batch_id: batch.batch_id,
      query_or_scope: batch.query_or_scope,
      treatment_class_ids: [...new Set(batch.candidate_video_ids.map((videoId) =>
        candidateById.get(videoId)?.treatment_class_id
      ).filter((value): value is string => value !== undefined))],
      access_status: normalizeAccessStatus(batch.access_status),
      pagination: {
        exhausted: batch.exhausted,
        next_cursor_present: batch.next_cursor_present
      },
      candidate_video_ids: batch.candidate_video_ids.filter((id) =>
        candidateById.has(id)
      ),
      new_program_fingerprint_ids: [...new Set(batch.candidate_video_ids.map((id) =>
        candidateById.get(id)?.fingerprint_id
      ).filter((value): value is string => value !== undefined))]
    }));

  const input: TreatmentLandscapeCoverageInput = {
    research_target: evidence.researchTarget,
    broad_treatment_choice: submission.broad_treatment_choice,
    substantial_youtube_corpus: work.candidates.length >= 20 ? "yes" : "no",
    discovery_batches: discoveryBatches,
    specific_implementation_searches: submission.specific_implementation_searches.map(
      (search) => {
        const batch = batchById.get(search.discovery_batch_id)!;
        const complete = ["complete", "api_visible_complete"].includes(batch.access_status) &&
          batch.exhausted && !batch.next_cursor_present;
        return {
          ...search,
          result_status: complete
            ? search.candidate_video_ids.length > 0
              ? "specific_candidates_found" as const
              : "exhausted_zero_results" as const
            : "inaccessible" as const
        };
      }
    ),
    treatment_classes: classEntries.map(([id, label]) => {
      const candidates = work.candidates.filter(({ treatment_class_id }) => id === treatment_class_id);
      const material = candidates.some(({ materiality }) => materiality === "MATERIAL");
      const classFormal = classFormalAssessments.get(id)!;
      return {
        class_id: id,
        plain_language_label: compact(label, 300),
        materiality: material ? "material" as const : "not_material" as const,
        search_status: candidates.some(({ discovery_batch_ids }) =>
          discovery_batch_ids.length > 0
        ) ? "searched" as const : "unsearched" as const,
        formal_follow_up: classFormal.status,
        omission_impact: material
          ? "ranking_changing" as const
          : "not_decision_relevant" as const,
        omission_rationale: material
          ? "Server-owned screening marked at least one candidate in this class material."
          : "Every candidate in this class was screened as not material.",
        access_boundary_ids: classFormal.boundary === undefined
          ? []
          : [classFormal.boundary.boundary_id]
      };
    }),
    program_fingerprints: fingerprintEntries.map((candidate) => {
      const formal = formalAssessments.get(candidate.fingerprint_id)!;
      return {
        fingerprint_id: candidate.fingerprint_id,
        treatment_class_id: candidate.treatment_class_id,
        materiality: candidate.materiality === "MATERIAL"
          ? "material" as const
          : "not_material" as const,
        availability_status: "available" as const,
        formal_follow_up: formal.status,
        ...(formal.boundary === undefined
          ? {}
          : { formal_follow_up_boundary_id: formal.boundary.boundary_id }),
        omission_impact: candidate.materiality === "MATERIAL"
          ? "ranking_changing" as const
          : "not_decision_relevant" as const,
        omission_rationale: compact(candidate.screening_rationale, 800),
        ...candidate.program
      };
    }),
    candidate_videos: work.candidates.map((candidate) => ({
      video_id: candidate.video_id,
      title: compact(candidate.title, 160),
      channel_id: candidate.channel_id,
      channel_title: candidate.channel_title === "not_reported"
        ? "not_reported" as const
        : compact(candidate.channel_title, 160),
      published_date: publishedDate(candidate.published_at),
      treatment_class_id: candidate.treatment_class_id,
      fingerprint_id: candidate.fingerprint_id,
      discovery_batch_ids: candidate.discovery_batch_ids,
      materiality: candidate.materiality === "MATERIAL"
        ? "material" as const
        : "not_material" as const,
      selection_status: candidate.selection_status === "SELECTED"
        ? "selected" as const
        : "screened_not_selected" as const,
      omission_impact: candidate.materiality === "MATERIAL"
        ? "ranking_changing" as const
        : "not_decision_relevant" as const,
      omission_rationale: compact(candidate.screening_rationale, 800)
    })),
    external_scout_frontiers: evidence.candidates.external_scout.frontier_id === undefined
      ? []
      : [{
        frontier_digest: evidence.candidates.external_scout.frontier_id,
        source: "gemini_spark",
        source_candidate_video_ids:
          evidence.candidates.external_scout.source_candidate_video_ids,
        validated_candidate_video_ids:
          evidence.candidates.external_scout.validated_candidate_video_ids,
        terminally_rejected_video_ids:
          evidence.candidates.external_scout.terminally_rejected_video_ids,
        unresolved_candidate_video_ids:
          evidence.candidates.external_scout.unresolved_candidate_video_ids
      }],
    external_scout_candidates: work.candidates.filter((candidate) =>
      evidence.candidates.external_scout.validated_candidate_video_ids.includes(
        candidate.video_id
      )
    ).map((candidate) => ({
      frontier_digest: evidence.candidates.external_scout.frontier_id!,
      source: "gemini_spark" as const,
      video_id: candidate.video_id,
      materiality: candidate.materiality === "MATERIAL"
        ? "material" as const
        : "not_material" as const,
      redundancy: evidence.candidates.candidates.find(({ video_id }) =>
        video_id === candidate.video_id
      )?.redundancy === "DUPLICATE" ? "duplicate" as const : "distinct" as const,
      screening_status: "screened" as const,
      fingerprint_id: candidate.fingerprint_id,
      ...(evidence.candidates.candidates.find(({ video_id }) =>
        video_id === candidate.video_id
      )?.duplicate_of_video_id === undefined
        ? {}
        : {
          duplicate_of_video_id: evidence.candidates.candidates.find(({ video_id }) =>
            video_id === candidate.video_id
          )!.duplicate_of_video_id
        }),
      omission_impact: candidate.materiality === "MATERIAL"
        ? "ranking_changing" as const
        : "not_decision_relevant" as const,
      omission_rationale: compact(candidate.screening_rationale, 800)
    })),
    selected_videos: work.selected_videos.map((selected) => {
      const interpretation = interpretationByVideo.get(selected.video_id)!;
      const transcript = transcriptById.get(selected.video_id)!;
      const discussion = discussionById.get(selected.video_id)!;
      return {
        video_id: selected.video_id,
        fingerprint_id: selected.fingerprint_id,
        stage_or_baseline: interpretation.stage_or_baseline,
        outcome_and_horizon: interpretation.outcome_and_horizon,
        nonredundant_value: interpretation.nonredundant_value,
        transcript_receipt: transcript.receipt!,
        discussion_receipt: discussion.receipt!,
        what_it_changed: interpretation.what_it_changed
      };
    }),
    further_expansion_likely_to_improve_answer:
      submission.further_expansion_likely_to_improve_answer,
    directional_searches: Object.fromEntries(([
      "benefit",
      "no_effect_or_failure",
      "harm",
      "discontinuation",
      "eventual_standard_treatment"
    ] as const).map((direction) => {
      const batchIds = submission.directional_search_batches[direction];
      const complete = batchIds.length > 0 && batchIds.every((batchId) => {
        const batch = batchById.get(batchId)!;
        return ["complete", "api_visible_complete"].includes(batch.access_status) &&
          batch.exhausted && !batch.next_cursor_present;
      });
      return [direction, { status: complete ? "complete" : "incomplete" }];
    })) as TreatmentLandscapeCoverageInput["directional_searches"],
    access_boundaries: [
      ...formalBoundaries,
      ...(bidirectionalBoundary === undefined ? [] : [bidirectionalBoundary])
    ]
  };
  return input;
}

function formalFollowUp(
  formal: ResearchFormalEvidenceState,
  program: z.output<typeof candidateReferenceSchema>["program"],
  fingerprintId: string,
  materiality: z.output<typeof candidateReferenceSchema>["materiality"]
): {
  status: TreatmentLandscapeCoverageInput["program_fingerprints"][number]["formal_follow_up"];
  boundary?: TreatmentLandscapeCoverageInput["access_boundaries"][number];
} {
  const signature = deriveProgramSignature(program);
  const hypotheses = formal.hypotheses.filter(({ program_signature }) =>
    program_signature === signature
  );
  if (hypotheses.length === 0) return { status: "incomplete" };
  const providerBlocked = hypotheses.some((hypothesis) =>
    hypothesis.provider_searches.some(({ status }) => status === "BLOCKED_TERMINAL")
  );
  const providersResolved = hypotheses.every((hypothesis) =>
    hypothesis.provider_searches.every(({ status }) =>
      status === "COMPLETE" || status === "BLOCKED_TERMINAL"
    )
  );
  if (!providersResolved || !formalEvidenceScreeningComplete(formal)) {
    return { status: "incomplete" };
  }
  const sources = formal.sources.filter((source) => source.hypothesis_ids.some((id) =>
    hypotheses.some(({ hypothesis_id }) => hypothesis_id === id)
  ));
  const decisionSources = sources.filter(({ decision_importance }) =>
    decision_importance === "DECISION_IMPORTANT"
  );
  const sourceBounded = decisionSources.some((source) =>
    source.full_text.status === "LEAD_BOUNDARY" ||
    source.method_audit.status === "BOUNDARY" ||
    source.method_audit.status === "INVALIDATED" ||
    source.external_evidence.status === "BOUNDED_NONRETRYABLE" ||
    source.external_evidence.linked_work.some((item) =>
      item.possible_decision_impact !== "detail_only" && item.status === "BOUNDED"
    ) ||
    source.claim_capability.status === "UNAVAILABLE_UNSEEN_SOURCE" ||
    source.claim_capability.status === "BOUNDED_ONLY"
  );
  if (providerBlocked || sourceBounded) {
    return {
      status: "inaccessible",
      boundary: {
        boundary_id: `formal_${fingerprintId}`,
        scope_type: "formal_follow_up",
        scope_id: fingerprintId,
        access_status: "inaccessible",
        materiality: materiality === "MATERIAL" ? "material" : "not_material",
        impact: materiality === "MATERIAL" ? "ranking_changing" : "not_decision_relevant",
        terminal: true,
        retryable: false,
        recovery_attempted: true,
        description: "At least one exact formal-search, full-text, method-audit, or linked-evidence path reached a nonretryable source boundary."
      }
    };
  }
  if (sources.length === 0 || decisionSources.length === 0) {
    return { status: "support_not_located" };
  }
  const resolved = decisionSources.every((source) => [
    "CURRENT", "EFFECT_CLAIMS_EXCLUDED", "NOT_APPLICABLE"
  ].includes(source.claim_capability.status));
  return { status: resolved ? "complete" : "incomplete" };
}

function aggregateFormalFollowUp(
  values: Array<TreatmentLandscapeCoverageInput["treatment_classes"][number]["formal_follow_up"]>
) {
  if (values.some((value) => value === "inaccessible")) return "inaccessible" as const;
  if (values.some((value) => value === "complete")) return "complete" as const;
  if (values.some((value) => value === "support_not_located")) {
    return "support_not_located" as const;
  }
  return "incomplete" as const;
}

function bidirectionalEvidence(evidence: TreatmentFinalizationEvidence) {
  return {
    candidates: evidence.candidates,
    videoDepth: evidence.videoDepth,
    formalEvidence: evidence.formalEvidence
  };
}

function externalDirectionHints(purpose: string, query: string) {
  const hints: z.output<typeof directionSchema>[] = [];
  if (purpose === "conventional_benefit") hints.push("benefit");
  if (purpose === "conventional_negative") {
    if (/harm|side effect|complication|adverse|risk/iu.test(query)) hints.push("harm");
    if (/stop|discontinu|quit|abandon|intoler/iu.test(query)) hints.push("discontinuation");
    if (/fail|no effect|did not|didn't|worse|nonresponse/iu.test(query)) {
      hints.push("no_effect_or_failure");
    }
  }
  if (/eventual|ultimately|later|standard|surgery|replacement/iu.test(query)) {
    hints.push("eventual_standard_treatment");
  }
  return [...new Set(hints)];
}

function nativeDirectionHint(direction: string): z.output<typeof directionSchema>[] {
  if (direction === "benefit") return ["benefit"];
  if (direction === "no_effect") return ["no_effect_or_failure"];
  if (direction === "harm") return ["harm"];
  if (direction === "discontinuation") return ["discontinuation"];
  return [];
}

function semanticDirectionSupported(
  direction: z.output<typeof directionSchema>,
  query: string
): boolean {
  const patterns = {
    benefit: /benefit|improv|worked|success|relief/iu,
    no_effect_or_failure: /fail|no effect|did not|didn't|worse|nonresponse/iu,
    harm: /harm|side effect|complication|adverse|risk/iu,
    discontinuation: /stop|discontinu|quit|abandon|intoler/iu,
    eventual_standard_treatment: /eventual|ultimately|later|standard|surgery|replacement/iu
  } as const;
  return patterns[direction].test(query);
}

function normalizeAccessStatus(value: string): TreatmentLandscapeCoverageInput[
  "discovery_batches"
][number]["access_status"] {
  const permitted = [
    "complete", "api_visible_complete", "partial", "abstract_only", "metadata_only",
    "comments_disabled", "inaccessible", "rate_limited", "not_found", "error"
  ] as const;
  return (permitted as readonly string[]).includes(value)
    ? value as typeof permitted[number]
    : "error";
}

function publishedDate(value: string): string {
  if (value === "not_reported") return value;
  return /^\d{4}-\d{2}-\d{2}/u.test(value) ? value.slice(0, 10) : "not_reported";
}

function compact(value: string, maximum: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, maximum) || "not reported";
}

function assertExactSet(actual: readonly string[], expected: readonly string[], message: string) {
  if (
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((value) => !expected.includes(value))
  ) throw new Error(message);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
