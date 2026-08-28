import { createHash } from "node:crypto";

import { ACCESS_STATUSES } from "@askrigor/contracts";
import {
  YOUTUBE_SEARCH_QUOTA_EXHAUSTED_CODE,
  deriveGeminiYoutubeCandidateFrontier,
  geminiYoutubeCandidatePacketSchema,
  geminiYoutubeCandidateValidationReceiptSchema,
  type GeminiYoutubeCandidatePacket,
  type GeminiYoutubeCandidateValidationReceipt
} from "@askrigor/sources";
import { z } from "zod";

import {
  youtubeCommunitySurveyOutputSchema,
  type YoutubeCommunitySurveyInput,
  type YoutubeCommunitySurveyOutput
} from "../youtube-community-survey.js";
import {
  PROGRAM_NOT_DESCRIBED,
  deriveProgramSignature,
  type ProgramSignatureFields
} from "./treatment-landscape-coverage-route.js";

const youtubeVideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const accessStatus = z.enum(ACCESS_STATUSES);
const queryText = z.string().min(1).max(5_000);
const boundedText = (maximum: number) => z.string().min(1).max(maximum);
export const NATIVE_YOUTUBE_QUERY_MAX_CHARACTERS = 200 as const;
const NATIVE_YOUTUBE_SUBJECT_MAX_CHARACTERS = 160;

const programFieldsSchema = z.object({
  components: boundedText(900),
  dose_or_intensity: boundedText(240),
  frequency: boundedText(240),
  duration: boundedText(240),
  supervision: boundedText(240),
  adherence_or_fidelity: boundedText(240),
  cointerventions: boundedText(240),
  stage_or_baseline: boundedText(500),
  outcome: boundedText(500),
  horizon: boundedText(240),
  care_stage: boundedText(240)
}).strict();

const discoveryOriginSchema = z.object({
  source: z.enum(["GEMINI_SCOUT", "NATIVE_YOUTUBE"]),
  frontier_id: digest,
  query_ids: z.array(z.string().regex(/^(gemini|native)_query_[0-9]{2}$/u)).max(18),
  query_linkage: z.enum(["FRONTIER_LEVEL_ONLY", "EXACT_SEARCH_RESULT"])
}).strict();

const candidateRecordSchema = z.object({
  video_id: youtubeVideoId,
  canonical_url: z.string().url().max(200),
  channel_id: z.union([boundedText(100), z.literal("not_reported")]),
  channel_title: z.union([boundedText(500), z.literal("not_reported")]),
  title: z.union([boundedText(500), z.literal("not_reported")]),
  published_at: z.union([boundedText(100), z.literal("not_reported")]),
  metadata_access_status: z.enum(["complete", "api_visible_complete"]),
  origins: z.array(discoveryOriginSchema).min(1).max(2),
  target_distance: z.enum(["exact", "adjacent", "remote", "unassessed"]),
  stage_distance: z.enum(["exact", "adjacent", "remote", "unassessed"]),
  provisional_treatment_class: boundedText(160),
  provisional_claim_summary: boundedText(600),
  program: programFieldsSchema,
  program_description_status: z.enum(["PARTIAL_PROVISIONAL", "NOT_DESCRIBED"]),
  program_signature: digest,
  materiality: z.enum(["UNASSESSED", "MATERIAL", "NOT_MATERIAL"]),
  redundancy: z.enum(["UNASSESSED", "DISTINCT", "DUPLICATE"]),
  duplicate_of_video_id: youtubeVideoId.optional(),
  selection_status: z.enum(["UNASSESSED", "SELECTED", "NOT_SELECTED"]),
  screening_status: z.enum(["PENDING", "SCREENED"]),
  screening_rationale: boundedText(1_000).optional()
}).strict().superRefine((candidate, context) => {
  if (
    candidate.redundancy === "DUPLICATE" !==
      (candidate.duplicate_of_video_id !== undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "Duplicate status and duplicate target must agree"
    });
  }
  if (
    candidate.program_signature !== deriveProgramSignature(candidate.program)
  ) {
    context.addIssue({
      code: "custom",
      message: "Candidate program signature must be derived from normalized program fields"
    });
  }
  if (
    (candidate.screening_status === "SCREENED") !==
      (candidate.screening_rationale !== undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "Screened candidate status and screening rationale must agree"
    });
  }
  if (
    candidate.screening_status === "PENDING" &&
    (
      candidate.materiality !== "UNASSESSED" ||
      candidate.redundancy !== "UNASSESSED" ||
      candidate.selection_status !== "UNASSESSED"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Pending candidates cannot contain semantic screening decisions"
    });
  }
  if (
    candidate.screening_status === "SCREENED" &&
    (
      candidate.materiality === "UNASSESSED" ||
      candidate.redundancy === "UNASSESSED" ||
      candidate.selection_status === "UNASSESSED"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Screened candidates require resolved semantic decisions"
    });
  }
  if (
    candidate.selection_status === "SELECTED" &&
    (candidate.materiality !== "MATERIAL" || candidate.redundancy !== "DISTINCT")
  ) {
    context.addIssue({
      code: "custom",
      message: "Only material, distinct candidates can be selected for depth work"
    });
  }
});

const externalQuerySchema = z.object({
  query_id: z.string().regex(/^gemini_query_[0-9]{2}$/u),
  purpose: z.enum([
    "firsthand_outcome",
    "radical_outcome",
    "overlooked_intervention",
    "conventional_benefit",
    "conventional_negative"
  ]),
  query: boundedText(500)
}).strict();

const nativeSearchSchema = z.object({
  query_id: z.string().regex(/^native_query_[0-9]{2}$/u),
  directions: z.array(z.enum([
    "general",
    "benefit",
    "no_effect",
    "harm",
    "discontinuation",
    "formal_discriminator"
  ])).min(1).max(6),
  query: queryText,
  access_status: accessStatus,
  exhausted: z.boolean(),
  next_cursor_present: z.boolean(),
  candidate_video_ids: z.array(youtubeVideoId).max(10)
}).strict();

