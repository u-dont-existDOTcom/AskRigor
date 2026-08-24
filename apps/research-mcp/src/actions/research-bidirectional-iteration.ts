import { createHash } from "node:crypto";

import type { ProvenanceEnvelope } from "@askrigor/contracts";
import type {
  SearchYoutubeCommentsInput,
  YoutubeCommentData
} from "@askrigor/sources";
import { z } from "zod";

import type { ResearchCandidateDiscoveryState } from "./research-candidate-frontier.js";
import {
  appendResearchFormalHypotheses,
  type CommunityFormalHypothesisInput,
  type ResearchFormalEvidenceState
} from "./research-formal-evidence.js";
import type { ResearchVideoDepthState } from "./research-video-depth-controller.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const youtubeVideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

const decisionImpactSchema = z.enum([
  "detail_only",
  "confidence_changing",
  "ranking_changing",
  "potentially_conclusion_changing",
  "unknown"
]);

const transferCategorySchema = z.enum([
  "PROGRAM",
  "FAILURE_OR_NO_EFFECT",
  "HARM",
  "DURABILITY",
  "ADHERENCE",
  "PROGRESSION",
  "IMPLEMENTATION",
  "INTEGRITY_EVENT",
  "REPLICATION_OR_REPRODUCTION",
  "REVIEW_ANCESTRY",
  "FORMAL_DISCRIMINATOR"
]);

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

const communityEvidenceReferenceSchema = z.object({
  evidence_ref_id: digest,
  video_id: youtubeVideoId,
  program_signature: digest,
  treatment_class: bounded(160),
  provisional_claim_summary: bounded(600),
  transcript_status: z.enum(["COMPLETE", "BLOCKED_TERMINAL"]),
  transcript_receipt_sha256: digest,
  discussion_status: z.enum(["COMPLETE", "BLOCKED_TERMINAL"]),
  discussion_receipt_sha256: digest,
  discussion_corpus_sha256: digest.optional()
}).strict();

const formalEvidenceReferenceSchema = z.object({
  evidence_ref_id: digest,
  reference_kind: z.enum(["FORMAL_SOURCE", "HYPOTHESIS_WITHOUT_SOURCE"]),
  hypothesis_id: digest,
  source_id: digest.optional(),
  program_signature: digest,
  treatment_class: bounded(160),
  claim_summary: bounded(600),
  source_kind: bounded(80),
  source_identity_hash: digest.optional(),
  method_audit_sha256: digest.optional(),
  external_receipt_payload_sha256: digest.optional(),
  linked_work_digest: digest,
  claim_capability_status: bounded(80),
  possible_decision_impact: decisionImpactSchema
}).strict().superRefine((reference, context) => {
  if (
    (reference.reference_kind === "FORMAL_SOURCE") !==
      (reference.source_id !== undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "Formal-source references require one exact source identity"
    });
  }
});

const sourceAssessmentSchema = z.object({
  evidence_ref_id: digest,
  disposition: z.enum([
    "MATERIAL_TRANSFER",
    "NO_NEW_MATERIAL_TRANSFER",
    "TERMINAL_BOUNDARY"
  ]),
  rationale: bounded(1_000)
}).strict();

const communityToFormalTransferInputSchema = z.object({
  direction: z.literal("COMMUNITY_TO_FORMAL"),
  source_evidence_ref_ids: z.array(digest).min(1).max(76),
  category: transferCategorySchema,
  treatment_class: bounded(160),
  claim_summary: bounded(600),
  program: programSchema,
  formal_query: bounded(5_000),
  possible_decision_impact: decisionImpactSchema
}).strict();

const formalToCommunityTransferInputSchema = z.object({
  direction: z.literal("FORMAL_TO_COMMUNITY"),
  source_evidence_ref_ids: z.array(digest).min(1).max(2_000),
  category: transferCategorySchema,
  discriminator_query: bounded(500),
  target_video_ids: z.array(youtubeVideoId).min(1).max(76),
  possible_decision_impact: decisionImpactSchema
}).strict();

const transferInputSchema = z.discriminatedUnion("direction", [
  communityToFormalTransferInputSchema,
  formalToCommunityTransferInputSchema
]);

const discordanceInputSchema = z.object({
  community_evidence_ref_ids: z.array(digest).min(1).max(76),
  formal_evidence_ref_ids: z.array(digest).min(1).max(2_000),
  discriminator: bounded(1_000),
  status: z.enum(["OPEN", "BOUNDED", "EXPLAINED_WITHOUT_FORCED_RECONCILIATION"])
}).strict();

export const bidirectionalIterationWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_bidirectional_iteration_v1"),
  evidence_basis_digest: digest,
  round_number: z.number().int().positive().max(100),
  community_evidence: z.array(communityEvidenceReferenceSchema).min(1).max(76),
  formal_evidence: z.array(formalEvidenceReferenceSchema).min(1).max(2_100)
}).strict();

export const bidirectionalIterationSubmissionSchema = z.object({
  package_version: z.literal("askrigor_bidirectional_iteration_v1"),
  evidence_basis_digest: digest,
  round_number: z.number().int().positive().max(100),
  community_to_formal_assessments: z.array(sourceAssessmentSchema).min(1).max(76),
  formal_to_community_assessments: z.array(sourceAssessmentSchema).min(1).max(2_100),
  transfers: z.array(transferInputSchema).max(2_000),
  discordances: z.array(discordanceInputSchema).max(1_000)
}).strict();

