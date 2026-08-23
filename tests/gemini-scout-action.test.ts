import type { IncomingMessage } from "node:http";

import { okEnvelope } from "@askrigor/contracts";
import {
  GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD,
  calculateGeminiScoutNanoUsd,
  createAutomatedGeminiScoutActionRoute,
  isDeidentifiedResearchTarget
} from "../apps/research-mcp/src/index.js";
import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from
  "../apps/research-mcp/src/config.js";
import type { AiBudget, BudgetReservation } from
  "../apps/research-mcp/src/lessons/ai-budget.js";
import type {
  GeminiYoutubeCandidatePacket,
  GeminiYoutubeCandidateValidationReceipt,
  GeminiYoutubeScoutData
} from "../packages/sources/src/index.js";
import { describe, expect, it, vi } from "vitest";

const TARGET = "adults with unspecified hip pain comparing materially different treatment programs";
const VIDEO_IDS = ["XpZHKGGCK-o", "0sZEvvPWq88", "qfPjRBqADKk"] as const;

function packet(): GeminiYoutubeCandidatePacket {
  return {
    packet_name: "gemini_youtube_candidate_handoff",
    packet_version: "2.0",
    research_target: TARGET,
    diagnosis_status: "diagnosis_not_specified",
    discovery_queries: [
      { purpose: "firsthand_outcome", query: "hip pain what worked firsthand" },
      { purpose: "radical_outcome", query: "hip pain avoided surgery recovery claim" },
      { purpose: "overlooked_intervention", query: "hip pain progressive loading program" },
      { purpose: "overlooked_intervention", query: "hip pain aquatic exercise program" },
      { purpose: "conventional_benefit", query: "hip injection benefit experience" },
      { purpose: "conventional_negative", query: "hip injection failure flare experience" },
      { purpose: "overlooked_intervention", query: "hip pain nutrition program outcome" },
      { purpose: "firsthand_outcome", query: "advanced hip pain program progression" }
    ],
    candidates: VIDEO_IDS.map((videoId, index) => ({
      video_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Candidate ${index + 1}`,
      channel: `Channel ${index + 1}`,
      target_distance: index === 0 ? "exact" : "adjacent",
      provisional_intervention_family: index === 0
        ? "nutrition_or_elimination"
        : index === 1
          ? "regenerative_or_biologic"
          : "local_mechanical",
      creator_claim_summary: `Creator-attributed provisional claim ${index + 1}`,
      provisional_specific_program: `Materially distinct program ${index + 1}`,
      provisional_population_or_stage: "Population or stage described provisionally",
      provisional_outcome_and_horizon: "Outcome and horizon described provisionally",
      summary_basis: "gemini_public_search_or_video_context_not_transcript_verified_by_askrigor",
      why_surfaced: "May add a nonredundant treatment-program hypothesis"
    })),
    suggested_seed_video_ids: [VIDEO_IDS[0]],
    search_gaps: ["One program lacked an independent failure account."],
    disclosures: [
      "comments_not_retrieved",
      "provider_metadata_not_validated_by_gemini",
      "creator_claims_not_validated",
      "not_medical_advice"
    ]
  };
}

function scoutData(): GeminiYoutubeScoutData {
  const value = packet();
  return {
    response_id: "interaction-fixture-1",
    model: "gemini-3.6-flash",
    google_search_grounded: true,
    provider_storage_disabled: true,
    executed_search_queries: value.discovery_queries.map(({ query }) => query),
    usage: {
      total_input_tokens: 1_000,
      total_output_tokens: 2_000,
      total_thought_tokens: 500,
      google_search_queries: 8
    },
    packet: value
  };
}

function validationReceipt(): GeminiYoutubeCandidateValidationReceipt {
  const value = packet();
  return {
    packet_name: "askrigor_gemini_youtube_candidate_validation",
    packet_version: "2.0",
    source_contract: "youtube-candidate-handoff-v2",
    source_packet_version: "2.0",
    status: "accepted",
    research_target: TARGET,
    candidate_frontier: {
      frontier_digest: "a".repeat(64),
      source_candidate_video_ids: [...VIDEO_IDS],
      validated_candidate_video_ids: [...VIDEO_IDS],
      terminally_rejected_video_ids: [],
      unresolved_candidate_video_ids: []
    },
    validated_candidates: value.candidates.map((candidate, index) => ({
      video_id: candidate.video_id,
      canonical_url: candidate.canonical_url,
      metadata_access_status: "api_visible_complete",
      provider_metadata: {
        retrieved_at: "2026-08-23T14:00:00.000Z",
        title: candidate.title,
        channel_id: `UC${String(index + 1).repeat(22)}`,
        channel_title: candidate.channel,
        privacy_status: "public",
        statistics: { comment_count: "10" }
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
        summary_basis: "gemini_public_search_or_video_context_not_transcript_verified_by_askrigor",
        why_surfaced: candidate.why_surfaced
      },
      limitations: []
    })),
    rejected_candidates: [],
    unresolved_candidates: [],
    suggested_seed_receipts: [{
      video_id: VIDEO_IDS[0],
      disposition: "eligible",
      reasons: []
    }],
    eligible_seed_video_ids: [VIDEO_IDS[0]],
    access_boundaries: [
      "Gemini scout summaries remain provisional and were not transcript-verified by AskRigor; they may guide candidate discovery only.",
      "Provider comment_count is metadata, not proof of corpus accessibility, completeness, materiality, efficacy, safety, or causality.",
      "Comment-audit eligibility is mechanical; AskRigor must still perform protocol-governed semantic selection and any required audit.",
      "No YouTube comments or transcripts were retrieved by this validation."
    ]
  };
}

function budget(reservation: BudgetReservation | undefined): AiBudget {
  return { reserve: vi.fn(async () => reservation) };
}

function context(body: unknown) {
  return {
    request: {} as IncomingMessage,
    clientIp: "203.0.113.8",
    body
  };
}

describe("automated Gemini YouTube scout Action", () => {
  it("runs a budgeted stateless scout and returns the independently validated frontier", async () => {
    const commit = vi.fn(async () => undefined);
    const forfeit = vi.fn(async () => undefined);
    const reservation = { commit, forfeit };
    const aiBudget = budget(reservation);
    const data = scoutData();
    const scout = vi.fn(async () => okEnvelope({
      provider: "gemini_api",
      recordType: "gemini_youtube_candidate_frontier",
      primaryIdentifier: data.response_id,
      query: { research_target: TARGET },
      pagination: { exhausted: true },
      returned: data.packet.candidates.length,
      accessStatus: "complete",
      limitations: [],
      rawMetadata: {
        model: data.model,
        google_search_grounded: true,
        provider_storage_disabled: true
      },
      data
    }));
    const validate = vi.fn(async () => validationReceipt());
    const route = createAutomatedGeminiScoutActionRoute({
      geminiApiKey: "gemini-secret",
      youtubeApiKey: "youtube-secret",
      budget: aiBudget,
      scout,
      validate,
      loadScoutInstructions: async () => "fixture scout instructions"
    });

    const result = await route.handle(context({
      research_target: TARGET,
      diagnosis_status: "diagnosis_not_specified"
    }));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: "accepted",
      boundary: null,
      scout_receipt: {
        model: "gemini-3.6-flash",
        access_status: "complete",
        provider_storage_disabled: true,
        accounted_nano_usd: 122_125_000
      },
      validation: {
        candidate_frontier: {
          validated_candidate_video_ids: [...VIDEO_IDS]
        }
      }
    });
    expect(aiBudget.reserve).toHaveBeenCalledWith(
      "gemini_youtube_candidate_scout",
      GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
    );
    expect(commit).toHaveBeenCalledWith(122_125_000);
    expect(forfeit).not.toHaveBeenCalled();
    expect(scout).toHaveBeenCalledWith(expect.objectContaining({
      researchTarget: TARGET,
      scoutInstructions: "fixture scout instructions"
    }), {
      apiKey: "gemini-secret",
      model: "gemini-3.6-flash"
    });
    expect(validate).toHaveBeenCalledOnce();
    expect(Buffer.byteLength(JSON.stringify(result.body), "utf8")).toBeLessThanOrEqual(
      RESEARCH_ACTION_RESPONSE_MAX_BYTES
    );
    expect(JSON.stringify(result.body)).not.toContain("gemini-secret");
    expect(JSON.stringify(result.body)).not.toContain("youtube-secret");
  });

  it("loads the checked-in production scout instructions when no test loader is supplied", async () => {
    const data = scoutData();
    const scout = vi.fn(async () => okEnvelope({
      provider: "gemini_api",
      recordType: "gemini_youtube_candidate_frontier",
      primaryIdentifier: data.response_id,
      query: { research_target: TARGET },
      pagination: { exhausted: true },
      returned: data.packet.candidates.length,
      accessStatus: "complete",
      limitations: [],
      rawMetadata: {},
      data
    }));
    const route = createAutomatedGeminiScoutActionRoute({
      geminiApiKey: "gemini-secret",
      youtubeApiKey: "youtube-secret",
      budget: budget({
        commit: vi.fn(async () => undefined),
        forfeit: vi.fn(async () => undefined)
      }),
      scout,
      validate: vi.fn(async () => validationReceipt())
    });

    await route.handle(context({
      research_target: TARGET,
      diagnosis_status: "diagnosis_not_specified"
    }));

    expect(scout).toHaveBeenCalledWith(expect.objectContaining({
      scoutInstructions: expect.stringContaining(
        "name: scout-youtube-candidates-for-askrigor"
      )
    }), expect.any(Object));
    expect(scout.mock.calls[0]?.[0].scoutInstructions).toContain(
      "gemini_public_search_or_video_context_not_transcript_verified_by_askrigor"
    );
  });

  it("fails closed with a bounded receipt when validated provider metadata would exceed the Action ceiling", async () => {
    const commit = vi.fn(async () => undefined);
    const oversizedValidation = validationReceipt();
    oversizedValidation.validated_candidates[0]!.limitations = ["x".repeat(59_000)];
    const route = createAutomatedGeminiScoutActionRoute({
      geminiApiKey: "gemini-secret",
      youtubeApiKey: "youtube-secret",
      budget: budget({ commit, forfeit: vi.fn(async () => undefined) }),
      scout: vi.fn(async () => okEnvelope({
        provider: "gemini_api",
        recordType: "gemini_youtube_candidate_frontier",
        primaryIdentifier: "interaction-fixture-oversized",
        query: { research_target: TARGET },
        pagination: { exhausted: true },
        returned: VIDEO_IDS.length,
        accessStatus: "complete",
        limitations: [],
        rawMetadata: {},
        data: scoutData()
      })),
      validate: vi.fn(async () => oversizedValidation),
      loadScoutInstructions: async () => "fixture scout instructions"
    });

    const result = await route.handle(context({
      research_target: TARGET,
      diagnosis_status: "diagnosis_not_specified"
    }));

    expect(result.body).toMatchObject({
      status: "blocked",
      boundary: {
        code: "gemini_youtube_candidate_validation_response_too_large",
        retryable: false
      },
      validation: null
    });
    expect(Buffer.byteLength(JSON.stringify(result.body), "utf8")).toBeLessThan(
      RESEARCH_ACTION_RESPONSE_MAX_BYTES
    );
    expect(commit).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.body)).not.toContain("x".repeat(200));
  });

  it("rejects personal or identifying targets before configuration, budget, or provider work", async () => {
    const aiBudget = budget({
      commit: vi.fn(async () => undefined),
      forfeit: vi.fn(async () => undefined)
    });
    const scout = vi.fn();
    const route = createAutomatedGeminiScoutActionRoute({
      geminiApiKey: "gemini-secret",
      youtubeApiKey: "youtube-secret",
      budget: aiBudget,
      scout
    });

    for (const researchTarget of [
      "how can I fix my bad hip",
      "adult hip pain; email joel@example.com",
      "patient id: 12345 with hip pain",
      "hip pain https://example.com/private-record"
    ]) {
      const result = await route.handle(context({
        research_target: researchTarget,
        diagnosis_status: "diagnosis_not_specified"
      }));
      expect(result).toEqual({
        status: 422,
        body: {
          error: {
            code: "research_target_not_deidentified",
            retryable: true
          }
        }
      });
    }
    expect(aiBudget.reserve).not.toHaveBeenCalled();
    expect(scout).not.toHaveBeenCalled();
  });

  it("reports provider configuration as a provider boundary rather than a missing Action", async () => {
    const route = createAutomatedGeminiScoutActionRoute({
      geminiApiKey: "",
      youtubeApiKey: "youtube-secret"
    });

    const result = await route.handle(context({
      research_target: TARGET,
      diagnosis_status: "diagnosis_not_specified"
    }));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: "blocked",
      boundary: {
        code: "gemini_provider_not_configured",
        retryable: false
      }
    });
    expect(JSON.stringify(result.body)).not.toContain("Action setup is out of date");
  });

  it("never calls Gemini when the aggregate budget cannot reserve the bounded request", async () => {
    const scout = vi.fn();
    const route = createAutomatedGeminiScoutActionRoute({
      geminiApiKey: "gemini-secret",
      youtubeApiKey: "youtube-secret",
      budget: budget(undefined),
      scout
    });

    const result = await route.handle(context({
      research_target: TARGET,
      diagnosis_status: "diagnosis_not_specified"
    }));

    expect(result.body).toMatchObject({
      status: "blocked",
      boundary: { code: "gemini_scout_budget_exhausted" }
    });
    expect(scout).not.toHaveBeenCalled();
  });

  it("forfeits the reservation and preserves only a bounded provider failure", async () => {
    const commit = vi.fn(async () => undefined);
    const forfeit = vi.fn(async () => undefined);
    const validate = vi.fn();
    const route = createAutomatedGeminiScoutActionRoute({
      geminiApiKey: "gemini-secret",
      youtubeApiKey: "youtube-secret",
      budget: budget({ commit, forfeit }),
      scout: vi.fn(async () => ({
        access_status: "rate_limited",
        error: {
          code: "gemini_youtube_scout_rate_limited",
          retryable: true,
          message: "private upstream detail"
        },
        data: {}
      }) as never),
      validate,
      loadScoutInstructions: async () => "fixture"
    });

    const result = await route.handle(context({
      research_target: TARGET,
      diagnosis_status: "diagnosis_not_specified"
    }));

    expect(result.body).toMatchObject({
      status: "blocked",
      boundary: {
        code: "gemini_youtube_scout_rate_limited",
        retryable: true
      },
      scout_receipt: {
        access_status: "rate_limited",
        accounted_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
      }
    });
    expect(commit).not.toHaveBeenCalled();
    expect(forfeit).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toContain("private upstream detail");
  });

  it("uses the conservative reservation when token accounting is absent or implausible", () => {
    expect(calculateGeminiScoutNanoUsd({ google_search_queries: 8 })).toBe(
      GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
    );
    expect(calculateGeminiScoutNanoUsd({
      total_input_tokens: 10_000_000,
      total_output_tokens: 10_000_000,
      total_thought_tokens: 10_000_000,
      google_search_queries: 18
    })).toBe(GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD);
  });

  it("accepts generic stage-specific population questions without requiring vague wording", () => {
    expect(isDeidentifiedResearchTarget(
      "adults with radiographically confirmed severe hip osteoarthritis comparing aquatic exercise, progressive resistance programs, and arthroplasty outcomes"
    )).toBe(true);
    expect(isDeidentifiedResearchTarget("how can I fix my bad hip")).toBe(false);
  });
});