const frontierStatusSchema = z.enum([
  "NOT_STARTED",
  "COMPLETE",
  "BLOCKED_RETRYABLE",
  "BLOCKED_TERMINAL"
]);

const externalFrontierSchema = z.object({
  status: frontierStatusSchema,
  frontier_id: digest.optional(),
  provider_response_id: boundedText(500).optional(),
  queries: z.array(externalQuerySchema).max(18),
  source_candidate_video_ids: z.array(youtubeVideoId).max(16),
  validated_candidate_video_ids: z.array(youtubeVideoId).max(16),
  terminally_rejected_video_ids: z.array(youtubeVideoId).max(16),
  unresolved_candidate_video_ids: z.array(youtubeVideoId).max(16)
}).strict();

const nativeFrontierSchema = z.object({
  status: frontierStatusSchema,
  frontier_id: digest.optional(),
  research_question: boundedText(5_000).optional(),
  searches: z.array(nativeSearchSchema).max(6),
  source_candidate_video_ids: z.array(youtubeVideoId).max(60),
  validated_candidate_video_ids: z.array(youtubeVideoId).max(60),
  unresolved_candidate_video_ids: z.array(youtubeVideoId).max(60)
}).strict();

export const researchCandidateDiscoveryStateSchema = z.object({
  external_scout: externalFrontierSchema,
  native_youtube: nativeFrontierSchema,
  candidates: z.array(candidateRecordSchema).max(76)
}).strict().superRefine(addDiscoveryRelationshipIssues);

export type ResearchCandidateDiscoveryState = z.output<
  typeof researchCandidateDiscoveryStateSchema
>;
export type ResearchCandidateRecord = z.output<typeof candidateRecordSchema>;

const candidateScreeningSourceSchema = z.object({
  video_id: youtubeVideoId,
  canonical_url: z.string().url().max(200),
  channel_id: z.union([boundedText(100), z.literal("not_reported")]),
  channel_title: z.union([boundedText(500), z.literal("not_reported")]),
  title: z.union([boundedText(500), z.literal("not_reported")]),
  metadata_access_status: z.enum(["complete", "api_visible_complete"]),
  origins: z.array(discoveryOriginSchema).min(1).max(2),
  target_distance: z.enum(["exact", "adjacent", "remote", "unassessed"]),
  stage_distance: z.enum(["exact", "adjacent", "remote", "unassessed"]),
  provisional_treatment_class: boundedText(160),
  provisional_claim_summary: boundedText(600),
  program: programFieldsSchema,
  program_description_status: z.enum(["PARTIAL_PROVISIONAL", "NOT_DESCRIBED"]),
  program_signature: digest
}).strict();

export const candidateScreeningWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_candidate_screening_v1"),
  discovery_digest: digest,
  candidates: z.array(candidateScreeningSourceSchema).min(1).max(76)
}).strict();

export const candidateScreeningSubmissionSchema = z.object({
  package_version: z.literal("askrigor_candidate_screening_v1"),
  discovery_digest: digest,
  decisions: z.array(z.object({
    video_id: youtubeVideoId,
    materiality: z.enum(["MATERIAL", "NOT_MATERIAL"]),
    redundancy: z.enum(["DISTINCT", "DUPLICATE"]),
    duplicate_of_video_id: youtubeVideoId.optional(),
    selection_status: z.enum(["SELECTED", "NOT_SELECTED"]),
    rationale: boundedText(1_000)
  }).strict()).min(1).max(76).describe(
    "Exactly one decision for every packaged candidate video_id, including nonmaterial, duplicate, and unselected candidates; preserve each packaged video_id exactly once and never return only selected candidates. For MATERIAL candidates with a described program, program_signature is the exact redundancy key: each shared signature has exactly one DISTINCT decision and every other member is DUPLICATE and names that distinct member's video_id. Similar titles, channels, or treatment themes alone do not establish DUPLICATE."
  )
}).strict();

export type CandidateScreeningWorkPackage = z.output<
  typeof candidateScreeningWorkPackageSchema
>;
export type CandidateScreeningSubmission = z.output<
  typeof candidateScreeningSubmissionSchema
>;

export const candidateDiscoveryDiagnosticsSchema = z.object({
  external_source_candidates: z.number().int().nonnegative(),
  native_source_candidates: z.number().int().nonnegative(),
  reconciled_candidates: z.number().int().nonnegative(),
  multiple_source_candidates: z.number().int().nonnegative(),
  unresolved_identity_video_ids: z.array(youtubeVideoId),
  described_program_signature_groups: z.array(z.object({
    program_signature: digest,
    candidate_video_ids: z.array(youtubeVideoId).min(1)
  }).strict()),
  program_not_described_candidates: z.number().int().nonnegative(),
  semantic_screening_pending: z.number().int().nonnegative()
}).strict();

export type CandidateDiscoveryDiagnostics = z.output<
  typeof candidateDiscoveryDiagnosticsSchema
>;

export function initialResearchCandidateDiscoveryState(): ResearchCandidateDiscoveryState {
  return researchCandidateDiscoveryStateSchema.parse({
    external_scout: {
      status: "NOT_STARTED",
      queries: [],
      source_candidate_video_ids: [],
      validated_candidate_video_ids: [],
      terminally_rejected_video_ids: [],
      unresolved_candidate_video_ids: []
    },
    native_youtube: {
      status: "NOT_STARTED",
      searches: [],
      source_candidate_video_ids: [],
      validated_candidate_video_ids: [],
      unresolved_candidate_video_ids: []
    },
    candidates: []
  });
}

