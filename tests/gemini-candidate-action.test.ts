import { describe, expect, it, vi } from "vitest";

import {
  GEMINI_CANDIDATE_ACTION_REQUEST_MAX_BYTES,
  createGeminiCandidateActionRoute,
  createActionOnlyResearchRoutes
} from "../apps/research-mcp/src/index.js";
import type {
  GeminiYoutubeCandidatePacket,
  GeminiYoutubeCandidateValidationReceipt,
  validateGeminiYoutubeCandidateHandoff
} from "../packages/sources/src/index.js";
import {
  MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES,
  deriveGeminiYoutubeCandidateFrontier
} from "../packages/sources/src/index.js";

const VIDEO_IDS = ["XpZHKGGCK-o", "0sZEvvPWq88", "qfPjRBqADKk"] as const;

describe("Gemini Spark candidate validation Action", () => {
  it("is a bounded public read-only Action-only route", () => {
    const route = createActionOnlyResearchRoutes().find(({ operationId }) =>
      operationId === "validate_gemini_youtube_candidate_handoff"
    );

    expect(route).toMatchObject({
      method: "POST",
      path: "/actions/research/validate_gemini_youtube_candidate_handoff",
      public: true,
      publicResearch: true,
      consequential: false
    });
    expect(route?.maximumRequestBytes).toBe(GEMINI_CANDIDATE_ACTION_REQUEST_MAX_BYTES);
    const maximumEscapedBody = JSON.stringify({
      packet: "\\".repeat(MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES)
    });
    expect(Buffer.byteLength(maximumEscapedBody, "utf8"))
      .toBeLessThanOrEqual(GEMINI_CANDIDATE_ACTION_REQUEST_MAX_BYTES);
  });

  it("accepts a raw v2 packet and returns independent validation", async () => {
    const receipt = rejectedReceipt();
    const validate = vi.fn<typeof validateGeminiYoutubeCandidateHandoff>(async () => receipt);
    const route = createGeminiCandidateActionRoute({
      youtubeApiKey: "server-held-youtube-key",
      validate
    });

    const result = await route.handle({
      request: {} as never,
      clientIp: "192.0.2.1",
      body: { packet: JSON.stringify(packet()) }
    });

    expect(result).toEqual({ status: 200, body: receipt });
    expect(validate).toHaveBeenCalledWith(
      expect.stringContaining('"packet_version":"2.0"'),
      { apiKey: "server-held-youtube-key" }
    );
  });

  it("returns exact repair paths for an invalid packet without provider work", async () => {
    const route = createGeminiCandidateActionRoute({ youtubeApiKey: "unused" });

    const result = await route.handle({
      request: {} as never,
      clientIp: "192.0.2.1",
      body: { packet: JSON.stringify({ ...packet(), unexpected: true }) }
    });

    expect(result).toMatchObject({
      status: 422,
      body: {
        error: {
          code: "invalid_packet",
          retryable: false,
          issues: [expect.objectContaining({
            path: "",
            message: expect.stringContaining("unexpected")
          })]
        }
      }
    });
  });

  it("bounds very large invalid-packet issue lists instead of throwing a 500", async () => {
    const route = createGeminiCandidateActionRoute({ youtubeApiKey: "unused" });
    const invalidPacket = {
      ...packet(),
      candidates: Array.from({ length: 16 }, () => ({}))
    };

    const result = await route.handle({
      request: {} as never,
      clientIp: "192.0.2.1",
      body: { packet: JSON.stringify(invalidPacket) }
    });

    expect(result.status).toBe(422);
    expect((result.body as { error: { issues: unknown[] } }).error.issues)
      .toHaveLength(100);
  });
});

function packet(): GeminiYoutubeCandidatePacket {
  return {
    packet_name: "gemini_youtube_candidate_handoff",
    packet_version: "2.0",
    research_target: "de-identified treatment question",
    diagnosis_status: "user_supplied_diagnosis",
    discovery_queries: [
      { purpose: "firsthand_outcome", query: "condition exact program what worked" },
      { purpose: "radical_outcome", query: "condition avoided procedure story" },
      { purpose: "overlooked_intervention", query: "condition named program one" },
      { purpose: "overlooked_intervention", query: "condition named program two" },
      { purpose: "conventional_benefit", query: "condition standard care benefit" },
      { purpose: "conventional_negative", query: "condition standard care failed" },
      { purpose: "firsthand_outcome", query: "advanced condition program result" },
      { purpose: "conventional_negative", query: "condition treatment discontinued" }
    ],
    candidates: VIDEO_IDS.map((videoId, index) => ({
      video_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Candidate ${index + 1}`,
      channel: `Channel ${index + 1}`,
      target_distance: "exact",
      provisional_intervention_family: "local_mechanical",
      creator_claim_summary: "The creator describes a specific implementation and outcome.",
      provisional_specific_program: `specific program ${index + 1}`,
      provisional_population_or_stage: "population and stage described by the creator",
      provisional_outcome_and_horizon: "functional outcome over a stated horizon",
      summary_basis: "spark_public_video_context_not_transcript_verified_by_askrigor",
      why_surfaced: "May add a nonredundant implementation hypothesis."
    })),
    suggested_seed_video_ids: [VIDEO_IDS[0]],
    search_gaps: [],
    disclosures: [
      "comments_not_retrieved",
      "provider_metadata_not_validated_by_gemini",
      "creator_claims_not_validated",
      "not_medical_advice"
    ]
  };
}

function rejectedReceipt(): GeminiYoutubeCandidateValidationReceipt {
  const frontier = deriveGeminiYoutubeCandidateFrontier(
    VIDEO_IDS,
    [],
    VIDEO_IDS,
    []
  );
  return {
    packet_name: "askrigor_gemini_youtube_candidate_validation",
    packet_version: "2.0",
    source_contract: "youtube-candidate-handoff-v2",
    source_packet_version: "2.0",
    status: "rejected",
    research_target: "de-identified treatment question",
    candidate_frontier: frontier,
    validated_candidates: [],
    rejected_candidates: VIDEO_IDS.map((videoId) => ({
      video_id: videoId,
      metadata_access_status: "not_found",
      retryable: false,
      rejection_reasons: ["metadata_not_api_visible_complete"],
      limitations: ["Fixture boundary"]
    })),
    unresolved_candidates: [],
    suggested_seed_receipts: [{
      video_id: VIDEO_IDS[0],
      disposition: "rejected",
      reasons: ["candidate_rejected"]
    }],
    eligible_seed_video_ids: [],
    access_boundaries: [
      "Spark video summaries remain provisional and were not transcript-verified by AskRigor; they may guide candidate discovery only.",
      "Provider comment_count is metadata, not proof of corpus accessibility, completeness, materiality, efficacy, safety, or causality.",
      "Comment-audit eligibility is mechanical; AskRigor must still perform protocol-governed semantic selection and any required audit.",
      "No YouTube comments or transcripts were retrieved by this validation."
    ]
  };
}