const returnSearchRecordSchema = z.object({
  video_id: youtubeVideoId,
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE_NO_RESULTS",
    "RESULT_ASSESSMENT_REQUIRED",
    "COMPLETE_ASSESSED",
    "BLOCKED_RETRYABLE",
    "BOUNDED_TERMINAL"
  ]),
  pages_retrieved: z.number().int().nonnegative().max(10_000),
  records_returned_cumulative: z.number().int().nonnegative().max(100_000),
  next_cursor: bounded(4_096).optional(),
  page_receipt_hashes: z.array(digest).max(10_000),
  result_rolling_sha256: digest.optional(),
  access_statuses: z.array(bounded(80)).max(10_000),
  boundary: z.object({
    classification: z.enum(["RETRYABLE", "TERMINAL_NONRETRYABLE"]),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u),
    summary: bounded(1_000)
  }).strict().optional()
}).strict().superRefine((record, context) => {
  if (record.page_receipt_hashes.length !== record.pages_retrieved) {
    context.addIssue({ code: "custom", message: "Return-search pages require exact receipt hashes" });
  }
  const blocked = record.status === "BLOCKED_RETRYABLE" ||
    record.status === "BOUNDED_TERMINAL";
  if (blocked !== (record.boundary !== undefined)) {
    context.addIssue({ code: "custom", message: "Return-search boundary and status must agree" });
  }
});

const communityToFormalTransferStateSchema = z.object({
  transfer_id: digest,
  direction: z.literal("COMMUNITY_TO_FORMAL"),
  source_evidence_ref_ids: z.array(digest).min(1).max(76),
  category: transferCategorySchema,
  treatment_class: bounded(160),
  claim_summary: bounded(600),
  program: programSchema,
  program_signature: digest,
  formal_query: bounded(5_000),
  possible_decision_impact: decisionImpactSchema,
  formal_hypothesis_id: digest,
  status: z.enum(["FORMAL_HYPOTHESIS_APPENDED", "FORMAL_HYPOTHESIS_ALREADY_PRESENT"])
}).strict();

const formalToCommunityTransferStateSchema = z.object({
  transfer_id: digest,
  direction: z.literal("FORMAL_TO_COMMUNITY"),
  source_evidence_ref_ids: z.array(digest).min(1).max(2_000),
  category: transferCategorySchema,
  discriminator_query: bounded(500),
  target_video_ids: z.array(youtubeVideoId).min(1).max(76),
  possible_decision_impact: decisionImpactSchema,
  searches: z.array(returnSearchRecordSchema).min(1).max(76)
}).strict();

const discordanceStateSchema = discordanceInputSchema.extend({
  discordance_id: digest
}).strict();

const bidirectionalRoundSchema = z.object({
  round_id: digest,
  round_number: z.number().int().positive().max(100),
  evidence_basis_digest: digest,
  community_evidence_ref_ids: z.array(digest).min(1).max(76),
  formal_evidence_ref_ids: z.array(digest).min(1).max(2_100),
  community_to_formal_assessments: z.array(sourceAssessmentSchema).min(1).max(76),
  formal_to_community_assessments: z.array(sourceAssessmentSchema).min(1).max(2_100),
  community_to_formal_transfers: z.array(communityToFormalTransferStateSchema).max(2_000),
  formal_to_community_transfers: z.array(formalToCommunityTransferStateSchema).max(2_000),
  discordances: z.array(discordanceStateSchema).max(1_000)
}).strict();

export const researchBidirectionalIterationStateSchema = z.object({
  state_version: z.literal("askrigor_bidirectional_state_v1"),
  rounds: z.array(bidirectionalRoundSchema).max(100)
}).strict();

export type ResearchBidirectionalIterationState = z.output<
  typeof researchBidirectionalIterationStateSchema
>;
export type BidirectionalIterationWorkPackage = z.output<
  typeof bidirectionalIterationWorkPackageSchema
>;
export type BidirectionalIterationSubmission = z.output<
  typeof bidirectionalIterationSubmissionSchema
>;

export const bidirectionalReturnAssessmentWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_bidirectional_return_assessment_v1"),
  evidence_basis_digest: digest,
  round_id: digest,
  transfer_id: digest,
  discriminator_query: bounded(500),
  result_receipts: z.array(z.object({
    evidence_ref_id: digest,
    video_id: youtubeVideoId,
    records_returned_cumulative: z.number().int().positive(),
    result_rolling_sha256: digest,
    page_receipt_hashes: z.array(digest).min(1)
  }).strict()).min(1).max(76)
}).strict();

export const bidirectionalReturnAssessmentSubmissionSchema = z.object({
  package_version: z.literal("askrigor_bidirectional_return_assessment_v1"),
  evidence_basis_digest: digest,
  round_id: digest,
  transfer_id: digest,
  result_assessments: z.array(z.object({
    video_id: youtubeVideoId,
    disposition: z.enum(["MATERIAL_TRANSFER", "NO_NEW_MATERIAL_TRANSFER"]),
    rationale: bounded(1_000)
  }).strict()).min(1).max(76),
  community_to_formal_transfers: z.array(
    communityToFormalTransferInputSchema
  ).max(500)
}).strict();

export type BidirectionalReturnAssessmentSubmission = z.output<
  typeof bidirectionalReturnAssessmentSubmissionSchema
>;

/**
 * Return-search cursors and result bodies are deliberately not durable. Reset
 * unfinished searches to their exact query/video origin after process loss;
 * completed assessed or terminal outcomes remain intact.
 */
export function reconcileBidirectionalIterationAfterEphemeralLoss(
  rawState: ResearchBidirectionalIterationState,
): ResearchBidirectionalIterationState {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  return researchBidirectionalIterationStateSchema.parse({
    ...state,
    rounds: state.rounds.map((round) => ({
      ...round,
      formal_to_community_transfers: round.formal_to_community_transfers.map(
        (transfer) => ({
          ...transfer,
          searches: transfer.searches.map((search) =>
            [
              "IN_PROGRESS",
              "RESULT_ASSESSMENT_REQUIRED",
              "BLOCKED_RETRYABLE",
            ].includes(search.status)
              ? {
                video_id: search.video_id,
                status: "NOT_STARTED" as const,
                pages_retrieved: 0,
                records_returned_cumulative: 0,
                page_receipt_hashes: [],
                access_statuses: [],
              }
              : search
          ),
        }),
      ),
    })),
  });
}