export function markExternalScoutFrontierBoundary(
  rawState: ResearchCandidateDiscoveryState,
  status: "BLOCKED_RETRYABLE" | "BLOCKED_TERMINAL",
  boundaryCode: string
): ResearchCandidateDiscoveryState {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  const frontierId = state.external_scout.frontier_id ?? createHash("sha256")
    .update(JSON.stringify({
      source: "GEMINI_SCOUT",
      status,
      boundary_code: boundaryCode
    }), "utf8")
    .digest("hex");
  return researchCandidateDiscoveryStateSchema.parse({
    ...state,
    external_scout: {
      ...state.external_scout,
      status,
      frontier_id: frontierId
    }
  });
}

export function resetExternalScoutFrontierForRetry(
  rawState: ResearchCandidateDiscoveryState
): ResearchCandidateDiscoveryState {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  return researchCandidateDiscoveryStateSchema.parse({
    ...state,
    external_scout: {
      status: "NOT_STARTED",
      queries: [],
      source_candidate_video_ids: [],
      validated_candidate_video_ids: [],
      terminally_rejected_video_ids: [],
      unresolved_candidate_video_ids: []
    },
    candidates: withoutDiscoveryOrigin(state.candidates, "GEMINI_SCOUT")
  });
}

export function ingestValidatedGeminiFrontier(
  rawState: ResearchCandidateDiscoveryState,
  packet: GeminiYoutubeCandidatePacket,
  receipt: GeminiYoutubeCandidateValidationReceipt,
  providerResponseId: string
): ResearchCandidateDiscoveryState {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  packet = geminiYoutubeCandidatePacketSchema.parse(packet);
  receipt = geminiYoutubeCandidateValidationReceiptSchema.parse(receipt);
  if (packet.research_target !== receipt.research_target) {
    throw new Error("Gemini packet and validation receipt target mismatch");
  }
  const packetIds = packet.candidates.map(({ video_id }) => video_id);
  if (!sameMembers(packetIds, receipt.candidate_frontier.source_candidate_video_ids)) {
    throw new Error("Gemini packet and validation receipt candidate frontier mismatch");
  }
  const expectedFrontier = deriveGeminiYoutubeCandidateFrontier(
    receipt.candidate_frontier.source_candidate_video_ids,
    receipt.candidate_frontier.validated_candidate_video_ids,
    receipt.candidate_frontier.terminally_rejected_video_ids,
    receipt.candidate_frontier.unresolved_candidate_video_ids
  );
  if (expectedFrontier.frontier_digest !== receipt.candidate_frontier.frontier_digest) {
    throw new Error("Gemini validation receipt frontier digest mismatch");
  }
  const packetById = new Map(packet.candidates.map((candidate) => [candidate.video_id, candidate]));
  const queryIds = packet.discovery_queries.map((_, index) => queryId("gemini", index));
  const externalCandidates = receipt.validated_candidates.map((validated) => {
    const packetCandidate = packetById.get(validated.video_id);
    if (packetCandidate === undefined) {
      throw new Error("Validated Gemini candidate is absent from its source packet");
    }
    return externalCandidate(
      validated,
      packetCandidate,
      receipt.candidate_frontier.frontier_digest,
      queryIds
    );
  });
  const candidates = mergeCandidates(
    withoutDiscoveryOrigin(state.candidates, "GEMINI_SCOUT"),
    externalCandidates
  );

  return researchCandidateDiscoveryStateSchema.parse({
    ...state,
    external_scout: {
      status: receipt.status === "rejected"
        ? "BLOCKED_RETRYABLE"
        : receipt.candidate_frontier.validated_candidate_video_ids.length > 0 &&
            receipt.unresolved_candidates.length > 0
          ? "BLOCKED_TERMINAL"
        : receipt.unresolved_candidates.some(({ retryable }) => retryable)
        ? "BLOCKED_RETRYABLE"
        : receipt.unresolved_candidates.length > 0
          ? "BLOCKED_TERMINAL"
          : "COMPLETE",
      frontier_id: receipt.candidate_frontier.frontier_digest,
      provider_response_id: providerResponseId,
      queries: packet.discovery_queries.map(({ purpose, query }, index) => ({
        query_id: queryId("gemini", index),
        purpose,
        query
      })),
      source_candidate_video_ids: receipt.candidate_frontier.source_candidate_video_ids,
      validated_candidate_video_ids: receipt.candidate_frontier.validated_candidate_video_ids,
      terminally_rejected_video_ids: receipt.candidate_frontier.terminally_rejected_video_ids,
      unresolved_candidate_video_ids: receipt.candidate_frontier.unresolved_candidate_video_ids
    },
    candidates
  });
}

export function nativeSurveyInputFromGeminiPacket(
  packet: GeminiYoutubeCandidatePacket
): YoutubeCommunitySurveyInput {
  const selected = selectNativeQueries(packet.discovery_queries);
  return {
    research_question: packet.research_target,
    searches: selected.map(({ direction, query }) => ({ direction, query })),
    results_per_search: 10
  };
}

export function nativeSurveyInputFromCandidateDiscovery(
  rawState: ResearchCandidateDiscoveryState,
  researchQuestion: string
): YoutubeCommunitySurveyInput {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  if (state.external_scout.status === "BLOCKED_RETRYABLE") {
    throw new Error("Native discovery cannot bypass retryable external scout work");
  }
  if (
    state.external_scout.status !== "COMPLETE" &&
    state.external_scout.status !== "BLOCKED_TERMINAL"
  ) {
    throw new Error("Native discovery input requires a resolved external scout attempt");
  }
  const selected = selectNativeQueries(state.external_scout.queries);
  const searches = selected.length > 0
    ? selected
    : fallbackNativeQueries(researchQuestion);
  return {
    research_question: researchQuestion,
    searches: searches.map(({ direction, query }) => ({ direction, query })),
    results_per_search: 10
  };
}

