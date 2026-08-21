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

export const GEMINI_YOUTUBE_CANDIDATE_CONTRACT = "youtube-candidate-handoff-v1";
export const GEMINI_YOUTUBE_CANDIDATE_MODE = "candidate_discovery";
export const GEMINI_YOUTUBE_CANDIDATE_PACKET_NAME = "gemini_youtube_candidate_handoff";
export const GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION = "1.0";
export const MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES = 32 * 1_024;

const RESPONSE_PREFIX = [
  `Scout contract: ${GEMINI_YOUTUBE_CANDIDATE_CONTRACT}`,
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

const geminiCandidateSchema = z.object({
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

const REQUIRED_DISCLOSURES = [
  "comments_not_retrieved",
  "provider_metadata_not_validated_by_gemini",
  "creator_claims_not_validated",
  "not_medical_advice"
] as const;

export const geminiYoutubeCandidatePacketSchema = z.object({
  packet_name: z.literal(GEMINI_YOUTUBE_CANDIDATE_PACKET_NAME),
  packet_version: z.literal(GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION),
  research_target: boundedText(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  discovery_queries: z.array(discoveryQuerySchema).min(6).max(12),
  candidates: z.array(geminiCandidateSchema).min(3).max(12),
  suggested_seed_video_ids: z.array(youtubeVideoIdSchema).min(1).max(4),
  search_gaps: z.array(boundedText(500)).max(8),
  disclosures: z.tuple([
    z.literal(REQUIRED_DISCLOSURES[0]),
    z.literal(REQUIRED_DISCLOSURES[1]),
    z.literal(REQUIRED_DISCLOSURES[2]),
    z.literal(REQUIRED_DISCLOSURES[3])
  ])
}).strict().superRefine((packet, context) => {
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
});

const identityRejectionReasonSchema = z.enum([
  "metadata_not_api_visible_complete",
  "provider_video_id_mismatch",
  "provider_canonical_url_mismatch",
  "provider_title_missing",
  "provider_channel_missing",
  "declared_title_mismatch",
  "declared_channel_mismatch"
]);

const seedIneligibilityReasonSchema = z.enum([
  "candidate_rejected",
  "privacy_not_public",
  "comment_count_not_reported",
  "comment_count_zero",
  "duplicate_suggested_channel"
]);

const provisionalAnnotationsSchema = z.object({
  target_distance: geminiCandidateSchema.shape.target_distance,
  intervention_family: geminiYoutubeInterventionFamilySchema,
  creator_claim_summary: geminiCandidateSchema.shape.creator_claim_summary,
  why_surfaced: geminiCandidateSchema.shape.why_surfaced
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
  rejection_reasons: z.array(identityRejectionReasonSchema).min(1),
  provider_title: z.string().optional(),
  provider_channel: z.string().optional(),
  provider_error_code: z.string().optional(),
  limitations: z.array(z.string())
}).strict();

const suggestedSeedReceiptSchema = z.object({
  video_id: youtubeVideoIdSchema,
  disposition: z.enum(["eligible", "ineligible", "rejected"]),
  reasons: z.array(seedIneligibilityReasonSchema)
}).strict();

export const geminiYoutubeCandidateValidationReceiptSchema = z.object({
  packet_name: z.literal("askrigor_gemini_youtube_candidate_validation"),
  packet_version: z.literal("1.0"),
  source_contract: z.literal(GEMINI_YOUTUBE_CANDIDATE_CONTRACT),
  status: z.enum(["accepted", "partial", "rejected"]),
  research_target: boundedText(1_000),
  validated_candidates: z.array(validatedCandidateSchema).max(12),
  rejected_candidates: z.array(rejectedCandidateSchema).max(12),
  suggested_seed_receipts: z.array(suggestedSeedReceiptSchema).min(1).max(4),
  eligible_seed_video_ids: z.array(youtubeVideoIdSchema).max(4),
  access_boundaries: z.tuple([
    z.literal(
      "Gemini annotations remain provisional; this receipt validates packet structure and provider identity only."
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

type CandidateValidationResult = ValidatedCandidateResult | RejectedCandidateResult;

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
  if (!normalized.startsWith(RESPONSE_PREFIX)) {
    throw new GeminiYoutubeCandidateHandoffError("invalid_framing", [{
      path: "response",
      message: "must begin with the exact contract, mode, and handoff heading"
    }]);
  }
  const block = JSON_BLOCK_PATTERN.exec(normalized.slice(RESPONSE_PREFIX.length));
  if (block === null) {
    throw new GeminiYoutubeCandidateHandoffError("invalid_framing", [{
      path: "response",
      message: "must contain exactly one fenced json block and no trailing prose"
    }]);
  }

  let value: unknown;
  try {
    value = JSON.parse(block[1]!);
  } catch {
    throw new GeminiYoutubeCandidateHandoffError("invalid_json", [{
      path: "packet",
      message: "must contain valid JSON"
    }]);
  }
  const parsed = geminiYoutubeCandidatePacketSchema.safeParse(value);
  if (!parsed.success) {
    throw new GeminiYoutubeCandidateHandoffError(
      "invalid_packet",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    );
  }
  return parsed.data;
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
  const validatedById = new Map(validatedCandidates.map((candidate) => [candidate.video_id, candidate]));
  const rejectedIds = new Set(rejectedCandidates.map(({ video_id }) => video_id));
  const seenEligibleChannels = new Set<string>();
  const suggestedSeedReceipts = packet.suggested_seed_video_ids.map((videoId) => {
    if (rejectedIds.has(videoId)) {
      return {
        video_id: videoId,
        disposition: "rejected" as const,
        reasons: ["candidate_rejected" as const]
      };
    }
    const candidate = validatedById.get(videoId)!;
    const reasons: Array<z.output<typeof seedIneligibilityReasonSchema>> = [];
    if (
      candidate.provider_metadata.privacy_status !== undefined &&
      candidate.provider_metadata.privacy_status !== "public"
    ) {
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
  const allCandidatesValidated = rejectedCandidates.length === 0;
  const allSuggestedSeedsEligible = suggestedSeedReceipts.every(
    ({ disposition }) => disposition === "eligible"
  );
  const status = validatedCandidates.length === 0
    ? "rejected" as const
    : allCandidatesValidated && allSuggestedSeedsEligible
      ? "accepted" as const
      : "partial" as const;

  return geminiYoutubeCandidateValidationReceiptSchema.parse({
    packet_name: "askrigor_gemini_youtube_candidate_validation",
    packet_version: "1.0",
    source_contract: GEMINI_YOUTUBE_CANDIDATE_CONTRACT,
    status,
    research_target: packet.research_target,
    validated_candidates: validatedCandidates,
    rejected_candidates: rejectedCandidates,
    suggested_seed_receipts: suggestedSeedReceipts,
    eligible_seed_video_ids: eligibleSeedVideoIds,
    access_boundaries: [
      "Gemini annotations remain provisional; this receipt validates packet structure and provider identity only.",
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
    return {
      kind: "rejected",
      candidate: {
        video_id: candidate.video_id,
        metadata_access_status: metadata.access_status,
        rejection_reasons: ["metadata_not_api_visible_complete"],
        ...(metadata.error?.code === undefined ? {} : { provider_error_code: metadata.error.code }),
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
  if (providerVideo.title === undefined) reasons.push("provider_title_missing");
  else if (comparableLabel(providerVideo.title) !== comparableLabel(candidate.title)) {
    reasons.push("declared_title_mismatch");
  }
  if (providerVideo.channel_id === undefined || providerVideo.channel_title === undefined) {
    reasons.push("provider_channel_missing");
  } else if (comparableLabel(providerVideo.channel_title) !== comparableLabel(candidate.channel)) {
    reasons.push("declared_channel_mismatch");
  }

  if (reasons.length > 0) {
    return {
      kind: "rejected",
      candidate: {
        video_id: candidate.video_id,
        metadata_access_status: metadata.access_status,
        rejection_reasons: reasons,
        ...(providerVideo.title === undefined ? {} : { provider_title: providerVideo.title }),
        ...(providerVideo.channel_title === undefined ? {} : { provider_channel: providerVideo.channel_title }),
        ...(metadata.error?.code === undefined ? {} : { provider_error_code: metadata.error.code }),
        limitations: metadata.limitations
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
        title: providerVideo.title!,
        channel_id: providerVideo.channel_id!,
        channel_title: providerVideo.channel_title!,
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
        why_surfaced: candidate.why_surfaced
      },
      limitations: metadata.limitations
    }
  };
}

function rejectedRuntimeCandidate(videoId: string): RejectedCandidateResult {
  return {
    kind: "rejected",
    candidate: {
      video_id: videoId,
      metadata_access_status: "error",
      rejection_reasons: ["metadata_not_api_visible_complete"],
      provider_error_code: "youtube_candidate_validation_runtime_error",
      limitations: ["YouTube metadata validation failed before a provider receipt was returned."]
    }
  };
}

function comparableLabel(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function comparableQuery(value: string): string {
  return comparableLabel(value).toLowerCase();
}