export const bidirectionalIterationDiagnosticsSchema = z.object({
  rounds: z.number().int().nonnegative(),
  current_evidence_basis_reviewed: z.boolean(),
  community_to_formal_passes: z.number().int().nonnegative(),
  formal_to_community_passes: z.number().int().nonnegative(),
  community_to_formal_transfers: z.number().int().nonnegative(),
  formal_to_community_transfers: z.number().int().nonnegative(),
  return_searches_pending: z.number().int().nonnegative(),
  return_assessments_pending: z.number().int().nonnegative(),
  retryable_searches: z.number().int().nonnegative(),
  terminal_search_boundaries: z.number().int().nonnegative(),
  open_discordances: z.number().int().nonnegative()
}).strict();

export interface BidirectionalEvidenceState {
  candidates: ResearchCandidateDiscoveryState;
  videoDepth: ResearchVideoDepthState;
  formalEvidence: ResearchFormalEvidenceState;
}

export interface BidirectionalCommentSearchExecutor {
  (input: SearchYoutubeCommentsInput): Promise<
    ProvenanceEnvelope<YoutubeCommentData | Record<string, never>>
  >;
}

export function initialResearchBidirectionalIterationState(): ResearchBidirectionalIterationState {
  return researchBidirectionalIterationStateSchema.parse({
    state_version: "askrigor_bidirectional_state_v1",
    rounds: []
  });
}

export function createBidirectionalIterationWorkPackage(
  rawState: ResearchBidirectionalIterationState,
  evidence: BidirectionalEvidenceState
): BidirectionalIterationWorkPackage {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  const communityEvidence = deriveCommunityEvidenceReferences(evidence);
  const formalEvidence = deriveFormalEvidenceReferences(evidence.formalEvidence);
  if (communityEvidence.length === 0 || formalEvidence.length === 0) {
    throw new Error("Bidirectional iteration needs exact community and formal evidence references");
  }
  const evidenceBasisDigest = bidirectionalEvidenceBasisDigest(evidence);
  const latest = state.rounds.at(-1);
  if (
    latest?.evidence_basis_digest === evidenceBasisDigest &&
    !roundHasOpenWork(latest)
  ) {
    throw new Error("The current bidirectional evidence basis is already reviewed");
  }
  return bidirectionalIterationWorkPackageSchema.parse({
    package_version: "askrigor_bidirectional_iteration_v1",
    evidence_basis_digest: evidenceBasisDigest,
    round_number: state.rounds.length + 1,
    community_evidence: communityEvidence,
    formal_evidence: formalEvidence
  });
}