export function ingestNativeYoutubeSurvey(
  rawState: ResearchCandidateDiscoveryState,
  survey: YoutubeCommunitySurveyOutput
): ResearchCandidateDiscoveryState {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  survey = youtubeCommunitySurveyOutputSchema.parse(survey);
  if (state.external_scout.status === "BLOCKED_RETRYABLE") {
    throw new Error("Native discovery cannot bypass retryable external scout work");
  }
  if (
    state.external_scout.status !== "COMPLETE" &&
    state.external_scout.status !== "BLOCKED_TERMINAL"
  ) {
    throw new Error("Native discovery requires a resolved external scout attempt");
  }
  const frontierId = nativeFrontierDigest(survey);
  const nativeCandidates = survey.candidates
    .filter(({ metadata_access_status }) => isCompleteAccess(metadata_access_status))
    .map((candidate) => nativeCandidate(candidate, frontierId, survey.searches));
  const unresolved = survey.candidates
    .filter(({ metadata_access_status }) => !isCompleteAccess(metadata_access_status))
    .map(({ video_id }) => video_id);
  const retryable = survey.searches.some((search) =>
    search.error?.retryable === true || isRetryableAccess(search.access_status)
  ) || survey.candidates.some((candidate) =>
    candidate.metadata_error?.retryable === true ||
      isRetryableAccess(candidate.metadata_access_status)
  );
  const incomplete = survey.searches.some((search) =>
    !isCompleteAccess(search.access_status)
  ) || unresolved.length > 0;
  const boundedSearchAccessBoundary =
    (
      state.external_scout.status === "COMPLETE" ||
      state.external_scout.status === "BLOCKED_TERMINAL"
    ) &&
    state.external_scout.validated_candidate_video_ids.length > 0 &&
    nativeSurveyEndedByBoundedSearchAccess(survey);
  const boundedIdentityAccessBoundary =
    (
      state.external_scout.status === "COMPLETE" ||
      state.external_scout.status === "BLOCKED_TERMINAL"
    ) &&
    state.external_scout.validated_candidate_video_ids.length > 0 &&
    nativeSurveyEndedByBoundedIdentityAccess(survey);

  return researchCandidateDiscoveryStateSchema.parse({
    ...state,
    native_youtube: {
      status: !incomplete
        ? "COMPLETE"
        : boundedSearchAccessBoundary || boundedIdentityAccessBoundary
          ? "BLOCKED_TERMINAL"
          : retryable
          ? "BLOCKED_RETRYABLE"
          : "BLOCKED_TERMINAL",
      frontier_id: frontierId,
      research_question: survey.research_question,
      searches: survey.searches.map((search, index) => ({
        query_id: queryId("native", index),
        directions: search.directions,
        query: search.query,
        access_status: search.access_status,
        exhausted: search.pagination.exhausted === true,
        next_cursor_present: search.pagination.next_cursor !== undefined,
        candidate_video_ids: search.candidate_video_ids
      })),
      source_candidate_video_ids: survey.candidates.map(({ video_id }) => video_id),
      validated_candidate_video_ids: nativeCandidates.map(({ video_id }) => video_id),
      unresolved_candidate_video_ids: unresolved
    },
    candidates: mergeCandidates(
      withoutDiscoveryOrigin(state.candidates, "NATIVE_YOUTUBE"),
      nativeCandidates
    )
  });
}

export function nativeSurveyEndedByBoundedSearchAccess(
  survey: YoutubeCommunitySurveyOutput
): boolean {
  survey = youtubeCommunitySurveyOutputSchema.parse(survey);
  return survey.searches.some(({ access_status }) =>
    !isCompleteAccess(access_status)
  );
}

export function nativeSurveyEndedByBoundedIdentityAccess(
  survey: YoutubeCommunitySurveyOutput
): boolean {
  survey = youtubeCommunitySurveyOutputSchema.parse(survey);
  return survey.searches.length > 0 &&
    survey.searches.every(({ access_status }) =>
      isCompleteAccess(access_status)
    ) &&
    survey.candidates.some(({ metadata_access_status }) =>
      !isCompleteAccess(metadata_access_status)
    );
}

export function nativeSurveyEndedByDailySearchQuota(
  survey: YoutubeCommunitySurveyOutput
): boolean {
  survey = youtubeCommunitySurveyOutputSchema.parse(survey);
  const quotaBoundedSearches = survey.searches.filter(({ error }) =>
    error?.code === YOUTUBE_SEARCH_QUOTA_EXHAUSTED_CODE
  );
  return quotaBoundedSearches.length > 0 &&
    survey.searches.every((search) =>
      isCompleteAccess(search.access_status) ||
      search.error?.code === YOUTUBE_SEARCH_QUOTA_EXHAUSTED_CODE
    ) &&
    survey.candidates.every(({ metadata_access_status }) =>
      isCompleteAccess(metadata_access_status)
    );
}

export function deriveCandidateDiscoveryDiagnostics(
  rawState: ResearchCandidateDiscoveryState
): CandidateDiscoveryDiagnostics {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  const describedGroups = new Map<string, string[]>();
  for (const candidate of state.candidates) {
    if (candidate.program_description_status === "NOT_DESCRIBED") continue;
    const ids = describedGroups.get(candidate.program_signature) ?? [];
    ids.push(candidate.video_id);
    describedGroups.set(candidate.program_signature, ids);
  }
  return candidateDiscoveryDiagnosticsSchema.parse({
    external_source_candidates:
      state.external_scout.source_candidate_video_ids.length,
    native_source_candidates: state.native_youtube.source_candidate_video_ids.length,
    reconciled_candidates: state.candidates.length,
    multiple_source_candidates: state.candidates.filter(({ origins }) =>
      origins.length > 1
    ).length,
    unresolved_identity_video_ids: unique([
      ...state.external_scout.unresolved_candidate_video_ids,
      ...state.native_youtube.unresolved_candidate_video_ids
    ]),
    described_program_signature_groups: [...describedGroups.entries()]
      .map(([program_signature, candidate_video_ids]) => ({
        program_signature,
        candidate_video_ids
      })),
    program_not_described_candidates: state.candidates.filter(({ program }) =>
      Object.values(program).every((value) => value === PROGRAM_NOT_DESCRIBED)
    ).length,
    semantic_screening_pending: state.candidates.filter(({ screening_status }) =>
      screening_status === "PENDING"
    ).length
  });
}

