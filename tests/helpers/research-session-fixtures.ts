import type { YoutubeCommunitySurveyOutput } from "../../apps/research-mcp/src/youtube-community-survey.js";
import {
  deriveGeminiYoutubeCandidateFrontier,
  type GeminiYoutubeCandidatePacket,
  type GeminiYoutubeCandidateValidationReceipt
} from "../../packages/sources/src/index.js";

export const RESEARCH_FIXTURE_VIDEO_IDS = [
  "XpZHKGGCK-o",
  "0sZEvvPWq88",
  "qfPjRBqADKk"
] as const;
export const NATIVE_ONLY_VIDEO_ID = "hgYdkSITKgk";

export function researchPacket(): GeminiYoutubeCandidatePacket {
  return {
    packet_name: "gemini_youtube_candidate_handoff",
    packet_version: "2.0",
    research_target: "de-identified treatment comparison",
    diagnosis_status: "diagnosis_not_specified",
    discovery_queries: [
      { purpose: "firsthand_outcome", query: "condition what worked program" },
      { purpose: "radical_outcome", query: "condition reversed avoided procedure" },
      { purpose: "overlooked_intervention", query: "condition named program one" },
      { purpose: "overlooked_intervention", query: "condition named program two" },
      { purpose: "conventional_benefit", query: "condition standard benefit" },
      { purpose: "conventional_negative", query: "condition standard failed" },
      { purpose: "firsthand_outcome", query: "condition long term outcome" },
      { purpose: "conventional_negative", query: "condition harm discontinued" }
    ],
    candidates: RESEARCH_FIXTURE_VIDEO_IDS.map((videoId, index) => ({
      video_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Candidate ${index + 1}`,
      channel: `Channel ${index + 1}`,
      target_distance: "exact",
      provisional_intervention_family: "local_mechanical",
      creator_claim_summary: "The creator describes a claimed outcome.",
      provisional_specific_program: `Program ${index + 1}`,
      provisional_population_or_stage: "Population described provisionally.",
      provisional_outcome_and_horizon: "Outcome and horizon described provisionally.",
      summary_basis: "spark_public_video_context_not_transcript_verified_by_askrigor",
      why_surfaced: "Adds a nonredundant program hypothesis."
    })),
    suggested_seed_video_ids: [RESEARCH_FIXTURE_VIDEO_IDS[0]],
    search_gaps: [],
    disclosures: [
      "comments_not_retrieved",
      "provider_metadata_not_validated_by_gemini",
      "creator_claims_not_validated",
      "not_medical_advice"
    ]
  };
}

export function researchReceipt(): GeminiYoutubeCandidateValidationReceipt {
  return {
    packet_name: "askrigor_gemini_youtube_candidate_validation",
    packet_version: "2.0",
    source_contract: "youtube-candidate-handoff-v2",
    source_packet_version: "2.0",
    status: "accepted",
    research_target: "de-identified treatment comparison",
    candidate_frontier: deriveGeminiYoutubeCandidateFrontier(
      RESEARCH_FIXTURE_VIDEO_IDS,
      RESEARCH_FIXTURE_VIDEO_IDS,
      [],
      []
    ),
    validated_candidates: RESEARCH_FIXTURE_VIDEO_IDS.map((videoId, index) => ({
      video_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      metadata_access_status: "api_visible_complete",
      provider_metadata: {
        retrieved_at: "2026-08-23T00:00:00.000Z",
        title: `Candidate ${index + 1}`,
        channel_id: `UC${"0".repeat(21)}${index}`,
        channel_title: `Channel ${index + 1}`,
        privacy_status: "public",
        statistics: { comment_count: "10" }
      },
      gemini_provisional_annotations: {
        target_distance: "exact",
        intervention_family: "local_mechanical",
        creator_claim_summary: "The creator describes a claimed outcome.",
        specific_program: `Program ${index + 1}`,
        population_or_stage: "Population described provisionally.",
        outcome_and_horizon: "Outcome and horizon described provisionally.",
        summary_basis: "spark_public_video_context_not_transcript_verified_by_askrigor",
        why_surfaced: "Adds a nonredundant program hypothesis."
      },
      limitations: []
    })),
    rejected_candidates: [],
    unresolved_candidates: [],
    suggested_seed_receipts: [{
      video_id: RESEARCH_FIXTURE_VIDEO_IDS[0],
      disposition: "eligible",
      reasons: []
    }],
    eligible_seed_video_ids: [RESEARCH_FIXTURE_VIDEO_IDS[0]],
    access_boundaries: [
      "Gemini scout summaries remain provisional and were not transcript-verified by AskRigor; they may guide candidate discovery only.",
      "Provider comment_count is metadata, not proof of corpus accessibility, completeness, materiality, efficacy, safety, or causality.",
      "Comment-audit eligibility is mechanical; AskRigor must still perform protocol-governed semantic selection and any required audit.",
      "No YouTube comments or transcripts were retrieved by this validation."
    ]
  };
}

export function nativeSurvey(
  metadataStatus: "api_visible_complete" | "rate_limited" = "api_visible_complete"
): YoutubeCommunitySurveyOutput {
  const query = "condition what worked program";
  const videoIds = [RESEARCH_FIXTURE_VIDEO_IDS[0], NATIVE_ONLY_VIDEO_ID];
  return {
    provider: "youtube",
    record_type: "youtube_community_survey",
    retrieved_at: "2026-08-23T00:01:00.000Z",
    research_question: "de-identified treatment comparison",
    access_status: metadataStatus === "api_visible_complete" ? "complete" : "partial",
    limitations: ["Bounded fixture survey."],
    searches: [{
      directions: ["general"],
      query,
      access_status: "complete",
      pagination: { returned: 2, exhausted: true },
      limitations: [],
      candidate_video_ids: videoIds
    }],
    candidates: videoIds.map((videoId, index) => ({
      video_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      directions: ["general"],
      search_queries: [{ direction: "general", query }],
      metadata_access_status: index === 0 ? "api_visible_complete" : metadataStatus,
      ...(index === 0 || metadataStatus === "api_visible_complete"
        ? {
          title: index === 0 ? "Candidate 1" : "Native candidate",
          channel_id: index === 0 ? `UC${"0".repeat(21)}0` : `UC${"1".repeat(22)}`,
          channel_title: index === 0 ? "Channel 1" : "Native Channel",
          published_at: "2026-08-20T00:00:00Z",
          provider_reported_comments: "10"
        }
        : {
          metadata_error: {
            code: "youtube_rate_limited",
            message: "Retry later",
            retryable: true
          }
        }),
      limitations: []
    }))
  };
}