export function ingestBidirectionalIterationSubmission(
  rawState: ResearchBidirectionalIterationState,
  evidence: BidirectionalEvidenceState,
  rawSubmission: BidirectionalIterationSubmission
): {
  bidirectional: ResearchBidirectionalIterationState;
  formalEvidence: ResearchFormalEvidenceState;
} {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  const work = createBidirectionalIterationWorkPackage(state, evidence);
  const submission = bidirectionalIterationSubmissionSchema.parse(rawSubmission);
  if (
    submission.evidence_basis_digest !== work.evidence_basis_digest ||
    submission.round_number !== work.round_number
  ) {
    throw new Error("Bidirectional submission is stale or bound to another evidence frontier");
  }
  assertExactAssessmentSet(
    submission.community_to_formal_assessments,
    work.community_evidence.map(({ evidence_ref_id }) => evidence_ref_id),
    "community-to-formal"
  );
  assertExactAssessmentSet(
    submission.formal_to_community_assessments,
    work.formal_evidence.map(({ evidence_ref_id }) => evidence_ref_id),
    "formal-to-community"
  );
  const communityById = new Map(work.community_evidence.map((item) => [
    item.evidence_ref_id,
    item
  ]));
  const formalById = new Map(work.formal_evidence.map((item) => [
    item.evidence_ref_id,
    item
  ]));
  for (const assessment of submission.community_to_formal_assessments) {
    if (
      assessment.disposition === "TERMINAL_BOUNDARY" &&
      communityById.get(assessment.evidence_ref_id)?.transcript_status !== "BLOCKED_TERMINAL" &&
      communityById.get(assessment.evidence_ref_id)?.discussion_status !== "BLOCKED_TERMINAL"
    ) {
      throw new Error("Community terminal assessment requires an exact terminal source receipt");
    }
  }
  for (const assessment of submission.formal_to_community_assessments) {
    const source = formalById.get(assessment.evidence_ref_id);
    if (
      assessment.disposition === "TERMINAL_BOUNDARY" &&
      source !== undefined &&
      !["UNAVAILABLE_UNSEEN_SOURCE", "BOUNDED_ONLY"].includes(
        source.claim_capability_status
      )
    ) {
      throw new Error("Formal terminal assessment requires an exact bounded claim capability");
    }
  }
  const communityIds = new Set(work.community_evidence.map(({ evidence_ref_id }) =>
    evidence_ref_id
  ));
  const formalIds = new Set(work.formal_evidence.map(({ evidence_ref_id }) =>
    evidence_ref_id
  ));
  const selectedVideoIds = new Set(evidence.videoDepth.selected_video_ids);
  for (const transfer of submission.transfers) {
    const allowed = transfer.direction === "COMMUNITY_TO_FORMAL"
      ? communityIds
      : formalIds;
    if (transfer.source_evidence_ref_ids.some((id) => !allowed.has(id))) {
      throw new Error("Bidirectional transfer cites an unbound source identity");
    }
    if (
      transfer.direction === "FORMAL_TO_COMMUNITY" &&
      transfer.target_video_ids.some((id) => !selectedVideoIds.has(id))
    ) {
      throw new Error("Formal discriminator search cites an unaudited discussion pool");
    }
  }
  assertMaterialAssessmentsHaveTransfers(
    submission.community_to_formal_assessments,
    submission.transfers.filter(({ direction }) => direction === "COMMUNITY_TO_FORMAL")
  );
  assertMaterialAssessmentsHaveTransfers(
    submission.formal_to_community_assessments,
    submission.transfers.filter(({ direction }) => direction === "FORMAL_TO_COMMUNITY")
  );
  assertDiscordancesBound(submission.discordances, communityIds, formalIds);

  const communityInputs = submission.transfers
    .filter((transfer): transfer is z.output<typeof communityToFormalTransferInputSchema> =>
      transfer.direction === "COMMUNITY_TO_FORMAL"
    );
  const formalBefore = evidence.formalEvidence;
  const formalAfter = appendResearchFormalHypotheses(
    formalBefore,
    communityInputs.map((transfer) => formalInputFromTransfer(transfer, work))
  );
  const formalByDigest = new Map(formalAfter.hypotheses.map((hypothesis) => [
    hypothesis.hypothesis_digest,
    hypothesis
  ]));
  const priorHypothesisIds = new Set(formalBefore.hypotheses.map(({ hypothesis_id }) =>
    hypothesis_id
  ));

  const communityTransfers = communityInputs.map((transfer) => {
    const formalInput = formalInputFromTransfer(transfer, work);
    const hypothesisDigest = sha256(JSON.stringify(formalInput));
    const hypothesis = formalByDigest.get(hypothesisDigest);
    if (hypothesis === undefined) {
      throw new Error("Appended formal hypothesis identity could not be reconciled");
    }
    const core = normalizedTransferCore(transfer);
    return communityToFormalTransferStateSchema.parse({
      ...core,
      transfer_id: sha256(`bidirectional-transfer:${JSON.stringify(core)}`),
      program_signature: formalInput.program_signature,
      formal_hypothesis_id: hypothesis.hypothesis_id,
      status: priorHypothesisIds.has(hypothesis.hypothesis_id)
        ? "FORMAL_HYPOTHESIS_ALREADY_PRESENT"
        : "FORMAL_HYPOTHESIS_APPENDED"
    });
  });
  const formalTransfers = submission.transfers
    .filter((transfer): transfer is z.output<typeof formalToCommunityTransferInputSchema> =>
      transfer.direction === "FORMAL_TO_COMMUNITY"
    ).map((transfer) => {
      const core = normalizedTransferCore(transfer);
      return formalToCommunityTransferStateSchema.parse({
        ...core,
        transfer_id: sha256(`bidirectional-transfer:${JSON.stringify(core)}`),
        searches: transfer.target_video_ids.map((video_id) => ({
          video_id,
          status: "NOT_STARTED",
          pages_retrieved: 0,
          records_returned_cumulative: 0,
          page_receipt_hashes: [],
          access_statuses: []
        }))
      });
    });
  const discordances = submission.discordances.map((discordance) => ({
    ...discordance,
    discordance_id: sha256(`bidirectional-discordance:${JSON.stringify(discordance)}`)
  }));
  const roundCore = {
    round_number: work.round_number,
    evidence_basis_digest: work.evidence_basis_digest,
    community_evidence_ref_ids: work.community_evidence.map(({ evidence_ref_id }) =>
      evidence_ref_id
    ),
    formal_evidence_ref_ids: work.formal_evidence.map(({ evidence_ref_id }) =>
      evidence_ref_id
    ),
    community_to_formal_assessments: submission.community_to_formal_assessments,
    formal_to_community_assessments: submission.formal_to_community_assessments,
    community_to_formal_transfers: communityTransfers,
    formal_to_community_transfers: formalTransfers,
    discordances
  };
  const round = bidirectionalRoundSchema.parse({
    ...roundCore,
    round_id: sha256(`bidirectional-round:${JSON.stringify(roundCore)}`)
  });
  return {
    bidirectional: researchBidirectionalIterationStateSchema.parse({
      ...state,
      rounds: [...state.rounds, round]
    }),
    formalEvidence: formalAfter
  };
}

export async function executeBidirectionalReturnSearch(
  rawState: ResearchBidirectionalIterationState,
  transferId: string,
  execute: BidirectionalCommentSearchExecutor,
  maximumPagesPerVideo = 1
): Promise<ResearchBidirectionalIterationState> {
  let state = researchBidirectionalIterationStateSchema.parse(rawState);
  if (!Number.isSafeInteger(maximumPagesPerVideo) || maximumPagesPerVideo < 1) {
    throw new Error("Invalid return-search page limit");
  }
  for (let page = 0; page < maximumPagesPerVideo; page += 1) {
    const located = findFormalReturnTransfer(state, transferId);
    const nextSearch = located.transfer.searches.find(({ status }) =>
      ["NOT_STARTED", "IN_PROGRESS", "BLOCKED_RETRYABLE"].includes(status)
    );
    if (nextSearch === undefined) break;
    const output = await execute({
      video: nextSearch.video_id,
      query: located.transfer.discriminator_query,
      includeReplies: true,
      pageSize: 100,
      ...(nextSearch.next_cursor === undefined ? {} : { cursor: nextSearch.next_cursor })
    });
    state = ingestReturnSearchPage(state, transferId, nextSearch.video_id, output);
  }
  return state;
}