export function candidateDiscoveryReadyForScreening(
  rawState: ResearchCandidateDiscoveryState
): boolean {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  return frontierReadyForScreening(state.external_scout) &&
    frontierReadyForScreening(state.native_youtube) &&
    state.candidates.length > 0;
}

export function createCandidateScreeningWorkPackage(
  rawState: ResearchCandidateDiscoveryState
): CandidateScreeningWorkPackage {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  if (!candidateDiscoveryReadyForScreening(state)) {
    throw new Error("Candidate discovery is not ready for a screening work package");
  }
  return candidateScreeningWorkPackageSchema.parse({
    package_version: "askrigor_candidate_screening_v1",
    discovery_digest: candidateDiscoveryScreeningDigest(state),
    candidates: state.candidates.map((candidate) => ({
      video_id: candidate.video_id,
      canonical_url: candidate.canonical_url,
      channel_id: candidate.channel_id,
      channel_title: candidate.channel_title,
      title: candidate.title,
      metadata_access_status: candidate.metadata_access_status,
      origins: candidate.origins,
      target_distance: candidate.target_distance,
      stage_distance: candidate.stage_distance,
      provisional_treatment_class: candidate.provisional_treatment_class,
      provisional_claim_summary: candidate.provisional_claim_summary,
      program: candidate.program,
      program_description_status: candidate.program_description_status,
      program_signature: candidate.program_signature
    }))
  });
}

export function ingestCandidateScreeningSubmission(
  rawState: ResearchCandidateDiscoveryState,
  rawSubmission: CandidateScreeningSubmission
): ResearchCandidateDiscoveryState {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  const workPackage = createCandidateScreeningWorkPackage(state);
  const submission = candidateScreeningSubmissionSchema.parse(rawSubmission);
  if (submission.discovery_digest !== workPackage.discovery_digest) {
    throw new Error("Candidate screening submission is bound to a different frontier");
  }
  if (!sameMembers(
    submission.decisions.map(({ video_id }) => video_id),
    state.candidates.map(({ video_id }) => video_id)
  )) {
    throw new Error("Candidate screening must decide every packaged identity exactly once");
  }
  const decisions = new Map(submission.decisions.map((decision) => [
    decision.video_id,
    decision
  ]));
  const screened = researchCandidateDiscoveryStateSchema.parse({
    ...state,
    candidates: state.candidates.map((candidate) => {
      const decision = decisions.get(candidate.video_id)!;
      return {
        ...candidate,
        materiality: decision.materiality,
        redundancy: decision.redundancy,
        duplicate_of_video_id: decision.duplicate_of_video_id,
        selection_status: decision.selection_status,
        screening_status: "SCREENED" as const,
        screening_rationale: decision.rationale
      };
    })
  });
  assertCandidateScreeningComplete(screened);
  return screened;
}

export function candidateDiscoveryScreeningDigest(
  rawState: ResearchCandidateDiscoveryState
): string {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  return createHash("sha256").update(JSON.stringify({
    external_scout: state.external_scout,
    native_youtube: state.native_youtube,
    candidates: state.candidates.map((candidate) => ({
      video_id: candidate.video_id,
      canonical_url: candidate.canonical_url,
      channel_id: candidate.channel_id,
      channel_title: candidate.channel_title,
      title: candidate.title,
      metadata_access_status: candidate.metadata_access_status,
      origins: candidate.origins,
      target_distance: candidate.target_distance,
      stage_distance: candidate.stage_distance,
      provisional_treatment_class: candidate.provisional_treatment_class,
      provisional_claim_summary: candidate.provisional_claim_summary,
      program: candidate.program,
      program_description_status: candidate.program_description_status,
      program_signature: candidate.program_signature
    }))
  }), "utf8").digest("hex");
}

export function selectedCandidateVideoIds(
  rawState: ResearchCandidateDiscoveryState
): string[] {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  assertCandidateScreeningComplete(state);
  return state.candidates
    .filter(({ selection_status }) => selection_status === "SELECTED")
    .map(({ video_id }) => video_id);
}

export function candidateScreeningResultDigest(
  rawState: ResearchCandidateDiscoveryState
): string {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  assertCandidateScreeningComplete(state);
  return createHash("sha256").update(JSON.stringify({
    discovery_digest: candidateDiscoveryScreeningDigest(state),
    decisions: state.candidates.map((candidate) => ({
      video_id: candidate.video_id,
      materiality: candidate.materiality,
      redundancy: candidate.redundancy,
      duplicate_of_video_id: candidate.duplicate_of_video_id ?? null,
      selection_status: candidate.selection_status,
      screening_rationale: candidate.screening_rationale
    }))
  }), "utf8").digest("hex");
}

