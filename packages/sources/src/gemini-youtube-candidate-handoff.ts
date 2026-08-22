import { createHash } from "node:crypto";

import {
  ACCESS_STATUSES,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import {
  getYoutubeVideo,
  youtubeCountSchema,
  youtubePrivacyStatusSchema,
  youtubeTimestampSchema,
  youtubeVideoDataSchema,
  youtubeVideoIdSchema,
  type YoutubeConfig,
  type YoutubeVideo
} from "./youtube.js";

export const GEMINI_YOUTUBE_CANDIDATE_CONTRACT = "youtube-candidate-handoff-v2";
export const GEMINI_YOUTUBE_CANDIDATE_LEGACY_CONTRACT = "youtube-candidate-handoff-v1";
export const GEMINI_YOUTUBE_CANDIDATE_MODE = "candidate_discovery";
export const GEMINI_YOUTUBE_CANDIDATE_PACKET_NAME = "gemini_youtube_candidate_handoff";
export const GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION = "2.0";
export const GEMINI_YOUTUBE_CANDIDATE_LEGACY_PACKET_VERSION = "1.0";
export const MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES = 32 * 1_024;

const LEGACY_RESPONSE_PREFIX = [
  `Scout contract: ${GEMINI_YOUTUBE_CANDIDATE_LEGACY_CONTRACT}`,
  "",
  `Mode: ${GEMINI_YOUTUBE_CANDIDATE_MODE}`,
  "",
  "## AskRigor candidate handoff",
  "",
  ""
].join("\n");
const JSON_BLOCK_PATTERN = /^```json\n([\s\S]+)\n```\s*$/u;
const textEncoder = new TextEncoder();
const accessStatusSchema = z.enum(ACCESS_STATUSES);
const boundedText = (maximum: number) => z.string().min(1).max(maximum).refine(
  (value) => value.trim().length > 0,
  "must contain non-whitespace text"
);
const canonicalYoutubeUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`;

export const geminiYoutubeDiscoveryPurposeSchema = z.enum([
  "firsthand_outcome",
  "radical_outcome",
  "overlooked_intervention",
  "conventional_benefit",
  "conventional_negative"
]);

export const geminiYoutubeInterventionFamilySchema = z.enum([
  "nutrition_or_elimination",
  "oral_supplement",
  "local_mechanical",
  "behavioral_environmental",
  "topical_or_traditional",
  "device_or_energy",
  "regenerative_or_biologic",
  "conventional_injection",
  "conventional_surgery",
  "other"
]);

const discoveryQuerySchema = z.object({
  purpose: geminiYoutubeDiscoveryPurposeSchema,
  query: boundedText(500)
}).strict();

const geminiCandidateV1Schema = z.object({
  video_id: youtubeVideoIdSchema,
  canonical_url: z.string().url().max(2_048),
  title: boundedText(500),
  channel: boundedText(500),
  target_distance: z.enum(["exact", "adjacent", "remote"]),
  provisional_intervention_family: geminiYoutubeInterventionFamilySchema,
  creator_claim_summary: boundedText(600),
  why_surfaced: boundedText(300)
}).strict().superRefine((candidate, context) => {
  if (candidate.canonical_url !== canonicalYoutubeUrl(candidate.video_id)) {
    context.addIssue({
      code: "custom",
      path: ["canonical_url"],
      message: "must be the exact canonical watch URL derived from video_id"
    });
  }
});

export const geminiYoutubeSummaryBasisSchema = z.enum([
  "spark_public_video_context_not_transcript_verified_by_askrigor"
]);

const geminiCandidateV2Schema = geminiCandidateV1Schema.safeExtend({
  provisional_specific_program: boundedText(900),
  provisional_population_or_stage: boundedText(500),
  provisional_outcome_and_horizon: boundedText(500),
  summary_basis: geminiYoutubeSummaryBasisSchema
}).strict();

const REQUIRED_DISCLOSURES = [
  "comments_not_retrieved",
  "provider_metadata_not_validated_by_gemini",
  "creator_claims_not_validated",
  "not_medical_advice"
] as const;

const packetCommonShape = {
  packet_name: z.literal(GEMINI_YOUTUBE_CANDIDATE_PACKET_NAME),
  research_target: boundedText(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  search_gaps: z.array(boundedText(500)).max(8),
  disclosures: z.tuple([
    z.literal(REQUIRED_DISCLOSURES[0]),
    z.literal(REQUIRED_DISCLOSURES[1]),
    z.literal(REQUIRED_DISCLOSURES[2]),
    z.literal(REQUIRED_DISCLOSURES[3])
  ])
} as const;

const geminiYoutubeCandidateV1PacketSchema = z.object({
  ...packetCommonShape,
  packet_version: z.literal(GEMINI_YOUTUBE_CANDIDATE_LEGACY_PACKET_VERSION),
  discovery_queries: z.array(discoveryQuerySchema).min(6).max(12),
  candidates: z.array(geminiCandidateV1Schema).min(3).max(12),
  suggested_seed_video_ids: z.array(youtubeVideoIdSchema).min(1).max(4)
}).strict().superRefine(addPacketRelationshipIssues);

const geminiYoutubeCandidateV2PacketSchema = z.object({
  ...packetCommonShape,
  packet_version: z.literal(GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION),
  discovery_queries: z.array(discoveryQuerySchema).min(8).max(18),
  candidates: z.array(geminiCandidateV2Schema).min(3).max(16),
  suggested_seed_video_ids: z.array(youtubeVideoIdSchema).min(1).max(8)
}).strict().superRefine(addPacketRelationshipIssues);

export const geminiYoutubeCandidatePacketSchema = z.union([
  geminiYoutubeCandidateV2PacketSchema,
  geminiYoutubeCandidateV1PacketSchema
]);

function addPacketRelationshipIssues(
  packet: z.output<typeof geminiYoutubeCandidateV1PacketSchema> |
    z.output<typeof geminiYoutubeCandidateV2PacketSchema>,
  context: z.RefinementCtx
): void {
  addDuplicateIssues(
    packet.discovery_queries.map(({ query }) => comparableQuery(query)),
    "discovery_queries",
    context
  );
  addDuplicateIssues(
    packet.candidates.map(({ video_id }) => video_id),
    "candidates",
    context
  );
  addDuplicateIssues(packet.suggested_seed_video_ids, "suggested_seed_video_ids", context);

  const purposes = new Set(packet.discovery_queries.map(({ purpose }) => purpose));
  for (const purpose of geminiYoutubeDiscoveryPurposeSchema.options) {
    if (!purposes.has(purpose)) {
      context.addIssue({
        code: "custom",
        path: ["discovery_queries"],
        message: `must include at least one ${purpose} query`
      });
    }
  }

  const candidateIds = new Set(packet.candidates.map(({ video_id }) => video_id));
  packet.suggested_seed_video_ids.forEach((videoId, index) => {
    if (!candidateIds.has(videoId)) {
      context.addIssue({
        code: "custom",
        path: ["suggested_seed_video_ids", index],
        message: "must identify a candidate in this packet"
      });
    }
  });
}

const identityRejectionReasonSchema = z.enum([
  "metadata_not_api_visible_complete",
  "provider_video_id_mismatch",
  "provider_canonical_url_mismatch",
  "declared_title_mismatch",
  "declared_channel_mismatch"
]);

const seedIneligibilityReasonSchema = z.enum([
  "candidate_rejected",
  "candidate_validation_incomplete",
  "privacy_not_reported",
  "privacy_not_public",
  "comment_count_not_reported",
  "comment_count_zero",
  "duplicate_suggested_channel"
]);

const provisionalAnnotationsSchema = z.object({
  target_distance: geminiCandidateV1Schema.shape.target_distance,
  intervention_family: geminiYoutubeInterventionFamilySchema,
  creator_claim_summary: geminiCandidateV1Schema.shape.creator_claim_summary,
  specific_program: boundedText(900),
  population_or_stage: boundedText(500),
  outcome_and_horizon: boundedText(500),
  summary_basis: z.enum([
    "spark_public_video_context_not_transcript_verified_by_askrigor",
    "legacy_spark_annotation_not_transcript_verified_by_askrigor"
  ]),
  why_surfaced: geminiCandidateV1Schema.shape.why_surfaced
}).strict();

const providerMetadataSchema = z.object({
  retrieved_at: youtubeTimestampSchema,
  title: youtubeVideoDataSchema.shape.title.unwrap(),
  channel_id: youtubeVideoDataSchema.shape.channel_id.unwrap(),
  channel_title: youtubeVideoDataSchema.shape.channel_title.unwrap(),
  privacy_status: youtubePrivacyStatusSchema.optional(),
  statistics: z.object({
    view_count: youtubeCountSchema.optional(),
    like_count: youtubeCountSchema.optional(),
    comment_count: youtubeCountSchema.optional()
  }).strict().optional()
}).strict();

const validatedCandidateSchema = z.object({
  video_id: youtubeVideoIdSchema,
  canonical_url: z.string().url(),
  metadata_access_status: z.literal("api_visible_complete"),
  provider_metadata: providerMetadataSchema,
  gemini_provisional_annotations: provisionalAnnotationsSchema,
  limitations: z.array(z.string())
}).strict();

const rejectedCandidateSchema = z.object({
  video_id: youtubeVideoIdSchema,
  metadata_access_status: accessStatusSchema,
  retryable: z.literal(false),
  rejection_reasons: z.array(identityRejectionReasonSchema).min(1),
  provider_title: z.string().optional(),
  provider_channel: z.string().optional(),
  provider_error_code: z.string().optional(),
  limitations: z.array(z.string())
}).strict();

const unresolvedCandidateSchema = z.object({
  video_id: youtubeVideoIdSchema,
  metadata_access_status: accessStatusSchema,
  retryable: z.boolean(),
  provider_error_code: z.string().optional(),
  limitations: z.array(z.string())
}).strict();

const suggestedSeedReceiptSchema = z.object({
  video_id: youtubeVideoIdSchema,
  disposition: z.enum(["eligible", "ineligible", "rejected", "unresolved"]),
  reasons: z.array(seedIneligibilityReasonSchema)
}).strict();

export const geminiYoutubeCandidateFrontierSchema = z.object({
  frontier_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  source_candidate_video_ids: z.array(youtubeVideoIdSchema).min(3).max(16),
  validated_candidate_video_ids: z.array(youtubeVideoIdSchema).max(16),
  terminally_rejected_video_ids: z.array(youtubeVideoIdSchema).max(16),
  unresolved_candidate_video_ids: z.array(youtubeVideoIdSchema).max(16)
}).strict();

export const geminiYoutubeCandidateValidationReceiptSchema = z.object({
  packet_name: z.literal("askrigor_gemini_youtube_candidate_validation"),
  packet_version: z.literal("2.0"),
  source_contract: z.enum([
    GEMINI_YOUTUBE_CANDIDATE_CONTRACT,
    GEMINI_YOUTUBE_CANDIDATE_LEGACY_CONTRACT
  ]),
  source_packet_version: z.enum([
    GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION,
    GEMINI_YOUTUBE_CANDIDATE_LEGACY_PACKET_VERSION
  ]),
  status: z.enum(["accepted", "partial", "rejected", "blocked"]),
  research_target: boundedText(1_000),
  candidate_frontier: geminiYoutubeCandidateFrontierSchema,
  validated_candidates: z.array(validatedCandidateSchema).max(16),
  rejected_candidates: z.array(rejectedCandidateSchema).max(16),
  unresolved_candidates: z.array(unresolvedCandidateSchema).max(16),
  suggested_seed_receipts: z.array(suggestedSeedReceiptSchema).min(1).max(8),
  eligible_seed_video_ids: z.array(youtubeVideoIdSchema).max(8),
  access_boundaries: z.tuple([
    z.literal(
      "Spark video summaries remain provisional and were not transcript-verified by AskRigor; they may guide candidate discovery only."
    ),
    z.literal(
      "Provider comment_count is metadata, not proof of corpus accessibility, completeness, materiality, efficacy, safety, or causality."
    ),
    z.literal(
      "Comment-audit eligibility is mechanical; AskRigor must still perform protocol-governed semantic selection and any required audit."
    ),
    z.literal("No YouTube comments or transcripts were retrieved by this validation.")
  ])
}).strict();

export type GeminiYoutubeCandidatePacket = z.output<typeof geminiYoutubeCandidatePacketSchema>;
export type GeminiYoutubeCandidateValidationReceipt = z.output<
  typeof geminiYoutubeCandidateValidationReceiptSchema
>;

export type GeminiYoutubeCandidateHandoffErrorCode =
  | "invalid_framing"
  | "invalid_json"
  | "invalid_packet";

export interface GeminiYoutubeCandidateHandoffIssue {
  path: string;
  message: string;
}

export class GeminiYoutubeCandidateHandoffError extends Error {
  constructor(
    readonly code: GeminiYoutubeCandidateHandoffErrorCode,
    readonly issues: GeminiYoutubeCandidateHandoffIssue[] = []
  ) {
    super(code);
    this.name = "GeminiYoutubeCandidateHandoffError";
  }
}

export interface GeminiYoutubeCandidateValidationDependencies {
  get_video?: typeof getYoutubeVideo;
}

interface ValidatedCandidateResult {
  kind: "validated";
  candidate: z.output<typeof validatedCandidateSchema>;
}

interface RejectedCandidateResult {
  kind: "rejected";
  candidate: z.output<typeof rejectedCandidateSchema>;
}

interface UnresolvedCandidateResult {
  kind: "unresolved";
  candidate: z.output<typeof unresolvedCandidateSchema>;
}

type CandidateValidationResult =
  | ValidatedCandidateResult
  | RejectedCandidateResult
  | UnresolvedCandidateResult;

export function parseGeminiYoutubeCandidateHandoff(
  response: string
): GeminiYoutubeCandidatePacket {
  if (
    typeof response !== "string" ||
    textEncoder.encode(response).byteLength > MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES
  ) {
    throw new GeminiYoutubeCandidateHandoffError("invalid_framing", [{
      path: "response",
      message: `must be a string at or below ${MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES} UTF-8 bytes`
    }]);
  }
  const normalized = response.replace(/\r\n/gu, "\n");
  const trimmed = normalized.trim();
  let jsonText: string;
  if (trimmed.startsWith("{")) {
    jsonText = trimmed;
  } else if (normalized.startsWith(LEGACY_RESPONSE_PREFIX)) {
    const block = JSON_BLOCK_PATTERN.exec(
      normalized.slice(LEGACY_RESPONSE_PREFIX.length)
    );
    if (block === null) {
      throw new GeminiYoutubeCandidateHandoffError("invalid_framing", [{
        path: "response",
        message: "legacy framing must contain exactly one fenced json block and no trailing prose"
      }]);
    }
    jsonText = block[1]!;
  } else {
    throw new GeminiYoutubeCandidateHandoffError("invalid_framing", [{
      path: "response",
      message: "must be one raw JSON object or use the exact legacy contract framing"
    }]);
  }

  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new GeminiYoutubeCandidateHandoffError("invalid_json", [{
      path: "packet",
      message: "must contain valid JSON"
    }]);
  }
  const packetVersion = isRecord(value) ? value.packet_version : undefined;
  if (packetVersion === GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION) {
    return parseVersionedPacket(geminiYoutubeCandidateV2PacketSchema, value);
  }
  if (packetVersion === GEMINI_YOUTUBE_CANDIDATE_LEGACY_PACKET_VERSION) {
    return parseVersionedPacket(geminiYoutubeCandidateV1PacketSchema, value);
  }
  throw new GeminiYoutubeCandidateHandoffError("invalid_packet", [{
    path: "packet_version",
    message: `must be ${GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION} or ${GEMINI_YOUTUBE_CANDIDATE_LEGACY_PACKET_VERSION}`
  }]);
}

function parseVersionedPacket<T extends GeminiYoutubeCandidatePacket>(
  schema: z.ZodType<T>,
  value: unknown
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new GeminiYoutubeCandidateHandoffError(
    "invalid_packet",
    parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateGeminiYoutubeCandidateHandoff(
  response: string,
  config: YoutubeConfig,
  dependencies: GeminiYoutubeCandidateValidationDependencies = {}
): Promise<GeminiYoutubeCandidateValidationReceipt> {
  const packet = parseGeminiYoutubeCandidateHandoff(response);
  const getVideo = dependencies.get_video ?? getYoutubeVideo;
  const results = await Promise.all(packet.candidates.map(async (candidate) => {
    try {
      const metadata = await getVideo(candidate.video_id, config);
      return validateCandidateIdentity(candidate, metadata);
    } catch {
      return rejectedRuntimeCandidate(candidate.video_id);
    }
  }));
  const validatedCandidates = results
    .filter((result): result is ValidatedCandidateResult => result.kind === "validated")
    .map(({ candidate }) => candidate);
  const rejectedCandidates = results
    .filter((result): result is RejectedCandidateResult => result.kind === "rejected")
    .map(({ candidate }) => candidate);
  const unresolvedCandidates = results
    .filter((result): result is UnresolvedCandidateResult => result.kind === "unresolved")
    .map(({ candidate }) => candidate);
  const validatedById = new Map(validatedCandidates.map((candidate) => [candidate.video_id, candidate]));
  const rejectedIds = new Set(rejectedCandidates.map(({ video_id }) => video_id));
  const unresolvedIds = new Set(unresolvedCandidates.map(({ video_id }) => video_id));
  const seenEligibleChannels = new Set<string>();
  const suggestedSeedReceipts = packet.suggested_seed_video_ids.map((videoId) => {
    if (unresolvedIds.has(videoId)) {
      return {
        video_id: videoId,
        disposition: "unresolved" as const,
        reasons: ["candidate_validation_incomplete" as const]
      };
    }
    if (rejectedIds.has(videoId)) {
      return {
        video_id: videoId,
        disposition: "rejected" as const,
        reasons: ["candidate_rejected" as const]
      };
    }
    const candidate = validatedById.get(videoId)!;
    const reasons: Array<z.output<typeof seedIneligibilityReasonSchema>> = [];
    if (candidate.provider_metadata.privacy_status === undefined) {
      reasons.push("privacy_not_reported");
    } else if (candidate.provider_metadata.privacy_status !== "public") {
      reasons.push("privacy_not_public");
    }
    const commentCount = candidate.provider_metadata.statistics?.comment_count;
    if (commentCount === undefined) reasons.push("comment_count_not_reported");
    else if (/^0+$/u.test(commentCount)) reasons.push("comment_count_zero");
    const channelId = candidate.provider_metadata.channel_id;
    if (seenEligibleChannels.has(channelId)) reasons.push("duplicate_suggested_channel");

    if (reasons.length === 0) seenEligibleChannels.add(channelId);
    return {
      video_id: videoId,
      disposition: reasons.length === 0 ? "eligible" as const : "ineligible" as const,
      reasons
    };
  });
  const eligibleSeedVideoIds = suggestedSeedReceipts
    .filter(({ disposition }) => disposition === "eligible")
    .map(({ video_id }) => video_id);
  const allCandidatesValidated = rejectedCandidates.length === 0 &&
    unresolvedCandidates.length === 0;
  const allSuggestedSeedsEligible = suggestedSeedReceipts.every(
    ({ disposition }) => disposition === "eligible"
  );
  const status = validatedCandidates.length === 0
    ? unresolvedCandidates.length > 0
      ? "blocked" as const
      : "rejected" as const
    : allCandidatesValidated && allSuggestedSeedsEligible
      ? "accepted" as const
      : "partial" as const;
  const candidateFrontier = deriveGeminiYoutubeCandidateFrontier(
    packet.candidates.map(({ video_id }) => video_id),
    validatedCandidates.map(({ video_id }) => video_id),
    rejectedCandidates.map(({ video_id }) => video_id),
    unresolvedCandidates.map(({ video_id }) => video_id)
  );

  return geminiYoutubeCandidateValidationReceiptSchema.parse({
    packet_name: "askrigor_gemini_youtube_candidate_validation",
    packet_version: "2.0",
    source_contract: packet.packet_version === GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION
      ? GEMINI_YOUTUBE_CANDIDATE_CONTRACT
      : GEMINI_YOUTUBE_CANDIDATE_LEGACY_CONTRACT,
    source_packet_version: packet.packet_version,
    status,
    research_target: packet.research_target,
    candidate_frontier: candidateFrontier,
    validated_candidates: validatedCandidates,
    rejected_candidates: rejectedCandidates,
    unresolved_candidates: unresolvedCandidates,
    suggested_seed_receipts: suggestedSeedReceipts,
    eligible_seed_video_ids: eligibleSeedVideoIds,
    access_boundaries: [
      "Spark video summaries remain provisional and were not transcript-verified by AskRigor; they may guide candidate discovery only.",
      "Provider comment_count is metadata, not proof of corpus accessibility, completeness, materiality, efficacy, safety, or causality.",
      "Comment-audit eligibility is mechanical; AskRigor must still perform protocol-governed semantic selection and any required audit.",
      "No YouTube comments or transcripts were retrieved by this validation."
    ]
  });
}

function addDuplicateIssues(
  values: readonly string[],
  path: "discovery_queries" | "candidates" | "suggested_seed_video_ids",
  context: z.RefinementCtx
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: [path, index],
        message: "must be unique within the packet"
      });
    }
    seen.add(value);
  });
}

function validateCandidateIdentity(
  candidate: GeminiYoutubeCandidatePacket["candidates"][number],
  metadata: ProvenanceEnvelope<YoutubeVideo>
): CandidateValidationResult {
  if (metadata.access_status !== "api_visible_complete") {
    const providerErrorCode = metadata.error?.code;
    if (
      providerErrorCode === "youtube_video_not_found" ||
      providerErrorCode === "youtube_video_not_visible"
    ) {
      return {
        kind: "rejected",
        candidate: {
          video_id: candidate.video_id,
          metadata_access_status: metadata.access_status,
          retryable: false,
          rejection_reasons: ["metadata_not_api_visible_complete"],
          provider_error_code: providerErrorCode,
          limitations: metadata.limitations
        }
      };
    }
    return {
      kind: "unresolved",
      candidate: {
        video_id: candidate.video_id,
        metadata_access_status: metadata.access_status,
        retryable: metadata.error?.retryable === true,
        ...(providerErrorCode === undefined ? {} : { provider_error_code: providerErrorCode }),
        limitations: metadata.limitations
      }
    };
  }
  const reasons: Array<z.output<typeof identityRejectionReasonSchema>> = [];
  const providerVideo = metadata.data;
  if (providerVideo.video_id !== candidate.video_id) reasons.push("provider_video_id_mismatch");
  if (metadata.source_identity.canonical_url !== candidate.canonical_url) {
    reasons.push("provider_canonical_url_mismatch");
  }
  if (
    providerVideo.title !== undefined &&
    comparableLabel(providerVideo.title) !== comparableLabel(candidate.title)
  ) {
    reasons.push("declared_title_mismatch");
  }
  if (
    providerVideo.channel_title !== undefined &&
    comparableLabel(providerVideo.channel_title) !== comparableLabel(candidate.channel)
  ) {
    reasons.push("declared_channel_mismatch");
  }

  if (reasons.length > 0) {
    return {
      kind: "rejected",
      candidate: {
        video_id: candidate.video_id,
        metadata_access_status: metadata.access_status,
        retryable: false,
        rejection_reasons: reasons,
        ...(providerVideo.title === undefined ? {} : { provider_title: providerVideo.title }),
        ...(providerVideo.channel_title === undefined ? {} : { provider_channel: providerVideo.channel_title }),
        ...(metadata.error?.code === undefined ? {} : { provider_error_code: metadata.error.code }),
        limitations: metadata.limitations
      }
    };
  }

  if (
    providerVideo.title === undefined || providerVideo.channel_id === undefined ||
    providerVideo.channel_title === undefined
  ) {
    return {
      kind: "unresolved",
      candidate: {
        video_id: candidate.video_id,
        metadata_access_status: metadata.access_status,
        retryable: false,
        provider_error_code: "youtube_candidate_identity_fields_missing",
        limitations: [
          ...metadata.limitations,
          "Provider metadata omitted one or more fields required to validate the candidate title and channel."
        ]
      }
    };
  }

  return {
    kind: "validated",
    candidate: {
      video_id: candidate.video_id,
      canonical_url: candidate.canonical_url,
      metadata_access_status: "api_visible_complete",
      provider_metadata: {
        retrieved_at: metadata.retrieved_at,
        title: providerVideo.title,
        channel_id: providerVideo.channel_id,
        channel_title: providerVideo.channel_title,
        ...(providerVideo.privacy_status === undefined
          ? {}
          : { privacy_status: youtubePrivacyStatusSchema.parse(providerVideo.privacy_status) }),
        ...(providerVideo.statistics === undefined
          ? {}
          : { statistics: providerVideo.statistics })
      },
      gemini_provisional_annotations: {
        target_distance: candidate.target_distance,
        intervention_family: candidate.provisional_intervention_family,
        creator_claim_summary: candidate.creator_claim_summary,
        specific_program: "provisional_specific_program" in candidate
          ? candidate.provisional_specific_program
          : "not described",
        population_or_stage: "provisional_population_or_stage" in candidate
          ? candidate.provisional_population_or_stage
          : "not described",
        outcome_and_horizon: "provisional_outcome_and_horizon" in candidate
          ? candidate.provisional_outcome_and_horizon
          : "not described",
        summary_basis: "summary_basis" in candidate
          ? candidate.summary_basis
          : "legacy_spark_annotation_not_transcript_verified_by_askrigor",
        why_surfaced: candidate.why_surfaced
      },
      limitations: metadata.limitations
    }
  };
}

function rejectedRuntimeCandidate(videoId: string): UnresolvedCandidateResult {
  return {
    kind: "unresolved",
    candidate: {
      video_id: videoId,
      metadata_access_status: "error",
      retryable: true,
      provider_error_code: "youtube_candidate_validation_runtime_error",
      limitations: ["YouTube metadata validation failed before a provider receipt was returned."]
    }
  };
}

export function deriveGeminiYoutubeCandidateFrontier(
  sourceCandidateVideoIds: readonly string[],
  validatedCandidateVideoIds: readonly string[],
  terminallyRejectedVideoIds: readonly string[],
  unresolvedCandidateVideoIds: readonly string[]
): z.output<typeof geminiYoutubeCandidateFrontierSchema> {
  const payload = {
    source_candidate_video_ids: [...sourceCandidateVideoIds],
    validated_candidate_video_ids: [...validatedCandidateVideoIds],
    terminally_rejected_video_ids: [...terminallyRejectedVideoIds],
    unresolved_candidate_video_ids: [...unresolvedCandidateVideoIds]
  };
  return geminiYoutubeCandidateFrontierSchema.parse({
    frontier_digest: createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex"),
    ...payload
  });
}

function comparableLabel(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function comparableQuery(value: string): string {
  return comparableLabel(value).toLowerCase();
}