export function createBidirectionalReturnAssessmentWorkPackages(
  rawState: ResearchBidirectionalIterationState
): Array<z.output<typeof bidirectionalReturnAssessmentWorkPackageSchema>> {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  return state.rounds.flatMap((round) => round.formal_to_community_transfers.flatMap(
    (transfer) => {
      const receipts = transfer.searches.filter(({ status }) =>
        status === "RESULT_ASSESSMENT_REQUIRED"
      ).map((search) => ({
        evidence_ref_id: communityEvidenceRefId(search.video_id, undefined, undefined),
        video_id: search.video_id,
        records_returned_cumulative: search.records_returned_cumulative,
        result_rolling_sha256: search.result_rolling_sha256!,
        page_receipt_hashes: search.page_receipt_hashes
      }));
      return receipts.length === 0 ? [] : [bidirectionalReturnAssessmentWorkPackageSchema.parse({
        package_version: "askrigor_bidirectional_return_assessment_v1",
        evidence_basis_digest: round.evidence_basis_digest,
        round_id: round.round_id,
        transfer_id: transfer.transfer_id,
        discriminator_query: transfer.discriminator_query,
        result_receipts: receipts
      })];
    }
  ));
}

export function ingestBidirectionalReturnAssessment(
  rawState: ResearchBidirectionalIterationState,
  formalEvidence: ResearchFormalEvidenceState,
  rawSubmission: BidirectionalReturnAssessmentSubmission
): {
  bidirectional: ResearchBidirectionalIterationState;
  formalEvidence: ResearchFormalEvidenceState;
} {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  const submission = bidirectionalReturnAssessmentSubmissionSchema.parse(rawSubmission);
  const work = createBidirectionalReturnAssessmentWorkPackages(state).find((item) =>
    item.round_id === submission.round_id && item.transfer_id === submission.transfer_id
  );
  if (
    work === undefined ||
    work.evidence_basis_digest !== submission.evidence_basis_digest
  ) {
    throw new Error("Return assessment is stale or bound to another search receipt");
  }
  assertExactStringSet(
    submission.result_assessments.map(({ video_id }) => video_id),
    work.result_receipts.map(({ video_id }) => video_id),
    "Return assessment must decide every packaged video result exactly once"
  );
  const materialVideoIds = new Set(submission.result_assessments
    .filter(({ disposition }) => disposition === "MATERIAL_TRANSFER")
    .map(({ video_id }) => video_id));
  for (const transfer of submission.community_to_formal_transfers) {
    if (
      transfer.source_evidence_ref_ids.some((refId) => {
        const video = work.result_receipts.find(({ evidence_ref_id }) =>
          evidence_ref_id === refId
        );
        return video !== undefined && !materialVideoIds.has(video.video_id);
      })
    ) {
      throw new Error("Return transfer cites a result not assessed as material");
    }
  }
  const transferredMaterialVideoIds = new Set(
    submission.community_to_formal_transfers.flatMap((transfer) =>
      transfer.source_evidence_ref_ids.map((refId) =>
        deriveVideoIdFromReturnReference(refId, work.result_receipts)
      ).filter((videoId): videoId is string => videoId !== undefined)
    )
  );
  if (
    materialVideoIds.size !== transferredMaterialVideoIds.size ||
    [...materialVideoIds].some((videoId) => !transferredMaterialVideoIds.has(videoId))
  ) {
    throw new Error("Every material return result requires an exact community-to-formal transfer");
  }
  const roundIndex = state.rounds.findIndex(({ round_id }) => round_id === work.round_id);
  const round = state.rounds[roundIndex]!;
  const transferIndex = round.formal_to_community_transfers.findIndex(({ transfer_id }) =>
    transfer_id === work.transfer_id
  );
  const returnTransfer = round.formal_to_community_transfers[transferIndex]!;
  const assessedIds = new Set(submission.result_assessments.map(({ video_id }) => video_id));
  const searches = returnTransfer.searches.map((search) =>
    assessedIds.has(search.video_id)
      ? returnSearchRecordSchema.parse({ ...search, status: "COMPLETE_ASSESSED" })
      : search
  );
  const formalInputs = submission.community_to_formal_transfers.map((transfer) => {
    const sourceVideoIds = transfer.source_evidence_ref_ids.map((refId) => {
      const ref = deriveVideoIdFromReturnReference(refId, work.result_receipts);
      if (ref === undefined || !materialVideoIds.has(ref)) {
        throw new Error("Return transfer source does not match a material result receipt");
      }
      return ref;
    });
    return formalInputFromDirectTransfer(transfer, sourceVideoIds);
  });
  const nextFormal = appendResearchFormalHypotheses(formalEvidence, formalInputs);
  const nextTransfer = formalToCommunityTransferStateSchema.parse({
    ...returnTransfer,
    searches
  });
  const nextRound = bidirectionalRoundSchema.parse({
    ...round,
    formal_to_community_transfers: round.formal_to_community_transfers.map(
      (item, index) => index === transferIndex ? nextTransfer : item
    )
  });
  return {
    bidirectional: researchBidirectionalIterationStateSchema.parse({
      ...state,
      rounds: state.rounds.map((item, index) => index === roundIndex ? nextRound : item)
    }),
    formalEvidence: nextFormal
  };
}