export function assertCandidateScreeningComplete(
  rawState: ResearchCandidateDiscoveryState
): void {
  const state = researchCandidateDiscoveryStateSchema.parse(rawState);
  if (!candidateDiscoveryReadyForScreening(state)) {
    throw new Error("Candidate discovery frontiers are not ready for screening completion");
  }
  if (state.candidates.some((candidate) =>
    candidate.screening_status !== "SCREENED" ||
    candidate.materiality === "UNASSESSED" ||
    candidate.redundancy === "UNASSESSED" ||
    candidate.selection_status === "UNASSESSED"
  )) {
    throw new Error("Candidate semantic screening remains unresolved");
  }
  const selected = state.candidates.filter(({ selection_status }) =>
    selection_status === "SELECTED"
  );
  if (selected.length === 0) {
    throw new Error("Candidate screening must select at least one source for depth work");
  }
  if (selected.some((candidate) =>
    candidate.materiality !== "MATERIAL" || candidate.redundancy !== "DISTINCT"
  )) {
    throw new Error("Selected candidates must be material and nonredundant");
  }
  const byId = new Map(state.candidates.map((candidate) => [candidate.video_id, candidate]));
  const materialGroups = new Map<string, ResearchCandidateRecord[]>();
  for (const candidate of state.candidates) {
    if (
      candidate.materiality !== "MATERIAL" ||
      candidate.program_description_status === "NOT_DESCRIBED"
    ) continue;
    const group = materialGroups.get(candidate.program_signature) ?? [];
    group.push(candidate);
    materialGroups.set(candidate.program_signature, group);
  }
  for (const group of materialGroups.values()) {
    const distinct = group.filter(({ redundancy }) => redundancy === "DISTINCT");
    if (distinct.length !== 1) {
      throw new Error("One described program signature cannot count as multiple distinct programs");
    }
    for (const candidate of group) {
      if (candidate.redundancy !== "DUPLICATE") continue;
      const target = candidate.duplicate_of_video_id === undefined
        ? undefined
        : byId.get(candidate.duplicate_of_video_id);
      if (
        target === undefined ||
        target.program_signature !== candidate.program_signature ||
        target.redundancy !== "DISTINCT"
      ) {
        throw new Error("Duplicate candidate must name the distinct record for its program signature");
      }
    }
  }
}

function addDiscoveryRelationshipIssues(
  state: {
    external_scout: z.output<typeof externalFrontierSchema>;
    native_youtube: z.output<typeof nativeFrontierSchema>;
    candidates: z.output<typeof candidateRecordSchema>[];
  },
  context: z.RefinementCtx
): void {
  const candidatesById = new Map(state.candidates.map((candidate) => [
    candidate.video_id,
    candidate
  ]));
  if (candidatesById.size !== state.candidates.length) {
    context.addIssue({ code: "custom", message: "Candidate video identities must be unique" });
    return;
  }
  validatePartition(
    state.external_scout.source_candidate_video_ids,
    [
      state.external_scout.validated_candidate_video_ids,
      state.external_scout.terminally_rejected_video_ids,
      state.external_scout.unresolved_candidate_video_ids
    ],
    "external scout",
    context
  );
  validatePartition(
    state.native_youtube.source_candidate_video_ids,
    [
      state.native_youtube.validated_candidate_video_ids,
      state.native_youtube.unresolved_candidate_video_ids
    ],
    "native survey",
    context
  );
  validateReciprocalOrigins(state.external_scout, "GEMINI_SCOUT", candidatesById, context);
  validateReciprocalOrigins(state.native_youtube, "NATIVE_YOUTUBE", candidatesById, context);
  const nativeSourceIds = new Set(state.native_youtube.source_candidate_video_ids);
  for (const search of state.native_youtube.searches) {
    for (const videoId of search.candidate_video_ids) {
      if (!nativeSourceIds.has(videoId)) {
        context.addIssue({
          code: "custom",
          message: `Native search ${search.query_id} references an unknown candidate identity`
        });
        continue;
      }
      if (!state.native_youtube.validated_candidate_video_ids.includes(videoId)) continue;
      const candidate = candidatesById.get(videoId);
      const origin = candidate?.origins.find(({ source }) => source === "NATIVE_YOUTUBE");
      if (origin === undefined || !origin.query_ids.includes(search.query_id)) {
        context.addIssue({
          code: "custom",
          message: `Native search ${search.query_id} lacks a reciprocal candidate origin`
        });
      }
    }
  }

  for (const candidate of state.candidates) {
    for (const origin of candidate.origins) {
      const frontier = origin.source === "GEMINI_SCOUT"
        ? state.external_scout
        : state.native_youtube;
      if (
        frontier.frontier_id !== origin.frontier_id ||
        !frontier.validated_candidate_video_ids.includes(candidate.video_id)
      ) {
        context.addIssue({
          code: "custom",
          message: `Candidate ${candidate.video_id} has an orphaned discovery origin`
        });
      }
      const validQueries = new Set(
        "queries" in frontier
          ? frontier.queries.map(({ query_id }) => query_id)
          : frontier.searches.map(({ query_id }) => query_id)
      );
      if (origin.query_ids.some((queryIdValue) => !validQueries.has(queryIdValue))) {
        context.addIssue({
          code: "custom",
          message: `Candidate ${candidate.video_id} references an unknown discovery query`
        });
      }
      if (origin.source === "NATIVE_YOUTUBE") {
        for (const queryIdValue of origin.query_ids) {
          const search = state.native_youtube.searches.find(({ query_id }) =>
            query_id === queryIdValue
          );
          if (search === undefined || !search.candidate_video_ids.includes(candidate.video_id)) {
            context.addIssue({
              code: "custom",
              message: `Candidate ${candidate.video_id} has a one-way native query origin`
            });
          }
        }
      }
    }
  }
}

function validatePartition(
  source: readonly string[],
  partitions: readonly (readonly string[])[],
  label: string,
  context: z.RefinementCtx
): void {
  const combined = partitions.flat();
  if (!sameMembers(source, combined) || new Set(combined).size !== combined.length) {
    context.addIssue({
      code: "custom",
      message: `${label} candidate identities must form one exact partition`
    });
  }
}

function validateReciprocalOrigins(
  frontier: z.output<typeof externalFrontierSchema> | z.output<typeof nativeFrontierSchema>,
  source: "GEMINI_SCOUT" | "NATIVE_YOUTUBE",
  candidatesById: ReadonlyMap<string, ResearchCandidateRecord>,
  context: z.RefinementCtx
): void {
  if (frontier.frontier_id === undefined && frontier.status !== "NOT_STARTED") {
    context.addIssue({ code: "custom", message: `${source} frontier identity is missing` });
  }
  for (const videoId of frontier.validated_candidate_video_ids) {
    const candidate = candidatesById.get(videoId);
    if (
      candidate === undefined ||
      !candidate.origins.some((origin) =>
        origin.source === source && origin.frontier_id === frontier.frontier_id
      )
    ) {
      context.addIssue({
        code: "custom",
        message: `${source} validated candidate ${videoId} lacks a reciprocal record`
      });
    }
  }
}