export function deriveBidirectionalIterationStatus(
  rawState: ResearchBidirectionalIterationState,
  evidence: BidirectionalEvidenceState
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" |
  "BLOCKED_RETRYABLE" | "BLOCKED_TERMINAL" {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  if (state.rounds.length === 0) return "NOT_STARTED";
  const searches = state.rounds.flatMap((round) => round.formal_to_community_transfers
    .flatMap((transfer) => transfer.searches));
  if (searches.some(({ status }) => status === "BLOCKED_RETRYABLE")) {
    return "BLOCKED_RETRYABLE";
  }
  if (state.rounds.some(roundHasOpenWork)) return "IN_PROGRESS";
  const latest = state.rounds.at(-1)!;
  if (latest.evidence_basis_digest !== bidirectionalEvidenceBasisDigest(evidence)) {
    return "IN_PROGRESS";
  }
  if (latest.discordances.some(({ status }) => status === "OPEN")) return "IN_PROGRESS";
  return searches.some(({ status }) => status === "BOUNDED_TERMINAL")
    ? "BLOCKED_TERMINAL"
    : "COMPLETE";
}

export function deriveBidirectionalIterationDiagnostics(
  rawState: ResearchBidirectionalIterationState,
  evidence: BidirectionalEvidenceState
): z.output<typeof bidirectionalIterationDiagnosticsSchema> {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  const searches = state.rounds.flatMap((round) => round.formal_to_community_transfers
    .flatMap((transfer) => transfer.searches));
  return bidirectionalIterationDiagnosticsSchema.parse({
    rounds: state.rounds.length,
    current_evidence_basis_reviewed: state.rounds.at(-1)?.evidence_basis_digest ===
      bidirectionalEvidenceBasisDigest(evidence),
    community_to_formal_passes: state.rounds.length,
    formal_to_community_passes: state.rounds.length,
    community_to_formal_transfers: state.rounds.reduce((count, round) =>
      count + round.community_to_formal_transfers.length, 0),
    formal_to_community_transfers: state.rounds.reduce((count, round) =>
      count + round.formal_to_community_transfers.length, 0),
    return_searches_pending: searches.filter(({ status }) =>
      ["NOT_STARTED", "IN_PROGRESS"].includes(status)
    ).length,
    return_assessments_pending: searches.filter(({ status }) =>
      status === "RESULT_ASSESSMENT_REQUIRED"
    ).length,
    retryable_searches: searches.filter(({ status }) =>
      status === "BLOCKED_RETRYABLE"
    ).length,
    terminal_search_boundaries: searches.filter(({ status }) =>
      status === "BOUNDED_TERMINAL"
    ).length,
    open_discordances: state.rounds.reduce((count, round) =>
      count + round.discordances.filter(({ status }) => status === "OPEN").length, 0)
  });
}

export function bidirectionalEvidenceBasisDigest(
  evidence: BidirectionalEvidenceState
): string {
  return sha256(JSON.stringify({
    community: deriveCommunityEvidenceReferences(evidence),
    formal: deriveFormalEvidenceReferences(evidence.formalEvidence)
  }));
}

function deriveCommunityEvidenceReferences(
  evidence: BidirectionalEvidenceState
): Array<z.output<typeof communityEvidenceReferenceSchema>> {
  const candidateById = new Map(evidence.candidates.candidates.map((candidate) => [
    candidate.video_id,
    candidate
  ]));
  const transcriptById = new Map(evidence.videoDepth.transcripts.map((record) => [
    record.source.video_id,
    record
  ]));
  const discussionById = new Map(evidence.videoDepth.discussions.map((record) => [
    record.source.video_id,
    record
  ]));
  return evidence.videoDepth.selected_video_ids.map((videoId) => {
    const candidate = candidateById.get(videoId);
    const transcript = transcriptById.get(videoId);
    const discussion = discussionById.get(videoId);
    if (
      candidate === undefined || transcript?.receipt === undefined ||
      discussion?.receipt === undefined ||
      !["COMPLETE", "BLOCKED_TERMINAL"].includes(transcript.status) ||
      !["COMPLETE", "BLOCKED_TERMINAL"].includes(discussion.status)
    ) {
      throw new Error("Bidirectional evidence requires terminal selected-video receipt chains");
    }
    const transcriptReceiptHash = sha256(JSON.stringify(transcript.receipt));
    const discussionReceiptHash = sha256(JSON.stringify(discussion.receipt));
    const core = {
      video_id: videoId,
      program_signature: candidate.program_signature,
      treatment_class: candidate.provisional_treatment_class,
      provisional_claim_summary: candidate.provisional_claim_summary,
      transcript_status: transcript.status as "COMPLETE" | "BLOCKED_TERMINAL",
      transcript_receipt_sha256: transcriptReceiptHash,
      discussion_status: discussion.status as "COMPLETE" | "BLOCKED_TERMINAL",
      discussion_receipt_sha256: discussionReceiptHash,
      ...(discussion.corpus_rolling_sha256 === undefined
        ? {}
        : { discussion_corpus_sha256: discussion.corpus_rolling_sha256 })
    };
    return communityEvidenceReferenceSchema.parse({
      ...core,
      evidence_ref_id: communityEvidenceRefId(
        videoId,
        transcriptReceiptHash,
        discussionReceiptHash
      )
    });
  });
}

function deriveFormalEvidenceReferences(
  formal: ResearchFormalEvidenceState
): Array<z.output<typeof formalEvidenceReferenceSchema>> {
  const references: Array<z.output<typeof formalEvidenceReferenceSchema>> = [];
  for (const hypothesis of formal.hypotheses) {
    const sources = formal.sources.filter((source) =>
      source.hypothesis_ids.includes(hypothesis.hypothesis_id) &&
      source.decision_importance === "DECISION_IMPORTANT"
    );
    if (sources.length === 0) {
      const core = {
        reference_kind: "HYPOTHESIS_WITHOUT_SOURCE" as const,
        hypothesis_id: hypothesis.hypothesis_id,
        program_signature: hypothesis.program_signature,
        treatment_class: hypothesis.treatment_class,
        claim_summary: hypothesis.claim_summary,
        source_kind: "NO_DECISION_IMPORTANT_SOURCE",
        linked_work_digest: sha256("[]"),
        claim_capability_status: "NO_SOURCE",
        possible_decision_impact: "unknown" as const
      };
      references.push(formalEvidenceReferenceSchema.parse({
        ...core,
        evidence_ref_id: sha256(`formal-evidence-ref:${JSON.stringify(core)}`)
      }));
      continue;
    }
    for (const source of sources) {
      const core = {
        reference_kind: "FORMAL_SOURCE" as const,
        hypothesis_id: hypothesis.hypothesis_id,
        source_id: source.source_id,
        program_signature: hypothesis.program_signature,
        treatment_class: hypothesis.treatment_class,
        claim_summary: hypothesis.claim_summary,
        source_kind: source.source_kind,
        source_identity_hash: source.identity.identity_hash,
        ...(source.method_audit.audit_sha256 === undefined
          ? {}
          : { method_audit_sha256: source.method_audit.audit_sha256 }),
        ...(source.external_evidence.receipt_payload_sha256 === undefined
          ? {}
          : {
            external_receipt_payload_sha256:
              source.external_evidence.receipt_payload_sha256
          }),
        linked_work_digest: sha256(JSON.stringify(source.external_evidence.linked_work)),
        claim_capability_status: source.claim_capability.status,
        possible_decision_impact: source.possible_decision_impact
      };
      references.push(formalEvidenceReferenceSchema.parse({
        ...core,
        evidence_ref_id: sha256(`formal-evidence-ref:${JSON.stringify(core)}`)
      }));
    }
  }
  return references;
}

function formalInputFromTransfer(
  transfer: z.output<typeof communityToFormalTransferInputSchema>,
  work: BidirectionalIterationWorkPackage
): CommunityFormalHypothesisInput {
  const byId = new Map(work.community_evidence.map((item) => [item.evidence_ref_id, item]));
  const sourceVideoIds = transfer.source_evidence_ref_ids.map((id) =>
    byId.get(id)?.video_id
  );
  if (sourceVideoIds.some((id) => id === undefined)) {
    throw new Error("Community transfer source identity is missing from its work package");
  }
  return formalInputFromDirectTransfer(
    transfer,
    sourceVideoIds as string[]
  );
}

function formalInputFromDirectTransfer(
  transfer: z.output<typeof communityToFormalTransferInputSchema>,
  sourceVideoIds: string[]
): CommunityFormalHypothesisInput {
  return {
    source_video_ids: [...new Set(sourceVideoIds)].sort(),
    program_signature: sha256(JSON.stringify(Object.values(transfer.program).map(
      (value) => value.trim().toLowerCase().replace(/\s+/gu, " ")
    ))),
    treatment_class: transfer.treatment_class,
    claim_summary: transfer.claim_summary,
    program: transfer.program,
    formal_query: transfer.formal_query
  };
}

function ingestReturnSearchPage(
  rawState: ResearchBidirectionalIterationState,
  transferId: string,
  videoId: string,
  output: ProvenanceEnvelope<YoutubeCommentData | Record<string, never>>
): ResearchBidirectionalIterationState {
  const state = researchBidirectionalIterationStateSchema.parse(rawState);
  const located = findFormalReturnTransfer(state, transferId);
  const searchIndex = located.transfer.searches.findIndex(({ video_id }) =>
    video_id === videoId
  );
  if (searchIndex < 0) throw new Error("Return-search result cites an unknown video");
  const prior = located.transfer.searches[searchIndex]!;
  if (!["NOT_STARTED", "IN_PROGRESS", "BLOCKED_RETRYABLE"].includes(prior.status)) {
    throw new Error("Return-search result cannot overwrite terminal evidence");
  }
  if (output.provider !== "youtube" || output.record_type !== "youtube_comments") {
    throw new Error("Return-search result is not a YouTube comment receipt");
  }
  const outputQuery = output.query as { video_id?: unknown; query?: unknown } | undefined;
  if (
    output.primary_identifier !== videoId ||
    (outputQuery?.video_id !== undefined && outputQuery.video_id !== videoId) ||
    outputQuery?.query !== located.transfer.discriminator_query ||
    output.pagination.cursor !== prior.next_cursor
  ) {
    throw new Error("Return-search result does not match the exact requested source and query");
  }
  const data = "comments" in output.data ? output.data : undefined;
  const returned = output.pagination.returned;
  if (data !== undefined && data.comments.length !== returned) {
    throw new Error("Return-search result count does not match its comment records");
  }
  const pageHash = sha256(JSON.stringify({
    provider: output.provider,
    record_type: output.record_type,
    query: output.query,
    pagination: output.pagination,
    access_status: output.access_status,
    error: output.error ?? null,
    data: output.data
  }));
  const rolling = sha256(`${prior.result_rolling_sha256 ?? ""}:${pageHash}`);
  const exhausted = output.pagination.exhausted === true &&
    output.pagination.next_cursor === undefined;
  let status: z.output<typeof returnSearchRecordSchema>["status"];
  let boundary: z.output<typeof returnSearchRecordSchema>["boundary"];
  if (output.error?.retryable === true || output.access_status === "rate_limited") {
    status = "BLOCKED_RETRYABLE";
    boundary = {
      classification: "RETRYABLE",
      code: "BIDIRECTIONAL_COMMUNITY_SEARCH_RETRYABLE",
      summary: "The formal-to-community discriminator search has retryable provider work."
    };
  } else if (output.error !== undefined || [
    "inaccessible", "not_found", "error"
  ].includes(output.access_status)) {
    status = "BOUNDED_TERMINAL";
    boundary = {
      classification: "TERMINAL_NONRETRYABLE",
      code: "BIDIRECTIONAL_COMMUNITY_SEARCH_TERMINAL_BOUNDARY",
      summary: "The exact discriminator search reached a nonretryable provider boundary."
    };
  } else if (!exhausted && output.pagination.next_cursor === undefined) {
    status = "BOUNDED_TERMINAL";
    boundary = {
      classification: "TERMINAL_NONRETRYABLE",
      code: "BIDIRECTIONAL_COMMUNITY_SEARCH_NOT_RESUMABLE",
      summary: "The query-bounded discriminator search was partial and supplied no resumable continuation."
    };
  } else if (!exhausted) {
    status = "IN_PROGRESS";
  } else if (prior.records_returned_cumulative + returned === 0) {
    status = "COMPLETE_NO_RESULTS";
  } else {
    status = "RESULT_ASSESSMENT_REQUIRED";
  }
  const nextSearch = returnSearchRecordSchema.parse({
    ...prior,
    status,
    pages_retrieved: prior.pages_retrieved + 1,
    records_returned_cumulative: prior.records_returned_cumulative + returned,
    next_cursor: output.pagination.next_cursor,
    page_receipt_hashes: [...prior.page_receipt_hashes, pageHash],
    result_rolling_sha256: rolling,
    access_statuses: [...prior.access_statuses, output.access_status],
    ...(boundary === undefined ? {} : { boundary })
  });
  const nextTransfer = formalToCommunityTransferStateSchema.parse({
    ...located.transfer,
    searches: located.transfer.searches.map((search, index) =>
      index === searchIndex ? nextSearch : search
    )
  });
  const round = state.rounds[located.roundIndex]!;
  const nextRound = bidirectionalRoundSchema.parse({
    ...round,
    formal_to_community_transfers: round.formal_to_community_transfers.map(
      (transfer, index) => index === located.transferIndex ? nextTransfer : transfer
    )
  });
  return researchBidirectionalIterationStateSchema.parse({
    ...state,
    rounds: state.rounds.map((item, index) =>
      index === located.roundIndex ? nextRound : item
    )
  });
}

function findFormalReturnTransfer(
  state: ResearchBidirectionalIterationState,
  transferId: string
): {
  roundIndex: number;
  transferIndex: number;
  transfer: z.output<typeof formalToCommunityTransferStateSchema>;
} {
  for (let roundIndex = 0; roundIndex < state.rounds.length; roundIndex += 1) {
    const transferIndex = state.rounds[roundIndex]!.formal_to_community_transfers
      .findIndex(({ transfer_id }) => transfer_id === transferId);
    if (transferIndex >= 0) {
      return {
        roundIndex,
        transferIndex,
        transfer: state.rounds[roundIndex]!.formal_to_community_transfers[transferIndex]!
      };
    }
  }
  throw new Error("Unknown formal-to-community transfer");
}

function roundHasOpenWork(round: z.output<typeof bidirectionalRoundSchema>): boolean {
  return round.formal_to_community_transfers.some((transfer) =>
    transfer.searches.some(({ status }) => [
      "NOT_STARTED", "IN_PROGRESS", "RESULT_ASSESSMENT_REQUIRED", "BLOCKED_RETRYABLE"
    ].includes(status))
  );
}

function assertExactAssessmentSet(
  assessments: readonly z.output<typeof sourceAssessmentSchema>[],
  expected: readonly string[],
  label: string
): void {
  assertExactStringSet(
    assessments.map(({ evidence_ref_id }) => evidence_ref_id),
    expected,
    `Every exact ${label} source must be assessed once`
  );
}

function assertExactStringSet(actual: readonly string[], expected: readonly string[], message: string) {
  if (
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((value) => !expected.includes(value))
  ) {
    throw new Error(message);
  }
}

function assertMaterialAssessmentsHaveTransfers(
  assessments: readonly z.output<typeof sourceAssessmentSchema>[],
  transfers: readonly z.output<typeof transferInputSchema>[]
): void {
  const cited = new Set(transfers.flatMap(({ source_evidence_ref_ids }) =>
    source_evidence_ref_ids
  ));
  for (const assessment of assessments) {
    if (
      assessment.disposition === "MATERIAL_TRANSFER" !==
        cited.has(assessment.evidence_ref_id)
    ) {
      throw new Error("Material source assessments and transfer records must agree exactly");
    }
  }
}

function assertDiscordancesBound(
  discordances: readonly z.output<typeof discordanceInputSchema>[],
  communityIds: ReadonlySet<string>,
  formalIds: ReadonlySet<string>
): void {
  for (const discordance of discordances) {
    if (
      discordance.community_evidence_ref_ids.some((id) => !communityIds.has(id)) ||
      discordance.formal_evidence_ref_ids.some((id) => !formalIds.has(id))
    ) {
      throw new Error("Cross-layer discordance cites an unbound source identity");
    }
  }
}

function normalizedTransferCore<T extends z.output<typeof transferInputSchema>>(transfer: T): T {
  return {
    ...transfer,
    source_evidence_ref_ids: [...new Set(transfer.source_evidence_ref_ids)].sort(),
    ...(transfer.direction === "FORMAL_TO_COMMUNITY"
      ? { target_video_ids: [...new Set(transfer.target_video_ids)].sort() }
      : {})
  } as T;
}

function communityEvidenceRefId(
  videoId: string,
  transcriptReceiptHash: string | undefined,
  discussionReceiptHash: string | undefined
): string {
  return sha256(`community-evidence-ref:${videoId}:${transcriptReceiptHash ?? "return"}:${discussionReceiptHash ?? "return"}`);
}

function deriveVideoIdFromReturnReference(
  refId: string,
  receipts: ReadonlyArray<{ video_id: string }>
): string | undefined {
  return receipts.find(({ video_id }) =>
    communityEvidenceRefId(video_id, undefined, undefined) === refId
  )?.video_id;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