function externalCandidate(
  validated: GeminiYoutubeCandidateValidationReceipt["validated_candidates"][number],
  packetCandidate: GeminiYoutubeCandidatePacket["candidates"][number],
  frontierId: string,
  queryIds: string[]
): ResearchCandidateRecord {
  const annotations = validated.gemini_provisional_annotations;
  const program = programFromGemini(annotations);
  return candidateRecordSchema.parse({
    video_id: validated.video_id,
    canonical_url: validated.canonical_url,
    channel_id: validated.provider_metadata.channel_id,
    channel_title: validated.provider_metadata.channel_title,
    title: validated.provider_metadata.title,
    published_at: "not_reported",
    metadata_access_status: validated.metadata_access_status,
    origins: [{
      source: "GEMINI_SCOUT",
      frontier_id: frontierId,
      query_ids: queryIds,
      query_linkage: "FRONTIER_LEVEL_ONLY"
    }],
    target_distance: packetCandidate.target_distance,
    stage_distance: "unassessed",
    provisional_treatment_class: annotations.intervention_family,
    provisional_claim_summary: annotations.creator_claim_summary,
    program,
    program_description_status: Object.values(program).every((value) =>
      value === PROGRAM_NOT_DESCRIBED
    ) ? "NOT_DESCRIBED" : "PARTIAL_PROVISIONAL",
    program_signature: deriveProgramSignature(program),
    materiality: "UNASSESSED",
    redundancy: "UNASSESSED",
    selection_status: "UNASSESSED",
    screening_status: "PENDING"
  });
}

function nativeCandidate(
  candidate: YoutubeCommunitySurveyOutput["candidates"][number],
  frontierId: string,
  searches: YoutubeCommunitySurveyOutput["searches"]
): ResearchCandidateRecord {
  const queryIds = candidate.search_queries.map((finding) => {
    const index = searches.findIndex((search) =>
      search.query === finding.query && search.cursor === finding.cursor
    );
    if (index < 0) throw new Error("Native candidate query lacks a survey receipt");
    return queryId("native", index);
  });
  const program = unspecifiedProgram();
  return candidateRecordSchema.parse({
    video_id: candidate.video_id,
    canonical_url: candidate.canonical_url,
    channel_id: candidate.channel_id ?? "not_reported",
    channel_title: candidate.channel_title ?? "not_reported",
    title: candidate.title ?? "not_reported",
    published_at: candidate.published_at ?? "not_reported",
    metadata_access_status: candidate.metadata_access_status,
    origins: [{
      source: "NATIVE_YOUTUBE",
      frontier_id: frontierId,
      query_ids: unique(queryIds),
      query_linkage: "EXACT_SEARCH_RESULT"
    }],
    target_distance: "unassessed",
    stage_distance: "unassessed",
    provisional_treatment_class: PROGRAM_NOT_DESCRIBED,
    provisional_claim_summary: PROGRAM_NOT_DESCRIBED,
    program,
    program_description_status: "NOT_DESCRIBED",
    program_signature: deriveProgramSignature(program),
    materiality: "UNASSESSED",
    redundancy: "UNASSESSED",
    selection_status: "UNASSESSED",
    screening_status: "PENDING"
  });
}

function programFromGemini(
  annotations: GeminiYoutubeCandidateValidationReceipt[
    "validated_candidates"
  ][number]["gemini_provisional_annotations"]
): ProgramSignatureFields {
  return {
    components: describedOrUnspecified(annotations.specific_program),
    dose_or_intensity: PROGRAM_NOT_DESCRIBED,
    frequency: PROGRAM_NOT_DESCRIBED,
    duration: PROGRAM_NOT_DESCRIBED,
    supervision: PROGRAM_NOT_DESCRIBED,
    adherence_or_fidelity: PROGRAM_NOT_DESCRIBED,
    cointerventions: PROGRAM_NOT_DESCRIBED,
    stage_or_baseline: describedOrUnspecified(annotations.population_or_stage),
    outcome: describedOrUnspecified(annotations.outcome_and_horizon),
    horizon: PROGRAM_NOT_DESCRIBED,
    care_stage: PROGRAM_NOT_DESCRIBED
  };
}

function unspecifiedProgram(): ProgramSignatureFields {
  return {
    components: PROGRAM_NOT_DESCRIBED,
    dose_or_intensity: PROGRAM_NOT_DESCRIBED,
    frequency: PROGRAM_NOT_DESCRIBED,
    duration: PROGRAM_NOT_DESCRIBED,
    supervision: PROGRAM_NOT_DESCRIBED,
    adherence_or_fidelity: PROGRAM_NOT_DESCRIBED,
    cointerventions: PROGRAM_NOT_DESCRIBED,
    stage_or_baseline: PROGRAM_NOT_DESCRIBED,
    outcome: PROGRAM_NOT_DESCRIBED,
    horizon: PROGRAM_NOT_DESCRIBED,
    care_stage: PROGRAM_NOT_DESCRIBED
  };
}

function mergeCandidates(
  existing: readonly ResearchCandidateRecord[],
  additions: readonly ResearchCandidateRecord[]
): ResearchCandidateRecord[] {
  const merged = new Map(existing.map((candidate) => [
    candidate.video_id,
    structuredClone(candidate)
  ]));
  for (const addition of additions) {
    const current = merged.get(addition.video_id);
    if (current === undefined) {
      merged.set(addition.video_id, addition);
      continue;
    }
    const origins = [...current.origins];
    for (const origin of addition.origins) {
      if (!origins.some((existingOrigin) => existingOrigin.source === origin.source)) {
        origins.push(origin);
      }
    }
    merged.set(addition.video_id, candidateRecordSchema.parse({
      ...current,
      origins,
      channel_id: current.channel_id === "not_reported"
        ? addition.channel_id
        : current.channel_id,
      channel_title: current.channel_title === "not_reported"
        ? addition.channel_title
        : current.channel_title,
      title: current.title === "not_reported" ? addition.title : current.title,
      published_at: current.published_at === "not_reported"
        ? addition.published_at
        : current.published_at
    }));
  }
  return [...merged.values()];
}

function withoutDiscoveryOrigin(
  existing: readonly ResearchCandidateRecord[],
  source: "GEMINI_SCOUT" | "NATIVE_YOUTUBE"
): ResearchCandidateRecord[] {
  return existing.flatMap((candidate) => {
    const origins = candidate.origins.filter((origin) => origin.source !== source);
    return origins.length === 0
      ? []
      : [candidateRecordSchema.parse({ ...candidate, origins })];
  });
}

function selectNativeQueries(
  queries: ReadonlyArray<{
    purpose: GeminiYoutubeCandidatePacket["discovery_queries"][number]["purpose"];
    query: string;
  }>
): Array<{
  direction: "general" | "benefit" | "no_effect" | "harm" |
    "discontinuation" | "formal_discriminator";
  query: string;
}> {
  const selected: Array<{
    direction: "general" | "benefit" | "no_effect" | "harm" |
      "discontinuation" | "formal_discriminator";
    query: string;
  }> = [];
  const used = new Set<number>();
  const negativeDirections = ["no_effect", "harm", "discontinuation"] as const;
  const purposes = [
    ["firsthand_outcome", "general"],
    ["radical_outcome", "general"],
    ["overlooked_intervention", "formal_discriminator"],
    ["conventional_benefit", "benefit"]
  ] as const;
  for (const [purpose, direction] of purposes) {
    const index = queries.findIndex((query, candidateIndex) =>
      query.purpose === purpose && !used.has(candidateIndex)
    );
    if (index < 0) continue;
    used.add(index);
    selected.push({ direction, query: queries[index]!.query });
  }
  let negativeIndex = 0;
  for (let index = 0; index < queries.length && selected.length < 6; index += 1) {
    if (used.has(index) || queries[index]!.purpose !== "conventional_negative") continue;
    used.add(index);
    selected.push({
      direction: negativeDirections[Math.min(negativeIndex, 2)]!,
      query: queries[index]!.query
    });
    negativeIndex += 1;
  }
  for (let index = 0; index < queries.length && selected.length < 6; index += 1) {
    if (used.has(index)) continue;
    const query = queries[index]!;
    selected.push({
      direction: query.purpose === "conventional_benefit"
        ? "benefit"
        : query.purpose === "conventional_negative"
          ? negativeDirections[Math.min(negativeIndex++, 2)]!
          : query.purpose === "overlooked_intervention"
            ? "formal_discriminator"
            : "general",
      query: query.query
    });
  }
  return selected;
}

function fallbackNativeQueries(
  researchQuestion: string
): Array<{
  direction: "general" | "benefit" | "no_effect" | "harm" |
    "discontinuation" | "formal_discriminator";
  query: string;
}> {
  const target = boundedNativeQuerySubject(researchQuestion);
  const searches = [
    { direction: "general", query: `${target} treatment experience` },
    { direction: "benefit", query: `${target} what worked` },
    { direction: "no_effect", query: `${target} no improvement failed` },
    { direction: "harm", query: `${target} side effects worsening` },
    { direction: "discontinuation", query: `${target} stopped treatment` },
    {
      direction: "formal_discriminator",
      query: `${target} evidence comparison trial`
    }
  ] as const;
  if (searches.some(({ query }) =>
    query.length > NATIVE_YOUTUBE_QUERY_MAX_CHARACTERS
  )) {
    throw new Error("Native YouTube fallback query exceeded its fixed bound");
  }
  return searches.map(({ direction, query }) => ({ direction, query }));
}

function boundedNativeQuerySubject(researchQuestion: string): string {
  const normalized = researchQuestion.trim().replace(/\s+/gu, " ");
  if (normalized.length <= NATIVE_YOUTUBE_SUBJECT_MAX_CHARACTERS) {
    return normalized;
  }
  const prefix = normalized.slice(0, NATIVE_YOUTUBE_SUBJECT_MAX_CHARACTERS + 1);
  const wordBoundary = prefix.lastIndexOf(" ");
  return prefix.slice(
    0,
    wordBoundary >= Math.floor(NATIVE_YOUTUBE_SUBJECT_MAX_CHARACTERS / 2)
      ? wordBoundary
      : NATIVE_YOUTUBE_SUBJECT_MAX_CHARACTERS
  ).trimEnd();
}

function frontierReadyForScreening(
  frontier: { status: z.output<typeof frontierStatusSchema>; unresolved_candidate_video_ids: string[] }
): boolean {
  return frontier.status === "BLOCKED_TERMINAL" ||
    frontier.status === "COMPLETE" &&
      frontier.unresolved_candidate_video_ids.length === 0;
}

function nativeFrontierDigest(survey: YoutubeCommunitySurveyOutput): string {
  return createHash("sha256").update(JSON.stringify({
    research_question: survey.research_question,
    searches: survey.searches.map((search) => ({
      directions: search.directions,
      query: search.query,
      cursor: search.cursor ?? null,
      access_status: search.access_status,
      candidate_video_ids: search.candidate_video_ids
    }))
  }), "utf8").digest("hex");
}

function queryId(source: "gemini" | "native", index: number): string {
  return `${source}_query_${String(index + 1).padStart(2, "0")}`;
}

function describedOrUnspecified(value: string): string {
  return value.trim().length === 0 ? PROGRAM_NOT_DESCRIBED : value;
}

function isCompleteAccess(value: string): boolean {
  return value === "complete" || value === "api_visible_complete";
}

function isRetryableAccess(value: string): boolean {
  return value === "rate_limited" || value === "error" || value === "partial";
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
